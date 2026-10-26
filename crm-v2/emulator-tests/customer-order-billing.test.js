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
