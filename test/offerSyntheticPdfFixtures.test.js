'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const sha=b=>createHash('sha256').update(b).digest('hex');
const load=()=>import('../scripts/offerSyntheticPdfFixtures.mjs');
const folder='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const GOLDEN_SHA256={
 quoteJa:'2dd5c5377461c969b9a436f36999150dc53cf159f02e4985e2f2536b683b004c',
 quoteNein:'c1e44e73700a549214fa1270f624e90fcca7f6c8d6a476de07ca8beea3ec93b9',
 terms:'fff20f2c906d0e1911f07e7d6a73623f9a4dc96140656233e58e34e825ae4e1d',
 avv:'2cf47da695083a0d74096eeb66e481e8ecbc4a00a6183772ed9ef76ce88a79a0'
};
const ids={
 quoteJa:'1LSZHSyntheticOnlyFile000000000000000001',
 quoteNein:'1LSZHSyntheticOnlyFile000000000000000002',
 terms:'1LSZHSyntheticOnlyFile000000000000000003',
 avv:'1LSZHSyntheticOnlyFile000000000000000004'
};
const makeBundle=(manifest,mode)=>{
 const doc=key=>({id:ids[key],sha256:manifest.files[key].sha256});
 return {avv_required:mode,quote:doc(mode==='Ja'?'quoteJa':'quoteNein'),
  terms:doc('terms'),...(mode==='Ja'?{avv:doc('avv')}:{})};
};
function mockDrive(files,{badBytes=false,unlocked=false,wrongFolder=false}={}){
 const byId=Object.fromEntries(Object.entries(ids).map(([k,id])=>[id,{bytes:files[k],sha256:sha(files[k])}]));
 const requests=[];
 const fetcher=async(url,options)=>{
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_ONLY_ACCESS_TOKEN');
  const u=new URL(url);
  assert.equal(u.origin,'https://www.googleapis.com');
  const id=u.pathname.split('/').at(-1);
  const item=byId[id];assert.ok(item,'unexpected Drive file ID');
  requests.push(id);
  if(u.searchParams.get('alt')==='media'){
   const bytes=badBytes?Buffer.from('%PDF-1.4\nMUTATED\n%%EOF\n'):item.bytes;
   return new Response(bytes,{status:200,headers:{'content-length':String(bytes.length)}});
  }
  return Response.json({id,mimeType:'application/pdf',
   size:String(item.bytes.length),sha256Checksum:item.sha256,trashed:false,
   contentRestrictions:[{readOnly:!unlocked}],
   parents:[wrongFolder?'1ANOTHER_FOLDER_FOR_TEST_ONLY000000':folder]});
 };
 return {requests,options:{fetcher,accessToken:'SYNTHETIC_ONLY_ACCESS_TOKEN',archiveFolderId:folder}};
}
test('4 deterministic parseable PDFs and manifest are explicitly nonbinding',async()=>{
 const {buildFixtures}=await load();
 const {files,manifest}=buildFixtures();
 assert.deepEqual(Object.keys(files).sort(),['avv','quoteJa','quoteNein','terms']);
 assert.deepEqual(manifest.offers.map(o=>o.avvRequired),['Ja','Nein']);
 assert.equal(manifest.offers[0].avv,'avv');
 assert.equal(manifest.offers[1].avv,null);
 assert.equal(manifest.testOnly,true);
 for(const key of ['legallyApproved','acceptanceEnabled','deliveryEnabled',
   'cloudUploaded','archiveVerified','tokenConfigured'])assert.equal(manifest[key],false);
 assert.equal(manifest.termsVersion,'TEST_v1.0_RC1');
 assert.equal(JSON.stringify(manifest).includes('access_token'),false);
 for(const [key,bytes] of Object.entries(files)){
  const props=manifest.files[key];
  assert.equal(sha(bytes),props.sha256);
  assert.equal(props.sha256,GOLDEN_SHA256[key],'PDF bytes must match independently rendered ZIP fixture');
  assert.equal(bytes.length,props.bytes);
  assert.equal(props.mimeType,'application/pdf');
  assert.equal(props.driveFileId,null,'must not invent Google file IDs');
  assert.equal(props.driveVerified,false);
  assert.equal(props.driveReadOnlyVerified,false);
  assert.equal(bytes.subarray(0,5).toString('ascii'),'%PDF-');
  assert.match(bytes.toString('latin1'),/NO CONTRACT - NOT LEGALLY BINDING/);
  assert.match(bytes.toString('latin1'),/synthetic@example\.invalid/);
  assert.match(bytes.toString('latin1'),/xref\n0 7\n/);
  assert.match(bytes.toString('latin1'),/%%EOF\n$/);
 }
 assert.deepEqual(buildFixtures().manifest,manifest);
});
test('fixture writer emits byte-identical files, manifest and prevents silent overwrites',async t=>{
 const path=await mkdtemp(join(tmpdir(),'lszh-offer-synthetic-'));
 t.after(()=>rm(path,{recursive:true,force:true}));
 const {buildFixtures,writeFixtures}=await load();
 const {files,manifest}=buildFixtures();
 assert.deepEqual(await writeFixtures(path),manifest);
 for(const [key,bytes] of Object.entries(files)){
  const saved=await readFile(join(path,manifest.files[key].file));
  assert.deepEqual(saved,bytes);
 }
 assert.deepEqual(JSON.parse(await readFile(join(path,'manifest.json'),'utf8')),manifest);
 await assert.rejects(()=>writeFixtures(path),/EEXIST/);
});
test('actual archive verifier checks each byte and AVV branch with synthetic only data',async()=>{
 const {buildFixtures}=await load();
 const {files,manifest}=buildFixtures();
 const {verifyArchiveBundle,readVerifiedArchivePdf}=await import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs');
 for(const mode of ['Ja','Nein']){
  const bundle=makeBundle(manifest,mode);
  const mock=mockDrive(files);
  assert.equal(await verifyArchiveBundle(bundle,mock.options),true);
  const which=mode==='Ja'?'quoteJa':'quoteNein';
  const bytes=await readVerifiedArchivePdf(bundle,'quote',mock.options);
  assert.deepEqual(bytes,files[which]);
  assert.deepEqual(await readVerifiedArchivePdf(bundle,'terms',mock.options),files.terms);
  if(mode==='Ja')
   assert.deepEqual(await readVerifiedArchivePdf(bundle,'avv',mock.options),files.avv);
  else{
   await assert.rejects(()=>readVerifiedArchivePdf(bundle,'avv',mock.options),/invalid_document/);
   assert.equal(mock.requests.includes(ids.avv),false);
  }
  assert.equal(await verifyArchiveBundle(bundle,mockDrive(files,{badBytes:true}).options),false);
  assert.equal(await verifyArchiveBundle(bundle,mockDrive(files,{unlocked:true}).options),false);
  assert.equal(await verifyArchiveBundle(bundle,mockDrive(files,{wrongFolder:true}).options),false);
 }
});
test('synthetic-only offer preview accepts deterministic PDF fixture hashes but cannot claim',async()=>{
 const {buildFixtures}=await load();
 const {files,manifest}=buildFixtures();
 const {createOfferPortal}=await import('../cloud-run/offer-portal-staging/portalCore.mjs');
 const {verifyArchiveBundle}=await import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs');
 const token='S'.repeat(48);
 for(const mode of ['Ja','Nein']){
  const bundle=makeBundle(manifest,mode);
  let claims=0;
  const item={tokenHash:sha(token),status:'sent',approved:true,revision:1,
   termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T00:00:00.000Z',
   recipientEmail:'synthetic@example.invalid',
   offerNumber:manifest.offers.find(x=>x.avvRequired===mode).offerNumber,
   details:{company:'Synthetic KMU AG',service:'Test automation',
    onceCHF:1490,monthlyCHF:149,paymentModel:'TEST ONLY',
    ...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV_v1.0_RC1'}:{})},
   bundle,source:{kind:'LSZH_SYNTHETIC_ONLY',
    baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
   downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
  const mock=mockDrive(files);
  const portal=createOfferPortal({
   store:{get:async()=>item,claim:async()=>{claims++;throw Error('no_claim')}},
   verifyBundle:b=>verifyArchiveBundle(b,mock.options),
   approvedVersion:'TEST_v1.0_RC1',proofSalt:'synthetic-only-fake-test-salt-1234567',
   clock:()=>new Date('2026-10-18T10:00:00.000Z'),syntheticOnly:true
  });
  const displayed=await portal.preview(token);
  assert.equal(displayed.test_only,true);
  assert.equal(displayed.number,item.offerNumber);
  assert.equal(displayed.avv_required,mode==='Ja');
  assert.equal(claims,0);
  assert.ok(!JSON.stringify(displayed).includes('synthetic@example.invalid'));
  assert.ok(!JSON.stringify(displayed).includes(ids.quoteJa));
 }
});
