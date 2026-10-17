'use strict';
// Isolated full PDF download handler test. All offers, archive responses,
// identifiers and PDF contents are synthetically created in this process.
// No Google/Airtable/Make/Render network; no contracts, no mail.
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const CODE='Z'.repeat(48);
const FOLDER='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const ORIGIN='https://portal-staging.lszh-automations.ch';
const VERSION='TEST_v1.0_RC1';
const DOCS=Object.fromEntries(['quote','terms','avv'].map((which,i)=>{
 const bytes=Buffer.from('%PDF-1.4\n% SYNTHETIC ONLY NO CONTRACT '+which+'\n%%EOF\n');
 return [which,{id:'1LSZHSyntheticOnlyFile00000000000000000'+(i+1),
  bytes,sha256:sha(bytes)}];
}));
const pdfOptions={accessToken:'SYNTHETIC_DOWNLOAD_TEST_TOKEN',archiveFolderId:FOLDER};
function fakeDrive({wrongParent=false,tamper=false,noLock=false,deny=false,metaSha=false}={}){
 const calls=[];
 const fetcher=async(raw,options)=>{
  const u=new URL(raw), id=decodeURIComponent(u.pathname.split('/').at(-1));
  calls.push({url:u.toString(),id,method:options.method});
  assert.equal(u.origin,'https://www.googleapis.com');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer '+pdfOptions.accessToken);
  const doc=Object.values(DOCS).find(d=>d.id===id);
  assert.ok(doc,'download only IDs selected from stored validated bundle');
  if(deny)return new Response('forbidden',{status:403});
  if(u.searchParams.has('alt')){
   const b=tamper?Buffer.concat([doc.bytes,Buffer.from('CHANGED')]):doc.bytes;
   return new Response(b,{status:200,headers:{'content-length':String(b.length)}});
  }
  return Response.json({
   id,mimeType:'application/pdf',size:doc.bytes.length,trashed:false,
   sha256Checksum:metaSha?'f'.repeat(64):doc.sha256,
   contentRestrictions:[{readOnly:!noLock}],
   parents:[wrongParent?'wrongArchiveParent000000000000':FOLDER]
  });
 };
 return {fetcher,calls};
}
async function setup(t,mode,{driveVariant={},enabled=true}={}){
 const [{createOfferPortal},{createOfferPortalHttp},
  {readVerifiedArchivePdf,verifyArchiveBundle}]=await Promise.all([
  import('../cloud-run/offer-portal-staging/portalCore.mjs'),
  import('../cloud-run/offer-portal-staging/portalHttp.mjs'),
  import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs')
 ]);
 const drive=fakeDrive(driveVariant);
 const offer={
  tokenHash:sha(CODE),status:'sent',approved:true,revision:1,
  termsVersion:VERSION,expiresAt:'2099-12-31T00:00:00.000Z',
  recipientEmail:'synthetic@example.invalid',offerNumber:'TEST_ONLY_DOWNLOAD_NO_CONTRACT',
  details:{company:'Synthetic GmbH',...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV'}:{})},
  bundle:{avv_required:mode,
    quote:{id:DOCS.quote.id,sha256:DOCS.quote.sha256},
    terms:{id:DOCS.terms.id,sha256:DOCS.terms.sha256},
    ...(mode==='Ja'?{avv:{id:DOCS.avv.id,sha256:DOCS.avv.sha256}}:{})}
 };
 let claims=0;
 const portal=createOfferPortal({
  store:{
   async get(codeHash){return codeHash===offer.tokenHash?structuredClone(offer):null;},
   async claim(){claims++;throw Error('should_never_claim_for_download');}
  },
  verifyBundle:bundle=>verifyArchiveBundle(bundle,{...pdfOptions,fetcher:drive.fetcher}),
  readPdf:(bundle,which)=>readVerifiedArchivePdf(bundle,which,{
   ...pdfOptions,fetcher:drive.fetcher
  }),
  approvedVersion:VERSION,proofSalt:'SYNTHETIC_PDF_TEST_ONLY_NOT_A_SECRET'
 });
 const server=http.createServer(createOfferPortalHttp({portal,enabled,allowedOrigin:ORIGIN}));
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return {base:'http://127.0.0.1:'+server.address().port,offer,drive,getClaims:()=>claims};
}
async function post(base,which,code=CODE,origin=ORIGIN){
 const response=await fetch(base+'/api/offer/document',{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({code,which}),signal:AbortSignal.timeout(5000)
 });
 const bytes=Buffer.from(await response.arrayBuffer());
 return {status:response.status,bytes,headers:response.headers,
  error:response.headers.get('content-type')?.includes('application/json')
   ?JSON.parse(bytes.toString()):null};
}
test('private document downloads verify exact PDF bytes, no customer contract',async t=>{
 const {base,drive,getClaims}=await setup(t,'Ja');
 for(const name of ['quote','terms','avv']){
  const r=await post(base,name);
  assert.equal(r.status,200);
  assert.deepEqual(r.bytes,DOCS[name].bytes);
  assert.equal(r.headers.get('content-type'),'application/pdf');
  assert.equal(r.headers.get('content-length'),String(DOCS[name].bytes.length));
  assert.match(r.headers.get('content-disposition'),/attachment; filename="LSZH_/);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('referrer-policy'),'no-referrer');
  assert.match(r.headers.get('x-robots-tag'),/noindex/);
  assert.equal(r.headers.get('access-control-allow-origin'),null);
 }
 assert.equal(drive.calls.length,6,'only selected PDFs downloaded+verified');
 assert.equal(getClaims(),0,'PDF download never mutates offer state');
});
test('AVV Nein blocks third PDF before accessing archive',async t=>{
 const {base,drive}=await setup(t,'Nein');
 const denied=await post(base,'avv');
 assert.equal(denied.status,404);
 assert.equal(drive.calls.length,0);
 assert.equal((await post(base,'quote')).status,200);
 assert.equal((await post(base,'terms')).status,200);
 assert.equal(drive.calls.length,4);
});
test('invalid token, forbidden origin, bad method and unknown type disclose zero bytes',async t=>{
 const {base,drive}=await setup(t,'Ja');
 assert.equal((await post(base,'quote','wrong_token')).status,404);
 assert.equal((await post(base,'quote',CODE,'https://attacker.invalid')).status,403);
 assert.equal((await post(base,'unknown')).status,404);
 const noBody=await fetch(base+'/api/offer/document',{method:'GET',headers:{Origin:ORIGIN}});
 assert.equal(noBody.status,404);
 assert.equal(drive.calls.length,0);
});
test('accepted or expired offer refuses archived PDF access',async t=>{
 const {base,offer,drive}=await setup(t,'Ja');
 offer.status='accepted';
 assert.equal((await post(base,'quote')).status,404);
 offer.status='sent';offer.expiresAt='2020-01-01T00:00:00Z';
 assert.equal((await post(base,'quote')).status,404);
 assert.equal(drive.calls.length,0);
});
test('mismatched PDF content, parent, lock or metadata fails closed',async t=>{
 for(const variant of [{tamper:true},{wrongParent:true},{noLock:true},{metaSha:true}]){
  const {base}=await setup(t,'Ja',{driveVariant:variant});
  const r=await post(base,'quote');
  assert.equal(r.status,409,'PDF corruption variant '+JSON.stringify(variant)+
    ' returned '+r.status+' ('+JSON.stringify(r.error)+')');
  assert.equal(r.error.error,'archive_changed');
  assert.ok(!r.bytes.toString().startsWith('%PDF-'));
 }
});
test('Drive 403 returns non-leaking 503 and disabled handler never downloads',async t=>{
 const failing=await setup(t,'Ja',{driveVariant:{deny:true}});
 const r=await post(failing.base,'quote');
 assert.equal(r.status,503);
 assert.deepEqual(r.error,{error:'temporarily_unavailable'});
 const disabled=await setup(t,'Ja',{enabled:false});
 const gate=await post(disabled.base,'quote');
 assert.equal(gate.status,503);
 assert.deepEqual(gate.error,{error:'not_available'});
 assert.equal(disabled.drive.calls.length,0);
});
