'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const script=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
async function withApp(callback){
  const operations=[];
  const store={
    TABLES:['leads','kunden','offerten','rechnungen','projekte'],
    async recordOfferDispatch(id,data,user){
      operations.push({type:'dispatch',id,data,email:user.email});
      return {id,status:'Versendet'};
    },
    async recordOfferFollowUp(id,data,user){
      operations.push({type:'followup',id,data,email:user.email});
      return {id,status:'Versendet',followUpDate:data.followUpDate};
    }
  };
  const mocks={
    'node:http':http,'node:fs':fs,'node:path':path,'node:crypto':require('node:crypto'),
    'google-auth-library':{OAuth2Client:class{
      async verifyIdToken({idToken}){
        if(idToken!=='valid-token')throw Error('invalid');
        return {getPayload:()=>({email:'lars@lszh-automations.ch',
          hd:'lszh-automations.ch',email_verified:true})};
      }
    }},
    '@google-cloud/firestore':{Firestore:class{}},
    './lead-ingest':{saveWebsiteLead:async()=>{throw Error('not needed')}},
    './mail-dispatcher':{makeDispatcher:()=>({stats:()=>({enabled:false})})},
    './cloud-records':{buildStore:()=>store},
    './offer-send':{createOfferSender:()=>({stats:()=>({enabled:false})})},
    './offer-preview':{renderOfferPreview:()=>''},
    './invoice-preview':{renderInvoicePreview:()=>''}
  };
  const module={exports:{}};
  new Function('require','module','exports','process','__dirname',script)(
    name=>{if(!Object.hasOwn(mocks,name))throw Error(name);return mocks[name];},
    module,module.exports,{env:{
      CRM_RECORD_PREFIX:'lszh_crm_v2_staging_',CRM_WEBSITE_INTAKE_ENABLED:'false',
      GOOGLE_OAUTH_CLIENT_ID:'test.apps.googleusercontent.com',
      CRM_ALLOWED_EMAILS:'lars@lszh-automations.ch'
    }},path.join(__dirname,'..')
  );
  const server=module.exports.createApp();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await callback({
      origin:'http://127.0.0.1:'+server.address().port,
      operations
    });
  }finally{
    await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
  }
}
test('manual offer actions require authentication and origin and never call mail provider',async()=>{
  await withApp(async({origin,operations})=>{
    const call=(action,token,from,method='POST')=>fetch(
      origin+'/api/records/offerten/offer_123/'+action,{
        method,headers:{
          'Content-Type':'application/json',
          ...(token?{Authorization:'Bearer '+token}:{}),
          ...(from?{Origin:from}:{})
        },
        ...(method==='POST'?{body:JSON.stringify({
          followUpDate:'2026-11-10',...(action==='followup'?{note:'Rückruf'}:{})
        })}:{})
      });
    assert.equal((await call('dispatch','','')).status,401);
    assert.equal((await call('followup','valid-token','https://not-the-crm.example')).status,403);
    assert.equal((await call('dispatch','valid-token','', 'GET')).status,405);
    assert.equal(operations.length,0);
    assert.equal((await call('dispatch','valid-token',origin)).status,200);
    assert.equal((await call('followup','valid-token',origin)).status,200);
    assert.deepEqual(operations.map(o=>o.type),['dispatch','followup']);
    assert.equal(operations[0].id,'offer_123');
    assert.equal(operations[1].data.note,'Rückruf');
    assert.ok(operations.every(o=>o.email==='lars@lszh-automations.ch'));
  });
});
