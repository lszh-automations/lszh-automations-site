import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createServer}=require('./server');
const SECRET='abcdefghijklmnopqrstuvwxyz0123456789';
const env={
 LSZH_OUTBOX_STAGE_ENABLED:'true',FIRESTORE_PROJECT_ID:'lszh-automations',
 FIRESTORE_DATABASE_ID:'lszh-offers-staging',
 LSZH_STAGING_FIXTURE_CODES:'ob_00000000-0000-4000-8000-000000000000',
 AIRTABLE_ONBOARDING_READ_TOKEN:'SYNTHETIC',OUTBOX_CONTROL_SECRET:SECRET
};

async function serve(overrides={}) {
 let scans=0,works=0;
 const srv=createServer({
   env:{...env,...overrides.env},
   store:{createOnce:async()=>{throw Error('must not write in HTTP mock');}},
   fetchImpl:async()=>{throw Error('No external fetch expected');},
   list:async()=>{scans++;return ['ob_00000000-0000-4000-8000-000000000000'];},
   work:async()=>{works++;return {candidates:1,completed:1,created:1,
       alreadyExisting:0,processing:0,requiresReview:0,unavailable:0};}
 });
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+srv.address().port;
 return {
   base,counts:()=>({scans,works}),
   close:()=>new Promise(resolve=>srv.close(resolve))
 };
}
async function post(base,secret=SECRET,options={}) {
 return fetch(base+'/internal/reconcile',{
  ...options,
  method:'POST',
  headers:{...(options.headers||{}),'x-lszh-outbox-key':secret}
 });
}
test('internal API defaults to disabled and creates no documents',async()=>{
 const mock=await serve({env:{LSZH_OUTBOX_STAGE_ENABLED:'false'}});
 try {
  const response=await post(mock.base);
  assert.equal(response.status,503);assert.deepEqual(mock.counts(),{scans:0,works:0});
 }finally{await mock.close();}
});
test('internal API rejects requests without the additional nonpublic secret',async()=>{
 const mock=await serve();
 try {
  const no=await post(mock.base,'');assert.equal(no.status,403);
  const wrong=await post(mock.base,'x'.repeat(36));assert.equal(wrong.status,403);
  assert.deepEqual(mock.counts(),{scans:0,works:0});
 }finally{await mock.close();}
});
test('internal API does not accept arbitrary customer payload',async()=>{
 const mock=await serve();
 try {
  const response=await post(mock.base,SECRET,{body:'{"project_code":"secret"}',
    headers:{'Content-Type':'application/json'}});
  assert.equal(response.status,400);
  assert.deepEqual(mock.counts(),{scans:0,works:0});
 }finally{await mock.close();}
});
test('private authorized trigger returns only aggregate counts',async()=>{
 const mock=await serve();
 try {
  const response=await post(mock.base);assert.equal(response.status,200);
  const body=await response.json();
  assert.deepEqual(body,{
    ok:true,mode:'STAGING_DRAFT_ONLY',candidates:1,completed:1,created:1,
    alreadyExisting:0,processing:0,requiresReview:0,unavailable:0
  });
  const serialized=JSON.stringify(body);
  assert.ok(!serialized.includes('ob_'));assert.ok(!serialized.includes('SYNTHETIC'));
  assert.deepEqual(mock.counts(),{scans:1,works:1});
 }finally{await mock.close();}
});
test('unexpected routes never process customer data',async()=>{
 const mock=await serve();
 try {
  assert.equal((await fetch(mock.base+'/api/onboarding',{method:'POST'})).status,404);
  assert.deepEqual(mock.counts(),{scans:0,works:0});
 }finally{await mock.close();}
});
