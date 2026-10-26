'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');
const {fixture}=require('../test/helpers/acceptance-fixture');
const {createDurableAcceptance}=require('../contract-acceptance-durable');
const {createAcceptanceNotifier,notificationKey}=require('../acceptance-notification');
const {createAcceptanceReview}=require('../contract-acceptance-review');
const {createOrderConfirmation,confirmationKey}=require('../order-confirmation');
const projectId='demo-lszha-c2-20261025',prefix='lszh_crm_v2_staging_';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788'||process.env.GOOGLE_CLOUD_PROJECT!==projectId)throw Error('Demo emulator required');
const clients=[];after(async()=>Promise.all(clients.map(d=>d.terminate())));
async function setup(){
 const db=new Firestore({projectId});clients.push(db);let f;
 const persistence=createDurableAcceptance({db,projectId,prefix,emulator:true,now:()=>f.now()});
 f=fixture({store:persistence.store,offerId:'test_notice_'+randomUUID().replace(/-/g,''),avv:'no'});
 const ref=db.collection(prefix+'offerten').doc(f.pkg.offerId);await ref.set({number:'1101',status:'Versendet'});
 const link=await f.issue(),page=await f.service.preview(link.token,{}),receipt=await f.service.accept(link.token,f.body(page),{},page.csrf);
 const collection=db.collection(prefix+'acceptance_v1'),notice=collection.doc(notificationKey(receipt.responseId));
 const archive={reserveId:async()=> 'synthetic_evidence_'+randomUUID().replace(/-/g,''),putVerified:async()=>{}};
 const notify=fetchImpl=>createAcceptanceNotifier({db,prefix,enabled:true,webhookUrl:'https://hook.eu1.make.com/synthetic123456',fetchImpl,now:f.now});
 return {db,f,persistence,ref,receipt,notice,archive,notify,collection};
}
test('archive completion creates one notification atomically; concurrent dispatch goes only to internal mailbox',async()=>{
 const x=await setup();assert.equal((await x.notice.get()).exists,false);
 await Promise.all([x.persistence.archiveResponse(x.receipt.responseId,x.archive),x.persistence.archiveResponse(x.receipt.responseId,x.archive)]);
 assert.equal((await x.notice.get()).data().state,'notification_pending');let sends=0;
 const notifier=x.notify(async(url,options)=>{sends++;const b=JSON.parse(options.body);assert.equal(b.to,'lars@lszh-automations.ch');assert.equal(b.kind,'internal_acceptance');assert.equal(b.eventId,'internal_acceptance__'+x.receipt.responseId);assert.doesNotMatch(b.html,/customer-test@example.com/);return Response.json({ok:true,messageId:'synthetic_notification_123'});});
 await Promise.all([notifier.deliver(x.notice.id),notifier.deliver(x.notice.id)]);assert.equal(sends,1);assert.equal((await x.notice.get()).data().state,'notification_sent');
 await x.persistence.archiveResponse(x.receipt.responseId,x.archive);await notifier.deliver(x.notice.id);assert.equal(sends,1);
});
test('uncertain internal delivery is not retried and invalid archive state prevents all sends',async()=>{
 const x=await setup();await x.persistence.archiveResponse(x.receipt.responseId,x.archive);let calls=0;
 const notifier=x.notify(async()=>{calls++;throw Error('timeout_after_send');});
 assert.equal((await notifier.deliver(x.notice.id)).status,'manual_review');await notifier.deliver(x.notice.id);assert.equal(calls,1);
 const y=await setup();await y.persistence.archiveResponse(y.receipt.responseId,y.archive);await y.ref.update({'onlineAcceptance.archiveState':'pending'});
 await assert.rejects(y.notify(async()=>{throw Error('must_not_send');}).deliver(y.notice.id),/not_ready/);assert.equal((await y.notice.get()).data().state,'notification_pending');
});
test('real Firestore transaction allows only one confirmation dispatch and saves its receipt before verification',async()=>{
 const x=await setup();await x.persistence.archiveResponse(x.receipt.responseId,x.archive);
 const authorizeOperator=async()=>({verified:true,email:'operator@example.com'});let sends=0,verified=0;const files=new Map();
 const review=createAcceptanceReview({transaction:x.persistence.transaction,authorizeOperator,now:x.f.now,enabled:true,verifyWrittenConfirmation:async({messageId,package:pkg,recipient})=>{
  const row=await x.persistence.transaction(tx=>tx.get('confirmationDocument_'+require('../offer-contract-package').digest(Buffer.from(pkg.packageId))));
  const delivery=(await x.collection.doc(confirmationKey(pkg.packageId)).get()).data();assert.equal(delivery.messageId,messageId);verified++;
  return {verified:true,messageId,packageSha256:pkg.packageSha256,recipient,confirmationSha256:row.document.sha256,sentAt:new Date(x.f.now()).toISOString()};
 }});await review.approve(x.f.pkg.offerId,{});
 const service=createOrderConfirmation({transaction:x.persistence.transaction,authorizeOperator,review,now:x.f.now,enabled:true,
  archivePdf:async({bytes})=>{files.set('synthetic_confirmation_archive',bytes);return 'synthetic_confirmation_archive';},readArchivedPdf:async id=>files.get(id),
  sendOnce:async body=>{sends++;return {ok:true,eventId:body.eventId,packageSha256:body.packageSha256,messageId:'synthetic_confirmation_123'};}});
 const p=await service.preview(x.f.pkg.offerId,{}),body={documentReviewed:true,sha256:p.sha256};
 await Promise.allSettled([service.send(x.f.pkg.offerId,body,{}),service.send(x.f.pkg.offerId,body,{})]);
 assert.equal(sends,1);assert.ok(verified>=1);const offer=(await x.ref.get()).data();assert.equal(offer.onlineAcceptance.state,'confirmed');assert.equal(offer.status,'Versendet');
});
