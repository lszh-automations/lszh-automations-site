'use strict';
const {test,expect}=require('@playwright/test'),{createServer}=require('node:http'),{readFileSync}=require('node:fs'),{createHash}=require('node:crypto');
test('isolated public fixture: fragment preview, two checked PDFs, disabled acceptance',async({page})=>{
 const {createPublicPreview,PREVIEW}=await import('../cloud-run/public-test-preview/preview.mjs');
 const code='T'.repeat(48),hash=createHash('sha256').update(code).digest('hex');
 const handler=createPublicPreview({config:{enabled:true,origin:PREVIEW.origin,tokenHash:hash,expiresAt:new Date(Date.now()+60000).toISOString()},pageHtml:readFileSync('offerte-annehmen/index.html','utf8')});
 let base;const seen=[];
 const server=createServer((req,res)=>{seen.push(req.url);if(req.headers.origin===base)req.headers.origin=PREVIEW.origin;return handler(req,res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 try{
  await page.goto(base+'/offerte-annehmen/#code='+code);
  await expect(page.locator('#number')).toHaveText(PREVIEW.number);
  await expect(page.locator('#submit')).toBeDisabled();expect(page.url()).toBe(base+'/offerte-annehmen/');
  for(const id of ['quotePdf','termsPdf']){const waiting=page.waitForEvent('download');await page.locator('#'+id).click();const d=await waiting;expect(d.suggestedFilename()).toMatch(/\.pdf$/);}
  expect(seen.every(url=>!url.includes(code))).toBe(true);
  const r=await page.request.post(base+'/api/offer/accept',{data:{code},headers:{Origin:base}});expect(r.status()).toBe(503);
 }finally{await server.closeAllConnections();await new Promise(r=>server.close(r));}
});
