'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Readable}=require('node:stream');
const importReceiver=()=>import('../cloud-run/g3-review-staging/index.mjs');
const SUB='projects/lszh-automations/subscriptions/lszh-g3-review-staging';
function envelope(text='LSZH_G3_CANARY_NO_CONTRACT_20261018'){
  return {subscription:SUB,message:{
    messageId:'123456789001',
    publishTime:'2026-10-18T15:00:00Z',
    attributes:{kind:'LSZH_G3_PRIVATE_PUSH_CANARY_V1',schema:'1'},
    data:Buffer.from(JSON.stringify({schemaVersion:1,syntheticOnly:true,
      fixtureId:text})).toString('base64')
  }};
}
function fakeRequest(method,url,body){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method=method;req.url=url;
  const res={statusCode:null,headers:{},ended:false,
    setHeader(k,v){this.headers[k]=v;},
    writeHead(n,h){this.statusCode=n;if(h)Object.assign(this.headers,h);},
    end(){this.ended=true;}};
  return {req,res};
}
test('private receiver may only ACK exact synthetic CANARY; never an offer acceptance',async()=>{
  const {isSyntheticCanaryPush,handleRequest}=await importReceiver();
  const canary=envelope();
  assert.equal(isSyntheticCanaryPush(canary),true);
  const {req,res}=fakeRequest('POST','/g3-review',canary);
  await handleRequest(req,res);
  assert.equal(res.statusCode,204);assert.equal(res.ended,true);
  assert.equal(res.headers['cache-control'],'no-store');
});
test('all malformed, customer-shaped, spoofed or replay-bypassing bodies fail closed',async()=>{
  const {isSyntheticCanaryPush,handleRequest}=await importReceiver();
  const valid=envelope();
  const cases=[
    {},null,[],
    {...valid,subscription:'projects/other/subscriptions/other'},
    {...valid,message:{...valid.message,attributes:{...valid.message.attributes,
      kind:'LIVE_OFFER'}}},
    {...valid,message:{...valid.message,data:'%%%'}},
    {...valid,message:{...valid.message,data:Buffer.from(JSON.stringify({
      schemaVersion:1,syntheticOnly:false,fixtureId:'LSZH_G3_CANARY_NO_CONTRACT_20261018'
    })).toString('base64')}},
    {...valid,message:{...valid.message,messageId:'abc'}},
    {...valid,customerEmail:'person@example.com'},
    envelope('LIVE_CUSTOMER_OFFER')
  ];
  for(const c of cases){
    assert.equal(isSyntheticCanaryPush(c),false);
    const {req,res}=fakeRequest('POST','/g3-review',c);
    await handleRequest(req,res);
    assert.equal(res.statusCode,503);assert.equal(res.ended,true);
    assert.equal(res.headers['cache-control'],'no-store');
  }
});
test('no docs, pdf, firestore, archives or mail route becomes live',async()=>{
  const {handleRequest}=await importReceiver();
  for(const path of ['/api/offer','/offerte-annehmen','/send-mail',
    '/archive','/g3-review/accept','/contracts']){
    const {req,res}=fakeRequest('POST',path,envelope());
    await handleRequest(req,res);
    assert.equal(res.statusCode,404,path);
  }
  const {req,res}=fakeRequest('GET','/healthz',{});
  await handleRequest(req,res);assert.equal(res.statusCode,200);
});
test('oversized synthetic content is never ACKed',async()=>{
  const {handleRequest}=await importReceiver();
  const {req,res}=fakeRequest('POST','/g3-review',{
    ...envelope(),extra:'x'.repeat(6000)});
  await handleRequest(req,res);
  assert.equal(res.statusCode,413);
});
