'use strict';
const {test,expect}=require('@playwright/test');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');

async function freePort(){
  const s=net.createServer();
  await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));
  const port=s.address().port;
  await new Promise(resolve=>s.close(resolve));
  return port;
}
async function serverReady(base){
  for(let i=0;i<80;i++){
    try{
      const r=await fetch(base+'/offerte-annehmen/?demo=1');
      if(r.ok)return;
    }catch{}
    await delay(100);
  }
  throw Error('Isolated acceptance portal did not start');
}
test('offer portal: desktop/mobile demo is read-only; all acceptance APIs fail closed',async({browser})=>{
  test.setTimeout(120000);
  const port=await freePort();
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.resolve(__dirname,'../..'),
    env:{
      ...process.env,PORT:String(port),SITE_PRIVATE:'false',
      OFFER_ACCEPTANCE_ENABLED:'false',
      OFFER_AIRTABLE_PAT:'',
      OFFER_PROOF_SALT:'',
      OFFER_DRIVE_SA_B64:'',
      OFFER_TERMS_APPROVED_VERSION:''
    },
    stdio:['ignore','pipe','pipe']
  });
  const base='http://127.0.0.1:'+port;
  try{
    await serverReady(base);
    for(const width of [1280,390]){
      const context=await browser.newContext({
        viewport:{width,height:844},isMobile:width===390,hasTouch:width===390
      });
      const page=await context.newPage();
      const externalRequests=[];
      page.on('request',request=>{
        if(request.url().includes('/api/offer/'))externalRequests.push(request.url());
      });
      const response=await page.goto(base+'/offerte-annehmen/?demo=1');
      expect(response.status()).toBe(200);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['referrer-policy']).toBe('no-referrer');
      expect(response.headers()['x-robots-tag']).toContain('noindex');
      await expect(page.locator('h1')).toContainText('Offerte');
      await expect(page.locator('#number')).toHaveText('MUSTER-2026-001');
      await expect(page.locator('#message')).toContainText('unverbindliche Designvorschau');
      await expect(page.locator('#submit')).toBeDisabled();
      await expect(page.locator('#completed')).toBeHidden();
      expect(new URL(page.url()).search).toBe('');
      await page.locator('#quotePdf').click();
      await expect(page.locator('#message')).toContainText('keine echten Vertragsdokumente');
      await page.locator('#termsPdf').click();
      await expect(page.locator('#message')).toContainText('keine echten Vertragsdokumente');
      expect(externalRequests).toEqual([]);

      for(const route of ['preview','accept','document']){
        const res=await context.request.post(base+'/api/offer/'+route,{
          headers:{Origin:base,'Content-Type':'application/json'},
          data:{code:'A'.repeat(43)}
        });
        expect(res.status(),route).toBe(503);
        expect((await res.json()).error).toBe('not_available');
      }
      await context.close();
    }

    const invalid=await browser.newPage();
    await invalid.goto(base+'/offerte-annehmen/?code=invalid-token');
    await expect(invalid.locator('#review')).toBeHidden();
    await expect(invalid.locator('#message')).toContainText('vollständigen Link');
    await invalid.close();
  }finally{
    child.kill('SIGTERM');
    await delay(150);
  }
});
