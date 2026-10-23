'use strict';

// Firestore persistence for the authenticated Cloud CRM. No direct browser
// Firestore access; all multi-record state transitions use transactions.
// Staging uses its own prefix and never reads or changes website live leads.
const {quoteTotals}=require('./offer-pricing');
const {invoiceTotals,isInvoiceLocked}=require('./invoice-pricing');
const {cleanProjectTasks}=require('./project-tasks');
const {LEAD_STATES}=require('./lead-lifecycle');
const {randomUUID}=require('node:crypto');
const {MAX_CONTACTS,validateContact,shouldMarkContacted,followUpFields,offerDescription}=require('./lead-contact');

const TABLES=['leads','kunden','offerten','rechnungen','projekte'];
const STATUS={
  leads:LEAD_STATES,
  kunden:['Aktiv','Inaktiv'],
  offerten:['Entwurf','Bereit','Versendet','Angenommen','Abgelehnt'],
  rechnungen:['Entwurf','Offen','Bezahlt','Storniert'],
  projekte:['Geplant','In Arbeit','Wartet auf Kunde','Abgeschlossen']
};
const FIELDS={
  leads:['name','company','email','street','postalCode','city','country','message','currentProcess','systems','mainProblem','frequency','desiredResult','budgetRange','qualificationNotes','nextAction','followUpDate','status'],
  kunden:['company','contactName','email','street','postalCode','city','country','notes','status'],
  offerten:['leadId','customerId','title','description','items','oneTimeCHF','monthlyCHF','validUntil','status'],
  rechnungen:['customerId','projectId','description','invoiceDate','items','amountCHF','dueDate','status'],
  projekte:['customerId','offerId','title','description','dueDate','tasks','status']
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
  const acceptedOffer=async(tx,id)=>{
    if(!id)return null;
    const snap=await tx.get(col('offerten').doc(id));
    if(!snap.exists||snap.data().status!=='Angenommen')throw err('Nur angenommene Offerten dürfen einem Projekt zugeordnet werden');
    return snap;
  };
  const validateInvoice=(data,previous)=>{
    if(data.status==='Offen' && (
      !data.customerId||!data.dueDate||!Array.isArray(data.items)||!data.items.length||!(data.amountCHF>0)
    ))throw err('Für eine offene Rechnung Kunde, Fälligkeit und Positionen mit Betrag angeben');
    if(data.status==='Bezahlt' && previous?.status!=='Offen')throw err('Rechnung zuerst auf Offen setzen');
    if(previous?.status==='Offen'&&data.status==='Entwurf')throw err('Offene Rechnung nicht in Entwurf zurücksetzen');
  };
  // Called after its inputs (customer/project and any associated lead) are read.
  // The helper performs every remaining read BEFORE any transaction writes.
  async function win(tx,{offerRef,offer,leadRef=null,lead=null,leadUpdate={}},user,date){
    if(!offer)throw err('Gewonnen setzt eine bestehende Offerte voraus');
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
    if(!customer){
      const fields={
        company:lead?.company||'Kunde aus Offerte',
        contactName:lead?.name||'',email:lead?.email||'',
        street:lead?.street||'',postalCode:lead?.postalCode||'',
        city:lead?.city||'',country:lead?.country||'Schweiz',
        notes:'Automatisch aus angenommener Offerte übernommen',status:'Aktiv'
      };
      tx.create(finalCustomer,newRecord(fields,user,date));
    }
    const finalProject=project?.ref||projectRef;
    if(!project&&!createdProject?.exists){
      const fields={
        customerId:finalCustomer.id,offerId:offerRef.id,
        title:offer.title||'Gewonnenes Projekt',description:offer.description||'',
        dueDate:'',tasks:[],status:'Geplant'
      };
      tx.create(finalProject,newRecord(fields,user,date));
    }
    tx.update(offerRef,audit({status:'Angenommen',customerId:finalCustomer.id},user,date));
    if(leadRef)tx.update(leadRef,audit({...leadUpdate,status:'Gewonnen'},user,date));
    return {customerId:finalCustomer.id,projectId:finalProject.id};
  }

  async function list(table,limit=200){
    const snap=await col(table).orderBy('createdAt','desc').limit(Math.min(Math.max(Number(limit)||200,1),200)).get();
    return snap.docs.map(toObject);
  }
  async function get(table,id){
    const doc=await col(table).doc(id).get();
    return doc.exists?toObject(doc):null;
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
    if(table==='rechnungen'&&input.status==='Bezahlt')throw err('Rechnung zuerst auf Offen setzen');
    if(table==='offerten'&&input.status==='Angenommen')throw err('Offerte zuerst speichern, dann auf Angenommen setzen');
    verify(table,input);
    if(table==='leads')followUpFields(input);
    const date=now(),ref=col(table).doc();
    if(table==='kunden'){
      await ref.create(newRecord(input,user,date));
      return {id:ref.id,...newRecord(input,user,date)};
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
            description:offerDescription(input),items:[],oneTimeCHF:0,monthlyCHF:0,
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
        tx.create(ref,newRecord({...input,tasks:input.tasks||[]},user,date));
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
              title:'Automation für '+merged.company,description:offerDescription(merged),
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
        if(isInvoiceLocked(before))throw err('Bezahlte oder stornierte Rechnung ist schreibgeschützt',403);
        await assertCustomer(tx,merged.customerId);
        const project=await assertProject(tx,merged.projectId);
        if(project?.data()?.customerId && merged.customerId!==project.data().customerId)
          throw err('Projekt und Rechnung müssen denselben Kunden haben');
        validateInvoice(merged,before);
        if(merged.status==='Bezahlt')input.paidAt=date;
        tx.update(ref,audit(input,user,date));
      }
    });
    const saved=await ref.get();return toObject(saved);
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
  return {TABLES,list,get,create,update,remove,addContact,reminders,clean};
}
module.exports={buildStore,clean,TABLES,STATUS};
