'use strict';
// Loopback-only, synthetic documents and in-memory receipts. No cloud or mail gateway.
const http=require('node:http'),path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {fixture}=require('../crm-v2/test/helpers/acceptance-fixture');
const {createAcceptanceHandler}=require('../crm-v2/customer-portal/contract-acceptance-http-staging');
async function startPreview({outcome='success',delay=0,customer=true}={}){
 const f=fixture({avv:'no'}),invitation=await f.issue();let posts=0;
 const service={...f.service,preview:async(...args)=>({...await f.service.preview(...args),testOnly:!customer}),accept:async(...args)=>{
  posts++;await new Promise(resolve=>setTimeout(resolve,delay));
  if(outcome==='error')throw Object.assign(Error('DOCUMENT_INTEGRITY_FAILED'),{status:409});
  if(outcome==='malformed')return {state:'pending'};
  const receipt=await f.service.accept(...args);
  if(outcome==='lost-ack')throw Error('REQUEST_FAILED');
  return receipt;
 }};
 let handler;const server=http.createServer((req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 handler=createAcceptanceHandler({service,origin,customerMode:customer});
 return {server,origin,url:origin+'/#'+invitation.token,posts:()=>posts};
}
async function run(){
 const output=path.resolve(__dirname,'../output/signature-success-20261028');fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,channel:process.env.SIGNATURE_BROWSER_CHANNEL||'msedge'});const results=[];
 try{
  for(const scenario of [
   {name:'desktop',width:1440,height:1100,outcome:'success'},
   {name:'mobile',width:390,height:844,outcome:'success'},
   {name:'narrow',width:320,height:740,outcome:'success'},
   {name:'test-only',width:390,height:844,outcome:'success',customer:false},
   {name:'reduced-motion',width:390,height:844,outcome:'success',reduced:true},
   {name:'error',width:390,height:844,outcome:'error'},
   {name:'malformed',width:390,height:844,outcome:'malformed'},
   {name:'lost-ack',width:390,height:844,outcome:'lost-ack'}
  ]){
   const preview=await startPreview({...scenario,delay:350});const page=await browser.newPage({viewport:scenario,reducedMotion:scenario.reduced?'reduce':'no-preference'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(preview.url);await page.locator('#package').waitFor({state:'visible'});
    await page.locator('#terms').check();await page.locator('#representative').check();
    // Two synchronous submissions exercise the guard before the server responds.
    if(scenario.reduced){await page.locator('#submit').focus();await page.keyboard.press('Enter');}
    await page.locator('#accept-form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    assert.equal(await page.locator('#success').isVisible(),false);
    assert.equal(await page.locator('#submit').isDisabled(),true);
    assert.equal(await page.locator('#accept-form').getAttribute('aria-busy'),'true');
    if(scenario.outcome==='success'){
     await page.locator('#success').waitFor({state:'visible'});
     assert.equal(preview.posts(),1);assert.equal(await page.locator('#success-title').textContent(),scenario.customer===false?'Vielen Dank. Ihre Test-Annahme ist erfasst.':'Vertrag erfolgreich angenommen!');
     assert.equal(await page.locator('#success-title').evaluate(el=>el===document.activeElement),true);
     assert.match(await page.locator('#response-id').textContent(),/^response_/);
     await page.locator('#accept-form').evaluate(form=>form.dispatchEvent(new Event('submit',{cancelable:true})));
     assert.equal(preview.posts(),1);
     const animation=await page.locator('.signature-copy').evaluate(el=>getComputedStyle(el).animationName);
     assert.equal(animation,scenario.reduced?'none':'signature-copy');
     await page.waitForTimeout(scenario.reduced?0:2750);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
     await page.screenshot({path:path.join(output,scenario.name+'.png'),fullPage:true});
     await page.reload();await page.locator('#error').waitFor({state:'visible'});
     assert.equal(await page.locator('#success').isVisible(),false);assert.equal(preview.posts(),1);
     await page.goto('about:blank');await page.goto(preview.url);await page.locator('#error').waitFor({state:'visible'});
     assert.match(await page.locator('#error').textContent(),/bereits gespeichert/);
    }else{
     await page.locator('#error').waitFor({state:'visible'});assert.equal(await page.locator('#success').isVisible(),false);
     assert.equal(await page.locator('#submit').isEnabled(),true);assert.equal(preview.posts(),1);
     await page.screenshot({path:path.join(output,scenario.name+'.png'),fullPage:true});
     if(scenario.outcome==='lost-ack'){
      await page.goto('about:blank');await page.goto(preview.url);await page.locator('#error').waitFor({state:'visible'});
      assert.equal(await page.locator('#success').isVisible(),false);assert.equal(preview.posts(),1);
      assert.match(await page.locator('#error').textContent(),/bereits gespeichert/);
     }
    }
    assert.deepEqual(errors,[]);results.push({scenario:scenario.name,result:'PASS',posts:preview.posts()});
   }finally{await page.close();await new Promise(resolve=>preview.server.close(resolve));}
  }
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
 }finally{await browser.close();}
}
if(require.main===module){
 const action=process.argv.includes('--serve')?startPreview({customer:false,delay:700}).then(p=>console.log('LOCAL SYNTHETIC PREVIEW ONLY: '+p.url)):run();
 action.catch(e=>{console.error(e);process.exitCode=1;});
}
module.exports={startPreview};
