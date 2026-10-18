'use strict';
// ONE synthetic chain: Airtable-shaped fixture -> local Firestore emulator
// -> real PDF hash verifier with mocked Drive responses -> HTTP preview/accept.
// No Airtable/Google network, customer, contract, Make invocation, or email.
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const {createRequire}=require('node:module');
const loadSDK=createRequire(require('node:path').resolve('cloud-run/offer-portal-staging/package.json'));
const PROJECT='demo-lszh-automations';
const DATABASE='lszh-offers-staging';
const ORIGIN='https://portal-staging.lszh-automations.ch';
const FOLDER='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const VERSION='TEST_v1.0_RC1';
const sha=data=>createHash('sha256').update(data).digest('hex');

function fakePdfs(){
 const docs={};
 for(const [kind,n] of [['quote',1],['terms',2],['avv',3]]){
  const bytes=Buffer.from('%PDF-1.4\n% TEST ONLY NO CONTRACT '+kind+'\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
  docs[kind]={id:'1LSZHSyntheticOnlyFile00000000000000000'+n,bytes,sha256:sha(bytes)};
 }
 return docs;
}
function fakeRecord(SOURCE,token,mode,docs){
 const linked='rec'+randomBytes(7).toString('hex');
 const map={
  [SOURCE.number]:'TEST_AIRTABLE_HTTP_AVV_'+mode.toUpperCase()+'_NO_CONTRACT',
  [SOURCE.status]:{name:'Entwurf'},
  [SOURCE.terms]:VERSION,
  [SOURCE.avvRequired]:{name:mode},
  [SOURCE.validUntil]:'2099-12-31',
  [SOURCE.email]:{linkedRecordIds:[linked],valuesByLinkedRecordId:{[linked]:['synthetic@example.invalid']}},
  [SOURCE.tokenHash]:sha(token),
  [SOURCE.quoteId]:docs.quote.id,[SOURCE.quoteSha]:docs.quote.sha256,
  [SOURCE.termsId]:docs.terms.id,[SOURCE.termsSha]:docs.terms.sha256,
  [SOURCE.service]:{name:'Automatisierter Anfrageprozess'},
  [SOURCE.paymentModel]:{name:'50 % bei Auftrag / 50 % nach Abnahme'},
  [SOURCE.once]:1490,[SOURCE.monthly]:149,
  [SOURCE.internalNote]:'TEST ONLY / NO CONTRACT / NO EMAIL'
 };
 if(mode==='Ja'){
  map[SOURCE.avvId]=docs.avv.id;
  map[SOURCE.avvSha]=docs.avv.sha256;
  map[SOURCE.avvVersion]='TEST_ONLY_AVV_v1.0_RC1';
 }
 return {id:'rec'+randomBytes(7).toString('hex'),cellValuesByFieldId:map};
}
function fakeDrive(docs){
 const byId=new Map(Object.values(docs).map(x=>[x.id,x]));
 const requests=[];
 const fetcher=async(raw,options)=>{
  const url=new URL(raw);
  assert.equal(url.origin,'https://www.googleapis.com');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ONLY_OAUTH');
  const id=decodeURIComponent(url.pathname.split('/').at(-1));
  const item=byId.get(id);
  assert.ok(item,'unknown Google Drive file rejected by synthetic fixture');
  requests.push(id);
  if(url.searchParams.get('alt')==='media')
   return new Response(item.bytes,{status:200,headers:{'content-length':String(item.bytes.length)}});
  return new Response(JSON.stringify({
   id,mimeType:'application/pdf',size:String(item.bytes.length),
   sha256Checksum:item.sha256,contentRestrictions:[{readOnly:true}],
   parents:[FOLDER],trashed:false
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 return {fetcher,requests};
}
const post=async(base,path,payload)=>{
 const res=await fetch(base+path,{method:'POST',
  headers:{'Content-Type':'application/json',Origin:ORIGIN},
  body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
 return {status:res.status,body:await res.json()};
};
const listening=server=>new Promise((resolve,reject)=>{
 server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
});

if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088' ||
   process.env.GCLOUD_PROJECT!==PROJECT ||
   process.env.K_SERVICE || process.env.GOOGLE_APPLICATION_CREDENTIALS){
 test('synthetic import-to-HTTP E2E requires local emulator, never cloud',{skip:true},()=>{});
}else{
 for(const mode of ['Ja','Nein']){
  test('synthetic Airtable -> PDF -> HTTP -> Firestore once; AVV '+mode,
   {timeout:90000},async t=>{
   const [{Firestore},{SOURCE,mapSyntheticAirtableOffer,seedOnlyLocalEmulator},
    {createOfferPortal},{createOfferPortalHttp},{createFirestoreOfferStore},
    {verifyArchiveBundle},{prepareSyntheticReceiptDocument}]=await Promise.all([
    Promise.resolve(loadSDK('@google-cloud/firestore')),
    import('../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs'),
    import('../cloud-run/offer-portal-staging/portalCore.mjs'),
    import('../cloud-run/offer-portal-staging/portalHttp.mjs'),
    import('../cloud-run/offer-portal-staging/firestoreOfferStore.mjs'),
    import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs'),
    import('../cloud-run/offer-portal-staging/receiptDocumentHandoff.mjs')
   ]);
   const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
   const token=randomBytes(36).toString('base64url');
   const docs=fakePdfs(),source=fakeRecord(SOURCE,token,mode,docs);
   const mapped=mapSyntheticAirtableOffer(source);
   const ref=db.collection('lszh_staging_offers_v1').doc(sha(token));
   const {syntheticSourceIndexId,SYNTHETIC_SOURCE_INDEX}=await import(
     '../cloud-run/offer-portal-staging/syntheticSourceIndex.mjs');
   const indexRef=db.collection(SYNTHETIC_SOURCE_INDEX)
     .doc(syntheticSourceIndexId(source.id));
   let created=false,server;
   t.after(async()=>{
    if(server)await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
    if(created){
     const current=await ref.get();
     if(current.exists){
      const data=current.data();
      assert.equal(data.source.kind,'LSZH_SYNTHETIC_ONLY');
      assert.equal(data.source.recordId,source.id);
      const idx=await indexRef.get();
      assert.equal(idx.exists,true);
      assert.equal(idx.data().tokenHash,sha(token));
      await Promise.all([ref.delete(),indexRef.delete()]);
      assert.equal((await ref.get()).exists,false);
      assert.equal((await indexRef.get()).exists,false);
     }
    }
    await db.terminate();
   });
   assert.equal(mapped.source.recordId,source.id);
   assert.deepEqual(mapped.downstream,{airtable:'disabled',proofPdf:'disabled',email:'disabled'});
   assert.equal((await seedOnlyLocalEmulator(db,source)).result,'created');created=true;
   assert.equal((await seedOnlyLocalEmulator(db,source)).result,'already_identical');
   const drive=fakeDrive(docs);
   const portal=createOfferPortal({
    store:createFirestoreOfferStore(db),
    verifyBundle:bundle=>verifyArchiveBundle(bundle,{
     fetcher:drive.fetcher,accessToken:'SYNTHETIC_ONLY_OAUTH',archiveFolderId:FOLDER
    }),
    approvedVersion:VERSION,proofSalt:'SYNTHETIC_ONLY_NOT_A_REAL_SECRET_123',
    clock:()=>new Date('2026-10-17T12:00:00.000Z')
   });
   server=http.createServer(createOfferPortalHttp({
    portal,enabled:true,allowedOrigin:ORIGIN
   }));
   await listening(server);
   const base='http://127.0.0.1:'+server.address().port;
   const preview=await post(base,'/api/offer/preview',{code:token});
   assert.equal(preview.status,200);
   const offer=preview.body.offer;
   assert.equal(offer.number,mapped.offerNumber);
   assert.equal(offer.company,mapped.details.company);
   assert.equal(offer.service,'Automatisierter Anfrageprozess');
   assert.equal(offer.payment_model,'50 % bei Auftrag / 50 % nach Abnahme');
   assert.equal(offer.once,1490);assert.equal(offer.monthly,149);
   assert.equal(offer.valid_until,'2099-12-31');
   assert.equal(offer.avv_required,mode==='Ja');
   assert.equal(offer.avv_version,mode==='Ja'?'TEST_ONLY_AVV_v1.0_RC1':null);
   assert.ok(!JSON.stringify(preview.body).includes('synthetic@example.invalid'));
   assert.ok(!JSON.stringify(preview.body).includes(docs.quote.id));
   assert.equal((await ref.get()).data().status,'sent');
   const submission={
    code:token,name:'Synthetische Testperson',email:'synthetic@example.invalid',
    authorized:true,accept_quote:true,accept_terms:true,quote_sha256:offer.quote_sha256,
    terms_sha256:offer.terms_sha256,
    accept_avv:mode==='Ja',avv_sha256:offer.avv_sha256,
    avv_version:offer.avv_version
   };
   const attempts=await Promise.all(Array.from({length:8},()=>
    post(base,'/api/offer/accept',submission)));
   assert.equal(attempts.filter(x=>x.status===200).length,1);
   const receipt=attempts.find(x=>x.status===200).body;
   assert.equal(receipt.test_only,true);
   assert.equal(receipt.offer_number,mapped.offerNumber);
   assert.equal(receipt.confirmation_email_pending,false);
   assert.equal(attempts.filter(x=>[404,409].includes(x.status)).length,7);
   const end=(await ref.get()).data();
   assert.equal(end.status,'accepted');assert.equal(end.revision,2);
   // The inert recovery marker must be in the SAME Firestore commit as acceptance.
   assert.equal(end.receiptReview?.purpose,'LSZH_SYNTHETIC_REVIEW_ONLY_NO_CONTRACT');
   assert.equal(end.receiptReview?.state,'AWAITING_MANUAL_RECONCILIATION');
   assert.match(end.receiptReview?.idempotencyKey||'',/^[a-f0-9]{64}$/);
   assert.equal(end.receiptReview?.receiptDriveId,null);
   assert.equal(end.receiptReview?.emailProviderMessageId,null);
   assert.deepEqual(end.receiptReview?.downstream,{
     airtable:'disabled',proofPdf:'disabled',email:'disabled'
   });
   assert.equal(end.evidence.avv_required,mode==='Ja');
   assert.equal(end.evidence.avv_confirmed,mode==='Ja');
   assert.equal(end.evidence.avv_version,
    mode==='Ja'?'TEST_ONLY_AVV_v1.0_RC1':null);
   assert.deepEqual(end.downstream,{airtable:'disabled',proofPdf:'disabled',email:'disabled'});
   assert.ok(!JSON.stringify(end).includes(token),'raw token must not be persisted');
   if(mode==='Nein')assert.ok(!drive.requests.includes(docs.avv.id),'no AVV PDF accessed');
   assert.ok(drive.requests.includes(docs.quote.id));
   assert.ok(drive.requests.includes(docs.terms.id));
   // The existing Google Docs -> PDF Make mapping can now be prepared directly
   // from the exact accepted Firestore record. No Make call, PDF export or mail.
   const documentPlan=prepareSyntheticReceiptDocument(end,{folderId:FOLDER});
   assert.equal(documentPlan.module,'google-docs:createADocument');
   assert.equal(documentPlan.action,'DO_NOT_CREATE');
   assert.equal(documentPlan.mapper.folderId,FOLDER);
   assert.ok(documentPlan.mapper.content.includes(end.offerNumber));
   assert.ok(documentPlan.mapper.content.includes(end.evidence.accepted_at_utc));
   assert.ok(documentPlan.mapper.content.includes(docs.quote.sha256));
   assert.equal(documentPlan.mapper.content.includes('AVV-Version:'),mode==='Ja');
   assert.equal(documentPlan.canExportPdf,false);
   assert.equal(documentPlan.canSendEmail,false);
  });
 }
}
