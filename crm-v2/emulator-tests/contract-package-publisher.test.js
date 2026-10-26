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
async function setup(avv='no'){
 const db=new Firestore({projectId});clients.push(db);const now=()=>Date.parse('2026-10-25T20:30:00Z');
 const persistence=createDurableAcceptance({db,projectId,prefix,emulator:true,now});
 const id='test_publisher_'+randomUUID().replace(/-/g,''),customerId='customer_'+randomUUID().replace(/-/g,'');
 const recipient={company:'Synthetic AG',email:'customer-test@example.com'},offer={id,number:'1101',title:'TEST_ONLY complete packet',status:'Bereit',customerId,createdAt:'2026-10-25T10:00:00Z',validUntil:'2026-11-25',items:[{title:'Synthetic setup',mode:'einmalig',qty:1,unitPriceCHF:100}]};
 await db.collection(prefix+'offerten').doc(id).set(offer);await db.collection(prefix+'kunden').doc(customerId).set(recipient);
 const pdf=makePdf(offer,recipient),snapshot=captureOfferSnapshot({id,attemptId:'synthetic_attempt',offer,recipient,to:recipient.email},pdf);
 const bytes=new Map(),docs=(avv==='yes'?['offer','terms','avv']:['offer','terms']).map(kind=>{
  const data=kind==='offer'?pdf:Buffer.from('%PDF-1.4 TEST_ONLY '+kind+' %%EOF'),archiveFileId='test_archive_'+id+'_'+kind;bytes.set(archiveFileId,data);
  return {kind,version:'TEST_ONLY_v1',archiveFileId,filename:'TEST_ONLY_'+kind+'.pdf',bytes:data.length,sha256:digest(data)};
 });
 const pkg=prepareOfferPackage({offerId:id,offerNumber:'1101',revision:1,offerSnapshotSha256:snapshot.offerSnapshotSha256,avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents:docs});
 let sends=0,links=0,corruptProof=false,loseResponse=false,payload;
 const options={transaction:persistence.transaction,readArchivedPdf:async id=>bytes.get(id),authorizeOperator:async()=>({verified:true,email:'operator@example.com'}),verifyRelease:async()=>true,
  enabled:true,mode:'test',now,issueAcceptance:async()=>{links++;return {token:'synthetic_invitation'};},
  sendOnce:async body=>{sends++;payload=body;if(loseResponse)throw Error('timeout after Gmail');return {ok:true,eventId:pkg.sendEventId,packageSha256:pkg.packageSha256,messageId:'synthetic_gmail_message'};},
  verifySentPackage:async()=>({verified:!corruptProof,sender:'info@lszh-automations.ch',cc:[],bcc:[],source:'independent_gmail_sent_readback',packageSha256:pkg.packageSha256,eventId:pkg.sendEventId,recipient:recipient.email,messageId:'synthetic_gmail_message',verifiedAt:new Date(now()).toISOString(),documentHashes:Object.fromEntries(docs.map(d=>[d.kind,d.sha256]))})};
 const publisher=createContractPackagePublisher(options);
 return {pkg,recipient,db,bytes,options,publisher,offer,prepare:()=>publisher.prepare(pkg,recipient.email,{}),sends:()=>sends,links:()=>links,payload:()=>payload,
  corrupt:()=>{corruptProof=true;},lose:()=>{loseResponse=true;}};
}
test('complete two/three PDF packets use exact archived bytes and issue links only after independent SENT proof',async()=>{
 for(const avv of ['no','yes']){
  const f=await setup(avv);await f.prepare();await assert.rejects(f.publisher.issueLink(f.pkg.packageId,{}),{code:'SENT_EVIDENCE_REQUIRED'});
  const r=await f.publisher.dispatch(f.pkg.packageId,{});assert.equal(r.state,'sent');assert.equal(f.sends(),1);
  const body=f.payload();assert.equal(body.attachments.length,avv==='yes'?3:2);assert.deepEqual(body.cc,[]);assert.deepEqual(body.bcc,[]);
  for(let i=0;i<body.attachments.length;i++)assert.equal(digest(Buffer.from(body.attachments[i].data,'base64')),f.pkg.documents[i].sha256);
  assert.equal((await f.db.collection(prefix+'offerten').doc(f.offer.id).get()).data().status,'Versendet');
  await f.publisher.issueLink(f.pkg.packageId,{});assert.equal(f.links(),1);
 }
});
test('two concurrent dispatches produce one send; lock survives a fresh publisher instance',async()=>{
 const f=await setup();await f.prepare();const other=createContractPackagePublisher(f.options);
 const r=await Promise.allSettled([f.publisher.dispatch(f.pkg.packageId,{}),other.dispatch(f.pkg.packageId,{})]);
 assert.equal(r.filter(x=>x.status==='fulfilled').length,1);assert.equal(f.sends(),1);
 await assert.rejects(other.dispatch(f.pkg.packageId,{}),{code:'PUBLICATION_CONFLICT'});assert.equal(f.sends(),1);
});
test('lost provider response or failed SENT proof never sends again and never issues a link',async()=>{
 for(const lose of [true,false]){
  const f=await setup();await f.prepare();lose?f.lose():f.corrupt();
  assert.equal((await f.publisher.dispatch(f.pkg.packageId,{})).state,'delivery_review');
  const other=createContractPackagePublisher(f.options);await assert.rejects(other.dispatch(f.pkg.packageId,{}));
  await assert.rejects(other.issueLink(f.pkg.packageId,{}),{code:'SENT_EVIDENCE_REQUIRED'});assert.equal(f.sends(),1);assert.equal(f.links(),0);
 }
});
test('changed CRM snapshot or archive bytes block before any external send; publisher is off by default',async()=>{
 const f=await setup();await f.prepare();await f.db.collection(prefix+'offerten').doc(f.offer.id).update({title:'Changed after preparation'});
 await assert.rejects(f.publisher.dispatch(f.pkg.packageId,{}));assert.equal(f.sends(),0);
 const g=await setup();await g.prepare();g.bytes.set(g.pkg.documents[1].archiveFileId,Buffer.from('bad PDF'));
 await assert.rejects(g.publisher.dispatch(g.pkg.packageId,{}));assert.equal(g.sends(),0);
 await assert.rejects(createContractPackagePublisher({...g.options,enabled:false}).prepare(g.pkg,g.recipient.email,{}),{code:'PUBLISHER_NOT_RELEASED'});
});

test('publisher hands the proven package to durable acceptance; customer response is separate from CRM win',async()=>{
 const f=await setup('yes');
 const {createContractAcceptance}=require('../contract-acceptance-staging');
 const {pubKey}=require('../contract-package-publisher');
 const now=f.options.now;
 const acceptanceStore=createDurableAcceptance({db:f.db,projectId,prefix,emulator:true,now}).store;
 const service=createContractAcceptance({store:acceptanceStore,now,csrfSecret:Buffer.alloc(32,8),
  readArchivedPdf:f.options.readArchivedPdf,authorizeIssue:async()=>true,
  verifySentPackage:async({package:pkg})=>{const row=await f.options.transaction(tx=>tx.get(pubKey(pkg.packageId)));return {...row.sentEvidence,provider:'gmail'};},
  resolveIdentity:async()=>({email:f.recipient.email,emailVerified:true,subject:'synthetic_mailbox_session',method:'verified_session',verifiedAt:now()}),verifyRepresentative:async()=>true});
 const publisher=createContractPackagePublisher({...f.options,issueAcceptance:(...args)=>service.issue(...args)});
 await publisher.prepare(f.pkg,f.recipient.email,{});await publisher.dispatch(f.pkg.packageId,{});
 const link=await publisher.issueLink(f.pkg.packageId,{}),page=await service.preview(link.token,{});
 assert.equal(page.documents.length,3);
 const receipt=await service.accept(link.token,{packageSha256:page.packageSha256,revision:page.revision,termsConsent:true,avvConsent:true,representativeDeclaration:true},{},page.csrf);
 const offer=(await f.db.collection(prefix+'offerten').doc(f.offer.id).get()).data();
 assert.equal(offer.onlineAcceptance.responseId,receipt.responseId);assert.equal(offer.status,'Versendet');assert.equal(offer.onlineAcceptance.reviewRequired,true);
 await assert.rejects(service.preview(link.token,{}),{code:'LINK_ALREADY_USED'});
 assert.equal(f.sends(),1);
});
