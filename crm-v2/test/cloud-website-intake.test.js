'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');

const script=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const leadIngest=require('../lead-ingest');
const secret='test-secret-for-staging-only-at-least-32-chars';
const sample=()=>({
  submission_id:'a4784b51-3ac3-4db1-a271-36260847cf52',
  name:'TEST_ONLY Website Lead',company:'TEST_ONLY GmbH',
  email:'website-test@example.com',street:'Musterstrasse 1',
  postal_code:'5610',city:'Wohlen',country:'Schweiz',
  message:'TEST_ONLY Website Formular',
  current_process:'Manuell',systems:'Excel',main_problem:'Doppelerfassung',frequency:'Taeglich'
});
async function runServer(enabled,callback){
  const records=new Map(),names=new Set();
  class FakeFirestore{
    collection(name){
      names.add(name);
      return {doc(id){
        return {
          async create(value){
            const k=name+'/'+id;
            if(records.has(k))throw Object.assign(new Error('already exists'),{code:6});
            records.set(k,{...value});
          },
          async get(){
            const value=records.get(name+'/'+id);
            return {exists:!!value,data:()=>value};
          }
        };
      }};
    }
  }
  const dependencies={
    'node:http':http,
    'node:fs':fs,
    'node:path':path,
    'node:crypto':require('node:crypto'),
    'google-auth-library':{OAuth2Client:class {verifyIdToken(){throw Error('not needed')}}},
    '@google-cloud/firestore':{Firestore:FakeFirestore},
    './lead-ingest':leadIngest,
    './mail-dispatcher':{makeDispatcher:(_db,prefix,config)=>{
      assert.equal(prefix,'lszh_crm_v2_staging_');
      assert.equal(config.enabled,false);
      return {stats:()=>({enabled:false}),tick:async()=>{throw Error('mail_not_enabled_in_intake_tests');}};
    }},
    './cloud-records':{buildStore:(_db,prefix)=>{
      assert.equal(prefix,'lszh_crm_v2_staging_');
      return {TABLES:['leads','kunden','offerten','rechnungen','projekte']};
    }},
    './offer-preview':{renderOfferPreview:()=>''},
    './invoice-preview':{renderInvoicePreview:()=>''}
  };
  const fakeProcess={env:{
    CRM_RECORD_PREFIX:'lszh_crm_v2_staging_',
    CRM_WEBSITE_INTAKE_ENABLED:enabled?'true':'false',
    CRM_INGEST_SECRET:secret,
    GOOGLE_OAUTH_CLIENT_ID:'',CRM_ALLOWED_EMAILS:''
  }};
  const module={exports:{}};
  const requireMock=id=>{
    if(!Object.hasOwn(dependencies,id))throw Error('Unexpected dependency '+id);
    return dependencies[id];
  };
  new Function('require','module','exports','process','__dirname',script)(
    requireMock,module,module.exports,fakeProcess,path.join(__dirname,'..')
  );
  const server=module.exports.createApp();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port+'/api/internal/website-leads';
    const post=(body,authorization)=>fetch(url,{
      method:'POST',headers:{'Content-Type':'application/json',
        ...(authorization?{Authorization:'Bearer '+authorization}:{})},
      body:JSON.stringify(body)
    });
    await callback({post,records,names});
  }finally{
    await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
  }
}
test('staging endpoint refuses all website submissions while the feature is disabled',async()=>{
  await runServer(false,async({post,records,names})=>{
    const res=await post(sample(),secret);
    assert.equal(res.status,404);
    assert.equal((await res.json()).error,'intake_disabled_on_staging');
    assert.equal(records.size,0);
    assert.equal(names.size,0);
  });
});
test('real HTTP contract creates once, retries once, detects conflict and rejects missing token in staging',async()=>{
  await runServer(true,async({post,records,names})=>{
    const payload=sample();
    const first=await post(payload,secret);
    assert.equal(first.status,201);
    const data=await first.json();
    assert.equal(data.ok,true);
    assert.equal(data.confirmed,true);
    assert.equal(data.created,true);
    assert.match(data.recordId,/^web_[0-9a-f]{32}$/);
    const repeated=await post(payload,secret);
    assert.equal(repeated.status,200);
    const answer=await repeated.json();
    assert.equal(answer.created,false);
    assert.equal(answer.recordId,data.recordId);
    const changed=await post({...payload,message:'TEST_ONLY changed'},secret);
    assert.equal(changed.status,409);
    assert.equal((await changed.json()).error,'submission_id_conflict');
    const anonymous=await post(payload,'');
    assert.equal(anonymous.status,401);
    assert.equal(records.size,1);
    assert.deepEqual([...names],['lszh_crm_v2_staging_leads']);
    assert.equal(records.get('lszh_crm_v2_staging_leads/'+data.recordId).status,'Neu');
    assert.equal(records.has('lszh_crm_v2_leads/'+data.recordId),false);
  });
});
