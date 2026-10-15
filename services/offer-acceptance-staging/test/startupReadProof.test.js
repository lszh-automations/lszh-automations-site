'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {runStartupReadProbe,VERDICT_PREFIX}=require('../startupReadProof');
function sink(){
 const info=[],error=[];
 return {logger:{info:s=>info.push(s),error:s=>error.push(s)},info,error};
}
test('startup fixed read to absent synthetic document logs only PASS_MISSING',async()=>{
 const s=sink(),read=async()=>({reachable:true,fixtureExists:false,secret:'never logged'});
 assert.equal(await runStartupReadProbe(read,s.logger),'PASS_MISSING');
 assert.deepEqual(s.info,[VERDICT_PREFIX+' PASS_MISSING']);
 assert.deepEqual(s.error,[]);
});
test('present synthetic document emits boolean verdict without exposing content',async()=>{
 const s=sink();
 assert.equal(await runStartupReadProbe(async()=>({reachable:true,fixtureExists:true,data:{email:'fake@example.invalid'}}),s.logger),'PASS_SYNTHETIC_PRESENT');
 assert.deepEqual(s.info,[VERDICT_PREFIX+' PASS_SYNTHETIC_PRESENT']);
 assert.doesNotMatch(JSON.stringify(s.info),/example\.invalid|email|data/);
});
test('IAM denial, invalid result and timeout never claim a successful connection',async()=>{
 for(const fn of [async()=>{throw Error('UNAUTHENTICATED private-token');},
  async()=>({reachable:false,fixtureExists:false}),
  async()=>({reachable:true,fixtureExists:'yes'}),
  ()=>new Promise(()=>{})]){
  const s=sink();
  assert.equal(await runStartupReadProbe(fn,s.logger,{timeoutMs:30}),'FAILED_OR_TIMED_OUT');
  assert.deepEqual(s.info,[]);
  assert.deepEqual(s.error,[VERDICT_PREFIX+' FAILED_OR_TIMED_OUT']);
  assert.doesNotMatch(JSON.stringify(s.error),/UNAUTHENTICATED|private-token/);
 }
});
test('startup log code never uses set/update/create/firestore transaction or exports raw errors',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../startupReadProof.js'),'utf8');
 assert.doesNotMatch(source,/\.set\(|\.update\(|\.create\(|runTransaction\(/);
 assert.doesNotMatch(source,/console\.log\(.*err|logger\.error\(.*err/);
 const index=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
 assert.match(index,/if\(stagingReadProbe\)void runStartupReadProbe/);
 const docker=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');
 assert.match(docker,/startupReadProof\.js/);
});
