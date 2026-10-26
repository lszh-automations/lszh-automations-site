'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto'),{Firestore}=require('@google-cloud/firestore');
const {createDurableAcceptance}=require('../contract-acceptance-durable');
const {createContractPackagePublisher}=require('../contract-package-publisher');
const {makePdf}=require('../offer-pdf'),{captureOfferSnapshot}=require('../offer-dispatch-snapshot');
const {prepareOfferPackage,digest}=require('../offer-contract-package');
const projectId='demo-lszha-c2-20261025',prefix='lszh_crm_v2_staging_';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788'||process.env.GOOGLE_CLOUD_PROJECT!==projectId)throw Error('Demo emulator required');
const clients=[];after(async()=>{await Promise.all(clients.map(d=>d.terminate()));});
const {createInvitationDelivery,invitationKey}=require('../simple-customer-send');
const {pubKey}=require('../contract-package-publisher');
test('separate Firestore clients claim a customer invitation once and retain an uncertain send',async()=>{
 for(const uncertain of [false,true]){
  const a=new Firestore({projectId}),b=new Firestore({projectId});clients.push(a,b);
  const pa=createDurableAcceptance({db:a,projectId,prefix,emulator:true}),pb=createDurableAcceptance({db:b,projectId,prefix,emulator:true});
  const id='pkg_invitation_'+randomUUID().replace(/-/g,'')+'_r1',pkg={packageId:id,packageSha256:'a'.repeat(64),offerNumber:'1201'};
  await pa.transaction(async tx=>tx.create(pubKey(id),{state:'sent',recipient:'synthetic@example.com',package:pkg}));
  let sends=0,issues=0;const options={portalOrigin:'https://portal.example',publisher:{issueLink:async()=>{issues++;return {token:'t'.repeat(43),expiresAt:'2026-10-26T22:00:00Z'};}},sendOnce:async()=>{sends++;if(uncertain)throw Error('lost response');return {messageId:'synthetic_gmail_123'};},verifySent:async({messageId})=>({verified:true,messageId})};
  await Promise.all([createInvitationDelivery({...options,transaction:pa.transaction}).deliver(id,{}),createInvitationDelivery({...options,transaction:pb.transaction}).deliver(id,{})]);
  await createInvitationDelivery({...options,transaction:pb.transaction}).deliver(id,{});
  assert.equal(sends,1);assert.equal(issues,1);const row=await pa.transaction(tx=>tx.get(invitationKey(id)));assert.equal(row.state,uncertain?'delivery_review':'sent');
 }
});
