'use strict';
// Offline, synthetic portal rendering only. Every browser request is intercepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {MAKE_REQUIREMENTS_VERSION,makeRequirements}=require('../make-requirements');
const assets=path.join(__dirname,'../customer-portal/acceptance-public');
const out=path.resolve(process.env.LSZH_BROWSER_QA_OUTPUT||path.join(__dirname,'../out/make-requirements'));
const policy=makeRequirements(MAKE_REQUIREMENTS_VERSION);
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({headless:true});
 try{
  for(const [name,viewport] of [['desktop',{width:1280,height:1000}],['mobile',{width:390,height:844}]]){
   for(const version of [undefined,MAKE_REQUIREMENTS_VERSION]){
    const page=await browser.newPage({viewport});const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
     const request=route.request(),pathname=new URL(request.url()).pathname;requests.push({pathname,method:request.method()});
     if(request.method()!=='GET')throw Error('No sends or acceptance requests allowed');
     if(pathname==='/api/acceptance')return route.fulfill({json:{testOnly:false,offerNumber:'1101',revision:1,
      recipient:'synthetic@example.com',expiresAt:'2026-11-26T18:00:00Z',avvRequired:false,
      declarations:{terms:'Ich stimme den geprüften Dokumentversionen zu.',representative:'Ich bin zur Abgabe dieser Erklärung berechtigt.',avv:'AVV'},
      ...(version?{makeRequirements:policy}:{}),documents:[{kind:'offer',filename:'TEST_ONLY_Offerte.pdf',bytes:6000},{kind:'terms',filename:'TEST_ONLY_Bedingungen.pdf',bytes:8000}]}});
     const file={'/':'contract-acceptance.html','/acceptance.js':'contract-acceptance.js','/acceptance.css':'contract-acceptance.css'}[pathname];
     if(!file)return route.abort();
     return route.fulfill({body:fs.readFileSync(path.join(assets,file)),contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
    });
    await page.goto('https://synthetic.example/#'+'a'.repeat(43));
    await page.locator('#package').waitFor({state:'visible'});
    assert.equal(await page.locator('#make-requirements').isVisible(),Boolean(version));
    assert.equal(await page.locator('#submit').isDisabled(),true);
    if(version){
     assert.equal(await page.locator('#make-requirements-title').innerText(),policy.title);
     for(const text of policy.paragraphs)assert.ok((await page.locator('#make-requirements-text').innerText()).includes(text));
     const notice=await page.locator('#make-requirements').boundingBox(),form=await page.locator('#accept-form').boundingBox();
     assert.ok(notice.y+notice.height<=form.y+1,'Notice precedes the actual consent form');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'No horizontal overflow');
     await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
    }
    await page.locator('#terms').check();await page.locator('#representative').check();
    assert.equal(await page.locator('#submit').isDisabled(),false);
    assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'));
    await page.close();
   }
  }
  console.log('MAKE NOTICE BROWSER PASS: desktop/mobile, new/legacy packages; zero POSTs or real network requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
