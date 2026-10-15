'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const token='Z'.repeat(48);
const digest=s=>createHash('sha256').update(s).digest('hex');
const hash=s=>s.repeat(64);
const CODE='synthetic-only';
const refs={quote:{id:'1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',sha256:hash('a')},
  terms:{id:'1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',sha256:hash('b')},
  avv:{id:'1CDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdefg',sha256:hash('c')}};
const {deepStrictEqual,equal,ok,rejects}=assert;
function record(mode='Ja'){
 return {tokenHash:digest(token),status:'sent',approved:true,revision:1,
  termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T23:59:59.000Z',
  recipientEmail:'client@example.invalid',offerNumber:'TEST_ONLY_OFFER_001',
  details:{company:'Synthetic GmbH',onceCHF:99,monthlyCHF:10},
  bundle:{avv_required:mode,quote:refs.quote,terms:refs.terms,
    ...(mode==='Ja'?{avv:refs.avv}:{})}
 };
}
function accepted(mode='Ja'){
 return {name:'Synthetischer Kunde',email:'client@example.invalid',authorized:true,
  accept_terms:true,quote_sha256:refs.quote.sha256,terms_sha256:refs.terms.sha256,
  ...(mode==='Ja'?{accept_avv:true,avv_sha256:refs.avv.sha256}:{accept_avv:false})};
}
function fakeDB(r){
 let doc=structuredClone(r),updates=0;
 let queue=Promise.resolve();
 const ref={get:async()=>({exists:!!doc,data:()=>structuredClone(doc)})};
 const db={
  collection(name){equal(name,'lszh_staging_offers_v1');return {doc:hash=>{equal(hash,digest(token));return ref}};},
  runTransaction(fn){
    const result=queue.then(()=>{
      let pending=null;
      return fn({
        get:async(rf)=>{equal(rf,ref);return rf.get();},
        update(rf,delta){equal(rf,ref);pending=delta;}
      }).then(res=>{if(pending){doc={...doc,...pending};updates++;}return res;});
    });
    queue=result.catch(()=>{});
    return result;
  }
 };
 return {db,state:()=>({doc:structuredClone(doc),updates}),
   mutate:fn=>{doc=fn(doc)}};
}
async function make(mode='Ja',verifyBundle=async()=>true){
 const {createOfferPortal}=await import('../cloud-run/offer-portal-staging/portalCore.mjs');
 const {createFirestoreOfferStore}=await import('../cloud-run/offer-portal-staging/firestoreOfferStore.mjs');
 const data=fakeDB(record(mode));
 const portal=createOfferPortal({store:createFirestoreOfferStore(data.db),verifyBundle,
  approvedVersion:'TEST_v1.0_RC1',proofSalt:'test-only-secret-with-enough-entropy',
  clock:()=>new Date('2026-10-15T10:00:00Z')});
 return {portal,data};
}
test('preview returns only offer information, never Drive IDs or stored recipient',async()=>{
 const {portal,data}=await make();
 const r=await portal.preview(token);
 equal(r.number,'TEST_ONLY_OFFER_001');
 equal(r.avv_required,true);
 equal(r.avv_sha256,refs.avv.sha256);
 ok(!JSON.stringify(r).includes('client@example.invalid'));
 ok(!JSON.stringify(r).includes(refs.quote.id));
 equal(data.state().updates,0);
});
test('staging acceptance with AVV records complete consent once',async()=>{
 const {portal,data}=await make();
 deepStrictEqual(await portal.accept(token,accepted(),{ip:'192.0.2.20'}),
  {ok:true,accepted:true,confirmation_pending:true});
 const {doc,updates}=data.state();equal(updates,1);
 equal(doc.status,'accepted');equal(doc.revision,2);
 equal(doc.evidence.avv_pdf_sha256,refs.avv.sha256);
 equal(doc.evidence.quote_pdf_sha256,refs.quote.sha256);
 equal(doc.evidence.name,'Synthetischer Kunde');
 ok(!JSON.stringify(doc).includes(token));
 await rejects(()=>portal.accept(token,accepted()),/unavailable/);
 equal(data.state().updates,1);
});
test('two parallel Cloud Run instances cannot claim one offer twice',async()=>{
 const {portal,data}=await make('Ja',async()=>{await new Promise(r=>setTimeout(r,10));return true});
 const results=await Promise.allSettled([
   portal.accept(token,accepted(),{ip:'192.0.2.30'}),
   portal.accept(token,accepted(),{ip:'192.0.2.30'})
 ]);
 equal(results.filter(x=>x.status==='fulfilled').length,1);
 equal(results.filter(x=>x.status==='rejected').length,1);
 equal(data.state().updates,1);
 equal(data.state().doc.status,'accepted');
});
test('false Drive integrity check blocks acceptance before Firestore write',async()=>{
 const {portal,data}=await make('Ja',async()=>false);
 await rejects(()=>portal.accept(token,accepted()),/archive_changed/);
 equal(data.state().updates,0);
});
test('changed quote in datastore during PDF check aborts transaction',async()=>{
 const {portal,data}=await make('Ja',async()=>{
   data.mutate(x=>({...x,bundle:{...x.bundle,quote:{...x.bundle.quote,sha256:'d'.repeat(64)}}}));
   return true;
 });
 await rejects(()=>portal.accept(token,accepted()),/offer_changed/);
 equal(data.state().updates,0);
});
test('revision changed during external Drive I/O aborts transaction',async()=>{
 const {portal,data}=await make('Ja',async()=>{
   data.mutate(x=>({...x,revision:x.revision+1}));
   return true;
 });
 await rejects(()=>portal.accept(token,accepted()),/offer_changed/);
 equal(data.state().updates,0);
});
test('AVV Nein allows exactly two PDFs and rejects AVV consent',async()=>{
 const {portal,data}=await make('Nein');
 const p=await portal.preview(token);
 equal(p.avv_required,false);equal(p.avv_sha256,null);
 await rejects(()=>portal.accept(token,{...accepted('Nein'),accept_avv:true}),/unexpected_avv_consent/);
 equal(data.state().updates,0);
 equal((await portal.accept(token,accepted('Nein'))).ok,true);
 equal(data.state().doc.evidence.avv_required,false);
});
test('missing AVV checkbox, false authorization and wrong hashes fail closed',async()=>{
 for(const body of [
   {...accepted(),accept_avv:false},
   {...accepted(),authorized:false},
   {...accepted(),accept_terms:false},
   {...accepted(),quote_sha256:'d'.repeat(64)},
   {...accepted(),avv_sha256:'d'.repeat(64)}
 ]){
  const {portal,data}=await make();
  await rejects(()=>portal.accept(token,body));
  equal(data.state().updates,0);
 }
});
test('wrong sender email and expired/invalid tokens are refused',async()=>{
 const {portal,data}=await make();
 await rejects(()=>portal.accept(token,{...accepted(),email:'stranger@example.invalid'}),/invalid_identity/);
 await rejects(()=>portal.preview('../not-token'),/unavailable/);
 data.mutate(x=>({...x,expiresAt:'2020-01-01T00:00:00Z'}));
 await rejects(()=>portal.accept(token,accepted()),/unavailable/);
 equal(data.state().updates,0);
});
test('FireStore offers are not accepted twice even on ambiguous retries',async()=>{
 const {portal,data}=await make();
 await portal.accept(token,accepted());
 await rejects(()=>portal.accept(token,accepted()),/unavailable/);
 equal(data.state().updates,1);
});
