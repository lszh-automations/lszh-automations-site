'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const script=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');

test('public /api/config never leaks TEST_ONLY private invoice recipient; signed-in operator can read it',async()=>{
  const allowed='crm-operator@lszh-automations.ch',mailbox='private-invoice-test@example.ch';
  const mocks={
    'node:http':http,'node:fs':fs,'node:path':path,'node:crypto':crypto,
    'google-auth-library':{OAuth2Client:class{
      async verifyIdToken({idToken}){
        if(idToken!=='valid-operator')throw Error('not_authorised');
        return {getPayload:()=>({email:allowed,hd:'lszh-automations.ch',email_verified:true})};
      }
    }},
    '@google-cloud/firestore':{Firestore:class{}},
    './lead-ingest':{saveWebsiteLead:async()=>{throw Error('unexpected_ingest')}},
    './cloud-records':{buildStore:()=>({})},
    './mail-dispatcher':{makeDispatcher:()=>({stats:()=>({enabled:false})})},
    './offer-send':{createOfferSender:()=>({stats:()=>({enabled:true,mode:'production',testTo:''})})},
    './offer-preview':{renderOfferPreview:()=>''},
    './invoice-preview':{renderInvoicePreview:()=>''}
  };
  const fakeProcess={env:{
    GOOGLE_OAUTH_CLIENT_ID:'fake-test-client.apps.googleusercontent.com',
    CRM_ALLOWED_EMAILS:allowed,
    CRM_RECORD_PREFIX:'lszh_crm_v2_',
    CRM_INVOICE_MAIL_ENABLED:'true',
    CRM_INVOICE_MAIL_PRODUCTION_APPROVED:'true',
    CRM_INVOICE_MAIL_MODE:'test_only',
    CRM_INVOICE_MAIL_TEST_TO:mailbox,
    CRM_INVOICE_MAIL_WEBHOOK_URL:'https://hook.eu1.make.com/Example123TEST',
    CRM_INVOICE_IBAN:'CH9300762011623852957'
  }};
  const m={exports:{}};
  new Function('require','module','exports','process','__dirname',script)(
    name=>{if(!Object.hasOwn(mocks,name))throw Error('unexpected module '+name);return mocks[name];},
    m,m.exports,fakeProcess,path.join(__dirname,'..')
  );
  const server=m.exports.createApp();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  try{
    const anonymous=await fetch(base+'/api/config');
    assert.equal(anonymous.status,200);
    const publicData=await anonymous.json();
    assert.equal(publicData.invoiceMailEnabled,true);
    assert.equal(publicData.invoiceMailMode,'test_only');
    assert.equal(publicData.invoiceMailTestTo,'');
    assert.equal(JSON.stringify(publicData).includes(mailbox),false);
    const invalid=await fetch(base+'/api/config',{headers:{Authorization:'Bearer invalid-token'}});
    assert.equal((await invalid.json()).invoiceMailTestTo,'');
    const valid=await fetch(base+'/api/config',{headers:{Authorization:'Bearer valid-operator'}});
    assert.equal(valid.status,200);
    assert.equal((await valid.json()).invoiceMailTestTo,mailbox);
    const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
    assert.match(html,/const privateConfig=await api\('\/api\/config'\)/);
    assert.match(html,/state\.invoiceMailTestTo=String\(privateConfig\.invoiceMailTestTo/);
  }finally{
    await new Promise(resolve=>server.close(resolve));
  }
});
