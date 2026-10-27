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
