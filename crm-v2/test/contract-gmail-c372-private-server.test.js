'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {SERVICE,CHECK,HEALTH,createC372Server}=
  require('../c372-readonly-server');
const PROJECT='lszh-automations';
const RUNTIME={
  K_SERVICE:SERVICE,GOOGLE_CLOUD_PROJECT:PROJECT,
  LSZH_C37_READONLY_ENABLED:'true',LSZH_C37_TEST_ONLY:'true'
};
async function request(server,{method='GET',url=HEALTH,headers={},body}={}){
  return new Promise((resolve,reject)=>{
    const address=server.address();
    const req=http.request({
      host:'127.0.0.1',port:address.port,method,path:url,headers
    },res=>{
      const chunks=[];
      res.on('data',data=>chunks.push(data));
      res.on('end',()=>resolve({
        status:res.statusCode,headers:res.headers,
        data:JSON.parse(Buffer.concat(chunks).toString('utf8'))
      }));
    });
    req.on('error',reject);req.end(body);
  });
}
async function listen(server){
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  return server;
}
async function close(server){await new Promise(resolve=>server.close(resolve))}
test('C3.7.2 refuses a live service, missing staging flags, or enabled sending',()=>{
  const backend={inspectAuthorisedMailbox:async()=>({verified:true,
    status:'READONLY_MAILBOX_VERIFIED'})};
  for(const runtime of [
    {},{...RUNTIME,K_SERVICE:'lszh-crm-v2'},
    {...RUNTIME,LSZH_C37_TEST_ONLY:'false'},
    {...RUNTIME,LSZH_C37_READONLY_ENABLED:'false'},
    {...RUNTIME,LSZH_C37_ENABLE_SENDING:'true'},
    {...RUNTIME,LSZH_C37_ALLOW_CUSTOMER_MAIL:'true'}
  ])assert.throws(()=>createC372Server({runtime,backend}),/isolated staging/);
});
test('C3.7.2 /healthz never reads Secret Manager or Gmail',async()=>{
  let reads=0;
  const server=await listen(createC372Server({
    runtime:RUNTIME,
    backend:{inspectAuthorisedMailbox:async()=>{reads++;return {
      verified:true,status:'READONLY_MAILBOX_VERIFIED'}}}
  }));
  try{
    assert.deepEqual((await request(server)).data,
      {status:'STAGING_READY',readPerformed:false});
    assert.equal(reads,0);
  }finally{await close(server)}
});
test('C3.7.2 POST explicit internal check returns static verified result only',async()=>{
  let calls=0;
  const server=await listen(createC372Server({
    runtime:RUNTIME,
    backend:{inspectAuthorisedMailbox:async()=>{calls++;return {
      verified:true,status:'READONLY_MAILBOX_VERIFIED'}}}
  }));
  try{
    const r=await request(server,{method:'POST',url:CHECK});
    assert.equal(r.status,200);
    assert.deepEqual(r.data,{status:'READONLY_MAILBOX_VERIFIED',
      verified:true,mailSent:false,messageRead:false});
    assert.equal(calls,1);
    assert.equal(r.headers['cache-control'],'no-store, max-age=0');
  }finally{await close(server)}
});
test('C3.7.2 no GET/probe, query/body or unknown route can read Gmail',async()=>{
  let calls=0;
  const server=await listen(createC372Server({
    runtime:RUNTIME,
    backend:{inspectAuthorisedMailbox:async()=>{calls++;return {
      verified:true,status:'READONLY_MAILBOX_VERIFIED'}}}
  }));
  try{
    const cases=[
      {method:'GET',url:CHECK},{method:'POST',url:CHECK+'?mailbox=x'},
      {method:'POST',url:'/api/send'},
      {method:'POST',url:CHECK,headers:{'Content-Length':'1'},body:'x'},
      {method:'POST',url:CHECK,headers:{'Transfer-Encoding':'chunked'}},
      {method:'POST',url:'/internal/gmail-readonly-check/'}
    ];
    for(const c of cases){
      const r=await request(server,c);
      assert.equal(r.status,404);
      assert.deepEqual(r.data,{status:'NOT_FOUND'});
    }
    assert.equal(calls,0);
  }finally{await close(server)}
});
test('C3.7.2 Gmail authorization and provider exceptions fail closed',async()=>{
  for(const value of [
    {verified:false,status:'BLOCKED'},
    {verified:true,status:'STAGING_READY'},
    undefined
  ]){
    const server=await listen(createC372Server({
      runtime:RUNTIME,backend:{inspectAuthorisedMailbox:async()=>value}
    }));
    try{
      const r=await request(server,{method:'POST',url:CHECK});
      assert.equal(r.status,503);
      assert.deepEqual(r.data,{status:'BLOCKED'});
    }finally{await close(server)}
  }
  const server=await listen(createC372Server({
    runtime:RUNTIME,
    backend:{inspectAuthorisedMailbox:async()=>{throw Error('PRIVATE TOKEN')}}
  }));
  try{
    const r=await request(server,{method:'POST',url:CHECK});
    assert.equal(r.status,503);
    assert.equal(JSON.stringify(r.data).includes('PRIVATE'),false);
  }finally{await close(server)}
});
test('C3.7.2 denies concurrent reads rather than performing parallel OAuth refresh',async()=>{
  let reads=0;
  let unlock;
  const hold=new Promise(r=>{unlock=r});
  const server=await listen(createC372Server({
    runtime:RUNTIME,
    backend:{inspectAuthorisedMailbox:async()=>{
      reads++;await hold;
      return {verified:true,status:'READONLY_MAILBOX_VERIFIED'}
    }}
  }));
  try{
    const first=request(server,{method:'POST',url:CHECK});
    // Repeated microtasks allow the first request to start.
    for(let i=0;i<25&&reads===0;i++){
      await new Promise(resolve=>setTimeout(resolve,1));
    }
    assert.equal(reads,1);
    const second=await request(server,{method:'POST',url:CHECK});
    assert.equal(second.status,429);
    assert.deepEqual(second.data,{status:'BLOCKED'});
    unlock();
    assert.equal((await first).status,200);
    assert.equal(reads,1);
  }finally{unlock();await close(server)}
});
test('C3.7.2 is not imported into productive CRM, makes no writes, no sending',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../c372-readonly-server.js'),'utf8');
  for(const f of ['server.js','offer-send.js']){
    const active=fs.readFileSync(path.resolve(__dirname,'..',f),'utf8');
    assert.equal(active.includes('c372-readonly-server'),false);
  }
  for(const bad of ['/messages/send','gmail.send','sendMail(',
    'runTransaction(', 'Firestore(', 'createDraft(', 'makeDispatcher('])
    assert.equal(source.includes(bad),false,'Unexpected live operation: '+bad);
});
