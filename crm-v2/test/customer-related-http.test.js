'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const script=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
test('customer related endpoint requires login and GET and forwards exact page selection',async()=>{
 const calls=[];
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
    './cloud-records':{buildStore:()=>({customerRelated:async(id,table,cursor)=>{calls.push({id,table,cursor});return {customer:{id},records:[],hasMore:false};}})},
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
  const url=base+'/api/records/kunden/TEST_ONLY_customer/related?table=offerten&cursor=TEST_ONLY_last';
  assert.equal((await fetch(url)).status,401);assert.deepEqual(calls,[]);
  const headers={Authorization:'Bearer valid-operator'};assert.equal((await fetch(url,{method:'POST',headers})).status,405);assert.deepEqual(calls,[]);
  const response=await fetch(url,{headers});assert.equal(response.status,200);assert.deepEqual((await response.json()).customer,{id:'TEST_ONLY_customer'});
  assert.deepEqual(calls,[{id:'TEST_ONLY_customer',table:'offerten',cursor:'TEST_ONLY_last'}]);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
