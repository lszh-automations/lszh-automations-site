'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
let inspectInternalMailRecovery,sendInternalTestConfirmationOnce,createInternalRecoveryStore;
test.before(async()=>{({inspectInternalMailRecovery,sendInternalTestConfirmationOnce,createInternalRecoveryStore}=await import('../cloud-run/offer-portal-staging/internalReceiptMailRecovery.mjs'));});
const hash=b=>createHash('sha256').update(b).digest('hex');
function fixture(avv=false){
 const kinds=['quote','terms',...(avv?['avv']:[]),'receipt'];
 const documents=kinds.map((kind,i)=>{
  const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n%%EOF');
  return {kind,id:String(i+1).repeat(25),bytes,sha256:hash(bytes),mimeType:'application/pdf',
   readOnly:true,parents:['10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko']};
 });
 return {recordId:avv?'recktLXj5wUxLmHFQ':'recR70ZSPynGqA1LS',
 offerNumber:avv?'TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT':'TEST_INTERNAL_LARS_20261019_NO_CONTRACT',
 baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',testOnly:true,status:'accepted',
 acceptedAt:'2026-10-20T15:05:19.544Z',productionApproved:false,legalApproved:false,
 dispatchApproved:false,inProgress:false,sentAt:null,avvRequired:avv,avvConfirmed:avv,
 quoteConfirmed:true,termsConfirmed:true,authorizedConfirmed:true,documents,
 expectedReceiptSha256:documents.at(-1).sha256,
 acceptedHashes:Object.fromEntries(documents.filter(d=>d.kind!=='receipt').map(d=>[d.kind,d.sha256]))};
}
function fakeDb(){
 const docs=new Map();let queue=Promise.resolve();
 return {projectId:'lszh-automations',databaseId:'lszh-offers-staging',docs,
 collection:name=>({doc:key=>({path:name+'/'+key})}),
 runTransaction:fn=>{
  const next=queue.then(()=>fn({get:async ref=>({exists:docs.has(ref.path),data:()=>docs.get(ref.path)}),
   create:(ref,data)=>{assert.equal(docs.has(ref.path),false);docs.set(ref.path,{...data});},
   update:(ref,data)=>docs.set(ref.path,{...docs.get(ref.path),...data})}));
  queue=next.catch(()=>{});return next;
 }};
}
test('AVV Nein and Ja require exact existing three/four independently verified PDFs',()=>{
 for(const avv of [false,true]){
  const input=fixture(avv),plan=inspectInternalMailRecovery(input);
  assert.equal(plan.status,'READY_FOR_ATOMIC_CLAIM');
  assert.equal(plan.attachmentCount,avv?4:3);assert.equal(plan.canCreateReceipt,false);
  input.documents.pop();assert.equal(inspectInternalMailRecovery(input).status,'STOP');
 }
});
test('sent evidence stops before any attachment lookup or send attempt',async()=>{
 const input={...fixture(),sentAt:'2026-10-20T15:14:15Z',documents:null};
 const result=await sendInternalTestConfirmationOnce({loadFresh:async()=>input,
  store:{claim:()=>assert.fail('must not claim')},sendMail:()=>assert.fail('must not send')});
 assert.equal(result.status,'ALREADY_SENT');
});
test('wrong source, business approval, missing consent and altered PDFs fail closed',()=>{
 const changes=[x=>x.recordId='recUNKNOWN00000000',x=>x.productionApproved=true,
  x=>x.dispatchApproved=undefined,x=>x.quoteConfirmed=false,x=>x.inProgress=true,
  x=>x.documents[0].readOnly=false,x=>x.documents[0].parents=['wrong-folder'],
  x=>x.documents[0].bytes=Buffer.from('not a PDF'),x=>x.expectedReceiptSha256='a'.repeat(64),
  x=>x.documents[0].sha256='b'.repeat(64)];
 for(const change of changes){const input=fixture();change(input);assert.equal(inspectInternalMailRecovery(input).status,'STOP');}
});
test('changed receipt IDs or timestamps cannot create another reservation key',()=>{
 const a=fixture(),b=fixture();b.documents.at(-1).id='Z'.repeat(25);b.acceptedAt='2026-10-21T01:00:00Z';
 const x=inspectInternalMailRecovery(a),y=inspectInternalMailRecovery(b);
 assert.equal(x.key,y.key);assert.notEqual(x.fingerprint,y.fingerprint);
});
test('twelve concurrent attempts reserve and invoke the provider exactly once',async()=>{
 const db=fakeDb(),store=createInternalRecoveryStore(db,{enabled:true});let sent=0;
 const results=await Promise.all(Array.from({length:12},()=>sendInternalTestConfirmationOnce({
  loadFresh:async()=>fixture(true),store,sendMail:async mail=>{
   sent++;assert.deepEqual(mail.to,['lars.schulthess@outlook.com']);assert.equal(mail.attachments.length,4);
   assert.deepEqual(mail.cc,[]);assert.deepEqual(mail.bcc,[]);return{id:'provider-test-id'};
  }})));
 assert.equal(sent,1);assert.equal(results.filter(r=>r.status==='PROVIDER_ACCEPTED').length,1);
 assert.equal([...db.docs.values()][0].state,'PROVIDER_ACCEPTED');
});
test('lost provider response remains blocked on retry and cannot regenerate proof',async()=>{
 const db=fakeDb(),store=createInternalRecoveryStore(db,{enabled:true});let sends=0;
 const options={loadFresh:async()=>fixture(),store,sendMail:async()=>{sends++;throw Error('response lost');}};
 const first=await sendInternalTestConfirmationOnce(options),second=await sendInternalTestConfirmationOnce(options);
 assert.equal(first.reason,'provider_outcome_unknown_manual_reconciliation');
 assert.equal(second.reason,'attempt_already_reserved_no_automatic_retry');assert.equal(sends,1);
});
test('provider success followed by persistence failure cannot be sent again',async()=>{
 const db=fakeDb(),base=createInternalRecoveryStore(db,{enabled:true});let sends=0;
 const store={...base,markSent:async()=>{throw Error('storage unavailable');}};
 const options={loadFresh:async()=>fixture(),store,sendMail:async()=>{sends++;return{id:'test-id'};}};
 assert.equal((await sendInternalTestConfirmationOnce(options)).reason,'provider_accepted_local_readback_pending_do_not_resend');
 assert.equal((await sendInternalTestConfirmationOnce(options)).status,'STOP');assert.equal(sends,1);
});
test('missing provider message ID requires manual reconciliation',async()=>{
 const db=fakeDb(),store=createInternalRecoveryStore(db,{enabled:true});
 const result=await sendInternalTestConfirmationOnce({loadFresh:async()=>fixture(),store,sendMail:async()=>({})});
 assert.equal(result.reason,'provider_receipt_missing_manual_reconciliation');
 assert.equal([...db.docs.values()][0].state,'MANUAL_RECONCILIATION_REQUIRED');
});
test('store defaults off and rejects production database and unrelated projects',()=>{
 assert.throws(()=>createInternalRecoveryStore(fakeDb()));
 assert.throws(()=>createInternalRecoveryStore({...fakeDb(),databaseId:'lszh-offers'},{enabled:true}));
 assert.throws(()=>createInternalRecoveryStore({...fakeDb(),projectId:'other'},{enabled:true}));
});
