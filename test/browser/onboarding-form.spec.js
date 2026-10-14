'use strict';
const {test,expect}=require('@playwright/test');
const http=require('node:http'),net=require('node:net');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const path=require('node:path');
const tokens=['ob_aaaaaaaa-bbbb-cccc-dddd-000000000011','ob_aaaaaaaa-bbbb-cccc-dddd-000000000012'];
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
async function ready(base){for(let i=0;i<80;i++){try{if((await fetch(base+'/onboarding/')).ok)return;}catch{}await delay(70);}throw Error('no test server');}
async function fill(form){
 const values={company:'LSZH "E2E" GmbH <TEST>',project_name:'Make-Onboarding & CRM',
 project_contact:"Anna O'Neil",contact_email:'fake@example.invalid',
 billing_street:'Testweg 1',billing_postal_code:'5610',billing_city:'Wohlen',
 billing_country:'Schweiz',billing_email:'fake@example.invalid',
 systems:'Excel & Make',approver:'Anna O Neill'};
 for(const [k,v] of Object.entries(values))await form.locator('[name="'+k+'"]').fill(v);
 await form.locator('[name="make_account_status"]').selectOption({label:'Make-Organisation vorhanden'});
 await form.locator('[name="make_invitation_status"]').selectOption({label:'Noch nicht eingeladen'});
 await form.locator('[name="sensitive_data"]').selectOption({label:'Unsicher'});
}
test('Onboarding Chromium desktop/mobile uses mock webhook only, no invitation or email',async({browser})=>{
 test.setTimeout(120000);
 const received=[];let mode='confirmed';
 const mock=http.createServer((req,res)=>{
  const chunks=[];req.on('data',x=>chunks.push(x));req.on('end',()=>{
   received.push(JSON.parse(Buffer.concat(chunks).toString()));
   res.setHeader('Content-Type','application/json');
   if(mode==='confirmed')res.end(JSON.stringify({ok:true,record_id:'recABC12345678901'}));
   else res.end(JSON.stringify({ok:true}));
  });
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 const port=await freePort(),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.js'],{cwd:path.resolve(__dirname,'../..'),
 env:{...process.env,PORT:String(port),SITE_PRIVATE:'false',
 MAKE_ONBOARDING_WEBHOOK:'http://127.0.0.1:'+mock.address().port+'/fake-make',
 OFFER_ACCEPTANCE_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
 try{
  await ready(base);
  for(const [index,[width,height,modeValue]] of [[1366,900,'pending'],[390,844,'confirmed']].entries()){
   mode=modeValue;
   const context=await browser.newContext({viewport:{width,height},isMobile:width===390,hasTouch:width===390});
   const page=await context.newPage();
   const external=[];page.on('request',req=>{if(!req.url().startsWith(base))external.push(req.url());});
   const pageResponse=await page.goto(base+'/onboarding/?code='+tokens[index]);
   expect(pageResponse.headers()['referrer-policy']).toBe('no-referrer');
   expect(pageResponse.headers()['cache-control']).toContain('no-store');
   expect(pageResponse.headers()['x-robots-tag']).toContain('noindex');
   await expect.poll(()=>new URL(page.url()).search).toBe('');
   const form=page.locator('#onboardingForm');await fill(form);
   await expect(page.getByText('lars@lszh-automations.ch').first()).toBeVisible();
   await form.locator('button[type="submit"]').click();
   await expect(page.locator('#status')).toContainText(mode==='pending'?'Speicherung ist noch nicht bestätigt':'gespeichert');
   await expect(form.locator('[name="company"]')).toHaveValue(mode==='pending'?'LSZH "E2E" GmbH <TEST>':'');
   expect(external).toEqual([]);
   await context.close();
  }
  assertSynthetic(received);
 }finally{child.kill('SIGTERM');await new Promise(r=>mock.close(r));}
});
function assertSynthetic(records){
 expect(records).toHaveLength(2);
 for(const r of records){
  expect(tokens).toContain(r.project_code);
  expect(r.company).toBe('LSZH "E2E" GmbH <TEST>');
  expect(r.make_invitation_status).toBe('Noch nicht eingeladen');
  expect(r.source).toBe('LSZH Kunden-Onboarding');
 }
}
