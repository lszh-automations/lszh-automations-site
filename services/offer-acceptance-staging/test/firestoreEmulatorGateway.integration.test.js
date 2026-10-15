'use strict';
// Opt-in Firestore EMULATOR HTTP integration test. Skipped by default.
// Only 127.0.0.1/localhost emulator allowed; never a live Google Cloud write.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {once}=require('node:events');
const {createGateway}=require('../app');
const {createLocalFixtureClaim}=require('./localFixtureClaims');
const {validateSettings,EMULATOR_PROJECT}=require('../../../stagingFirestoreConnection');
const {TARGET,documentPath}=require('../../../stagingOfferSchema');
let enabled=false;
try{
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
test('local HTTP + two independent Firestore emulator clients commit only once', {skip:!enabled},async()=>{
 // SDK and emulator are never used in standard CI/unit tests.
 const {Firestore}=require('@google-cloud/firestore');
 const one=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const two=new Firestore({projectId:EMULATOR_PROJECT,databaseId:TARGET.databaseId});
 const fixtureId='LSZH-EMULATOR-'+crypto.randomBytes(12).toString('hex');
 const fixture={fixtureId,offerNumber:'DEMO-OFF-20991231-999',
   termsVersion:'TEST_ONLY_TERMS',avvVersion:'TEST_ONLY_AVV',avvRequired:true};
 const TOKEN='A'.repeat(43);
 const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
 const archiveBytes={offer:Buffer.from('%PDF-1.7\nSynthetic offer\n%%EOF'),
   terms:Buffer.from('%PDF-1.7\nSynthetic terms\n%%EOF'),
   avv:Buffer.from('%PDF-1.7\nSynthetic AVV\n%%EOF')};
 const d=k=>({mimeType:'application/pdf',sha256:hash(archiveBytes[k]),
   driveFileId:'1'.repeat(24),archiveVerified:true});
 const state={schemaVersion:1,fixtureId,testOnly:true,status:'ISSUED',acceptanceEnabled:true,
   legallyApproved:true,deliveryConfirmed:true,archiveVerified:true,acceptedAt:null,
   expiresAt:'2099-12-31T23:59:59Z',tokenHash:hash(TOKEN),
   offerNumber:fixture.offerNumber,termsVersion:fixture.termsVersion,
   avvVersion:fixture.avvVersion,avvRequired:true,
   recipientEmail:'fake-tester@example.invalid',
   documents:{offer:d('offer'),terms:d('terms'),avv:d('avv')}};
 const ref=one.doc(documentPath(fixtureId));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-emulator-http-'));
 const htmlPath=path.join(dir,'index.html');fs.writeFileSync(htmlPath,'<html>Synthetic test</html>');
 let count=0,srv=null;
 const handlers=[one,two].map(db=>createLocalFixtureClaim({db,fixture,archiveBytes}));
 const oldNodeEnv=process.env.NODE_ENV;
 try{
   await ref.create(state); // local emulator only, guarded before this test starts
   process.env.NODE_ENV='test';
   srv=createGateway({htmlPath,localFixtureClaim:(req,res,ctx)=>handlers[count++%2](req,res,ctx)});
   srv.listen(0,'127.0.0.1');await once(srv,'listening');
   const url='http://127.0.0.1:'+srv.address().port+'/__local_fixture/claim';
   const request=extra=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({code:TOKEN,name:'Test Muster',email:'fake-tester@example.invalid',
       authorized:true,accept_terms:true,accept_avv:true,
       quote_sha256:hash(archiveBytes.offer),terms_sha256:hash(archiveBytes.terms),
       avv_sha256:hash(archiveBytes.avv),...extra})});
   const changed=await request({avv_sha256:'f'.repeat(64)});
   assert.equal(changed.status,409);
   assert.equal((await ref.get()).data().status,'ISSUED');
   const result=await Promise.all([request({}),request({})]);
   assert.deepEqual(result.map(x=>x.status).sort(),[200,409]);
   const stored=(await ref.get()).data();
   assert.equal(stored.status,'ACCEPTED');
   assert.equal(stored.reconciliationStatus,'PENDING');
   assert.equal(stored.acceptanceEvidence.acceptedAvv,true);
 }finally{
   if(srv)await new Promise(resolve=>srv.close(()=>resolve()));
   if(oldNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldNodeEnv;
   await ref.delete().catch(()=>{});
   await Promise.all([one.terminate(),two.terminate()]);
   fs.rmSync(dir,{recursive:true,force:true});
 }
});
