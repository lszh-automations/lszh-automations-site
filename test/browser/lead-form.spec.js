const {test, expect}=require('@playwright/test');
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {setTimeout:pause}=require('node:timers/promises');
const path=require('node:path');

async function freePort(){
  const server=net.createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function waitForSite(url){
  for(let i=0;i<80;i++){
    try{const response=await fetch(url+'/');if(response.ok)return;}catch{}
    await pause(100);
  }
  throw Error('Local LSZH server did not become ready');
}
async function fillLead(page){
  const f=page.locator('#contactForm');
  await f.locator('[name="name"]').fill("E2E Browser <Max & Co>");
  await f.locator('[name="company"]').fill('LSZH Test "GmbH"');
  await f.locator('[name="email"]').fill('browser-test@example.ch');
  await f.locator('[name="message"]').fill('Nur Test: <b>Offerte</b> & Anführungszeichen');
  await f.locator('[name="current_process"]').fill('Excel und E-Mail');
  await f.locator('[name="systems"]').fill('Microsoft 365');
  await f.locator('[name="main_problem"]').selectOption({label:'Hoher Zeitaufwand'});
  await f.locator('[name="frequency"]').selectOption({label:'Wöchentlich'});
  await f.locator('[name="desired_result"]').fill('Weniger manuelle Arbeit');
  return f;
}

test('real Chromium desktop + mobile: website lead form confirms only persisted receipts',async ({browser})=>{
  test.setTimeout(120000);
  const received=[];
  let mode='confirmed';
  const upstream=http.createServer((req,res)=>{
    const data=[];
    req.on('data',x=>data.push(x));
    req.on('end',()=>{
      try{received.push(JSON.parse(Buffer.concat(data).toString('utf8')));}
      catch{return res.writeHead(400).end('invalid JSON')}
      res.setHeader('Content-Type','application/json');
      if(mode==='confirmed') return res.end(JSON.stringify({ok:true,record_id:'recABC12345678901'}));
      if(mode==='pending') return res.end(JSON.stringify({ok:true}));
      res.statusCode=502;
      res.end(JSON.stringify({error:'test_webhook_failed'}));
    });
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const port=await freePort();
  const app=spawn(process.execPath,['server.js'],{
    cwd:path.resolve(__dirname,'../..'),
    env:{...process.env,PORT:String(port),SITE_PRIVATE:'false',
      MAKE_LEAD_WEBHOOK:'http://127.0.0.1:'+upstream.address().port+'/lead'},
    stdio:['ignore','pipe','pipe']
  });
  const base='http://127.0.0.1:'+port;
  try{
    await waitForSite(base);
    const context=await browser.newContext({viewport:{width:1366,height:900}});
    const page=await context.newPage();
    await page.goto(base+'/');
    await expect(page.locator('#contactForm')).toBeVisible();
    let form=await fillLead(page);
    mode='confirmed';
    await form.locator('[type="submit"]').click();
    await expect(page.locator('#formNote')).toContainText('Anfrage wurde gespeichert');
    await expect(form.locator('[name="company"]')).toHaveValue('');
    expect(received.at(-1).company).toBe('LSZH Test "GmbH"');
    expect(received.at(-1).message).toContain('<b>Offerte</b>');

    form=await fillLead(page);
    mode='pending';
    await form.locator('[type="submit"]').click();
    await expect(page.locator('#formNote')).toContainText('Speicherung ist noch nicht bestätigt');
    await expect(form.locator('[name="company"]')).toHaveValue('LSZH Test "GmbH"');
    await expect(form.locator('[type="submit"]')).toBeEnabled();

    mode='failed';
    await form.locator('[type="submit"]').click();
    await expect(page.locator('#formNote')).toContainText('Bitte versuchen Sie es später erneut');
    await expect(form.locator('[name="company"]')).toHaveValue('LSZH Test "GmbH"');
    await context.close();

    const mobile=await browser.newContext({
      viewport:{width:390,height:844},
      deviceScaleFactor:3,
      isMobile:true,hasTouch:true
    });
    const mobilePage=await mobile.newPage();
    await mobilePage.goto(base+'/');
    const mobileForm=await fillLead(mobilePage);
    mode='confirmed';
    await mobileForm.locator('[type="submit"]').click();
    await expect(mobilePage.locator('#formNote')).toContainText('Anfrage wurde gespeichert');
    await expect(mobileForm.locator('[name="email"]')).toHaveValue('');
    await mobile.close();
    expect(received).toHaveLength(4);
  }finally{
    app.kill('SIGTERM');
    await new Promise(resolve=>upstream.close(resolve));
  }
});