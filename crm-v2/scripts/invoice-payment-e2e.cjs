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
    // Due monitoring stays read-only: the synthetic invoice is one day overdue
    // in the disposable emulator. The filters must not create any reminder.
    assert.equal(await page.locator('#invoiceDueOverdueCount').innerText(),'1');
    assert.match(await page.locator('#invoiceDueOverdueAmount').innerText(),/199.95/);
    assert.equal(await page.locator('#invoiceDueSoonCount').innerText(),'0');
    await page.locator('#invoiceDueFilter').selectOption('soon');
    assert.equal(await page.locator('#tableArea tbody tr').count(),0);
    await page.locator('#invoiceDueFilter').selectOption('overdue');
    const row=page.locator('#tableArea tbody tr').filter({hasText:invoice.number});
    assert.equal(await row.count(),1);
    await row.getByRole('button',{name:'Bearbeiten'}).click();
    await page.locator('#invoiceEditor[open]').waitFor({state:'visible'});
    assert.match(await page.locator('#invoicePaymentTotal').innerText(),/199.95/);
    assert.match(await page.locator('#invoicePaymentOpen').innerText(),/199.95/);
    assert.match(await page.locator('#invoicePaymentReceived').innerText(),/0.00/);
    assert.equal(await page.locator('#invoicePaymentPercent').innerText(),'0 % bezahlt');
    assert.equal(await page.locator('#invoicePaymentProgress').evaluate(el=>el.value),0);
    assert.equal(await page.locator('#invoiceSend').isDisabled(),true,
      'No outgoing invoice email in E2E');
    await page.locator('#invoiceReminderActions').waitFor({state:'visible'});
    assert.match(await page.locator('#invoiceReminderText').inputValue(),/Zahlungserinnerung/);
    assert.match(await page.locator('#invoiceReminderStatus').innerText(),/überfällig · Rest/);

    // Real browser-click payment -> authenticated API -> Firestore transaction.
    await page.locator('#invoicePaymentAmount').fill('50.00');
    await page.locator('#invoicePaymentReference').fill('TEST_ONLY E2E-PART-1');
    await page.locator('#invoiceRecordPayment').click();
    await page.waitForFunction(()=>document.querySelector('#invoicePaymentOpen')?.textContent?.includes('149.95'));
    const partial=(await store.get('rechnungen',invoice.id));
    assert.equal(partial.status,'Teilbezahlt');
    assert.equal(partial.outstandingCHF,149.95);
    assert.equal(partial.paymentHistory.length,1);
    assert.match(await page.locator('#invoiceReminderStatus').innerText(),/überfällig · Rest/);
    assert.match(await page.locator('#invoicePaymentOpen').innerText(),/149.95/);
    assert.match(await page.locator('#invoicePaymentReceived').innerText(),/50.00/);
    assert.equal(await page.locator('#invoicePaymentPercent').innerText(),'25 % bezahlt');
    assert.equal(await page.locator('#invoicePaymentProgress').evaluate(el=>el.value),25);
    assert.match(await page.locator('#invoicePaymentStatus').innerText(),/Überfällig/);

    // In emulator only, click the UI's operator-confirmation after a
    // simulated *external* reminder; this never makes a network mail send.
    await page.locator('#invoiceLogReminder').click();
    try {
      await page.waitForFunction(()=>document.querySelector('#invoiceReminderHistory')?.textContent?.includes('Zahlungserinnerung ·'),null,{timeout:15000});
    }catch(err){
      console.error('TEST_ONLY REMINDER UI DIAGNOSTIC',JSON.stringify({
        history:await page.locator('#invoiceReminderHistory').textContent(),
        notice:await page.locator('#invoiceReminderNotice').textContent(),
        hidden:await page.locator('#invoiceReminderActions').evaluate(x=>x.hidden),
        stageHistory:(await store.get('rechnungen',invoice.id)).reminderHistory,
        browserErrors:errors
      }));
      throw err;
    }
    const reminderPath='/api/records/rechnungen/'+invoice.id+'/reminders';
    const invoiceDoc=db.collection('lszh_crm_v2_staging_rechnungen').doc(invoice.id);
    let firstReminder=(await store.get('rechnungen',invoice.id)).reminderHistory[0];
    assert.equal(firstReminder.kind,'Zahlungserinnerung');
    assert.equal(firstReminder.by,account);
    assert.equal(firstReminder.recipient,customer.email);
    assert.equal(firstReminder.outstandingCHF,149.95);
    assert.equal(firstReminder.delivery,'operator_confirmed_external');
    assert.equal((await page.locator('#invoiceReminderHistory').innerText()).includes(customer.email),true);
    assert.equal((await page.locator('#invoiceReminderHistory').innerText()).includes(account),true);
    assert.equal((await page.locator('#invoiceReminderHistory').innerText()).includes(firstReminder.reminderId),true);
    assert.equal(await page.locator('#invoiceReminderActions').isVisible(),false,
      'seven-day reminder lock prevents consecutive reminder');
    assert.match(await page.locator('#invoiceReminderNotice').innerText(),/frühestens/);
    const second={reminderId:randomUUID(),kind:'1. Mahnung'};
    const third={reminderId:randomUUID(),kind:'2. Mahnung'};
    assert.equal((await request(reminderPath,'POST',third)).status,409,'cannot skip first dunning stage');
    assert.equal((await request(reminderPath,'POST',second)).status,409,'second stage blocked before 7 days');
    // Advance synthetic reminder clock by modifying ONLY the throwaway emulator.
    // This simulates external sending on past dates; NEVER do so in production.
    const backdate=async(index,offsetMs)=>{
      const record=await store.get('rechnungen',invoice.id);
      const history=record.reminderHistory;
      history[index].at=new Date(Date.now()-offsetMs).toISOString();
      await invoiceDoc.update({reminderHistory:history});
    };
    await backdate(0,7*86400000-120000);
    assert.equal((await request(reminderPath,'POST',second)).status,409,'<7 full days');
    await backdate(0,7*86400000+120000);
    const secondResult=await expectOk(reminderPath,'POST',second);
    assert.equal(secondResult.record.reminderHistory.length,2);
    assert.equal(secondResult.record.reminderHistory[1].recipient,customer.email);
    assert.equal(secondResult.record.reminderHistory[1].outstandingCHF,149.95);
    assert.equal((await expectOk(reminderPath,'POST',second)).record.reminderHistory.length,2,
      'duplicate confirmation never logs twice');
    assert.equal((await request(reminderPath,'POST',third)).status,409,'third blocked before 7 days');
    await backdate(1,7*86400000+120000);
    const thirdResult=await expectOk(reminderPath,'POST',third);
    assert.equal(thirdResult.record.reminderHistory.length,3);
    assert.deepEqual(thirdResult.record.reminderHistory.map(h=>h.kind),[
      'Zahlungserinnerung','1. Mahnung','2. Mahnung'
    ]);
    assert.equal(thirdResult.record.reminderHistory[2].recipient,customer.email);
    assert.equal(thirdResult.record.reminderHistory[2].by,account);
    assert.equal(thirdResult.record.reminderHistory[2].outstandingCHF,149.95);
    assert.equal((await request(reminderPath,'POST',{
      reminderId:randomUUID(),kind:'2. Mahnung'
    })).status,409,'no fourth reminder');
    // Refresh actual browser and verify all 3 synthetic audit records are visible.
    await page.locator('#invoiceClose').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#workspace').waitFor({state:'visible',timeout:20000});
    await page.locator('#nav button[data-tab="rechnungen"]').click();
    await page.locator('#tableArea tbody tr').filter({hasText:invoice.number})
      .getByRole('button',{name:'Bearbeiten'}).click();
    assert.match(await page.locator('#invoiceReminderHistory').innerText(),/3 von 3 Mahnstufen/);
    assert.match(await page.locator('#invoiceReminderHistory').innerText(),/1\. Mahnung/);
    assert.match(await page.locator('#invoiceReminderHistory').innerText(),/2\. Mahnung/);
    assert.equal(await page.locator('#invoiceReminderActions').isVisible(),false);
    assert.match(await page.locator('#invoiceReminderNotice').innerText(),/Mahnfolge abgeschlossen/);

    // Full settlement.
    await page.locator('#invoicePaymentAmount').fill('149.95');
    await page.locator('#invoicePaymentReference').fill('TEST_ONLY E2E-FINAL-2');
    await page.locator('#invoiceRecordPayment').click();
    await page.waitForFunction(()=>document.querySelector('#invoicePaymentStatus')?.textContent==='Bezahlt');
    const full=await store.get('rechnungen',invoice.id);
    assert.equal(full.status,'Bezahlt');
    assert.equal(full.outstandingCHF,0);
    assert.equal(full.paymentHistory.length,2);
    assert.match(await page.locator('#invoicePaymentOpen').innerText(),/0.00/);
    assert.equal(await page.locator('#invoicePaymentPercent').innerText(),'100 % bezahlt');
    assert.equal(await page.locator('#invoicePaymentProgress').evaluate(el=>el.value),100);
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
    assert.match(await page.locator('#invoicePaymentOpen').innerText(),/149.95/);
    assert.equal(await page.locator('#invoicePaymentPercent').innerText(),'25 % bezahlt');
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

    // New business cockpit derives exact rappen figures from real authenticated
    // emulator records, excluding the reversed payment. Navigation is read-only.
    await page.locator('#invoiceClose').click();
    await page.locator('#nav button[data-tab="dashboard"]').click();
    await page.locator('#dashboardArea .dash-finance').waitFor({state:'visible'});
    const kpiText=await page.locator('#kpis').innerText();
    assert.match(kpiText,/Offene Forderungen[\s\S]*149\.95/);
    assert.match(kpiText,/Verbuchte Zahlungen[\s\S]*50\.00/);
    const financeText=await page.locator('#dashboardArea .dash-finance').innerText();
    assert.match(financeText,/Offene Forderungen[\s\S]*149\.95/);
    assert.match(financeText,/Davon überfällig[\s\S]*149\.95/);
    assert.match(financeText,/Erfasste Zahlungseingänge[\s\S]*50\.00/);
    assert.match(await page.locator('#dashboardArea .dash-data-scope').innerText(),/maximal 200 pro Register/);
    const actionable=page.locator('#dashboardArea .dash-lead').filter({hasText:invoice.number});
    assert.ok(await actionable.count()>0,'unpaid invoice can be opened from cockpit');
    await actionable.last().click();
    await page.locator('#invoiceEditor[open]').waitFor({state:'visible'});
    assert.match(await page.locator('#invoicePaymentOpen').innerText(),/149\.95/);
    await page.locator('#invoiceClose').click();

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
