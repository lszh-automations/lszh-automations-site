'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const script=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
async function withApp(callback,enabled){
  const calls=[];
  const store={
    TABLES:['leads','kunden','offerten','rechnungen','projekte'],
    async resolveOfferSend(id,resolution,user){
      calls.push({kind:'resolve',id,resolution,user});
      return {id,status:resolution==='confirmed'?'Versendet':'Bereit'};
    }
  };
  const mocks={
    'node:http':http,'node:fs':fs,'node:path':path,'node:crypto':require('node:crypto'),
    'google-auth-library':{OAuth2Client:class {
      async verifyIdToken({idToken}){
        if(idToken!=='test-token')throw Error('bad');
        return {getPayload:()=>({email:'lars@lszh-automations.ch',
          hd:'lszh-automations.ch',email_verified:true})};
      }
    }},
    '@google-cloud/firestore':{Firestore:class{}},
    './lead-ingest':{saveWebsiteLead:async()=>{throw Error('not needed');}},
    './cloud-records':{buildStore:()=>store},
    './mail-dispatcher':{makeDispatcher:()=>({stats:()=>({enabled:false})})},
    './offer-send':{createOfferSender:()=>({
      stats:()=>({enabled}),
      async send(id,payload,user){
        if(!enabled)throw Object.assign(Error('disabled'),{status:503});
        calls.push({kind:'send',id,payload,user});
        return {status:'confirmed',record:{id,status:'Versendet'}};
      }
    })},
    './offer-preview':{renderOfferPreview:()=>''},
    './invoice-preview':{renderInvoicePreview:()=>''}
  };
  const module={exports:{}};
  new Function('require','module','exports','process','__dirname',script)(
    name=>{if(!Object.hasOwn(mocks,name))throw Error('unexpected '+name);return mocks[name];},
    module,module.exports,{env:{
      GOOGLE_OAUTH_CLIENT_ID:'fake-test-client.apps.googleusercontent.com',
      CRM_ALLOWED_EMAILS:'lars@lszh-automations.ch',
      CRM_RECORD_PREFIX:'lszh_crm_v2_staging_'
    }},path.join(__dirname,'..')
  );
  const server=module.exports.createApp();
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port;
  try{await callback({origin,calls});}
  finally{await new Promise(done=>server.close(done));}
}
test('automatic offer send is disabled by default and unauthorized requests cannot send',async()=>{
  await withApp(async({origin,calls})=>{
    const config=await fetch(origin+'/api/config');
    assert.equal((await config.json()).offerMailEnabled,false);
    const unauth=await fetch(origin+'/api/records/offerten/off-1/send',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({followUpDate:'2026-11-02'})
    });
    assert.equal(unauth.status,401);
    assert.equal(calls.length,0);
    const logged=await fetch(origin+'/api/records/offerten/off-1/send',{
      method:'POST',headers:{Authorization:'Bearer test-token','Content-Type':'application/json',
        Origin:origin},
      body:JSON.stringify({followUpDate:'2026-11-02'})
    });
    assert.equal(logged.status,503);
    assert.equal(calls.length,0);
  },false);
});
test('offer send and uncertain-case resolve are authenticated and same-origin',async()=>{
  await withApp(async({origin,calls})=>{
    const url=origin+'/api/records/offerten/off-2/send';
    const config=await fetch(origin+'/api/config');
    assert.equal((await config.json()).offerMailEnabled,true);
    const headers={Authorization:'Bearer test-token','Content-Type':'application/json'};
    assert.equal((await fetch(url,{method:'POST',headers:{...headers,Origin:'https://attacker.example'},
      body:'{}'})).status,403);
    assert.equal((await fetch(url,{method:'GET',headers})).status,405);
    assert.equal((await fetch(url+'/resolve',{method:'POST',headers:{...headers,Origin:origin},
      body:JSON.stringify({resolution:'retry'})})).status,400);
    const sent=await fetch(url,{method:'POST',headers:{...headers,Origin:origin},
      body:JSON.stringify({followUpDate:'2026-11-02'})});
    assert.equal(sent.status,200);
    assert.equal((await sent.json()).record.status,'Versendet');
    assert.equal(calls[0].kind,'send');
    const resolved=await fetch(url+'/resolve',{method:'POST',headers:{...headers,Origin:origin},
      body:JSON.stringify({resolution:'not_sent'})});
    assert.equal(resolved.status,200);
    assert.equal(calls[1].kind,'resolve');
  },true);
});
