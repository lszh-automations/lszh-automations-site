'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Firestore}=require('@google-cloud/firestore');
const {buildStore}=require('../cloud-records'),{createRestDb}=require('../../scripts/crm-rest-repair.cjs');
const projectId='demo-lszha-c2-20261025',prefix='lszh_crm_v2_staging_',user={email:'synthetic-operator@example.com'};
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788'||process.env.GOOGLE_CLOUD_PROJECT!==projectId)throw Error('Demo emulator required');
const clients=[];after(async()=>Promise.all(clients.map(x=>x.terminate())));
function setup(){const db=new Firestore({projectId});clients.push(db);return {db,store:buildStore(db,prefix)};}
test('concurrent customer creation allocates unique numbers with two independent clients',async()=>{
 const a=setup(),b=setup(),customers=await Promise.all([a.store.create('kunden',{company:'TEST_ONLY '+randomUUID()},user),b.store.create('kunden',{company:'TEST_ONLY '+randomUUID()},user)]);
 assert.notEqual(customers[0].customerNumber,customers[1].customerNumber);assert.match(customers[0].customerNumber,/^KD-\d+$/);
 const numbers=await Promise.all([a.store.ensureCustomerNumber(customers[0].id,user),b.store.ensureCustomerNumber(customers[0].id,user)]);assert.equal(numbers[0].customerNumber,numbers[1].customerNumber);
});
test('acceptance atomically creates one-time invoice; concurrent repair cannot duplicate it',async()=>{
 const a=setup(),b=setup(),customer=await a.store.create('kunden',{company:'TEST_ONLY '+randomUUID()},user);
 const offer=await a.store.create('offerten',{customerId:customer.id,title:'TEST_ONLY order',items:[{title:'Setup',qty:2,unitPriceCHF:99.95,mode:'einmalig'},{title:'Monthly',qty:1,unitPriceCHF:49,mode:'monatlich'}]},user);
 await a.store.update('offerten',offer.id,{status:'Angenommen'},user);
 const result=await Promise.all([a.store.ensureInitialInvoice(offer.id,user),b.store.ensureInitialInvoice(offer.id,user)]);
 assert.equal(result[0].invoice.id,result[1].invoice.id);assert.equal(result[0].invoice.amountCHF,199.9);assert.equal(result[0].invoice.status,'Entwurf');assert.equal(result[0].invoice.items.length,1);
 const invoices=await a.db.collection(prefix+'rechnungen').where('offerId','==',offer.id).get();assert.equal(invoices.size,1);
});
test('the exact REST repair path backfills a legacy accepted order and customer once without changing IDs',async()=>{
 const a=setup(),id='test_legacy_'+randomUUID().replace(/-/g,''),customerId=id+'_customer',projectDocId=id+'_project';
 await a.db.collection(prefix+'kunden').doc(customerId).set({company:'TEST_ONLY legacy',status:'Aktiv'});
 await a.db.collection(prefix+'offerten').doc(id).set({status:'Angenommen',number:'99001',customerId,title:'TEST_ONLY legacy',items:[{title:'Setup',qty:1,unitPriceCHF:180.15,mode:'einmalig'},{title:'Monthly',qty:1,unitPriceCHF:19,mode:'monatlich'}]});
 await a.db.collection(prefix+'projekte').doc(projectDocId).set({customerId,offerId:id,status:'Geplant',title:'TEST_ONLY legacy'});
 const store=buildStore(createRestDb({projectId,emulatorHost:'127.0.0.1:8788'}),prefix);
 const first=await store.ensureInitialInvoice(id,user),second=await store.ensureInitialInvoice(id,user);
 assert.equal(first.invoice.id,second.invoice.id);assert.equal(first.invoice.amountCHF,180.15);assert.equal(first.invoice.customerId,customerId);assert.equal(first.invoice.projectId,projectDocId);
 assert.match((await store.get('kunden',customerId)).customerNumber,/^KD-\d+$/);assert.equal((await store.get('offerten',id)).status,'Angenommen');
});


test('accepted project onboarding persists independently and rejected premature readiness cannot alter it',async()=>{
 const a=setup(),customer=await a.store.create('kunden',{company:'TEST_ONLY '+randomUUID()},user);
 const offer=await a.store.create('offerten',{customerId:customer.id,title:'TEST_ONLY onboarding',items:[{title:'Setup',qty:1,unitPriceCHF:100,mode:'einmalig'}]},user);
 await a.store.update('offerten',offer.id,{status:'Angenommen'},user);
 const rows=await a.db.collection(prefix+'projekte').where('offerId','==',offer.id).get(),id=rows.docs[0].id;
 const before=await a.store.get('projekte',id),invoiceBefore=await a.store.get('offerten',offer.id);
 assert.equal(before.onboarding.makeRequired,null);
 const o={makeRequired:true,invitationConfirmed:false,accessConfirmed:false,notes:'TEST_ONLY Einladung fehlt'};
 await a.store.update('projekte',id,{onboarding:o},user);
 await assert.rejects(()=>a.store.update('projekte',id,{onboarding:{...o,accessConfirmed:true}},user),/Zuerst/);
 assert.deepEqual((await a.store.get('projekte',id)).onboarding,o);
 await a.store.update('projekte',id,{onboarding:{...o,invitationConfirmed:true,accessConfirmed:true}},user);
 const saved=await a.store.get('projekte',id);assert.equal(saved.onboarding.accessConfirmed,true);assert.equal(saved.status,'Geplant');
 assert.equal(saved.customerId,customer.id);assert.equal(saved.offerId,offer.id);
 assert.deepEqual(await a.store.get('offerten',offer.id),invoiceBefore);
});


test('project invoice review reads the actual accepted-order draft without changing commercial records',async()=>{
 const a=setup(),customer=await a.store.create('kunden',{company:'TEST_ONLY '+randomUUID(),email:'synthetic@example.invalid',street:'Testweg 1',postalCode:'5610',city:'Wohlen'},user);
 const offer=await a.store.create('offerten',{customerId:customer.id,title:'TEST_ONLY invoice review',items:[{title:'Setup',qty:1,unitPriceCHF:100,mode:'einmalig'}]},user);
 await a.store.update('offerten',offer.id,{status:'Angenommen'},user);
 const accepted=await a.store.get('offerten',offer.id),invoice=await a.store.get('rechnungen',accepted.initialInvoiceId),before=JSON.stringify(invoice);
 const billing=await a.store.projectBilling(invoice.projectId),review=await a.store.invoiceReview(invoice.id);
 assert.deepEqual(billing.records.map(x=>x.id),[invoice.id]);assert.ok(review.readiness.missing.includes('Gültige Fälligkeit'));assert.equal(review.readiness.canSend,false);
 assert.equal(JSON.stringify(await a.store.get('rechnungen',invoice.id)),before);
 await a.store.update('rechnungen',invoice.id,{dueDate:'2026-11-10',status:'Offen'},user);
 assert.equal((await a.store.invoiceReview(invoice.id)).readiness.canSend,true);
 assert.deepEqual(await a.store.get('offerten',offer.id),accepted);
});


test('concurrent project starts persist one audit and leave linked commercial records unchanged',async()=>{
 const a=setup(),b=setup(),customer=await a.store.create('kunden',{company:'TEST_ONLY start '+randomUUID()},user);
 const offer=await a.store.create('offerten',{customerId:customer.id,title:'TEST_ONLY start',items:[{title:'Setup',qty:1,unitPriceCHF:100,mode:'einmalig'}]},user);
 await a.store.update('offerten',offer.id,{status:'Angenommen'},user);
 const accepted=await a.store.get('offerten',offer.id),invoice=await a.store.get('rechnungen',accepted.initialInvoiceId),id=invoice.projectId;
 await assert.rejects(()=>a.store.startProject(id,user),e=>e.status===409);
 await a.store.update('projekte',id,{startDate:'2020-01-02',owner:'TEST_ONLY responsible',tasks:[{title:'Umsetzen',done:false}],onboarding:{makeRequired:true,invitationConfirmed:true,accessConfirmed:true,notes:''}},user);
 const result=await Promise.all([a.store.startProject(id,user),b.store.startProject(id,{email:'other@example.invalid'})]);
 assert.equal(result[0].startedAt,result[1].startedAt);assert.equal(result[0].startedBy,result[1].startedBy);assert.equal(result[0].status,'In Arbeit');
 await a.store.update('projekte',id,{status:'Wartet auf Kunde'},user);const ref=a.db.collection(prefix+'projekte').doc(id),paused=(await ref.get()).data();
 await b.store.startProject(id,user);assert.deepEqual((await ref.get()).data(),paused);
 assert.deepEqual(await a.store.get('offerten',offer.id),accepted);assert.deepEqual(await a.store.get('rechnungen',invoice.id),invoice);
});



test('real customer relations include legacy records on all pages; exact REST backfill preserves sent data',async()=>{
 const a=setup(),customer=await a.store.create('kunden',{company:'TEST_ONLY relations '+randomUUID(),email:randomUUID()+'@example.invalid'},user);
 const key=randomUUID().replace(/-/g,''),leadId='rel_lead_'+key,offerId='rel_offer_'+key;
 await a.db.collection(prefix+'leads').doc(leadId).set({email:customer.email,company:customer.company,status:'Qualifiziert'});
 const offer={title:'TEST_ONLY sent',number:'TEST-201',leadId,status:'Versendet',customerId:'',offerSnapshotSha256:'unchanged'};
 await a.db.collection(prefix+'offerten').doc(offerId).set(offer);
 const restStore=buildStore(createRestDb({projectId,emulatorHost:'127.0.0.1:8788'}),prefix);
 await restStore.linkCustomer('offerten',offerId,user);
 const saved=(await a.db.collection(prefix+'offerten').doc(offerId).get()).data();assert.equal(saved.customerId,customer.id);assert.equal(saved.offerSnapshotSha256,'unchanged');assert.equal(saved.status,'Versendet');
 await restStore.linkCustomer('offerten',offerId,user);assert.deepEqual((await a.db.collection(prefix+'offerten').doc(offerId).get()).data(),saved);
 await Promise.all(Array.from({length:115},(_,i)=>a.db.collection(prefix+'projekte').doc('rel_'+key+'_'+String(i).padStart(3,'0')).set({title:'TEST_ONLY legacy',customerId:customer.id,status:'Geplant'})));
 let cursor='',ids=[];do{const page=await a.store.customerRelated(customer.id,'projekte',cursor);ids.push(...page.records.map(r=>r.id));cursor=page.nextCursor;}while(cursor);
 assert.equal(ids.length,115);assert.equal(new Set(ids).size,115);
 const related=await a.store.customerRelated(customer.id,'offerten');assert.equal(related.records.length,1);assert.equal(related.records[0].id,offerId);
});

async function reminderFixture(){
 const a=setup(),customer=await a.store.create('kunden',{company:'TEST_ONLY Reminder '+randomUUID(),email:'test@example.invalid',street:'Testweg 1',postalCode:'8000',city:'Zürich',country:'CH'},user);
 const invoice=await a.store.create('rechnungen',{customerId:customer.id,description:'TEST_ONLY Reminder',invoiceDate:'2020-01-01',dueDate:'2020-01-31',status:'Offen',items:[{title:'Setup',qty:1,unitPriceCHF:199.95}]},user);
 const claim=await a.store.claimInvoiceSend(invoice.id,user);await a.store.finishInvoiceSend(invoice.id,claim.attemptId,'confirmed','synthetic_invoice');return {...a,customer,invoice};
}
test('two independent Firestore clients cannot claim the same reminder twice and payment changes invalidate the preview',async()=>{
 const a=await reminderFixture(),b=setup(),p=await a.store.invoiceReminderPreview(a.invoice.id),input={reviewed:true,sha256:p.sha256,reminderId:randomUUID()};
 const claims=await Promise.allSettled([a.store.claimInvoiceReminder(a.invoice.id,input,user),b.store.claimInvoiceReminder(a.invoice.id,{...input,reminderId:randomUUID()},user)]);assert.equal(claims.filter(x=>x.status==='fulfilled').length,1);
 const saved=await a.store.get('rechnungen',a.invoice.id);await a.store.finishInvoiceReminder(a.invoice.id,saved.reminderDispatch.reminderId,'confirmed','synthetic_receipt',user);assert.equal((await a.store.get('rechnungen',a.invoice.id)).reminderHistory.length,1);
 const c=await reminderFixture(),preview=await c.store.invoiceReminderPreview(c.invoice.id);await c.store.recordInvoicePayment(c.invoice.id,{paymentId:randomUUID(),amountCHF:50,paidOn:new Date().toISOString().slice(0,10),method:'Banküberweisung',reference:''},user);
 await assert.rejects(()=>c.store.claimInvoiceReminder(c.invoice.id,{reviewed:true,sha256:preview.sha256,reminderId:randomUUID()},user),/veraltet/);assert.equal((await c.store.get('rechnungen',c.invoice.id)).reminderDispatch,undefined);
});
test('uncertain Firestore reminder cannot be resent; payment and explicit mailbox resolution retain the original balance audit',async()=>{
 const a=await reminderFixture(),p=await a.store.invoiceReminderPreview(a.invoice.id),id=randomUUID();await a.store.claimInvoiceReminder(a.invoice.id,{reviewed:true,sha256:p.sha256,reminderId:id},user);await a.store.finishInvoiceReminder(a.invoice.id,id,'manual_review','',user);
 await assert.rejects(()=>a.store.claimInvoiceReminder(a.invoice.id,{reviewed:true,sha256:p.sha256,reminderId:randomUUID()},user),/Postfach/);
 await a.store.recordInvoicePayment(a.invoice.id,{paymentId:randomUUID(),amountCHF:199.95,paidOn:new Date().toISOString().slice(0,10),method:'Banküberweisung',reference:''},user);
 const r=await a.store.resolveInvoiceReminder(a.invoice.id,'confirmed',user);assert.equal(r.status,'Bezahlt');assert.equal(r.reminderHistory[0].outstandingCHF,199.95);assert.equal(r.reminderDispatchHistory.length,1);
});

test('concurrent monthly scheduler workers create one invoice and advance the period atomically',async()=>{
 const a=setup(),b=setup(),clock={date:'2026-10-27T12:00:00Z'};
 const storeA=buildStore(a.db,prefix,{now:()=>clock.date}),storeB=buildStore(b.db,prefix,{now:()=>clock.date});
 const c=await storeA.create('kunden',{company:'TEST_ONLY monthly '+randomUUID()},user),o=await storeA.create('offerten',{customerId:c.id,title:'TEST_ONLY monthly',items:[{title:'Betreuung',qty:1,unitPriceCHF:99.95,mode:'monatlich'}]},user);
 await storeA.update('offerten',o.id,{status:'Angenommen'},user);const docs=await a.db.collection(prefix+'projekte').where('offerId','==',o.id).get(),id=docs.docs[0].id;
 await storeA.activateMonthlyBilling(id,{startDate:'2026-10-27',reviewed:true,externalBillingChecked:true},user);clock.date='2026-11-01T06:00:00Z';
 const result=await Promise.all([storeA.createDueMonthlyInvoice(id,user),storeB.createDueMonthlyInvoice(id,user)]);assert.equal(result.filter(x=>x.created).length,1);
 const invoices=await a.db.collection(prefix+'rechnungen').where('offerId','==',o.id).get();assert.equal(invoices.size,1);assert.equal(invoices.docs[0].data().monthlyPeriod,'2026-11');assert.equal(invoices.docs[0].data().status,'Entwurf');assert.equal((await storeA.get('projekte',id)).monthlyBilling.nextPeriod,'2026-12');
 await storeB.createDueMonthlyInvoice(id,user);assert.equal((await a.db.collection(prefix+'rechnungen').where('offerId','==',o.id).get()).size,1);
});
