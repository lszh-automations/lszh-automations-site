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
  let initializations=0;
  const mocks={
    './contract-crm-actions':require('../contract-crm-actions'),
    './contract-crm-runtime':{createContractCrmRuntime:()=>{initializations++;return {status:async()=>({enabled:true,state:'prepared'}),act:async(id,action,body,user)=>{calls.push({id,action,body,user});return {state:'sent'};}};}},
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
      CRM_RECORD_PREFIX:'lszh_crm_v2_staging_',CRM_CONTRACT_ACTIONS_ENABLED:enabled?'true':'false'
    }},path.join(__dirname,'..')
  );
  const server=module.exports.createApp();
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin='http://127.0.0.1:'+server.address().port;
  try{await callback({origin,calls,initializations:()=>initializations});}
  finally{await new Promise(done=>server.close(done));}
}

test('contract CRM stays disabled by default and anonymous requests cannot initialize dependencies',async()=>{
 await withApp(async({origin,calls,initializations})=>{
  const base=origin+'/api/records/offerten/off-1/contract';
  assert.equal((await fetch(base)).status,401);
  const headers={Authorization:'Bearer test-token'};
  assert.equal((await (await fetch(base,{headers})).json()).enabled,false);
  assert.equal((await fetch(base+'/dispatch',{method:'POST',headers:{...headers,Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,503);
  assert.equal(initializations(),0);assert.equal(calls.length,0);
 },false);
});
test('contract CRM actions require operator token, exact Origin, JSON and exact action body',async()=>{
 await withApp(async({origin,calls,initializations})=>{
  const base=origin+'/api/records/offerten/off-1/contract',auth={Authorization:'Bearer test-token'},headers={...auth,Origin:origin,'Content-Type':'application/json'};
  assert.equal((await (await fetch(base,{headers:auth})).json()).state,'prepared');assert.equal(initializations(),1);
  for(const [h,b,status] of [[auth,'{}',403],[{...headers,Origin:'https://other.example'},'{}',403],[{...headers,'Content-Type':'text/plain'},'{}',415],[headers,'{bad',400],[headers,JSON.stringify({verified:true}),400]]){
   assert.equal((await fetch(base+'/dispatch',{method:'POST',headers:h,body:b})).status,status);
  }
  assert.equal(calls.length,0);
  const sent=await fetch(base+'/dispatch',{method:'POST',headers,body:'{}'});assert.equal(sent.status,200);assert.equal(sent.headers.get('cache-control'),'no-store');
  assert.equal(calls.length,1);assert.equal(calls[0].user.email,'lars@lszh-automations.ch');
  assert.equal((await fetch(base+'/confirmation',{method:'POST',headers,body:JSON.stringify({messageId:'../unsafe'})})).status,400);
 },true);
});

test('simplified preview and send remain authenticated, same-origin and reject extra approval flags',async()=>{
 await withApp(async({origin,calls})=>{
  const base=origin+'/api/records/offerten/off-1/contract',auth={Authorization:'Bearer test-token'},headers={...auth,Origin:origin,'Content-Type':'application/json'};
  for(const action of ['preview','preview-terms','preview-avv'])assert.equal((await fetch(base+'/'+action)).status,401);
  assert.equal((await fetch(base+'/preview',{headers:auth})).status,200);
  assert.equal((await fetch(base+'/send',{method:'POST',headers:auth,body:'{}'})).status,403);
  assert.equal((await fetch(base+'/send',{method:'POST',headers,body:JSON.stringify({avvRequired:'no',documentsReviewed:true,retentionApproved:true,offerSnapshotSha256:'b'.repeat(64),customerAvvApproved:true})})).status,400);
  const before=calls.length;assert.equal((await fetch(base+'/send',{method:'POST',headers,body:JSON.stringify({avvRequired:'no',documentsReviewed:true,retentionApproved:true,offerSnapshotSha256:'b'.repeat(64)})})).status,200);assert.equal(calls.length,before+1);assert.equal(calls.at(-1).action,'send');
 },true);
});
