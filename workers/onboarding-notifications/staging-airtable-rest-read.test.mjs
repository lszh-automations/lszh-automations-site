import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {probe}=require('./staging-airtable-rest-read.js');
const CODE='ob_92f84f12-25cc-4552-9f80-93d33a77f61b';
const TOKEN='pat_SYNTHETIC_READ_ONLY_TEST_TOKEN_NOT_REAL';
const ENV={LSZH_AIRTABLE_REST_PROBE_ONLY:'true'};
function testCase({status=200,records=[],urlGuard=()=>{},jsonFailure=false}={}){
  let calls=0;
  const output=[];
  return {
    log:(line)=>output.push(line), output,
    calls:()=>calls,
    fetchImpl:async(url,options)=>{
      calls++;
      const u=new URL(url);
      assert.equal(u.hostname,'api.airtable.com');
      assert.equal(u.pathname,'/v0/appzJiskpAdaR1HEv/tblWIY4l4VASz8Vse');
      assert.equal(options.method,'GET');
      assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
      assert.equal(u.searchParams.get('filterByFormula'),"{Projektcode}='"+CODE+"'");
      assert.equal(u.searchParams.get('maxRecords'),'2');
      urlGuard(u,options);
      return {ok:status===200,status,json:async()=>jsonFailure?{notRecords:[]}:{records}};
    }
  };
}
test('one exact real-verifier REST GET for missing synthetic fixture, no leaks',async()=>{
 const m=testCase();
 assert.equal(await probe({token:TOKEN,env:ENV,freshCode:()=>CODE,...m}),true);
 assert.equal(m.calls(),1);
 assert.equal(m.output.length,3);
 assert.ok(m.output.every(x=>x.startsWith('PASS: ')));
 assert.doesNotMatch(m.output.join(' '),/pat_SYNTHETIC|ob_92f84|Bearer/);
});
test('no approval flag blocks all REST requests',async()=>{
 const m=testCase();
 await assert.rejects(probe({token:TOKEN,env:{},freshCode:()=>CODE,...m}),/probe_disabled/);
 assert.equal(m.calls(),0);
});
test('empty, oversize, newline or short bearer value blocked before REST',async()=>{
 for(const token of ['', 'x'.repeat(10),'x'.repeat(513),'x'.repeat(40)+'\n']){
  const m=testCase();
  await assert.rejects(probe({token,env:ENV,freshCode:()=>CODE,...m}),/invalid_read_only_token/);
  assert.equal(m.calls(),0);
 }
});
test('predictable offline test token blocked, no network',async()=>{
 for(const code of ['ob_00000000-0000-4000-8000-000000000000','ob_not_uuid','ob_92f84f12-25cc-5552-9f80-93d33a77f61b']){
  const m=testCase();
  await assert.rejects(probe({token:TOKEN,env:ENV,freshCode:()=>code,...m}),/unsafe_synthetic_code/);
  assert.equal(m.calls(),0);
 }
});
test('Airtable authorization 401/403 does not pretend to succeed',async()=>{
 for(const status of [401,403]){
  const m=testCase({status});
  await assert.rejects(probe({token:TOKEN,env:ENV,freshCode:()=>CODE,...m}),/airtable_token_not_authorized/);
  assert.equal(m.calls(),1);
 }
});
test('rate limit is surfaced as blocked not completed',async()=>{
 const m=testCase({status:429});
 await assert.rejects(probe({token:TOKEN,env:ENV,freshCode:()=>CODE,...m}),/airtable_rate_limited/);
 assert.equal(m.calls(),1);
});
test('unexpected nonempty Airtable response cannot query customer/order IDs',async()=>{
 const m=testCase({records:[{id:'rec'+'A'.repeat(14),fields:{Projektcode:CODE,Auftrag:['rec'+'B'.repeat(14)],Status:'Eingegangen'}}]});
 await assert.rejects(probe({token:TOKEN,env:ENV,freshCode:()=>CODE,...m}),/unexpected_airtable_request/);
 assert.equal(m.calls(),1);
});
test('missing records collection fails closed',async()=>{
 const m=testCase({jsonFailure:true});
 await assert.rejects(probe({token:TOKEN,env:ENV,freshCode:()=>CODE,...m}),/invalid_status_response/);
 assert.equal(m.calls(),1);
});
