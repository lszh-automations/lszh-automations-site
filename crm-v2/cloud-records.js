'use strict';

// Firestore persistence for the authenticated Cloud CRM. No direct browser
// Firestore access; all multi-record state transitions use transactions.
// Staging uses its own prefix and never reads or changes website live leads.
const {quoteTotals,existingLines}=require('./offer-pricing');
const {invoiceTotals,isInvoiceLocked}=require('./invoice-pricing');
const {normalizePayment,paidCents,outstandingCents,localSwissDate}=require('./invoice-accounting');
const {cleanProjectTasks,cleanProjectOnboarding,defaultOnboarding}=require('./project-tasks');
const {LEAD_STATES}=require('./lead-lifecycle');
const {randomUUID,createHash}=require('node:crypto');
const {MAX_CONTACTS,validateContact,shouldMarkContacted,followUpFields}=require('./lead-contact');
const {normalizeDispatchInput,normalizeFollowUpInput,checkReadyForDispatch}=require('./offer-tracking');

const TABLES=['leads','kunden','offerten','rechnungen','projekte'];
const STATUS={
  leads:LEAD_STATES,
  kunden:['Aktiv','Inaktiv'],
  offerten:['Entwurf','Bereit','Versendet','Angenommen','Abgelehnt'],
  rechnungen:['Entwurf','Offen','Teilbezahlt','Bezahlt','Storniert'],
  projekte:['Geplant','In Arbeit','Wartet auf Kunde','Abgeschlossen']
};
const FIELDS={
  leads:['name','company','email','street','postalCode','city','country','message','currentProcess','systems','mainProblem','frequency','desiredResult','budgetRange','qualificationNotes','nextAction','followUpDate','status'],
  kunden:['company','contactName','email','street','postalCode','city','country','notes','status'],
  offerten:['leadId','customerId','title','description','items','oneTimeCHF','monthlyCHF','validUntil','status'],
  rechnungen:['customerId','projectId','description','invoiceDate','items','amountCHF','dueDate','status'],
  projekte:['customerId','offerId','title','description','dueDate','tasks','onboarding','status']
};
const REQUIRED={
  leads:['name','company','email','street','postalCode','city','country'],
  kunden:['company'],offerten:['title'],rechnungen:['description'],projekte:['title']
};
const MONEY=new Set(['oneTimeCHF','monthlyCHF','amountCHF']);
function err(message,status=400){return Object.assign(new Error(message),{status});}
function norm(value){return String(value||'').trim().toLocaleLowerCase('de-CH');}
function clean(table,input){
  if(!TABLES.includes(table))throw err('Unbekanntes CRM-Register',404);
  if(!input||typeof input!=='object'||Array.isArray(input))throw err('Ungültiger Datensatz');
  const out={};
  for(const field of FIELDS[table]){
    if(!Object.hasOwn(input,field))continue;
    const value=input[field];
    if(field==='items'){
      if(table==='offerten')out.items=quoteTotals(value).items;
      else if(table==='rechnungen')out.items=invoiceTotals(value).items;
      else throw err('Ungültige Positionen');
      continue;
    }
    if(field==='onboarding'){out.onboarding=cleanProjectOnboarding(value);continue;}
    if(field==='tasks'){
      if(table!=='projekte')throw err('Ungültige Aufgaben');
      out.tasks=cleanProjectTasks(value);continue;
    }
    if(MONEY.has(field)){
      if(value===''||value===null){out[field]=null;continue;}
      const number=Number(value);
      if(!Number.isFinite(number)||number<0||number>100000000)throw err('Ungültiger Betrag');
      out[field]=number;continue;
    }
    if(typeof value!=='string'||value.length>5000)throw err('Ungültiges Feld: '+field);
    const text=value.trim();
    if(field==='nextAction'&&text.length>180)throw err('Nächste Aktion maximal 180 Zeichen');
    if(field==='qualificationNotes'&&text.length>2000)throw err('Qualifizierungsnotizen maximal 2000 Zeichen');
    if(field==='budgetRange'&&text.length>100)throw err('Budgetrahmen maximal 100 Zeichen');
    if(field==='email'&&text&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text))throw err('Ungültige E-Mail');
    if(field==='status'&&text&&!STATUS[table].includes(text))throw err('Ungültiger Status');
    if(['dueDate','validUntil','invoiceDate'].includes(field)&&text&&!/^\d{4}-\d{2}-\d{2}$/.test(text))
      throw err('Ungültiges Datum: '+field);
    out[field]=field==='email'?text.toLowerCase():text;
  }
  return out;
}
function verify(table,data){
  for(const field of REQUIRED[table]){
    if(!String(data[field]??'').trim())throw err('Pflichtfeld fehlt: '+field);
  }
}
function toObject(doc){return {id:doc.id,...doc.data()};}
function keyId(prefix,key){return prefix+String(key).replace(/[^a-zA-Z0-9_-]/g,'-');}
function buildStore(db,prefix){
  if(!/^lszh_crm_v2_(?:staging_)?$/.test(prefix))
    throw Error('CRM_RECORD_PREFIX must be explicitly approved: lszh_crm_v2_ or lszh_crm_v2_staging_');
  const col=table=>db.collection(prefix+table);
  const seq=kind=>db.collection(prefix+'_meta').doc(kind+'_sequence');
  const now=()=>new Date().toISOString();
  const docDate=()=>new Date().toISOString().slice(0,10);
  const defaultStatus=table=>STATUS[table][0];
  const queryOne=async(tx,table,field,value)=>{
    if(!value)return null;
    const q=await tx.get(col(table).where(field,'==',value).limit(2));
    return q.empty?null:q.docs[0];
  };
  const nextSequence=async(tx,kind)=>{
    const reference=seq(kind),snap=await tx.get(reference);
    const next=snap.exists&&Number.isSafeInteger(snap.data().next)?snap.data().next:1000;
    if(next>99999999)throw err('Nummernkreis ausgeschöpft',409);
    return {reference,next};
  };
  const audit=(values,user,date)=>({...values,updatedAt:date,updatedBy:user.email});
  const newRecord=(values,user,date)=>({...values,createdAt:date,updatedAt:date,createdBy:user.email,updatedBy:user.email});
  // Human-facing number; existing document IDs remain the stable foreign keys.
  async function customerNumberPlan(tx,id,customer={}){
    if(customer.customerNumber){
      if(!/^KD-[1-9][0-9]{3,7}$/.test(customer.customerNumber))throw err('Ungültige bestehende Kundennummer',409);
      return {number:customer.customerNumber};
    }
    const counter=await nextSequence(tx,'customer'),number='KD-'+counter.next;
    const registry=db.collection(prefix+'_meta').doc('customer_number_'+number);
    if((await tx.get(registry)).exists)throw err('Kundennummer bereits reserviert – Nummernkreis prüfen',409);
    return {number,counter,registry,customerId:id};
  }
  function reserveCustomerNumber(tx,plan,user,date){
    if(!plan.counter)return;
    tx.set(plan.counter.reference,{next:plan.counter.next+1},{merge:true});
    tx.create(plan.registry,{customerId:plan.customerId,customerNumber:plan.number,assignedAt:date,assignedBy:user.email});
  }
  async function ensureCustomerNumber(id,user){
    const reference=col('kunden').doc(id),date=now();
    await db.runTransaction(async tx=>{
      const customer=await tx.get(reference);if(!customer.exists)throw err('Kunde nicht gefunden',404);
      const plan=await customerNumberPlan(tx,id,customer.data());
      reserveCustomerNumber(tx,plan,user,date);
      if(plan.counter)tx.update(reference,audit({customerNumber:plan.number},user,date));
    });
    return toObject(await reference.get());
  }
  async function initialInvoicePlan(tx,{offerId,offer,customerId,projectId}){
    const reference=col('rechnungen').doc('order-'+createHash('sha256').update(offerId).digest('hex').slice(0,32));
    const reserved=await tx.get(reference);
    const existing=reserved.exists?reserved:await queryOne(tx,'rechnungen','offerId',offerId)||await queryOne(tx,'rechnungen','projectId',projectId);
    if(existing){
      if(existing.data().customerId!==customerId||existing.data().projectId!==projectId)throw err('Bestehende Rechnung ist einem anderen Kunden oder Projekt zugeordnet',409);
      return {invoiceId:existing.id,state:'existing_invoice'};
    }
    const items=existingLines(offer).filter(x=>x.mode==='einmalig').map(({title,qty,unitPriceCHF})=>({title,qty,unitPriceCHF}));
    const totals=invoiceTotals(items);
    if(!items.length||totals.amountCHF<=0)return {invoiceId:null,state:'no_one_time_charges'};
    const counter=await nextSequence(tx,'invoice');
    return {invoiceId:reference.id,state:'draft',reference,counter,values:{...totals,number:'RE-'+counter.next,customerId,projectId,offerId,
      description:'Einmalige Leistungen gemäss Offerte Nr. '+String(offer.number||'')+(offer.title?' – '+offer.title:''),
      invoiceDate:localSwissDate(),dueDate:'',status:'Entwurf',source:'offer_acceptance',billingScope:'one_time'}};
  }
  function createInitialInvoice(tx,plan,user,date){
    if(!plan.reference)return;
    tx.set(plan.counter.reference,{next:plan.counter.next+1},{merge:true});
    tx.create(plan.reference,newRecord(plan.values,user,date));
  }
  async function ensureInitialInvoice(offerId,user){
    const reference=col('offerten').doc(offerId),date=now();
    await db.runTransaction(async tx=>{
      const snap=await tx.get(reference),offer=snap.data();
      if(!snap.exists||offer.status!=='Angenommen')throw err('Rechnungsentwurf benötigt eine angenommene Offerte',409);
      if(offer.onlineAcceptance&&(offer.onlineAcceptance.state!=='confirmed'||offer.onlineAcceptance.reviewRequired!==false||offer.onlineAcceptance.archiveState!=='complete'))throw err('Bestätigte Online-Annahme erforderlich',409);
      const customer=await assertCustomer(tx,offer.customerId),project=await queryOne(tx,'projekte','offerId',offerId);
      if(!customer||!project||project.data().customerId!==offer.customerId)throw err('Kunde und Projekt müssen der Offerte eindeutig zugeordnet sein',409);
      const numberPlan=await customerNumberPlan(tx,customer.id,customer.data());
      const plan=await initialInvoicePlan(tx,{offerId,offer,customerId:customer.id,projectId:project.id});
      reserveCustomerNumber(tx,numberPlan,user,date);
      if(numberPlan.counter)tx.update(customer.ref,audit({customerNumber:numberPlan.number},user,date));
      createInitialInvoice(tx,plan,user,date);
      tx.update(reference,audit({initialInvoiceId:plan.invoiceId,initialInvoiceState:plan.state},user,date));
    });
    const offer=toObject(await reference.get());
    return {offer,invoice:offer.initialInvoiceId?await get('rechnungen',offer.initialInvoiceId):null};
  }
  const assertCustomer=async(tx,id)=>{
    if(!id)return null;
    const snap=await tx.get(col('kunden').doc(id));
    if(!snap.exists)throw err('Kunde nicht gefunden');return snap;
  };
  const assertProject=async(tx,id)=>{
    if(!id)return null;
    const snap=await tx.get(col('projekte').doc(id));
    if(!snap.exists)throw err('Projekt nicht gefunden');return snap;
  };
  async function withCustomerNumbers(table,records){
    if(!['offerten','projekte','rechnungen'].includes(table))return records;
    const ids=[...new Set(records.map(r=>r.customerId).filter(Boolean))],customers=new Map();
    await Promise.all(ids.map(async id=>{const row=await col('kunden').doc(id).get();if(row.exists)customers.set(id,row.data());}));
    return records.map(row=>{const c=customers.get(row.customerId);return c?.customerNumber?{...row,customerNumber:c.customerNumber,customerCompany:c.company||''}:row;});
  }
  const acceptedOffer=async(tx,id)=>{
    if(!id)return null;
    const snap=await tx.get(col('offerten').doc(id));
    if(!snap.exists||snap.data().status!=='Angenommen')throw err('Nur angenommene Offerten dürfen einem Projekt zugeordnet werden');
    return snap;
  };
  const validateInvoice=(data,previous)=>{
    if(['Offen','Teilbezahlt'].includes(data.status) && (
      !data.customerId||!data.dueDate||!Array.isArray(data.items)||!data.items.length||!(data.amountCHF>0)
    ))throw err('Für eine offene Rechnung Kunde, Fälligkeit und Positionen mit Betrag angeben');
    if(data.status==='Bezahlt' && !['Offen','Teilbezahlt'].includes(previous?.status))throw err('Rechnung zuerst auf Offen setzen');
    if(previous?.status==='Offen'&&data.status==='Entwurf')throw err('Offene Rechnung nicht in Entwurf zurücksetzen');
  };
  // Called after its inputs (customer/project and any associated lead) are read.
  // The helper performs every remaining read BEFORE any transaction writes.
  async function win(tx,{offerRef,offer,leadRef=null,lead=null,leadUpdate={}},user,date){
    if(!offer)throw err('Gewonnen setzt eine bestehende Offerte voraus');
    if(offer.onlineAcceptance&&(offer.onlineAcceptance.state!=='confirmed'||offer.onlineAcceptance.reviewRequired!==false||offer.onlineAcceptance.archiveState!=='complete'))
      throw err('Online-Annahme zuerst intern prüfen und schriftliche LSZH-Auftragsbestätigung nachweisen',409);
    if(!lead&&!offer.customerId)
      throw err('Angenommene Offerte benötigt einen verknüpften Lead oder einen bestehenden Kunden');
    const custRef=offer.customerId?col('kunden').doc(offer.customerId):null;
    const knownCustomer=custRef?await tx.get(custRef):null;
    let customer=knownCustomer?.exists?knownCustomer:null;
    if(!customer&&lead?.email)customer=await queryOne(tx,'kunden','email',lead.email);
    if(!customer&&lead?.company)customer=await queryOne(tx,'kunden','company',lead.company);
    const project=await queryOne(tx,'projekte','offerId',offerRef.id);
    const customerRef=customer?.ref||col('kunden').doc(keyId('lead-',leadRef?.id||offerRef.id));
    const projectRef=project?.ref||col('projekte').doc(keyId('offer-',offerRef.id));
    // Ensure deterministically named documents are checked before writes.
    const [createdCustomer,createdProject]=await Promise.all([
      !customer?tx.get(customerRef):null,
      !project?tx.get(projectRef):null
    ]);
    if(createdCustomer?.exists)customer=createdCustomer;
    const finalCustomer=customer?.ref||customerRef;
    const numberPlan=await customerNumberPlan(tx,finalCustomer.id,customer?.data()||{});
    const finalProject=project?.ref||projectRef;
    const savedProject=project||(createdProject?.exists?createdProject:null);
    if(savedProject&&(savedProject.data().customerId!==finalCustomer.id||savedProject.data().offerId!==offerRef.id))throw err('Projekt und Offerte müssen denselben Kunden haben',409);
    const invoicePlan=await initialInvoicePlan(tx,{offerId:offerRef.id,offer,customerId:finalCustomer.id,projectId:finalProject.id});
    reserveCustomerNumber(tx,numberPlan,user,date);
    if(customer&&numberPlan.counter)tx.update(finalCustomer,audit({customerNumber:numberPlan.number},user,date));
    if(!customer){
      const fields={
        customerNumber:numberPlan.number,
        company:lead?.company||'Kunde aus Offerte',
        contactName:lead?.name||'',email:lead?.email||'',
        street:lead?.street||'',postalCode:lead?.postalCode||'',
        city:lead?.city||'',country:lead?.country||'Schweiz',
        notes:'Automatisch aus angenommener Offerte übernommen',status:'Aktiv'
      };
      tx.create(finalCustomer,newRecord(fields,user,date));
    }
    if(!project&&!createdProject?.exists){
      const fields={
        customerId:finalCustomer.id,offerId:offerRef.id,
        title:offer.title||'Gewonnenes Projekt',description:offer.description||'',
        dueDate:'',tasks:[],onboarding:defaultOnboarding(),status:'Geplant'
      };
      tx.create(finalProject,newRecord(fields,user,date));
    }
    createInitialInvoice(tx,invoicePlan,user,date);
    tx.update(offerRef,audit({status:'Angenommen',customerId:finalCustomer.id,initialInvoiceId:invoicePlan.invoiceId,initialInvoiceState:invoicePlan.state},user,date));
    if(leadRef)tx.update(leadRef,audit({...leadUpdate,status:'Gewonnen'},user,date));
    return {customerId:finalCustomer.id,projectId:finalProject.id};
  }

  // Bounded Firestore pages, using a DocumentSnapshot as cursor to keep
  // Firestore's implicit document-ID tie-break on equal creation timestamps.
  async function listPage(table,limit=50,cursor=''){
    if(!TABLES.includes(table))throw err('Unbekanntes Register',404);
    const size=Number(limit);
    if(!Number.isInteger(size)||size<1||size>100)throw err('Seitengrösse muss 1 bis 100 sein');
    if(typeof cursor!=='string'||cursor.length>120||
       (cursor&&!/^[A-Za-z0-9_-]{1,100}$/.test(cursor)))
      throw err('Ungültiger Seitenzeiger');
    let query=col(table).orderBy('createdAt','desc');
    if(cursor){
      const last=await col(table).doc(cursor).get();
      if(!last.exists||!last.data()?.createdAt)throw err('Seitenzeiger veraltet – bitte Register neu laden',409);
      query=query.startAfter(last);
    }
    const snap=await query.limit(size+1).get();
    const rows=snap.docs.slice(0,size);
    return {
      records:await withCustomerNumbers(table,rows.map(toObject)),
      nextCursor:snap.docs.length>size&&rows.length?rows[rows.length-1].id:null,
      hasMore:snap.docs.length>size
    };
  }
  // Server-side search of ALL register rows, not just the browser's current page.
  // This read-only implementation streams Firestore documents in stable order.
  // O(N) reads per query; replace with a search index if the CRM grows substantially.
  async function searchPage(table,{pageSize=50,cursor='',q='',status='',due='',today}={}){
    const {localSwissDate,outstandingCents,validDay}=require('./invoice-accounting');
    const {invoiceKind}=require('./cockpit-summary');
    if(!TABLES.includes(table))throw err('Unbekanntes Register',404);
    const size=Number(pageSize);
    if(!Number.isInteger(size)||size<1||size>100)throw err('Seitengrösse muss 1 bis 100 sein');
    if(typeof q!=='string'||q.length>120||/[\u0000-\u001f]/.test(q))
      throw err('Suchbegriff ist ungültig oder zu lang');
    if(typeof cursor!=='string'||cursor.length>120||
       (cursor&&!/^[A-Za-z0-9_-]{1,100}$/.test(cursor)))throw err('Ungültiger Seitenzeiger');
    if(typeof status!=='string'||(status&&!STATUS[table].includes(status)))
      throw err('Ungültiger Statusfilter');
    if(typeof due!=='string'||(due&&
       (table!=='rechnungen'||!['overdue','soon','open'].includes(due))))
      throw err('Ungültiger Fälligkeitsfilter');
    const day=today||localSwissDate();
    if(!validDay(day))throw err('Ungültiges Vergleichsdatum');
    const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLocaleLowerCase('de-CH');
    const needle=fold(q.trim());
    const searchFields={
      leads:['name','company','email','city','postalCode'],
      kunden:['customerNumber','company','contactName','email','city','postalCode'],
      offerten:['number','title','description'],
      rechnungen:['number','description'],
      projekte:['title','description']
    };
    const contains=(record,fields)=>fields.some(key=>fold(record[key]).includes(needle));
    const customerIds=new Set(),leadIds=new Set();
    if(needle&&['offerten','rechnungen','projekte'].includes(table)){
      for await(const snap of col('kunden').stream()){
        const row=snap.data();
        if(contains(row,['customerNumber','company','contactName','email']))customerIds.add(snap.id);
      }
    }
    if(needle&&table==='offerten'){
      for await(const snap of col('leads').stream()){
        if(contains(snap.data(),['name','company','email']))leadIds.add(snap.id);
      }
    }
    const matches=row=>{
      if(status&&row.status!==status)return false;
      if(due){
        if(!['Offen','Teilbezahlt'].includes(row.status)||outstandingCents(row)<=0)return false;
        if(due!=='open'&&invoiceKind(row,day)!==due)return false;
      }
      if(!needle)return true;
      return contains(row,searchFields[table])||
        (row.customerId&&customerIds.has(row.customerId))||
        (row.leadId&&leadIds.has(row.leadId));
    };
    let totalMatches=0,found=!cursor,started=!cursor;
    const selected=[];
    if(status||due){
      // Equality / IN use Firestore's automatic single-field status index.
      // Do NOT orderBy(createdAt) here: that would require a new composite
      // index. Keep only the best (pageSize + 1) sorted rows in memory.
      const source=status?col(table).where('status','==',status):
        col(table).where('status','in',['Offen','Teilbezahlt']);
      const cursorSnap=cursor?await col(table).doc(cursor).get():null;
      if(cursor&&(!cursorSnap.exists||!cursorSnap.data()?.createdAt))
        throw err('Seitenzeiger veraltet – bitte Suche neu laden',409);
      const after=cursorSnap?toObject(cursorSnap):null;
      const rank=(a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||
        String(b.id).localeCompare(String(a.id));
      for await(const snap of source.stream()){
        const row=toObject(snap);
        // Firestore orderBy('createdAt') excluded records missing the field.
        if(!Object.hasOwn(row,'createdAt')||!matches(row))continue;
        totalMatches++;
        if(after&&row.id===cursor)found=true;
        if(after&&rank(row,after)<=0)continue;
        let low=0,high=selected.length;
        while(low<high){
          const middle=(low+high)>>>1;
          if(rank(row,selected[middle])<0)high=middle;
          else low=middle+1;
        }
        if(low<=size){
          selected.splice(low,0,row);
          if(selected.length>size+1)selected.pop();
        }
      }
    }else{
      // Unfiltered/full-text path retains Firestore cursor semantics.
      for await(const snap of col(table).orderBy('createdAt','desc').stream()){
        const row=toObject(snap);
        if(!matches(row))continue;
        totalMatches++;
        if(!started){
          if(row.id===cursor){found=true;started=true;}
          continue;
        }
        if(selected.length<=size)selected.push(row);
      }
    }
    if(!found)throw err('Seitenzeiger veraltet – bitte Suche neu laden',409);
    const hasMore=selected.length>size,records=selected.slice(0,size);
    return {records:await withCustomerNumbers(table,records),nextCursor:hasMore&&records.length?records[records.length-1].id:null,
      hasMore,totalMatches};
  }
  // Read-only full collection scans for complete server metrics. Stream does
  // not put all invoice/payment/customer documents in the browser or RAM;
  // O(number of documents) reads remain a scaling cost until materialized.
  async function* scan(table){
    if(!TABLES.includes(table))throw err('Unbekanntes Register',404);
    for await(const doc of col(table).stream())yield toObject(doc);
  }
  async function list(table,limit=200){
    const snap=await col(table).orderBy('createdAt','desc').limit(Math.min(Math.max(Number(limit)||200,1),200)).get();
    return withCustomerNumbers(table,snap.docs.map(toObject));
  }
  async function get(table,id){
    const doc=await col(table).doc(id).get();
    return doc.exists?(await withCustomerNumbers(table,[toObject(doc)]))[0]:null;
  }
  async function reminders(){
    const snap=await col('leads').where('status','==','Neu').limit(200).get();
    const cutoff=Date.now()-24*60*60*1000;
    return snap.docs.filter(doc=>Date.parse(doc.data().createdAt||'')<=cutoff)
      .map(doc=>({leadId:doc.id,createdAt:doc.data().createdAt,delivery:'preview_only_not_sent'}));
  }

  async function create(table,payload,user){
    const input=clean(table,payload);
    if(table==='rechnungen'&&Object.hasOwn(input,'amountCHF')&&!Object.hasOwn(input,'items'))
      throw err('Rechnungsbetrag wird aus Positionen berechnet');
    if(table==='offerten'&&Object.hasOwn(input,'items'))Object.assign(input,quoteTotals(input.items));
    if(table==='rechnungen')Object.assign(input,invoiceTotals(input.items||[]));
    input.status=input.status||defaultStatus(table);
    if(table==='leads'&&input.status==='Gewonnen')throw err('Gewonnen setzt eine bestehende Offerte voraus');
    if(table==='rechnungen'&&['Bezahlt','Teilbezahlt'].includes(input.status))throw err('Zahlungsstatus nur über Zahlungseingang erfassen');
    if(table==='offerten'&&input.status==='Angenommen')throw err('Offerte zuerst speichern, dann auf Angenommen setzen');
    if(table==='offerten'&&input.status==='Versendet')
      throw err('Offertenversand muss separat dokumentiert werden',409);
    verify(table,input);
    if(table==='leads')followUpFields(input);
    const date=now(),ref=col(table).doc();
    if(table==='kunden'){
      await db.runTransaction(async tx=>{
        const plan=await customerNumberPlan(tx,ref.id);reserveCustomerNumber(tx,plan,user,date);
        tx.create(ref,newRecord({...input,customerNumber:plan.number},user,date));
      });
      return toObject(await ref.get());
    }
    await db.runTransaction(async tx=>{
      if(table==='leads'){
        let counter=null;
        if(input.status==='Qualifiziert')counter=await nextSequence(tx,'offer');
        tx.create(ref,newRecord(input,user,date));
        if(counter){
          const offerRef=col('offerten').doc(keyId('lead-',ref.id));
          const offer=newRecord({
            number:String(counter.next),leadId:ref.id,customerId:'',
            title:'Automation für '+input.company,
            description:'',items:[],oneTimeCHF:0,monthlyCHF:0,
            validUntil:'',status:'Entwurf'
          },user,date);
          tx.set(counter.reference,{next:counter.next+1},{merge:true});
          tx.create(offerRef,offer);
        }
      }
      if(table==='offerten'){
        const lead=input.leadId?await tx.get(col('leads').doc(input.leadId)):null;
        if(input.leadId&&(!lead?.exists||lead.data().status!=='Qualifiziert'))
          throw err('Lead zuerst qualifizieren');
        if(input.leadId&&await queryOne(tx,'offerten','leadId',input.leadId))
          throw err('Für diesen Lead existiert bereits eine Offerte');
        await assertCustomer(tx,input.customerId);
        const counter=await nextSequence(tx,'offer');
        tx.set(counter.reference,{next:counter.next+1},{merge:true});
        tx.create(ref,newRecord({...input,number:String(counter.next)},user,date));
      }
      if(table==='projekte'){
        await assertCustomer(tx,input.customerId);
        await acceptedOffer(tx,input.offerId);
        if(input.offerId&&await queryOne(tx,'projekte','offerId',input.offerId))
          throw err('Diese Offerte ist bereits einem Projekt zugeordnet');
        tx.create(ref,newRecord({...input,tasks:input.tasks||[],onboarding:input.onboarding||defaultOnboarding()},user,date));
      }
      if(table==='rechnungen'){
        await assertCustomer(tx,input.customerId);
        const project=await assertProject(tx,input.projectId);
        if(project?.data().customerId && input.customerId!==project.data().customerId)
          throw err('Projekt und Rechnung müssen denselben Kunden haben');
        validateInvoice(input,null);
        if(!input.invoiceDate)input.invoiceDate=docDate();
        const counter=await nextSequence(tx,'invoice');
        tx.set(counter.reference,{next:counter.next+1},{merge:true});
        tx.create(ref,newRecord({...input,number:'RE-'+counter.next},user,date));
      }
    });
    const saved=await ref.get();
    return toObject(saved);
  }

  async function update(table,id,payload,user){
    const input=clean(table,payload);
    if(!Object.keys(input).length)throw err('Keine Änderungen');
    if(table==='rechnungen'&&Object.hasOwn(input,'amountCHF')&&!Object.hasOwn(input,'items'))
      throw err('Rechnungsbetrag wird aus Positionen berechnet');
    if(table==='offerten'&&Object.hasOwn(input,'items'))Object.assign(input,quoteTotals(input.items));
    if(table==='rechnungen'&&Object.hasOwn(input,'items'))Object.assign(input,invoiceTotals(input.items));
    if(table==='rechnungen'&&['Bezahlt','Teilbezahlt'].includes(input.status))
      throw err('Zahlungsstatus ausschliesslich über Zahlungseingang erfassen',409);
    const ref=col(table).doc(id),date=now();
    await db.runTransaction(async tx=>{
      const existing=await tx.get(ref);
      if(!existing.exists)throw err('Datensatz nicht gefunden',404);
      const before=existing.data();
      const merged={...before,...input};
      verify(table,merged);
      if(table==='leads'&&(Object.hasOwn(input,'nextAction')||Object.hasOwn(input,'followUpDate')))
        followUpFields(merged);
      if(table==='kunden'){
        tx.update(ref,audit(input,user,date));return;
      }
      if(table==='leads'){
        // "Neu" is an entry state, never a destination after the lead was processed.
        if(before.status!=='Neu' && input.status==='Neu')
          throw err('Ein bearbeiteter Lead kann nicht auf «Neu» zurückgesetzt werden',409);
        if(before.status==='Gewonnen' && input.status&&input.status!=='Gewonnen')
          throw err('Gewonnener Auftrag kann nicht zurückgestuft werden');
        if(before.status==='Gewonnen'){
          tx.update(ref,audit(input,user,date));return;
        }
        const requested=input.status||before.status;
        const quote=await queryOne(tx,'offerten','leadId',id);
        if(requested==='Gewonnen'){
          if(!quote)throw err('Gewonnen setzt eine bestehende Offerte voraus');
          const changes={...input};delete changes.status;
          await win(tx,{offerRef:quote.ref,offer:quote.data(),leadRef:ref,lead:merged,leadUpdate:changes},user,date);
          return;
        }
        if(requested==='Qualifiziert'){
          if(!quote){
            const counter=await nextSequence(tx,'offer');
            const offerRef=col('offerten').doc(keyId('lead-',id));
            // Manual/old ID collision guard; do not overwrite.
            const occupied=await tx.get(offerRef);
            if(occupied.exists)throw err('Offerten-Verknüpfung bereits vorhanden',409);
            const newOffer=newRecord({
              number:String(counter.next),leadId:id,customerId:'',
              title:'Automation für '+merged.company,description:'',
              items:[],oneTimeCHF:0,monthlyCHF:0,validUntil:'',status:'Entwurf'
            },user,date);
            tx.set(counter.reference,{next:counter.next+1},{merge:true});
            tx.create(offerRef,newOffer);
          }else if(quote.data().status==='Abgelehnt'){
            tx.update(quote.ref,audit({status:'Entwurf'},user,date));
          }
        }
        if(requested==='Verloren'&&quote&&quote.data().status!=='Angenommen')
          tx.update(quote.ref,audit({status:'Abgelehnt'},user,date));
        tx.update(ref,audit(input,user,date));
        return;
      }
      if(table==='offerten'){
        if(['sending','manual_review'].includes(before.offerDispatchState))
          throw err('Offerte hat einen laufenden oder ungeklärten Versandauftrag',409);
        // Once manually marked sent, the exact submitted offer must stay frozen.
        if(input.status==='Versendet')
          throw err('Versand nur über «Versand dokumentieren» erfassen',409);
        if(before.status==='Versendet' &&
           (Object.keys(input).some(key=>key!=='status') ||
            !['Angenommen','Abgelehnt'].includes(input.status)))
          throw err('Versendete Offerte darf nur angenommen oder abgelehnt werden',409);
        const wonLead=before.leadId?await tx.get(col('leads').doc(before.leadId)):null;
        if(before.status==='Angenommen'||wonLead?.data()?.status==='Gewonnen')
          throw err('Angenommene Offerte ist schreibgeschützt',403);
        if(merged.leadId){
          const lead=merged.leadId===before.leadId?wonLead:await tx.get(col('leads').doc(merged.leadId));
          if(!lead?.exists||!['Qualifiziert','Gewonnen'].includes(lead.data().status))
            throw err('Lead zuerst qualifizieren');
          if(merged.leadId!==before.leadId&&await queryOne(tx,'offerten','leadId',merged.leadId))
            throw err('Für diesen Lead existiert bereits eine Offerte');
        }
        await assertCustomer(tx,merged.customerId);
        if(merged.status==='Angenommen'){
          const lead=merged.leadId?(merged.leadId===before.leadId?wonLead:await tx.get(col('leads').doc(merged.leadId))):null;
          const offerAfter={...merged};
          const change={...input};delete change.status;
          // win() owns the acceptance update and link transition.
          await win(tx,{
            offerRef:ref,offer:offerAfter,leadRef:lead?.ref||null,lead:lead?.data()||null
          },user,date);
          if(Object.keys(change).length)tx.update(ref,audit(change,user,date));
          return;
        }
        if(merged.status==='Abgelehnt'&&wonLead?.exists)
          tx.update(wonLead.ref,audit({status:'Verloren'},user,date));
        tx.update(ref,audit(input,user,date));
        return;
      }
      if(table==='projekte'){
        if(before.offerId&&input.offerId!==undefined&&input.offerId!==before.offerId)
          throw err('Angenommene Offerte eines Projekts darf nicht geändert werden');
        if(before.offerId&&input.customerId!==undefined&&input.customerId!==before.customerId)
          throw err('Kunde eines gewonnenen Projekts darf nicht geändert werden');
        await assertCustomer(tx,merged.customerId);
        await acceptedOffer(tx,merged.offerId);
        if(merged.offerId!==before.offerId&&merged.offerId&&await queryOne(tx,'projekte','offerId',merged.offerId))
          throw err('Offerte ist bereits einem Projekt zugeordnet');
        tx.update(ref,audit(input,user,date));
        return;
      }
      if(table==='rechnungen'){
        if(before.source==='offer_acceptance'&&(merged.customerId!==before.customerId||merged.projectId!==before.projectId))
          throw err('Kunde und Projekt eines automatischen Auftragsentwurfs dürfen nicht geändert werden',409);
        if(isInvoiceLocked(before)||before.status==='Teilbezahlt'||(before.paymentHistory||[]).length)
          throw err('Rechnung mit Zahlungseingängen ist schreibgeschützt',403);
        if(['sending','manual_review'].includes(before.invoiceDispatchState))
          throw err('Rechnungsversand läuft oder muss zuerst geprüft werden',409);
        if(before.invoiceDispatchState==='confirmed'){
          if(Object.keys(input).some(k=>k!=='status')||
             !['Bezahlt','Storniert'].includes(input.status))
            throw err('Versendete Rechnung: nur noch Bezahlt oder Storniert möglich',409);
        }
        await assertCustomer(tx,merged.customerId);
        const project=await assertProject(tx,merged.projectId);
        if(project?.data()?.customerId && merged.customerId!==project.data().customerId)
          throw err('Projekt und Rechnung müssen denselben Kunden haben');
        validateInvoice(merged,before);
        tx.update(ref,audit(input,user,date));
      }
    });
    const saved=await ref.get();return toObject(saved);
  }

  // Manual reconciliation only: no bank access, outgoing mail or automatic cash booking.
  // The browser-generated paymentId is an idempotency key against duplicate clicks/retries.
  async function recordInvoicePayment(id,payload,user){
    const form=normalizePayment(payload,localSwissDate());
    const date=now(),ref=col('rechnungen').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Rechnung nicht gefunden',404);
      const before=snap.data();
      const history=Array.isArray(before.paymentHistory)?before.paymentHistory:[];
      const replay=history.find(p=>p.paymentId===form.paymentId);
      if(replay){
        if(['amountCHF','paidOn','method','reference'].some(key=>replay[key]!==form[key]))
          throw err('Buchungs-ID wurde bereits mit anderen Zahlungsdaten verwendet',409);
        return; // Exact duplicate: no second payment is posted.
      }
      if(!['Offen','Teilbezahlt'].includes(before.status)||before.invoiceDispatchState!=='confirmed')
        throw err('Zahlung nur auf offenem, nachweislich versendetem Beleg erfassen',409);
      if(history.length>=100)throw err('Maximal 100 Zahlungseinträge pro Rechnung',409);
      const remaining=outstandingCents(before);
      const received=Math.round(form.amountCHF*100);
      if(!remaining||received>remaining)throw err('Zahlungsbetrag übersteigt den offenen Restbetrag',409);
      if(form.reference&&history.some(p=>!p.voidedAt&&p.reference===form.reference&&p.method===form.method))
        throw err('Diese Zahlungsreferenz ist bei der Rechnung schon erfasst',409);
      const afterHistory=[...history,{...form,recordedAt:date,recordedBy:user.email}];
      const totalPaid=paidCents({...before,paymentHistory:afterHistory});
      const outstanding=Math.max(0,Math.round(Number(before.amountCHF)*100)-totalPaid);
      const complete=outstanding===0;
      tx.update(ref,audit({
        paymentHistory:afterHistory,paidAmountCHF:totalPaid/100,outstandingCHF:outstanding/100,
        lastPaymentOn:form.paidOn,status:complete?'Bezahlt':'Teilbezahlt',
        ...(complete?{paidAt:date}:{}),
      },user,date));
    });
    return toObject(await ref.get());
  }

  // Never delete a payment. Corrections reverse its effect while retaining
  // both the original booking and the reason/user/time of the correction.
  async function reverseInvoicePayment(id,payload,user){
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       Object.keys(payload).some(k=>!['paymentId','reversalId','reason'].includes(k))||
       typeof payload.paymentId!=='string'||typeof payload.reversalId!=='string'||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.paymentId)||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.reversalId)||
       typeof payload.reason!=='string'||payload.reason.trim().length<8||payload.reason.trim().length>250)
      throw err('Korrektur benötigt gültige Buchungs-ID, Korrektur-ID und Begründung (8–250 Zeichen)');
    const reason=payload.reason.trim(),date=now(),ref=col('rechnungen').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Rechnung nicht gefunden',404);
      const before=snap.data();
      const history=Array.isArray(before.paymentHistory)?before.paymentHistory:[];
      const index=history.findIndex(p=>p.paymentId===payload.paymentId);
      if(index<0)throw err('Zahlungsbuchung nicht gefunden',404);
      const payment=history[index];
      if(payment.voidedAt){
        if(payment.reversalId===payload.reversalId&&payment.voidReason===reason)return;
        throw err('Zahlung wurde bereits korrigiert',409);
      }
      if(!['Bezahlt','Teilbezahlt'].includes(before.status)||before.invoiceDispatchState!=='confirmed')
        throw err('Keine korrigierbare Zahlung auf dieser Rechnung',409);
      const amended=history.map((p,i)=>i===index?{...p,
        voidedAt:date,voidedBy:user.email,voidReason:reason,reversalId:payload.reversalId}:p);
      const paid=paidCents({...before,paymentHistory:amended});
      const remaining=Math.max(0,Math.round(Number(before.amountCHF)*100)-paid);
      const status=remaining===0?'Bezahlt':paid>0?'Teilbezahlt':'Offen';
      tx.update(ref,audit({paymentHistory:amended,paidAmountCHF:paid/100,
        outstandingCHF:remaining/100,status,paidAt:status==='Bezahlt'?before.paidAt:null,
        lastPaymentCorrectionAt:date,lastPaymentCorrectionBy:user.email},user,date));
    });
    return toObject(await ref.get());
  }

  // The CRM only logs a reminder AFTER the operator confirms they sent it externally.
  // This API never contacts Make/Gmail, queues mail or changes the invoice amount.
  async function recordInvoiceReminder(id,payload,user){
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||
       Object.keys(payload).some(k=>!['reminderId','kind'].includes(k))||
       typeof payload.reminderId!=='string'||
       !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.reminderId))
      throw err('Ungültige Mahnprotokollierung');
    const kinds=['Zahlungserinnerung','1. Mahnung','2. Mahnung'];
    if(!kinds.includes(payload.kind))throw err('Ungültige Mahnstufe');
    const date=now(),today=localSwissDate(),ref=col('rechnungen').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Rechnung nicht gefunden',404);
      const invoice=snap.data();
      const previous=Array.isArray(invoice.reminderHistory)?invoice.reminderHistory:[];
      const replay=previous.find(item=>item.reminderId===payload.reminderId);
      if(replay){
        if(replay.kind!==payload.kind)throw err('Mahn-ID mit abweichender Stufe schon verwendet',409);
        return;
      }
      if(!['Offen','Teilbezahlt'].includes(invoice.status)||
         invoice.invoiceDispatchState!=='confirmed'||!invoice.dueDate||
         invoice.dueDate>=today||outstandingCents(invoice)===0)
        throw err('Mahnung nur für überfällige, versendete und unbezahlte Rechnungen',409);
      if(previous.length>=3)throw err('Manuelle Mahnfolge abgeschlossen',409);
      if(payload.kind!==kinds[previous.length])
        throw err('Mahnstufe muss in Reihenfolge dokumentiert werden',409);
      if(previous.length && Date.parse(date)-Date.parse(previous[previous.length-1].at)<7*24*60*60*1000)
        throw err('Zwischen zwei Mahnstufen mindestens sieben Tage abwarten',409);
      const customer=invoice.customerId?await tx.get(col('kunden').doc(invoice.customerId)):null;
      if(!customer?.exists||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(customer.data().email||'')))
        throw err('Kundenadresse für Mahnprotokoll fehlt',409);
      tx.update(ref,audit({
        reminderHistory:[...previous,{
          reminderId:payload.reminderId,kind:payload.kind,at:date,by:user.email,
          recipient:customer.data().email,delivery:'operator_confirmed_external',
          outstandingCHF:outstandingCents(invoice)/100
        }],
        lastReminderAt:date,lastReminderKind:payload.kind
      },user,date));
    });
    return toObject(await ref.get());
  }

  // Exactly-once claim: the offer sender uses the same transaction-first pattern.
  // Never infer a sent invoice from a webhook HTTP 200 without the matching Gmail messageId.
  async function claimInvoiceSend(id,user){
    const date=now(),ref=col('rechnungen').doc(id);
    let claimed=null;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Rechnung nicht gefunden',404);
      const invoice=snap.data();
      if(invoice.status!=='Offen')throw err('Versand nur für offene Rechnungen erlaubt',409);
      if(invoice.invoiceDispatchState==='confirmed'||invoice.invoiceSentAt)
        throw err('Rechnung wurde bereits versendet',409);
      if(['sending','manual_review'].includes(invoice.invoiceDispatchState))
        throw err('Versand läuft oder muss manuell geprüft werden',409);
      if(!/^RE-[0-9]{1,10}$/.test(String(invoice.number||''))||
         !invoice.customerId||!invoice.dueDate||
         !Array.isArray(invoice.items)||!invoice.items.length||
         !(Number(invoice.amountCHF)>0))
        throw err('Rechnung ist noch nicht versandbereit',409);
      const customerSnap=await tx.get(col('kunden').doc(invoice.customerId));
      if(!customerSnap.exists)throw err('Rechnungskunde fehlt',409);
      const customer=customerSnap.data();
      const to=String(customer.email||'').trim().toLowerCase();
      if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)||
         !customer.company||!customer.street||!customer.postalCode||!customer.city)
        throw err('Kunden-E-Mail oder Rechnungsanschrift unvollständig',409);
      // Swiss QR structured debtor address needs a separable house number.
      if(!/^(.*?)\s+(\d+[a-zA-Z]?(?:[-/]\d+)?)$/.test(String(customer.street).trim()))
        throw err('Für die Swiss-QR-Rechnung Strasse mit Hausnummer beim Kunden erfassen',409);
      const projectSnap=invoice.projectId?
        await tx.get(col('projekte').doc(invoice.projectId)):null;
      if(invoice.projectId&&!projectSnap?.exists)throw err('Projekt der Rechnung fehlt',409);
      const attemptId=randomUUID();
      tx.update(ref,audit({
        invoiceDispatchState:'sending',invoiceDispatchAttemptId:attemptId,
        invoiceDispatchRequestedAt:date,invoiceDispatchRequestedBy:user.email,
        invoiceDispatchTo:to,invoiceDispatchError:''
      },user,date));
      claimed={id,attemptId,to,invoice:{id,...invoice},
        customer:{id:invoice.customerId,...customer,email:to},
        project:projectSnap?.exists?{id:invoice.projectId,...projectSnap.data()}:null,
        isSynthetic:/^TEST_ONLY\b/i.test(String(invoice.description||''))||
          /^TEST_ONLY\b/i.test(String(customer.company||''))||
          String(customer.company).trim().toLowerCase()==='lszh invest gmbh'};
    });
    return claimed;
  }
  async function finishInvoiceSend(id,attemptId,status,receipt=''){
    if(!['confirmed','preparation_failed','manual_review'].includes(status))
      throw err('Ungültiges Versandresultat');
    const date=now(),ref=col('rechnungen').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Rechnung nicht gefunden',404);
      const previous=snap.data();
      if(previous.invoiceDispatchState!=='sending'||previous.invoiceDispatchAttemptId!==attemptId)
        throw err('Rechnungsversand wurde bereits verarbeitet',409);
      const values={
        invoiceDispatchState:status,invoiceDispatchResultAt:date,
        invoiceDispatchError:status==='manual_review'?String(receipt).slice(0,100):''
      };
      if(status==='confirmed')Object.assign(values,{
        invoiceSentAt:date,invoiceSentBy:previous.invoiceDispatchRequestedBy,
        invoiceSentTo:previous.invoiceDispatchTo,
        invoiceDispatchProviderId:String(receipt).slice(0,200)
      });
      tx.update(ref,audit(values,{email:previous.invoiceDispatchRequestedBy},date));
    });
    return toObject(await ref.get());
  }
  async function resolveInvoiceSend(id,resolution,user){
    if(!['confirmed','not_sent'].includes(resolution))throw err('Ungültige Prüfung');
    const date=now(),ref=col('rechnungen').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Rechnung nicht gefunden',404);
      const before=snap.data();
      const stale=before.invoiceDispatchState==='sending'&&
        Number.isFinite(Date.parse(before.invoiceDispatchRequestedAt||''))&&
        Date.now()-Date.parse(before.invoiceDispatchRequestedAt)>=5*60*1000;
      if(before.status!=='Offen'||!['manual_review'].includes(before.invoiceDispatchState)&&!stale)
        throw err('Kein manuell prüfbarer Rechnungsversand',409);
      const values={
        invoiceDispatchState:resolution==='confirmed'?'confirmed':'not_sent',
        invoiceDispatchReviewedAt:date,invoiceDispatchReviewedBy:user.email,
        invoiceDispatchError:''
      };
      if(resolution==='confirmed')Object.assign(values,{
        invoiceSentAt:date,invoiceSentBy:before.invoiceDispatchRequestedBy,
        invoiceSentTo:before.invoiceDispatchTo,
        invoiceDispatchProviderId:'manual_verification'
      });
      tx.update(ref,audit(values,user,date));
    });
    return toObject(await ref.get());
  }
  async function claimOfferSend(id,payload,user){
    const date=now(),today=date.slice(0,10);
    const requested=normalizeDispatchInput(payload,today);
    const ref=col('offerten').doc(id);
    let claimed=null;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Offerte nicht gefunden',404);
      const offer=snap.data();
      if(['sending','manual_review'].includes(offer.offerDispatchState))
        throw err('Versand bereits in Bearbeitung oder manuell zu prüfen',409);
      const lead=offer.leadId?await tx.get(col('leads').doc(offer.leadId)):null;
      const customer=offer.customerId?await tx.get(col('kunden').doc(offer.customerId)):null;
      const recipient=lead?.data()?.email?lead.data():customer?.data();
      const to=checkReadyForDispatch(offer,recipient,today);
      const attemptId=randomUUID();
      tx.update(ref,audit({
        offerDispatchState:'sending',offerDispatchAttemptId:attemptId,
        offerDispatchRequestedAt:date,offerDispatchRequestedBy:user.email,
        offerDispatchTo:to,offerDispatchFollowUpDate:requested.followUpDate,
        offerDispatchError:''
      },user,date));
      claimed={id,attemptId,offer:{id,...offer},recipient:{...recipient,email:to},
        to,followUpDate:requested.followUpDate};
    });
    return claimed;
  }
  async function recordOfferDispatchSnapshot(id,attemptId,snapshot){
    if(!snapshot||snapshot.attemptId!==attemptId||snapshot.offerId!==id||snapshot.completeContractPackage!==false||
       !/^[a-f0-9]{64}$/.test(snapshot.offerSnapshotSha256||'')||!/^[a-f0-9]{64}$/.test(snapshot.pdfSha256||''))throw err('Ungültiger Versand-Snapshot');
    const ref=col('offerten').doc(id),archive=db.collection(prefix+'offer_dispatch_snapshots').doc(attemptId);
    await db.runTransaction(async tx=>{
      const offer=await tx.get(ref),old=await tx.get(archive);
      if(!offer.exists||offer.data().offerDispatchState!=='sending'||offer.data().offerDispatchAttemptId!==attemptId||
         offer.data().offerDispatchTo!==snapshot.recipient)throw err('Versandreservierung passt nicht zum Snapshot',409);
      if(old.exists){if(old.data().offerSnapshotSha256!==snapshot.offerSnapshotSha256||old.data().pdfSha256!==snapshot.pdfSha256)throw err('Versand-Snapshot ist unveränderlich',409);return;}
      tx.create(archive,{...snapshot,capturedAt:now()});
    });
  }
  async function finishOfferSend(id,attemptId,status,receipt=''){
    if(!['confirmed','preparation_failed','manual_review'].includes(status))
      throw err('Ungültiges Versandresultat');
    const date=now(),ref=col('offerten').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Offerte nicht gefunden',404);
      const offer=snap.data();
      if(offer.offerDispatchState!=='sending'||offer.offerDispatchAttemptId!==attemptId)
        throw err('Versandauftrag wurde bereits verarbeitet',409);
      const values={
        offerDispatchState:status,offerDispatchResultAt:date,
        offerDispatchError:status==='manual_review'?String(receipt).slice(0,100):''
      };
      if(status==='confirmed'){
        Object.assign(values,{
          status:'Versendet',sentAt:date,sentBy:offer.offerDispatchRequestedBy,
          sentTo:offer.offerDispatchTo,
          followUpDate:offer.offerDispatchFollowUpDate,
          followUpCount:0,followUpHistory:[],
          offerDispatchProviderId:String(receipt).slice(0,200)
        });
      }
      tx.update(ref,audit(values,{email:offer.offerDispatchRequestedBy},date));
    });
    return toObject(await ref.get());
  }
  async function resolveOfferSend(id,resolution,user){
    if(!['confirmed','not_sent'].includes(resolution))throw err('Ungültige Prüfung');
    const date=now(),ref=col('offerten').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Offerte nicht gefunden',404);
      const before=snap.data();
      const stalePending=before.offerDispatchState==='sending'&&
        Number.isFinite(Date.parse(before.offerDispatchRequestedAt||''))&&
        Date.now()-Date.parse(before.offerDispatchRequestedAt)>=5*60*1000;
      if(before.status!=='Bereit'||
         before.offerDispatchState!=='manual_review'&&!stalePending)
        throw err('Kein prüfbarer Versandauftrag vorhanden',409);
      const values={
        offerDispatchState:resolution==='confirmed'?'confirmed':'not_sent',
        offerDispatchReviewedBy:user.email,
        offerDispatchReviewedAt:date,offerDispatchError:''
      };
      if(resolution==='confirmed')Object.assign(values,{
        status:'Versendet',sentAt:date,sentBy:before.offerDispatchRequestedBy,
        sentTo:before.offerDispatchTo,
        followUpDate:before.offerDispatchFollowUpDate,
        followUpCount:0,followUpHistory:[],
        offerDispatchProviderId:'manual_verification'
      });
      tx.update(ref,audit(values,user,date));
    });
    return toObject(await ref.get());
  }
  async function recordOfferDispatch(id,payload,user){
    const date=now(),today=date.slice(0,10);
    const form=normalizeDispatchInput(payload,today);
    const ref=col('offerten').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Offerte nicht gefunden',404);
      const offer=snap.data();
      if(['sending','manual_review'].includes(offer.offerDispatchState))
        throw err('Ein Versandauftrag läuft oder muss zuerst überprüft werden',409);
      const lead=offer.leadId?await tx.get(col('leads').doc(offer.leadId)):null;
      const customer=offer.customerId?await tx.get(col('kunden').doc(offer.customerId)):null;
      const email=checkReadyForDispatch(offer,
        lead?.data()?.email?lead.data():customer?.data(),today);
      tx.update(ref,audit({
        status:'Versendet',sentAt:date,sentBy:user.email,sentTo:email,
        followUpDate:form.followUpDate,followUpCount:0,followUpHistory:[]
      },user,date));
    });
    return toObject(await ref.get());
  }
  async function recordOfferFollowUp(id,payload,user){
    const date=now(),today=date.slice(0,10);
    const form=normalizeFollowUpInput(payload,today);
    const ref=col('offerten').doc(id);
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      if(!snap.exists)throw err('Offerte nicht gefunden',404);
      const before=snap.data();
      if(before.status!=='Versendet')
        throw err('Nachfassen nur bei versendeten Offerten möglich',409);
      const history=Array.isArray(before.followUpHistory)?before.followUpHistory:[];
      if(history.length>=50)throw err('Maximale Anzahl Nachfassaktionen erreicht',409);
      tx.update(ref,audit({
        lastFollowUpAt:date,lastFollowUpBy:user.email,
        followUpDate:form.followUpDate,followUpCount:history.length+1,
        followUpHistory:[...history,{at:date,by:user.email,note:form.note}]
      },user,date));
    });
    return toObject(await ref.get());
  }
  async function addContact(id,payload,user){
    const details=validateContact(payload);
    const ref=col('leads').doc(id);
    const date=now(),entry={
      id:randomUUID(),...details,createdAt:date,createdBy:user.email
    };
    await db.runTransaction(async tx=>{
      const doc=await tx.get(ref);
      if(!doc.exists)throw err('Lead nicht gefunden',404);
      const before=doc.data();
      const history=Array.isArray(before.contactHistory)?before.contactHistory:[];
      if(history.length>=MAX_CONTACTS)
        throw err('Kontaktverlauf hat die maximale Anzahl Einträge erreicht',409);
      const updates={contactHistory:[...history,entry],lastContactAt:date};
      if(before.status==='Neu'&&shouldMarkContacted(details.outcome))
        updates.status='Kontaktiert';
      tx.update(ref,audit(updates,user,date));
    });
    return entry;
  }
  async function remove(table,id){
    // Deletion is deliberately restricted to unprocessed leads, never to
    // customers, offers, invoices or projects. Firestore transaction re-reads
    // current status and linked offers to handle concurrent status changes.
    if(table!=='leads')throw err('Nur neue Website-Leads dürfen gelöscht werden',405);
    const ref=col('leads').doc(id);
    await db.runTransaction(async tx=>{
      const lead=await tx.get(ref);
      if(!lead.exists)throw err('Lead nicht gefunden',404);
      if(lead.data().status!=='Neu')throw err('Nur Leads mit Status «Neu» dürfen gelöscht werden',409);
      const linked=await queryOne(tx,'offerten','leadId',id);
      if(linked)throw err('Lead hat bereits eine verknüpfte Offerte und kann nicht gelöscht werden',409);
      tx.delete(ref);
    });
    return {id,deleted:true};
  }
  return {ensureInitialInvoice,ensureCustomerNumber,TABLES,list,listPage,searchPage,scan,get,create,update,remove,addContact,recordOfferDispatch,recordOfferFollowUp,claimOfferSend,recordOfferDispatchSnapshot,finishOfferSend,resolveOfferSend,claimInvoiceSend,finishInvoiceSend,resolveInvoiceSend,recordInvoicePayment,reverseInvoicePayment,recordInvoiceReminder,reminders,clean};
}
module.exports={buildStore,clean,TABLES,STATUS};
