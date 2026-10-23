'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

const script=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');

async function withApp(fn){
  const contacts=[];
  const store={
    TABLES:['leads','kunden','offerten','rechnungen','projekte'],
    async addContact(id,body,user){
      contacts.push({id,body,user});
      return {id:'contact-id',createdBy:user.email,...body};
    }
  };
  const mocks={
    'node:http':http,
    'node:fs':fs,
    'node:path':path,
    'node:crypto':require('node:crypto'),
    'google-auth-library':{OAuth2Client:class{
      async verifyIdToken({idToken}){
        if(idToken!=='test-id-token')throw Error('invalid');
        return {getPayload:()=>({
          email:'lars@lszh-automations.ch',
          hd:'lszh-automations.ch',email_verified:true
        })};
      }
    }},
    '@google-cloud/firestore':{Firestore:class{}},
    './lead-ingest':{saveWebsiteLead:async()=>{throw Error('no website intake');}},
    './mail-dispatcher':{makeDispatcher:()=>({stats:()=>({enabled:false})})},
    './cloud-records':{buildStore:()=>store},
    './offer-send':{createOfferSender:()=>({stats:()=>({enabled:false})})},
    './offer-preview':{renderOfferPreview:()=>''},
    './invoice-preview':{renderInvoicePreview:()=>''}
  };
  const module={exports:{}};
  const env={CRM_RECORD_PREFIX:'lszh_crm_v2_staging_',
    CRM_WEBSITE_INTAKE_ENABLED:'false',
    GOOGLE_OAUTH_CLIENT_ID:'test.apps.googleusercontent.com',
    CRM_ALLOWED_EMAILS:'lars@lszh-automations.ch'};
  new Function('require','module','exports','process','__dirname',script)(
    name=>{if(!Object.hasOwn(mocks,name))throw Error('unexpected '+name);return mocks[name];},
    module,module.exports,{env},path.join(__dirname,'..')
  );
  const server=module.exports.createApp();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port+'/api/records/leads/lead_123/contacts';
    await fn({url,contacts});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}
test('lead contact HTTP requires a CRM login and same-origin before saving',async()=>{
  await withApp(async({url,contacts})=>{
    const payload={channel:'Telefon',outcome:'Erreicht',note:'Bedarf notiert'};
    const req=(method,token,origin)=>fetch(url,{
      method,headers:{'Content-Type':'application/json',
        ...(token?{Authorization:'Bearer '+token}:{}),
        ...(origin?{Origin:origin}:{})},
      ...(method==='POST'?{body:JSON.stringify(payload)}:{})
    });
    const unauthorized=await req('POST','','');
    assert.equal(unauthorized.status,401);
    const forbidden=await req('POST','test-id-token','https://malicious.example');
    assert.equal(forbidden.status,403);
    const wrongMethod=await req('GET','test-id-token','');
    assert.equal(wrongMethod.status,405);
    assert.equal(contacts.length,0);
    const accepted=await req('POST','test-id-token',new URL(url).origin);
    assert.equal(accepted.status,201);
    const saved=(await accepted.json()).contact;
    assert.equal(saved.createdBy,'lars@lszh-automations.ch');
    assert.equal(saved.note,'Bedarf notiert');
    assert.equal(contacts.length,1);
    assert.equal(contacts[0].id,'lead_123');
  });
});
