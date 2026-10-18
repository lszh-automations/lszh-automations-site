'use strict';
// REAL portal HTTP + real named Firestore emulator + actual PDF verifier,
// with explicitly simulated Google Drive HTTP only. No external connections.
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash,randomBytes}=require('node:crypto');
const {createRequire}=require('node:module');
const loadSDK=createRequire(require('node:path').resolve('cloud-run/offer-portal-staging/package.json'));
const EMULATOR='127.0.0.1:8088';
const PROJECT='demo-lszh-automations';
const DATABASE='lszh-offers-staging';
const FOLDER='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const ORIGIN='https://portal-staging.lszh-automations.ch';
const OWNER='LSZH_SYNTHETIC_E2E_TEST_ONLY';
const TERMS_VERSION='TEST_v1.0_RC1';
const sha=b=>createHash('sha256').update(b).digest('hex');
const waitServer=server=>new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
});
const closeServer=server=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
const post=async(base,route,payload)=>{
  const r=await fetch(base+route,{
    method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)
  });
  return {status:r.status,body:await r.json(),headers:r.headers};
};
function pdfFixtures(){
  const fixtures={};
  for(const [kind,i] of [['quote',1],['terms',2],['avv',3]]){
    const bytes=Buffer.from('%PDF-1.4\n% LSZH SYNTHETIC '+kind+' PDF - NOT A CONTRACT\n'+
      '1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
    const id='1LSZHSyntheticOnlyFile00000000000000000'+i;
    fixtures[kind]={id,bytes,sha256:sha(bytes)};
  }
  return fixtures;
}
function driveFixture(fixtures,{alterBinary=false}={}){
  const byId=new Map(Object.values(fixtures).map(f=>[f.id,f]));
  const calls=[];
  const fetcher=async(url,opts)=>{
    const u=new URL(url);
    assert.equal(u.origin,'https://www.googleapis.com');
    assert.equal(opts.method,'GET');
    assert.ok(opts.headers.Authorization.startsWith('Bearer '));
    const id=decodeURIComponent(u.pathname.split('/').at(-1));
    const f=byId.get(id);
    assert.ok(f,'no external file identifiers');
    calls.push({id,media:u.searchParams.get('alt')==='media'});
    if(u.searchParams.get('alt')==='media'){
      const bytes=alterBinary?
        Buffer.concat([f.bytes,Buffer.from('TAMPERED')]):f.bytes;
      return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});
    }
    assert.ok(u.searchParams.has('fields'));
    return new Response(JSON.stringify({
      id,mimeType:'application/pdf',size:String(f.bytes.length),
      sha256Checksum:f.sha256,contentRestrictions:[{readOnly:true}],
      parents:[FOLDER],trashed:false
    }),{status:200,headers:{'content-type':'application/json'}});
  };
  return {fetcher,calls};
}
function offerFor(token,mode,files){
  return {
    owner:OWNER,synthetic:true,tokenHash:sha(token),
    status:'sent',approved:true,revision:1,
    termsVersion:TERMS_VERSION,expiresAt:'2099-12-31T23:59:59.000Z',
    recipientEmail:'synthetic@example.invalid',
    offerNumber:'TEST_ONLY_E2E_'+randomBytes(7).toString('hex'),
    details:{company:'LSZH Synthetic Test AG',onceCHF:20,monthlyCHF:5,
      ...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV_v1.0'}:{})},
    bundle:{
      avv_required:mode,quote:{id:files.quote.id,sha256:files.quote.sha256},
      terms:{id:files.terms.id,sha256:files.terms.sha256},
      ...(mode==='Ja'?{avv:{id:files.avv.id,sha256:files.avv.sha256}}:{})
    }
  };
}
function agreement(token,mode,files){
  return {code:token,name:'Synthetischer Testempfaenger',
    email:'synthetic@example.invalid',authorized:true,accept_quote:true,accept_terms:true,
    quote_sha256:files.quote.sha256,terms_sha256:files.terms.sha256,
    ...(mode==='Ja'?
      {accept_avv:true,avv_sha256:files.avv.sha256,avv_version:'TEST_ONLY_AVV_v1.0'}:
      {accept_avv:false})};
}
if(process.env.FIRESTORE_EMULATOR_HOST!==EMULATOR ||
   process.env.GCLOUD_PROJECT!==PROJECT){
  test('E2E refuses to run without explicit local emulator (never cloud)',{skip:true},()=>{});
}else{
 const {Firestore}=loadSDK('@google-cloud/firestore');
 const load=async()=>{
   const [{createOfferPortal},{createFirestoreOfferStore},
     {createOfferPortalHttp},{verifyArchiveBundle}]=await Promise.all([
     import('../cloud-run/offer-portal-staging/portalCore.mjs'),
     import('../cloud-run/offer-portal-staging/firestoreOfferStore.mjs'),
     import('../cloud-run/offer-portal-staging/portalHttp.mjs'),
     import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs')
   ]);
   return {createOfferPortal,createFirestoreOfferStore,createOfferPortalHttp,verifyArchiveBundle};
 };
 for(const mode of ['Ja','Nein']){
   test('synthetic E2E HTTP + Drive-PDF hash + named Firestore: AVV='+mode+
     ' with 12 simultaneous accept attempts', {timeout:90000},async t=>{
     const mods=await load();
     const db=new Firestore({projectId:PROJECT,databaseId:DATABASE});
     assert.equal(db.databaseId,DATABASE);
     const token=randomBytes(36).toString('base64url');
     const files=pdfFixtures();
     const initial=offerFor(token,mode,files);
     const ref=db.collection('lszh_staging_offers_v1').doc(sha(token));
     let created=false;
     let server;
     t.after(async()=>{
       if(server)await closeServer(server);
       // Only remove this exact synthetic test offer, NEVER other collections.
       if(created){
         const snapshot=await ref.get();
         if(snapshot.exists){
           const current=snapshot.data();
           assert.equal(current.owner,OWNER);
           assert.equal(current.synthetic,true);
           assert.equal(current.tokenHash,sha(token));
           await ref.delete();
           assert.equal((await ref.get()).exists,false);
         }
       }
       await db.terminate();
     });
     await ref.create(initial);created=true;
     const mockDrive=driveFixture(files);
     const verifier=bundle=>mods.verifyArchiveBundle(bundle,{
       fetcher:mockDrive.fetcher,accessToken:'SYNTHETIC_E2E_FAKE_OAUTH',
       archiveFolderId:FOLDER
     });
     const portal=mods.createOfferPortal({
       store:mods.createFirestoreOfferStore(db),
       verifyBundle:verifier,approvedVersion:TERMS_VERSION,
       clock:()=>new Date('2026-10-15T12:30:00Z'),
       proofSalt:'SYNTHETIC_E2E_TEST_ONLY_NOT_A_SECRET'
     });
     server=http.createServer(mods.createOfferPortalHttp({
       portal,enabled:true,allowedOrigin:ORIGIN
     }));
     await waitServer(server);
     const base='http://127.0.0.1:'+server.address().port;

     const preview=await post(base,'/api/offer/preview',{code:token});
     assert.equal(preview.status,200);
     assert.equal(preview.body.offer.avv_required,mode==='Ja');
     assert.equal(preview.body.offer.quote_sha256,files.quote.sha256);
     assert.equal(preview.body.offer.terms_sha256,files.terms.sha256);
     assert.equal(preview.body.offer.avv_sha256,mode==='Ja'?files.avv.sha256:null);
     assert.ok(!JSON.stringify(preview.body).includes(initial.recipientEmail));
     assert.ok(!JSON.stringify(preview.body).includes(files.quote.id));
     assert.equal((await ref.get()).data().status,'sent');

     const agreementBody=agreement(token,mode,files);
     if(mode==='Ja'){
       const noAvv=await post(base,'/api/offer/accept',{
         ...agreementBody,accept_avv:false
       });
       assert.equal(noAvv.status,400);
       assert.equal(noAvv.body.error,'avv_consent_required');
       const omittedVersion=await post(base,'/api/offer/accept',{
         ...agreementBody,avv_version:null
       });
       assert.equal(omittedVersion.status,409);
       assert.equal(omittedVersion.body.error,'document_changed');
     }else{
       const unexpectedAvv=await post(base,'/api/offer/accept',{
         ...agreementBody,accept_avv:true
       });
       assert.equal(unexpectedAvv.status,400);
       assert.equal(unexpectedAvv.body.error,'unexpected_avv_consent');
     }
     // Hash metadata can match even when downloaded PDF bytes are altered.
     const broken=driveFixture(files,{alterBinary:true});
     const corrupted=mods.createOfferPortal({
       store:mods.createFirestoreOfferStore(db),
       verifyBundle:bundle=>mods.verifyArchiveBundle(bundle,{
         fetcher:broken.fetcher,accessToken:'SYNTHETIC_E2E_FAKE_OAUTH',
         archiveFolderId:FOLDER
       }),
       approvedVersion:TERMS_VERSION,
       clock:()=>new Date('2026-10-15T12:30:00Z'),
       proofSalt:'SYNTHETIC_E2E_TEST_ONLY_NOT_A_SECRET'
     });
     await assert.rejects(
       ()=>corrupted.accept(token,agreementBody),
       e=>e.code==='archive_changed'
     );
     assert.equal((await ref.get()).data().status,'sent');

     const attempts=await Promise.all(Array.from({length:12},()=>
       post(base,'/api/offer/accept',agreementBody)));
     const successes=attempts.filter(r=>r.status===200);
     const duplicates=attempts.filter(r=>[404,409].includes(r.status));
     assert.equal(successes.length,1,'exactly one customer acceptance');
     assert.equal(duplicates.length,11,'all duplicate attempts rejected');
     assert.equal(successes[0].body.accepted,true);
     assert.equal(successes[0].body.test_only,true);
     assert.equal(successes[0].body.offer_number,initial.offerNumber);
     assert.equal(successes[0].body.confirmation_email_pending,false);
     const final=(await ref.get()).data();
     assert.equal(final.status,'accepted');
     assert.equal(final.revision,2);
     assert.equal(final.evidence.avv_required,mode==='Ja');
     assert.equal(final.evidence.avv_confirmed,mode==='Ja');
     assert.equal(final.evidence.quote_pdf_sha256,files.quote.sha256);
     assert.equal(final.evidence.terms_pdf_sha256,files.terms.sha256);
     assert.equal(final.evidence.avv_pdf_sha256,mode==='Ja'?files.avv.sha256:null);
     assert.deepEqual(final.downstream,{
       airtable:'disabled',proofPdf:'disabled',email:'disabled'
     });
     assert.ok(!JSON.stringify(final).includes(token),'raw code never stored');
     const kinds=mode==='Ja'?3:2;
     assert.equal(mockDrive.calls.filter(c=>!c.media).length,
       mockDrive.calls.filter(c=>c.media).length);
     assert.ok(mockDrive.calls.length>=kinds*2,'real Drive verifier used');
     if(mode==='Nein')assert.ok(!mockDrive.calls.some(x=>x.id===files.avv.id),
       'never fetch an AVV for offers without AVV');
   });
 }
}
