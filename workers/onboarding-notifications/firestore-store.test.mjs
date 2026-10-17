import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createFirestoreStore}=require('./firestore-store');
const {eventId,makeDraft}=require('./outbox');
const ID='rec'+'A'.repeat(14),key=eventId(ID),draft=makeDraft(ID,new Date('2026-10-16T10:00:00.000Z'));
const path='projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging/'+key;
function fakeFirestore({badExisting=false,writeStatus=200,existing=false}={}) {
  const files=new Map();
  if(existing)files.set(key,{name:path,fields:{
    schemaVersion:{integerValue:'1'},
    eventType:{stringValue:badExisting?'FAKE':draft.eventType},
    recordId:{stringValue:draft.recordId},testOnly:{booleanValue:true},
    deliveryEnabled:{booleanValue:false},emailSent:{booleanValue:false},
    state:{stringValue:'DRAFT_NOT_SENT'}
  }});
  let creates=0,reads=0,metadataCalls=0;
  return {
    files,stats:()=>({creates,reads,metadataCalls}),
    fetchImpl:async(url,opts)=>{
      if(url.startsWith('http://metadata.google.internal/')){
        metadataCalls++;
        assert.equal(opts.headers['Metadata-Flavor'],'Google');
        return {ok:true,json:async()=>({access_token:'SYNTHETIC_SERVICE_TOKEN',expires_in:3000})};
      }
      assert.ok(url.startsWith('https://firestore.googleapis.com/v1/projects/lszh-automations/'));
      assert.equal(opts.headers.Authorization,'Bearer SYNTHETIC_SERVICE_TOKEN');
      if(opts.method==='POST'){
        creates++;
        assert.equal(new URL(url).searchParams.get('documentId'),key);
        assert.equal(opts.headers['Content-Type'],'application/json');
        const payload=JSON.parse(opts.body);
        assert.equal(payload.fields.state.stringValue,'DRAFT_NOT_SENT');
        assert.equal(payload.fields.deliveryEnabled.booleanValue,false);
        assert.equal(payload.fields.emailSent.booleanValue,false);
        if(writeStatus!==200)return {ok:false,status:writeStatus};
        if(files.has(key))return {ok:false,status:409};
        files.set(key,{name:path,fields:payload.fields});
        return {ok:true,json:async()=>({name:path})};
      }
      assert.equal(opts.method,'GET');reads++;
      const record=files.get(key);
      if(!record)return {ok:false,status:404};
      return {ok:true,json:async()=>record};
    }
  };
}
test('creates a server-side Firestore document with short-lived metadata credentials',async()=>{
 const fake=fakeFirestore(),store=createFirestoreStore(fake.fetchImpl);
 assert.equal(await store.createOnce(key,draft),'created');
 assert.equal(fake.files.size,1);
 assert.equal(fake.stats().metadataCalls,1);
});
test('409 means existing only after verifying immutable identity and send gates',async()=>{
 const fake=fakeFirestore({existing:true}),store=createFirestoreStore(fake.fetchImpl);
 assert.equal(await store.createOnce(key,draft),'exists');
 assert.equal(fake.stats().reads,1);
});
test('wrong existing event is conflict, never overwritten',async()=>{
 const fake=fakeFirestore({existing:true,badExisting:true});
 await assert.rejects(createFirestoreStore(fake.fetchImpl).createOnce(key,draft),/duplicate_conflict/);
 assert.equal(fake.files.size,1);
});
test('409 existing emailSent=true is a conflict even if event identity matches',async()=>{
 const fake=fakeFirestore({existing:true});
 fake.files.get(key).fields.emailSent.booleanValue=true;
 await assert.rejects(createFirestoreStore(fake.fetchImpl).createOnce(key,draft),/duplicate_conflict/);
});
test('API server error must not silently become duplicate or sent',async()=>{
 const fake=fakeFirestore({writeStatus:503});
 await assert.rejects(createFirestoreStore(fake.fetchImpl).createOnce(key,draft),/persistence_unavailable/);
 assert.equal(fake.files.size,0);
});
test('a changed event key or enabled delivery is blocked before requesting metadata',async()=>{
 const fake=fakeFirestore(),store=createFirestoreStore(fake.fetchImpl);
 await assert.rejects(store.createOnce('0'.repeat(64),draft),/invalid_notification_draft/);
 await assert.rejects(store.createOnce(key,{...draft,deliveryEnabled:true}),/invalid_notification_draft/);
 assert.equal(fake.stats().metadataCalls,0);
});
