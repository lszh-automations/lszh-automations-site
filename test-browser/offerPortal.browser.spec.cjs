'use strict';
// Real Chromium UI against the existing HTML and actual Cloud-Run portal core/HTTP
// adapter, but ONLY a loopback fixture with an in-memory synthetic offer store.
// NO Google Cloud, Airtable, Make, mail, contracts or live HTTP targets.
const {test,expect}=require('@playwright/test');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const HTML=fs.readFileSync(path.join(ROOT,'offerte-annehmen/index.html'),'utf8');
const TOKEN='Z'.repeat(48); // synthetic, never a production credential
const ORIGIN='https://portal-staging.lszh-automations.ch'; // adapter's synthetic allowed origin
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');

async function localFixture(mode,{previewOnly=false}={}){
 const [{createOfferPortal,offerFingerprint},{createOfferPortalHttp},
  {verifyArchiveBundle,readVerifiedArchivePdf}]=await Promise.all([
  import('../cloud-run/offer-portal-staging/portalCore.mjs'),
  import('../cloud-run/offer-portal-staging/portalHttp.mjs'),
  import('../cloud-run/archive-reader-staging/archiveBundleVerifier.mjs')
 ]);
 const folder='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
 const pdfs=Object.fromEntries(['quote','terms','avv'].map((kind,index)=>{
  const bytes=Buffer.from('%PDF-1.4\n% SYNTHETIC ONLY NOT A CONTRACT '+kind+'\n%%EOF\n');
  return [kind,{id:'1LSZHSyntheticOnlyFile00000000000000000'+(index+1),
    sha256:sha(bytes),bytes}];
 }));
 const fetcher=async(raw)=>{
  const u=new URL(raw);
  if(u.origin!=='https://www.googleapis.com')throw Error('outbound_not_allowed');
  const file=Object.values(pdfs).find(x=>x.id===u.pathname.split('/').at(-1));
  if(!file)throw Error('unknown_fixture');
  if(u.searchParams.get('alt')==='media')
    return new Response(file.bytes,{status:200,
      headers:{'content-length':String(file.bytes.length)}});
  return Response.json({id:file.id,mimeType:'application/pdf',trashed:false,
    size:file.bytes.length,sha256Checksum:file.sha256,
    parents:[folder],contentRestrictions:[{readOnly:true}]});
 };
 const options={fetcher,accessToken:'SYNTHETIC_PDF_FIXTURE_NOT_A_SECRET',
  archiveFolderId:folder};
 const offer={
  tokenHash:sha(TOKEN),status:'sent',approved:true,revision:1,
  termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T23:59:59Z',
  recipientEmail:'synthetic@example.invalid',
  offerNumber:'TEST_BROWSER_'+mode.toUpperCase()+'_NO_CONTRACT',
  ...(previewOnly?{
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  }:{}),
  details:{company:'Muster KMU AG',service:'Automatisierter Anfrageprozess',
   paymentModel:'50 % bei Auftrag / 50 % nach Abnahme',
   onceCHF:1490,monthlyCHF:149,
   ...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV_v1.0'}:{})},
  bundle:{avv_required:mode,
   quote:{id:pdfs.quote.id,sha256:pdfs.quote.sha256},
   terms:{id:pdfs.terms.id,sha256:pdfs.terms.sha256},
   ...(mode==='Ja'?{avv:{id:pdfs.avv.id,sha256:pdfs.avv.sha256}}:{})}
 };
 const stats={preview:0,accept:0,pdf:0};let evidence=null;
 const store={
  async get(tokenHash){return tokenHash===offer.tokenHash?structuredClone(offer):null;},
  async claim(tokenHash,fingerprint,record,now){
   if(tokenHash!==offer.tokenHash||offerFingerprint(offer)!==fingerprint)return 'offer_changed';
   if(offer.status!=='sent')return 'already_accepted';
   offer.status='accepted';offer.revision++;evidence=record;
   return 'accepted';
  }
 };
 const portal=createOfferPortal({
  store,
  verifyBundle:bundle=>verifyArchiveBundle(bundle,options),
  readPdf:(bundle,which)=>readVerifiedArchivePdf(bundle,which,options),
  approvedVersion:'TEST_v1.0_RC1',
  proofSalt:'SYNTHETIC_BROWSER_ONLY_NOT_A_SECRET_12345',
  syntheticOnly:previewOnly,
  clock:()=>new Date('2026-10-17T12:00:00.000Z')
 });
 const handle=createOfferPortalHttp({portal,enabled:true,acceptEnabled:!previewOnly,
  allowedOrigin:ORIGIN,pageHtml:HTML});
 let base='';
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/offerte-annehmen/')
   return handle(req,res);
  if(req.method==='POST'&&
     ['/api/offer/preview','/api/offer/accept','/api/offer/document'].includes(url.pathname)){
   // Do not allow cross-origin browser requests even in this loopback fixture.
   if(req.headers.origin!==base){res.writeHead(403);res.end();return;}
   if(url.pathname.endsWith('preview'))stats.preview++;
   else if(url.pathname.endsWith('document'))stats.pdf++;
   else stats.accept++;
   // The production adapter allows HTTPS origins; the local browser fixture
   // uses HTTP loopback. Rewrite Origin here only, never in shipped portal code.
   req.headers.origin=ORIGIN;
   await handle(req,res);return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 base='http://127.0.0.1:'+server.address().port;
 return {base,stats,offer,getEvidence:()=>evidence,close:()=>new Promise((resolve,reject)=>
  server.close(error=>error?reject(error):resolve()))};
}

test('public synthetic design demo: clearly marked, no contract or backend POST',async({page})=>{
 const fixture=await localFixture('Ja');
 try{
  await page.goto(fixture.base+'/offerte-annehmen/?demo=1');
  await expect(page.locator('#number')).toHaveText('MUSTER-2026-001');
  await expect(page.locator('#message')).toContainText('unverbindliche Designvorschau');
  await expect(page.locator('#submit')).toBeDisabled();
  await page.locator('#quotePdf').click();
  await expect(page.locator('#message')).toContainText('keine echten Vertragsdokumente');
  await page.reload();
  await expect(page.locator('#submit')).toBeDisabled();
  expect(fixture.stats).toEqual({preview:0,accept:0,pdf:0});
 }finally{await fixture.close();}
});

for(const mode of ['Ja','Nein']){
 test('personal offer browser -> real local HTTP adapter -> synthetic confirmation: AVV '+mode,
  async({page})=>{
  const fixture=await localFixture(mode);
  try{
   await page.goto(fixture.base+'/offerte-annehmen/?code='+TOKEN);
   await expect(page.locator('#number')).toHaveText(fixture.offer.offerNumber);
   await expect(page.locator('#company')).toHaveText('Muster KMU AG');
   await expect(page.locator('#service')).toHaveText('Automatisierter Anfrageprozess');
   await expect(page.locator('#payment')).toContainText('50 % bei Auftrag');
   await expect(page.locator('#once')).toContainText('1');
   await expect(page.locator('#monthly')).toContainText('149');
   if(mode==='Ja'){
    await expect(page.locator('#avvSection')).toBeVisible();
    await expect(page.locator('#avvConsentSection')).toBeVisible();
   }else{
    await expect(page.locator('#avvSection')).toBeHidden();
    await expect(page.locator('#avvConsentSection')).toBeHidden();
   }
   await expect(page.locator('#avvConsent')).not.toBeChecked();
   expect(fixture.stats.preview).toBe(1);
   expect(new URL(page.url()).searchParams.has('code')).toBe(false,
    'browser history must redact private offer token');
   for(const [button,type] of [
    ['quotePdf','Offerte'],['termsPdf','Projektbedingungen'],
    ...(mode==='Ja'?[['avvPdf','AVV']]:[])
   ]){
    const downloading=page.waitForEvent('download');
    await page.locator('#'+button).click();
    const download=await downloading;
    expect(download.suggestedFilename()).toContain('LSZH_'+type+'_');
   }
   await page.locator('#person').fill('Synthetische Testperson');
   await page.locator('#email').fill('synthetic@example.invalid');
   await page.locator('#authorized').check();
   await page.locator('#terms').check();
   if(mode==='Ja')await page.locator('#avvConsent').check();
   await page.locator('#submit').click();
   await expect(page.locator('#completedTitle')).toContainText('kein Vertrag');
   await expect(page.locator('#receipt')).toContainText(fixture.offer.offerNumber);
   await expect(page.locator('#emailFollowup')).toBeHidden();
   await expect(page.locator('#review')).toBeHidden();
   expect(fixture.stats.accept).toBe(1);
   expect(fixture.stats.pdf).toBe(mode==='Ja'?3:2);
   expect(fixture.offer.status).toBe('accepted');
   expect(fixture.offer.revision).toBe(2);
   expect(fixture.getEvidence().avv_required).toBe(mode==='Ja');
  }finally{await fixture.close();}
 });
}

for(const mode of ['Ja','Nein']){
 test('CLOUD PREVIEW ONLY: synthetic browser + verified PDFs; acceptance blocked AVV '+mode,
  async({page})=>{
   const fixture=await localFixture(mode,{previewOnly:true});
   try{
     await page.goto(fixture.base+'/offerte-annehmen/?code='+TOKEN);
     await expect(page.locator('#number')).toHaveText(fixture.offer.offerNumber);
     await expect(page.locator('#message')).toContainText('Hier kann kein Vertrag geschlossen werden');
     await expect(page.locator('#acceptanceHeading')).toContainText('Testvorschau');
     await expect(page.locator('#submit')).toBeDisabled();
     await expect(page.locator('#legalNote')).toBeHidden();
     if(mode==='Ja')await expect(page.locator('#avvSection')).toBeVisible();
     else await expect(page.locator('#avvSection')).toBeHidden();
     expect(new URL(page.url()).searchParams.has('code')).toBe(false);
     for(const which of ['quotePdf','termsPdf',...(mode==='Ja'?['avvPdf']:[])]){
       const downloading=page.waitForEvent('download');
       await page.locator('#'+which).click();
       const download=await downloading;
       expect(download.suggestedFilename()).toMatch(/\.pdf$/);
     }
     const blocked=await page.evaluate(async code=>{
       const res=await fetch('/api/offer/accept',{method:'POST',
         headers:{'Content-Type':'application/json'},
         body:JSON.stringify({code})});
       return {status:res.status,body:await res.json()};
     },TOKEN);
     expect(blocked).toEqual({status:503,body:{error:'not_available'}});
     expect(fixture.offer.status).toBe('sent');
     expect(fixture.offer.revision).toBe(1);
     expect(fixture.getEvidence()).toBe(null);
     expect(fixture.stats.preview).toBe(1);
     expect(fixture.stats.pdf).toBe(mode==='Ja'?3:2);
     await page.reload();
     await expect(page.locator('#message')).toContainText('vollständigen Link');
     expect(fixture.offer.status).toBe('sent');
   }finally{await fixture.close();}
 });
}

test('TEMP CLOUD-ONLY STATIC DEMO: real Chromium displays existing demo and never sends an offer POST',async({page})=>{
 const {createTemporaryBrowserDemoHttp}=await import('../cloud-run/offer-portal-staging/temporaryBrowserDemo.mjs');
 const server=http.createServer(createTemporaryBrowserDemoHttp({enabled:true,pageHtml:HTML}));
 await new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(0,'127.0.0.1',resolve);
 });
 try{
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/offerte-annehmen/?demo=1');
  await expect(page.locator('#number')).toHaveText('MUSTER-2026-001');
  await expect(page.locator('#message')).toContainText('unverbindliche Designvorschau');
  await expect(page.locator('#submit')).toBeDisabled();
  await page.locator('#quotePdf').click();
  await expect(page.locator('#message')).toContainText('keine echten Vertragsdokumente');
  // The demo CSP has connect-src 'none', so normal browser fetches are
  // correctly blocked before reaching the server. A test-driver HTTP call
  // separately verifies the server-side contract endpoint is also hard-off.
  const apiResult=await page.request.post(base+'/api/offer/accept',{
    data:{code:'NOT_REAL'}});
  expect(apiResult.status()).toBe(503);
  expect(await apiResult.json()).toEqual({error:'not_available'});
  const preview=await page.request.get(base+'/offerte-annehmen/?code=NOT_REAL');
  expect(preview.status()).toBe(503);
  await page.reload();
  await expect(page.locator('#submit')).toBeDisabled();
 }finally{
  await new Promise(resolve=>server.close(resolve));
 }
});
