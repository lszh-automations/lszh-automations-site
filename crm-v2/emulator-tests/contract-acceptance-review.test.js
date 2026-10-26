'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {Firestore}=require('@google-cloud/firestore'),{randomUUID}=require('node:crypto');
const {fixture}=require('../test/helpers/acceptance-fixture');
const {createDurableAcceptance}=require('../contract-acceptance-durable');
const {createAcceptanceReview}=require('../contract-acceptance-review');
const projectId='demo-lszha-c2-20261025',prefix='lszh_crm_v2_staging_';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788'||process.env.GOOGLE_CLOUD_PROJECT!==projectId)throw Error('Demo emulator required');
const clients=[];after(async()=>{await Promise.all(clients.map(d=>d.terminate()));});
async function setup({archive=true}={}){
 const db=new Firestore({projectId});clients.push(db);let f;
 const p=createDurableAcceptance({db,projectId,prefix,emulator:true,now:()=>f.now()});
 f=fixture({store:p.store,offerId:'test_review_'+randomUUID().replace(/-/g,'')});
 const ref=db.collection(prefix+'offerten').doc(f.pkg.offerId);await ref.set({title:'Synthetic review',status:'Versendet'});
 const link=await f.issue(),page=await f.service.preview(link.token,{}),receipt=await f.service.accept(link.token,f.body(page),{},page.csrf);
 if(archive)await p.archiveResponse(receipt.responseId,{reserveId:async()=> 'synthetic_archive_'+randomUUID().replace(/-/g,''),putVerified:async()=>{}});
 const options={transaction:p.transaction,enabled:true,now:f.now,authorizeOperator:async()=>({verified:true,email:'operator@example.com'}),
 verifyWrittenConfirmation:async({messageId,package:pkg,recipient})=>({verified:true,messageId,packageSha256:pkg.packageSha256,recipient,confirmationSha256:'c'.repeat(64),sentAt:new Date(f.now()).toISOString()})};
 return {f,ref,options,review:createAcceptanceReview(options)};
}
test('review requires archived response and remains disabled by default',async()=>{
 const x=await setup({archive:false});await assert.rejects(x.review.approve(x.f.pkg.offerId,{}),{code:'ARCHIVED_RESPONSE_REQUIRED'});
 await assert.rejects(createAcceptanceReview({...x.options,enabled:false}).approve(x.f.pkg.offerId,{}),{code:'REVIEW_NOT_RELEASED'});
});
test('concurrent internal review records once; written confirmation is separate and never books CRM win',async()=>{
 const x=await setup(),id=x.f.pkg.offerId;
 const results=await Promise.allSettled([x.review.approve(id,{}),createAcceptanceReview(x.options).approve(id,{})]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 let row=(await x.ref.get()).data();assert.equal(row.onlineAcceptance.state,'awaiting_lszh_confirmation');assert.equal(row.status,'Versendet');
 await x.review.confirm(id,'synthetic_message_confirmation',{});
 row=(await x.ref.get()).data();assert.equal(row.onlineAcceptance.state,'confirmed');assert.equal(row.status,'Versendet');
 await assert.rejects(x.review.confirm(id,'synthetic_message_confirmation',{}),{code:'REVIEW_STATE_CONFLICT'});
});
test('spoofed confirmation, wrong recipient and unauthorised operator cannot confirm',async()=>{
 const x=await setup(),id=x.f.pkg.offerId;await x.review.approve(id,{});
 await assert.rejects(createAcceptanceReview({...x.options,authorizeOperator:async()=>null}).confirm(id,'synthetic_confirmation',{}),{code:'OPERATOR_REQUIRED'});
 const invalid=createAcceptanceReview({...x.options,verifyWrittenConfirmation:async()=>({verified:true,recipient:'attacker@example.com'})});
 await assert.rejects(invalid.confirm(id,'synthetic_confirmation',{}),{code:'CONFIRMATION_PROOF_REQUIRED'});
 assert.equal((await x.ref.get()).data().onlineAcceptance.state,'awaiting_lszh_confirmation');
});
