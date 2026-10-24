'use strict';

/*
 * Isolated real-browser + HTTP + Firestore-emulator E2E.
 * NEVER run with cloud credentials, external emails or production resources.
 * Google ID-token verification is stubbed ONLY in this runner's process.
 */
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require('playwright');

async function main(){
  // Fail closed before requiring any Cloud SDK.
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8787')
    throw Error('E2E_REQUIRES_LOCAL_FIRESTORE_EMULATOR');
  if(process.env.CI!=='true')
    throw Error('E2E_REQUIRES_DEDICATED_GITHUB_ACTIONS_RUNNER');
  const project='demo-lszh-invoice-e2e';
  const account='e2e@qa.invalid';
  const token='TEST_ONLY_INVOICE_E2E_TOKEN';
  const audience='TEST_ONLY_INVOICE_E2E_CLIENT_ID';
  process.env.GOOGLE_CLOUD_PROJECT=project;
  process.env.GCLOUD_PROJECT=project;
  process.env.CRM_RECORD_PREFIX='lszh_crm_v2_staging_';
  process.env.GOOGLE_OAUTH_CLIENT_ID=audience;
  process.env.CRM_ALLOWED_EMAILS=account;
  process.env.CRM_WEBSITE_INTAKE_ENABLED='false';
  process.env.CRM_MAIL_ENABLED='false';
  process.env.CRM_OFFER_MAIL_ENABLED='false';
  process.env.CRM_INVOICE_MAIL_ENABLED='false';
  process.env.CRM_INVOICE_MAIL_PRODUCTION_APPROVED='false';
  process.env.CRM_INVOICE_MAIL_MODE='disabled';
  process.env.CRM_INVOICE_QR_ENABLED='false';
  process.env.CRM_INVOICE_PRODUCTION_APPROVED='false';
  process.env.CRM_INVOICE_MAIL_WEBHOOK_URL='';
  process.env.CRM_OFFER_MAIL_WEBHOOK_URL='';
  process.env.CRM_MAIL_WEBHOOK_URL='';
  process.env.CRM_INGEST_SECRET='';
  process.env.CRM_INVOICE_IBAN='';
  const {OAuth2Client}=require('google-auth-library');
  OAuth2Client.prototype.verifyIdToken=async function(args){
    if(args?.idToken!==token||args?.audience!==audience)throw Error('e2e_invalid_test_token');
    return {getPayload:()=>({email:account,email_verified:true,hd:'qa.invalid'})};
  };
  const {Firestore}=require('@google-cloud/firestore');
  const {createApp}=require('../server');
  const {buildStore}=require('../cloud-records');
  const db=new Firestore({projectId:project});
  const store=buildStore(db,'lszh_crm_v2_staging_');
  const server=createApp();
  let browser;
  const errors=[];
  try{
    await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',resolve);
    });
    const base='http://127.0.0.1:'+server.address().port;
    const request=async(path,method='GET',payload,headers={})=>{
      const response=await fetch(base+path,{method,headers:{
        Authorization:'Bearer '+token,Origin:base,
        ...(payload?{'Content-Type':'application/json'}:{}),...headers
      },body:payload?JSON.stringify(payload):undefined});
      const data=await response.json().catch(()=>({}));
      return {status:response.status,data};
    };
    const expectOk=async(path,method,payload)=>{
      const result=await request(path,method,payload);
      assert.ok([200,201].includes(result.status),
        method+' '+path+' HTTP '+result.status+' '+JSON.stringify(result.data));
      return result.data;
    };
    // A real listener denies unauthenticated requests and foreign origins.
    let raw=await fetch(base+'/api/records/rechnungen');
    assert.equal(raw.status,401,'anonymous read must not work');
    assert.equal((await request('/api/records/rechnungen','POST',{description:'blocked'},
      {Origin:'https://untrusted.example'})).status,403,'cross-origin write blocked');

    const customer=(await expectOk('/api/records/kunden','POST',{
      company:'TEST_ONLY E2E Debitor AG',contactName:'Test Person',
      email:'debitor@qa.invalid',street:'Musterweg 12',postalCode:'8000',
      city:'Zuerich',country:'CH',status:'Aktiv'
    })).record;
    const invoice=(await expectOk('/api/records/rechnungen','POST',{
      customerId:customer.id,description:'TEST_ONLY E2E Automationsservice',
      invoiceDate:'2020-01-01',dueDate:'2020-01-31',status:'Offen',
      items:[{title:'TEST_ONLY Service',qty:1,unitPriceCHF:199.95}]
    })).record;
    assert.equal(invoice.amountCHF,199.95);
    assert.match(invoice.number,/^RE-\d+$/);
    // The E2E deliberately does NOT send email. Simulate Gmail receipt only
    // inside the disposable Firestore emulator, via the real state machine.
    const claim=await store.claimInvoiceSend(invoice.id,{email:account});
    await store.finishInvoiceSend(invoice.id,claim.attemptId,'confirmed',
      'TEST_ONLY_EMULATOR_RECEIPT_NO_GMAIL_SEND');
    const persisted=await db.collection('lszh_crm_v2_staging_rechnungen').doc(invoice.id).get();
    assert.equal(persisted.data().invoiceDispatchState,'confirmed');

    // Browser loads the actual Cloud CRM UI. Google Identity script is supplied
    // by a local Playwright route; no Google OAuth or Gmail request is performed.
    browser=await chromium.launch({headless:true,args:['--no-sandbox']});
    const page=await browser.newPage({timezoneId:'Europe/Zurich',viewport:{width:1400,height:900}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',async dialog=>{
      if(dialog.type()==='prompt')await dialog.accept('TEST_ONLY incorrect payment reference corrected');
      else await dialog.accept();
    });
    await page.route('https://accounts.google.com/gsi/client',async route=>{
      await route.fulfill({status:200,contentType:'application/javascript',body:
        'window.google={accounts:{id:{initialize:function(c){this.cb=c.callback;},'+
        'renderButton:function(){},prompt:function(){this.cb({credential:"'+token+'"});},'+
        'disableAutoSelect:function(){}}}};'});
    });
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('#workspace').waitFor({state:'visible',timeout:20000});
    await page.locator('#nav button[data-tab="rechnungen"]').click();
    const row=page.locator('#tableArea tbody tr').filter({hasText:invoice.number});
    await row.getByRole('button',{name:'Bearbeiten'}).click();
    await page.locator('#invoiceEditor[open]').waitFor({state:'visible'});
    assert.match(await page.locator('#invoicePaymentSummary').innerText(),/199.95/);
    assert.equal(await page.locator('#invoiceSend').isDisabled(),true,
      'No outgoing invoice email in E2E');
    await page.locator('#invoiceReminderActions').waitFor({state:'visible'});
    assert.match(await page.locator('#invoiceReminderText').inputValue(),/Zahlungserinnerung/);

    // Real browser-click payment -> authenticated API -> Firestore transaction.
    await page.locator('#invoicePaymentAmount').fill('50.00');
    await page.locator('#invoicePaymentReference').fill('TEST_ONLY E2E-PART-1');
    await page.locator('#invoiceRecordPayment').click();
    await page.waitForFunction(()=>document.querySelector('#invoicePaymentSummary')?.textContent?.includes('149.95'));
    const partial=(await store.get('rechnungen',invoice.id));
    assert.equal(partial.status,'Teilbezahlt');
    assert.equal(partial.outstandingCHF,149.95);
    assert.equal(partial.paymentHistory.length,1);
    assert.match(await page.locator('#invoicePaymentSummary').innerText(),/149.95/);
    assert.match(await page.locator('#invoicePaymentStatus').innerText(),/Überfällig/);

    // In emulator only, click the UI's operator-confirmation after a
    // simulated *external* reminder; this never makes a network mail send.
    await page.locator('#invoiceLogReminder').click();
    await page.waitForFunction(()=>document.querySelector('#invoiceReminderHistory')?.textContent?.includes('Zahlungserinnerung ('));
    assert.equal((await store.get('rechnungen',invoice.id)).reminderHistory.length,1);
    assert.equal(await page.locator('#invoiceReminderActions').isVisible(),false,
      'seven-day reminder lock prevents consecutive reminder');

    // Full settlement.
    await page.locator('#invoicePaymentAmount').fill('149.95');
    await page.locator('#invoicePaymentReference').fill('TEST_ONLY E2E-FINAL-2');
    await page.locator('#invoiceRecordPayment').click();
    await page.waitForFunction(()=>document.querySelector('#invoicePaymentStatus')?.textContent==='Bezahlt');
    const full=await store.get('rechnungen',invoice.id);
    assert.equal(full.status,'Bezahlt');
    assert.equal(full.outstandingCHF,0);
    assert.equal(full.paymentHistory.length,2);
    assert.equal(await page.locator('#invoicePaymentEntry').isVisible(),false);
    assert.equal(await page.locator('#invoiceReminderActions').isVisible(),false);

    // User corrects an incorrect posting. Original audit row remains.
    await page.locator('#invoicePaymentHistory button').first().click();
    await page.waitForFunction(()=>document.querySelector('#invoicePaymentHistory')?.textContent?.includes('KORRIGIERT'));
    const corrected=await store.get('rechnungen',invoice.id);
    assert.equal(corrected.status,'Teilbezahlt');
    assert.equal(corrected.outstandingCHF,149.95);
    assert.equal(corrected.paymentHistory.length,2);
    assert.ok(corrected.paymentHistory[1].voidedAt);
    assert.match(await page.locator('#invoicePaymentHistory').innerText(),/KORRIGIERT/);

    // Explicit negative tests against the actual HTTP API.
    const duplicate=await request('/api/records/rechnungen/'+invoice.id+'/payments',
      'POST',{paymentId:randomUUID(),amountCHF:'149.96',
      paidOn:'2020-02-01',method:'Banküberweisung',reference:'TEST_ONLY E2E-OVERPAY'});
    assert.equal(duplicate.status,409);
    const forbidden=await request('/api/records/rechnungen/'+invoice.id,'PATCH',
      {status:'Bezahlt'});
    assert.equal(forbidden.status,409,'direct paid-status writes forbidden');
    const same=await request('/api/records/rechnungen/'+invoice.id+'/payments','POST',{
      paymentId:corrected.paymentHistory[0].paymentId,
      amountCHF:'50.00',paidOn:corrected.paymentHistory[0].paidOn,
      method:corrected.paymentHistory[0].method,
      reference:corrected.paymentHistory[0].reference
    });
    assert.equal(same.status,200,'duplicate payment ID is idempotent');
    assert.equal((await store.get('rechnungen',invoice.id)).paymentHistory.length,2);

    const production=await db.collection('lszh_crm_v2_rechnungen').limit(1).get();
    assert.equal(production.empty,true,'no production-prefix collection touched');
    assert.deepEqual(errors,[],'no uncaught browser errors');
    console.log('INVOICE E2E PASS: browser + authenticated HTTP + local Firestore');
    console.log('INVOICE E2E PASS: partial, reminder cooldown, full, reversal, replay, denial');
    console.log('INVOICE E2E NO SEND: Google/Gmail/Make/bank endpoints not called');
    console.log('INVOICE E2E ISOLATED PROJECT '+project+' (emulator only)');
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
    await db.terminate();
  }
}
main().catch(error=>{console.error('INVOICE E2E FAIL:',error.stack||String(error));process.exitCode=1;});
