'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createReadOnlyAirtableRecordReader,AirtableReadRejected}=require('../airtableReadonlyRecord');
const baseId='appTEST0000000000',tableId='tblTEST0000000000',recordId='recTEST0000000000';
const token='ONLY_FAKE_UNIT_TEST_TOKEN';
const fields={Status:'Entwurf',Offertennummer:'DEMO-OFF-20991231-999'};
const settings={baseId,tableId,getAccessToken:async()=>token};
test('uses exact allowlisted Airtable HTTPS GET; never sends a PATCH',async()=>{
 let count=0;
 const read=createReadOnlyAirtableRecordReader({...settings,
   fetchImpl:async(url,options)=>{
     count++;
     assert.equal(url,'https://api.airtable.com/v0/'+baseId+'/'+tableId+'/'+recordId);
     assert.equal(options.method,'GET');
     assert.equal(options.redirect,'error');
     assert.equal(options.credentials,'omit');
     assert.equal(options.referrerPolicy,'no-referrer');
     assert.equal(options.cache,'no-store');
     assert.equal(options.headers.Authorization,'Bearer '+token);
     return {status:200,json:async()=>({id:recordId,fields})};
   }});
 const returned=await read(recordId);
 assert.equal(count,1);
 assert.deepEqual(returned,{id:recordId,fields});
 returned.fields.Status='MUTATED';
 assert.equal(fields.Status,'Entwurf','must clone returned data');
});
test('invalid identifiers cannot reach injected transport',async()=>{
 let count=0;
 const read=createReadOnlyAirtableRecordReader({...settings,
   fetchImpl:async()=>{count++;throw Error('must not call');}});
 for(const id of ['','recWRONG','../../evil','recTEST0000000000/other',
   'https://evil.example.com','recTEST0000000000?x=y']){
   await assert.rejects(read(id),AirtableReadRejected);
 }
 assert.equal(count,0);
});
test('configuration is explicit: no default fetch, token or guessed table',()=>{
 for(const config of [
   {...settings,fetchImpl:null},
   {...settings,fetchImpl:async()=>{},baseId:'(default)'},
   {...settings,fetchImpl:async()=>{},tableId:'Offerten'},
   {...settings,fetchImpl:async()=>{},getAccessToken:null}
 ]) assert.throws(()=>createReadOnlyAirtableRecordReader(config),AirtableReadRejected);
});
test('Airtable errors, missing records and identity substitution are never accepted',async()=>{
 for(const response of [
  {status:401,json:async()=>({error:'INVALID_TOKEN'})},
  {status:404,json:async()=>({})},
  {status:200,json:async()=>({id:'recOTHER000000000',fields})},
  {status:200,json:async()=>({id:recordId,fields:null})},
  {status:200,json:async()=>{throw Error('broken JSON')}}
 ]){
  const read=createReadOnlyAirtableRecordReader({...settings,
    fetchImpl:async()=>response});
  await assert.rejects(read(recordId),AirtableReadRejected);
 }
 const read=createReadOnlyAirtableRecordReader({...settings,
   fetchImpl:async()=>{throw Error('private network details');}});
 await assert.rejects(read(recordId),e=>{
   assert.ok(e instanceof AirtableReadRejected);
   assert.equal(e.message.includes('private network'),false);
   return true;
 });
});
test('empty or multiline token is rejected before any request',async()=>{
 for(const key of ['','short','INJECTED\nBAD_SECRET']){
  let requests=0;
  const read=createReadOnlyAirtableRecordReader({baseId,tableId,
    getAccessToken:async()=>key,fetchImpl:async()=>{requests++;return null;}});
  await assert.rejects(read(recordId),AirtableReadRejected);
  assert.equal(requests,0);
 }
});

test('credentials provider failures are sanitized and never invoke transport',async()=>{
 let sent=0;
 const read=createReadOnlyAirtableRecordReader({baseId,tableId,
  getAccessToken:async()=>{throw Error('private token fetch failure');},
  fetchImpl:async()=>{sent++;return null;}});
 await assert.rejects(read(recordId),e=>{
  assert.ok(e instanceof AirtableReadRejected);
  assert.doesNotMatch(e.message,/private/);
  return true;
 });
 assert.equal(sent,0);
});
test('real-style response body is capped and parsed with a five-second deadline',async()=>{
 let calls=0;
 const reader=createReadOnlyAirtableRecordReader({...settings,
  fetchImpl:async(url,opts)=>{
   calls++;
   assert.equal(opts.signal.aborted,false);
   assert.equal(typeof opts.signal.addEventListener,'function');
   return {status:200,url,headers:{get:()=>null},
     text:async()=>JSON.stringify({id:recordId,fields})};
  }});
 assert.deepEqual(await reader(recordId),{id:recordId,fields});
 assert.equal(calls,1);
});
test('oversized, redirected and malformed HTTP responses fail closed',async()=>{
 for(const response of [
  {status:200,url:'https://evil.example',text:async()=>JSON.stringify({id:recordId,fields})},
  {status:200,headers:{get:()=>String(999999)},text:async()=>JSON.stringify({id:recordId,fields})},
  {status:200,text:async()=>JSON.stringify({id:recordId,fields:{raw:'x'.repeat(270000)}})},
  {status:200,text:async()=>'{broken json'},
  {status:200,text:async()=>JSON.stringify({id:recordId,fields:[]})}
 ]){
  const reader=createReadOnlyAirtableRecordReader({...settings,fetchImpl:async()=>response});
  await assert.rejects(reader(recordId),AirtableReadRejected);
 }
});
