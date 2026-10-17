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

async function localFixture(mode){
 const [{createOfferPortal,offerFingerprint},{createOfferPortalHttp}]=await Promise.all([
  import('../cloud-run/offer-portal-staging/portalCore.mjs'),
  import('../cloud-run/offer-portal-staging/portalHttp.mjs')
 ]);
 const offer={
  tokenHash:sha(TOKEN),status:'sent',approved:true,revision:1,
  termsVersion:'TEST_v1.0_RC1',expiresAt:'2099-12-31T23:59:59Z',
  recipientEmail:'synthetic@example.invalid',
  offerNumber:'TEST_BROWSER_'+mode.toUpperCase()+'_NO_CONTRACT',
  details:{company:'Muster KMU AG',service:'Automatisierter Anfrageprozess',
   paymentModel:'50 % bei Auftrag / 50 % nach Abnahme',
   onceCHF:1490,monthlyCHF:149,
   ...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV_v1.0'}:{})},
  bundle:{avv_required:mode,
   quote:{id:'1LSZHSyntheticQuoteFile000000000001',sha256:'a'.repeat(64)},
   terms:{id:'1LSZHSyntheticTermsFile000000000001',sha256:'b'.repeat(64)},
   ...(mode==='Ja'?{avv:{id:'1LSZHSyntheticAvvFile0000000000001',sha256:'c'.repeat(64)}}:{})}
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
  store,verifyBundle:async()=>true,approvedVersion:'TEST_v1.0_RC1',
  proofSalt:'SYNTHETIC_BROWSER_ONLY_NOT_A_SECRET_12345',
  clock:()=>new Date('2026-10-17T12:00:00.000Z')
 });
 const handle=createOfferPortalHttp({portal,enabled:true,allowedOrigin:ORIGIN});
 let base='';
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(req.method==='GET'&&url.pathname==='/offerte-annehmen/'){
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
    'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
   res.end(HTML);return;
  }
  // Synthetic document bytes exercise the download interaction, NOT archive verification.
  if(req.method==='POST'&&url.pathname==='/api/offer/document'){
   stats.pdf++;
   res.writeHead(200,{'Content-Type':'application/pdf',
    'Content-Disposition':'attachment; filename="SYNTHETIC_ONLY_NO_CONTRACT.pdf"',
    'Cache-Control':'no-store'});
   res.end('%PDF-1.4\n% SYNTHETIC ONLY - NOT A CONTRACT\n%%EOF\n');return;
  }
  if(req.method==='POST'&&['/api/offer/preview','/api/offer/accept'].includes(url.pathname)){
   // Do not allow cross-origin browser requests even in this loopback fixture.
   if(req.headers.origin!==base){res.writeHead(403);res.end();return;}
   if(url.pathname.endsWith('preview'))stats.preview++;
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
   const downloading=page.waitForEvent('download');
   await page.locator('#quotePdf').click();
   const download=await downloading;
   expect(download.suggestedFilename()).toContain('LSZH_Offerte_');
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
   expect(fixture.stats.pdf).toBe(1);
   expect(fixture.offer.status).toBe('accepted');
   expect(fixture.offer.revision).toBe(2);
   expect(fixture.getEvidence().avv_required).toBe(mode==='Ja');
  }finally{await fixture.close();}
 });
}
