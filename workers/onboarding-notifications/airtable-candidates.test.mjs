import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {listCandidateCodes}=require('./airtable-candidates');
const CODE='ob_00000000-0000-4000-8000-000000000000';
function page(records,offset) {return {ok:true,json:async()=>({records, ...(offset?{offset}:{})})};}
const rec=(code)=>({fields:{Projektcode:code}});
test('scanner is read-only and consumes paginated Airtable results',async()=>{
 let calls=0;
 const codes=await listCandidateCodes('SYNTHETIC',async(url,options)=>{
  calls++;assert.equal(options.method,'GET');
  assert.equal(options.headers.Authorization,'Bearer SYNTHETIC');
  const query=new URL(url).searchParams;
  assert.equal(query.get('filterByFormula'),
   "AND(OR({Status}='Eingegangen',{Status}='Vollständig'),LEFT({Projektcode},3)='ob_')");
  assert.equal(query.get('fields[]'),'Projektcode');
  if(calls===1){assert.equal(query.get('offset'),null);return page([rec(CODE)],'NEXT');}
  assert.equal(query.get('offset'),'NEXT');return page([rec(CODE)]);
 });
 assert.deepEqual(codes,[CODE,CODE]);assert.equal(calls,2);
});
test('scanner fails closed before returning truncated candidate list',async()=>{
 const many=Array.from({length:100},()=>rec(CODE));
 await assert.rejects(listCandidateCodes('SYNTHETIC',async()=>page(many),50),/candidate_limit_exceeded/);
});
test('scanner cannot loop forever on an invalid Airtable offset',async()=>{
 await assert.rejects(listCandidateCodes('SYNTHETIC',async()=>page([rec(CODE)],'SAME')),/invalid_candidate_offset/);
});
test('scanner blocks malformed candidate and API outage',async()=>{
 await assert.rejects(listCandidateCodes('SYNTHETIC',async()=>page([rec('not-a-token')])),/invalid_candidate_record/);
 await assert.rejects(listCandidateCodes('SYNTHETIC',async()=>({ok:false,status:503})),/candidate_scan_unavailable/);
});
