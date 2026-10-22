'use strict';
const {test,expect}=require('@playwright/test'),{createServer}=require('node:http'),{readFileSync}=require('node:fs');
test('onboarding fragment and pending receipt use only an isolated local backend',async({page})=>{
 const requests=[],html=readFileSync('onboarding/index.html','utf8');
 const server=createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/onboarding/'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);}
  if(req.method==='POST'&&req.url==='/api/onboarding'){let body='';for await(const c of req)body+=c;requests.push(JSON.parse(body));res.writeHead(202,{'Content-Type':'application/json'});return res.end('{"ok":true,"pending":true}');}
  res.writeHead(404);res.end();
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,code='ob_12345678-1234-4234-8234-123456789abc';
 try{
  await page.goto(base+'/onboarding/#code='+code+'&firma=TEST_ONLY&projekt=Fiktives%20Onboarding');
  await expect(page.locator('#company')).toHaveValue('TEST_ONLY');expect(page.url()).toBe(base+'/onboarding/');
  await page.locator('form [required]').evaluateAll(fields=>{for(const f of fields){if(f.tagName==='SELECT')f.value=[...f.options].find(o=>o.value)?.value||'';else if(f.type==='checkbox')f.checked=true;else f.value=f.type==='email'?'synthetic@example.invalid':'TEST_ONLY';}});
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#status')).toContainText('Speicherung ist noch nicht bestätigt');
  expect(requests).toHaveLength(1);expect(requests[0].project_code).toBe(code);expect(requests[0].contact_email).toBe('synthetic@example.invalid');
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
