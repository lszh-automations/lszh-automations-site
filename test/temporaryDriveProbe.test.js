'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const FOLDER='10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko';
const ROOT='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const OWNER='lars@lszh-automations.ch';
const token='SYNTHETIC_TEST_ONLY_NOT_REAL_TOKEN';
const names=[
 'TEST_ONLY_quote_AVV_JA_NO_CONTRACT.pdf',
 'TEST_ONLY_quote_AVV_NEIN_NO_CONTRACT.pdf',
 'TEST_ONLY_project_terms_NO_CONTRACT.pdf',
 'TEST_ONLY_avv_NO_CONTRACT.pdf'
];
const ids=names.map((_,i)=>'1SYNTHETIC_ONLY_PDF_ID_00000000000'+i);
const fixtures=names.map((name,i)=>Buffer.from('%PDF-1.4\n% '+name+' NO CONTRACT\n%%EOF\n'));
const hashes=fixtures.map(sha);
const base={
 LSZH_PORTAL_STAGING_ENABLED:'false',
 LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED:'true',
 LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED:'true',
 LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER:FOLDER,
 LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES:hashes.join(','),
 K_SERVICE:'lszh-offer-browser-staging',
 K_REVISION:'lszh-offer-browser-staging-00003-test',
 GOOGLE_CLOUD_PROJECT:'lszh-automations'
};
function mockDrive({wrongOwner=false,wrongParent=false,extra=false,
 changedBytes=false,unlocked=false,metadataShaMismatch=false}={}){
 const stats={list:0,meta:0,bytes:0};
 const fetcher=async(raw,options)=>{
  const u=new URL(raw);
  assert.equal(u.origin,'https://www.googleapis.com');
  assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer '+token);
  if(u.pathname==='/drive/v3/files'){
   stats.list++;
   assert.equal(u.searchParams.get('q'),"'"+FOLDER+"' in parents and trashed = false");
   const list=ids.map((id,i)=>({id,name:names[i],mimeType:'application/pdf',
     parents:[FOLDER],trashed:false}));
   if(extra)list.push({id:'1SYNTHETIC_EXTRA_FILE_1234567890123',name:'real.pdf',
     mimeType:'application/pdf',parents:[FOLDER]});
   return Response.json({files:list});
  }
  const id=u.pathname.split('/').at(-1);
  if(id===FOLDER){
   return Response.json({id,name:'LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT',
     mimeType:'application/vnd.google-apps.folder',
     parents:[wrongParent?'1WRONG_ROOT_0000000000000000000':ROOT],
     owners:[{emailAddress:wrongOwner?'private@example.invalid':OWNER}],
     trashed:false});
  }
  const index=ids.indexOf(id);
  assert.ok(index>=0,'no arbitrary Drive access');
  if(u.searchParams.get('alt')==='media'){
   stats.bytes++;
   const bytes=changedBytes?Buffer.from('%PDF-1.4\nTAMPERED\n%%EOF\n'):fixtures[index];
   return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
  }
  stats.meta++;
  return Response.json({id,mimeType:'application/pdf',trashed:false,
   size:String(fixtures[index].length),parents:[FOLDER],
   contentRestrictions:[{readOnly:!unlocked}],
   sha256Checksum:metadataShaMismatch?'f'.repeat(64):hashes[index]});
 };
 return {fetcher,stats};
}
test('probe stays disabled unless synthetic-only temporary demo has explicit exact settings',async()=>{
 const {temporaryDriveProbeConfig}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 const {tempBrowserDemoConfig}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 assert.deepEqual(temporaryDriveProbeConfig({},{}),{enabled:false});
 assert.deepEqual(temporaryDriveProbeConfig({...base,LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED:'false'},
   tempBrowserDemoConfig(base)),{enabled:false});
 assert.deepEqual(temporaryDriveProbeConfig(base,tempBrowserDemoConfig(base)),{
   enabled:true,folder:FOLDER,hashes
 });
 for(const [change,value] of [
  ['LSZH_PORTAL_STAGING_ENABLED','true'],
  ['LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED','false'],
  ['LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER',ROOT],
  ['LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES',hashes[1]+','+hashes.slice(1).join(',')],
  ['LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES','INVALID'],
 ]){
  const env={...base,[change]:value};
  assert.throws(()=>temporaryDriveProbeConfig(env,{enabled:true}),{name:'Error'},change);
 }
 assert.throws(()=>temporaryDriveProbeConfig(base,{enabled:false}),
   /temporary_drive_probe_not_isolated/);
});
test('four synthetic PDFs verified by existing archive verifier, read only, no customer endpoints',async()=>{
 const {verifySyntheticDriveReadOnly}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 const drive=mockDrive();
 const value=await verifySyntheticDriveReadOnly({
  folder:FOLDER,hashes,accessToken:token,fetcher:drive.fetcher
 });
 assert.deepEqual(value,{status:'PASS_SYNTHETIC_ARCHIVE_READ_ONLY',verifiedFiles:4});
 assert.equal(drive.stats.list,1);
 assert.equal(drive.stats.meta,5); // quoteJa, terms, avv, quoteNein, terms
 assert.equal(drive.stats.bytes,5);
});
test('reject incorrect owner/parent/extra PDFs/changed bytes/unlocked/mismatched Drive hash',async()=>{
 const {verifySyntheticDriveReadOnly}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 for(const option of ['wrongOwner','wrongParent','extra','changedBytes','unlocked','metadataShaMismatch']){
  const fixture=mockDrive({[option]:true});
  await assert.rejects(()=>verifySyntheticDriveReadOnly({
   folder:FOLDER,hashes,accessToken:token,fetcher:fixture.fetcher
  }),{name:'Error'},option);
 }
});
test('optional probe returns only non-sensitive PASS and is never available to POSTs or offer APIs',async t=>{
 const {createTemporaryBrowserDemoHttp}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 const html=fs.readFileSync('offerte-annehmen/index.html','utf8');
 let executions=0;
 const server=http.createServer(createTemporaryBrowserDemoHttp({pageHtml:html,enabled:true,
  driveProbe:async()=>{executions++;return {status:'PASS_SYNTHETIC_ARCHIVE_READ_ONLY',
     verifiedFiles:4,fileIds:ids,token};}}));
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const baseurl='http://127.0.0.1:'+server.address().port;
 const pass=await fetch(baseurl+'/_lszh/synthetic-drive-check');
 assert.equal(pass.status,200);
 assert.deepEqual(await pass.json(),{status:'PASS_SYNTHETIC_ARCHIVE_READ_ONLY',
   verifiedFiles:4});
 assert.equal(pass.headers.get('cache-control'),'no-store');
 assert.equal(executions,1);
 for(const path of ['/_lszh/synthetic-drive-check?code=INVALID',
   '/_lszh/synthetic-drive-check/', '/api/offer/preview', '/api/offer/document',
   '/api/offer/accept']){
  const res=await fetch(baseurl+path);
  assert.equal(res.status,503,path);
 }
 const post=await fetch(baseurl+'/_lszh/synthetic-drive-check',{method:'POST',
  headers:{'Content-Type':'application/json'},body:'{}'});
 assert.equal(post.status,503);
 assert.equal(executions,1);
 assert.equal((await fetch(baseurl+'/offerte-annehmen/?demo=1')).status,200);
 const disabled=http.createServer(createTemporaryBrowserDemoHttp({pageHtml:html,enabled:true}));
 await new Promise(resolve=>disabled.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>disabled.close(resolve)));
 assert.equal((await fetch('http://127.0.0.1:'+disabled.address().port+
   '/_lszh/synthetic-drive-check')).status,503);
});

test('folder metadata classifier is exact, secret-free and never relaxes missing parent or owner',async()=>{
 const {classifySyntheticFolderMetadata}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 const clean={id:FOLDER,name:'LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT',
  mimeType:'application/vnd.google-apps.folder',trashed:false,parents:[ROOT],
  owners:[{emailAddress:OWNER}]};
 assert.equal(classifySyntheticFolderMetadata(clean,FOLDER),null);
 const cases=[
  [null,'FOLDER_STRUCTURE'],
  [{...clean,id:'SYNTHETIC_WRONG'},'FOLDER_ID'],
  [{...clean,name:'OTHER'},'FOLDER_NAME'],
  [{...clean,mimeType:'text/plain'},'FOLDER_MIME'],
  [{...clean,trashed:true},'FOLDER_TRASHED'],
  [Object.fromEntries(Object.entries(clean).filter(([key])=>key!=='parents')),
   'FOLDER_PARENT_HIDDEN'],
  [{...clean,parents:[]},'FOLDER_PARENT_MISMATCH'],
  [{...clean,parents:['1WRONG_ROOT_00000000000000000']},'FOLDER_PARENT_MISMATCH'],
  [Object.fromEntries(Object.entries(clean).filter(([key])=>key!=='owners')),
   'FOLDER_OWNER_HIDDEN'],
  [{...clean,owners:[]},'FOLDER_OWNER_MISMATCH'],
  [{...clean,owners:[{emailAddress:'private@example.invalid'}]},'FOLDER_OWNER_MISMATCH']
 ];
 for(const [meta,expected] of cases){
  assert.equal(classifySyntheticFolderMetadata(meta,FOLDER),expected);
  assert.match(expected,/^FOLDER_[A-Z_]+$/);
  assert.ok(!expected.includes(FOLDER));
  assert.ok(!expected.includes(OWNER));
 }
});

test('diagnostic logging must be opted in only with isolated temporary probe',async()=>{
 const {temporaryDriveProbeConfig}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 assert.throws(()=>temporaryDriveProbeConfig({
  ...base,LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED:'false',
  LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED:'true'
 },{enabled:true}),/temporary_drive_diagnostics_requires_probe/);
 assert.deepEqual(temporaryDriveProbeConfig({...base,
  LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED:'true'},{enabled:true}),{
  enabled:true,folder:FOLDER,hashes
 });
});
test('fixed Drive failure stages classify owner, files and checksum without echoing secrets',async()=>{
 const {verifySyntheticDriveReadOnly}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 const cases=[
  [{wrongOwner:true},'FOLDER_OWNER_MISMATCH'],
  [{wrongParent:true},'FOLDER_PARENT_MISMATCH'],
  [{extra:true},'LIST_VALIDATE'],
  [{changedBytes:true},'PDF_YES_INTEGRITY'],
  [{unlocked:true},'PDF_YES_INTEGRITY'],
  [{metadataShaMismatch:true},'PDF_YES_INTEGRITY']
 ];
 for(const [flags,expected] of cases){
  const collected=[];
  const mock=mockDrive(flags);
  await assert.rejects(()=>verifySyntheticDriveReadOnly({
   folder:FOLDER,hashes,accessToken:token,fetcher:mock.fetcher,
   onDiagnostic:code=>collected.push(code)
  }),{name:'Error'});
  assert.deepEqual(collected,[expected]);
  assert.ok(!JSON.stringify(collected).includes(token));
  assert.ok(!JSON.stringify(collected).includes(FOLDER));
  assert.ok(!JSON.stringify(collected).includes(ids[0]));
 }
 let reported=[];
 const good=mockDrive();
 await verifySyntheticDriveReadOnly({folder:FOLDER,hashes,accessToken:token,
  fetcher:good.fetcher,onDiagnostic:s=>reported.push(s)});
 assert.deepEqual(reported,[]);
});
test('fixed phases distinguish first Drive metadata/list API failure without provider error exposure',async()=>{
 const {verifySyntheticDriveReadOnly}=await import('../cloud-run/offer-portal-staging/temporaryDriveProbe.mjs');
 for(const [target,expected] of [['folder','FOLDER_API'],['list','LIST_API'],['pdf','PDF_YES_API']]){
  const mock=mockDrive();
  const events=[];
  const fetcher=async(url,opts)=>{
   const u=new URL(url);
   const match=(target==='folder'&&u.pathname.endsWith('/'+FOLDER))||
    (target==='list'&&u.pathname==='/drive/v3/files')||
    (target==='pdf'&&u.pathname.endsWith('/'+ids[0]));
   if(match)throw Error('SECRET_PROVIDER_DETAILS_'+token);
   return mock.fetcher(url,opts);
  };
  await assert.rejects(()=>verifySyntheticDriveReadOnly({
   folder:FOLDER,hashes,accessToken:token,fetcher,onDiagnostic:c=>events.push(c)
  }),{name:'Error'});
  assert.deepEqual(events,[expected]);
 }
});

test('wrong results and rejected Drive reads never leak Drive errors, IDs or tokens',async t=>{
 const {createTemporaryBrowserDemoHttp}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 const html=fs.readFileSync('offerte-annehmen/index.html','utf8');
 for(const probe of [
  async()=>{throw Error('SECRET_TOKEN '+token+' '+ids[0]);},
  async()=>({status:'FAIL',verifiedFiles:4}),
  async()=>({status:'PASS_SYNTHETIC_ARCHIVE_READ_ONLY',verifiedFiles:3})
 ]){
  const server=http.createServer(createTemporaryBrowserDemoHttp({
   pageHtml:html,enabled:true,driveProbe:probe
  }));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const res=await fetch('http://127.0.0.1:'+server.address().port+
   '/_lszh/synthetic-drive-check');
  assert.equal(res.status,503);
  const txt=await res.text();
  assert.equal(txt,'{"error":"not_available"}');
  assert.ok(!txt.includes(token));
  assert.ok(!txt.includes(ids[0]));
 }
});
