'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
const token=sha('customer-token-not-a-real-secret');
const sourceId='recABCDEFGH123456';
const base=()=>({
  tokenHash:token,status:'sent',approved:true,revision:1,
  termsVersion:'v1.0',expiresAt:'2026-11-01T22:59:59Z',
  recipientEmail:'pilot@fictional.example',offerNumber:'LSZH-2026-0001',
  details:{company:'Fiktive Pilot GmbH',service:'Automations-Projekt'},
  bundle:{avv_required:'Nein',
    quote:{id:'1ABCDEFGHIJKLMNOPQRSTUVWX123456',sha256:'a'.repeat(64)},
    terms:{id:'1BCDEFGHIJKLMNOPQRSTUVWXYZ123456',sha256:'b'.repeat(64)}},
  source:{kind:'LSZH_CUSTOMER_APPROVED_V1',baseId:'appzJiskpAdaR1HEv',
    tableId:'tbljeIUoD7wwKuSmS',recordId:sourceId,
    legalApproved:true,liveApproved:true},
  downstream:{airtable:'pending',proofPdf:'pending',email:'pending'}
});
const clone=value=>structuredClone(value);
function fakeDatabase(){
 const collections=new Map();
 let queue=Promise.resolve();
 function makeDoc(collection,id){
   const key=collection+'/'+id;
   return {key,
     async get(){return {exists:collections.has(key),data:()=>clone(collections.get(key))}}};
 }
 return {
   records:collections,
   db:{
     collection(name){return {doc:id=>makeDoc(name,id)};},
     runTransaction(fn){
       const p=queue.then(async()=>{
         const updates=[];
         const tx={
           get:ref=>ref.get(),
           create:(ref,data)=>updates.push(()=>{if(collections.has(ref.key))throw Error('exists');collections.set(ref.key,clone(data));}),
           update:(ref,delta)=>updates.push(()=>{if(!collections.has(ref.key))throw Error('missing');collections.set(ref.key,{...collections.get(ref.key),...clone(delta)});})
         };
         const value=await fn(tx);for(const apply of updates)apply();return value;
       });
       queue=p.catch(()=>{});
       return p;
     }
   }
 };
}
test('register creates one offer and source index in one transaction',async()=>{
 const {createCustomerOfferStore,CUSTOMER_OFFERS_COLLECTION,CUSTOMER_SOURCE_INDEX}=await import('../cloud-run/offer-portal-production/customerFirestoreStore.mjs');
 const data=fakeDatabase();const store=createCustomerOfferStore(data.db);
 assert.equal((await store.register(base())).result,'registered');
 assert.equal((await store.register(base())).result,'already_registered');
 assert.equal(data.records.size,2);
 assert.ok(data.records.has(CUSTOMER_OFFERS_COLLECTION+'/'+token));
 assert.ok(data.records.has(CUSTOMER_SOURCE_INDEX+'/'+sourceId));
 const read=await store.get(token);
 assert.equal(read.recipientEmail,'pilot@fictional.example');
});
test('concurrent source registrations cannot issue two different bearer hashes',async()=>{
 const {createCustomerOfferStore}=await import('../cloud-run/offer-portal-production/customerFirestoreStore.mjs');
 const data=fakeDatabase(),store=createCustomerOfferStore(data.db);
 const second={...base(),tokenHash:sha('different-unique-test-token')};
 const outcomes=await Promise.allSettled([store.register(base()),store.register(second)]);
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
 assert.equal(data.records.size,2);
});
test('single Firestore claim even for two competing customer submissions',async()=>{
 const {createCustomerOfferStore}=await import('../cloud-run/offer-portal-production/customerFirestoreStore.mjs');
 const {offerFingerprint}=await import('../cloud-run/offer-portal-staging/portalCore.mjs');
 const data=fakeDatabase(),store=createCustomerOfferStore(data.db);
 await store.register(base());
 const fingerprint=offerFingerprint(base());
 const evidence={offer_number:'LSZH-2026-0001',accepted_at_utc:'2026-10-19T12:00:00Z'};
 const now=new Date('2026-10-19T12:00:00Z');
 const r=await Promise.all([store.claim(token,fingerprint,evidence,now),store.claim(token,fingerprint,evidence,now)]);
 assert.deepEqual(r.sort(),['accepted','already_accepted']);
 assert.equal((await store.get(token)).status,'accepted');
 assert.equal((await store.register(base())).result,'already_accepted');
 assert.equal(data.records.size,2);
});
test('rejects missing live approval before any Firestore change',async()=>{
 const {createCustomerOfferStore}=await import('../cloud-run/offer-portal-production/customerFirestoreStore.mjs');
 const data=fakeDatabase(),store=createCustomerOfferStore(data.db);
 const invalid=base();invalid.source.liveApproved=false;
 await assert.rejects(()=>store.register(invalid),/source_not_approved/);
 assert.equal(data.records.size,0);
});
