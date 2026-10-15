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
  assert.deepEqual(s.error.slice(0,1),[VERDICT_PREFIX+' FAILED_OR_TIMED_OUT']);
  assert.equal(s.error.length,2);
  assert.match(s.error[1],/^LSZH_FIRESTORE_READ_PREFLIGHT: ERROR_CLASS: (UNKNOWN|LOCAL_TIMEOUT)$/);
  assert.doesNotMatch(JSON.stringify(s.error),/UNAUTHENTICATED|private-token/);
 }
});
test('startup log code never uses set/update/create/firestore transaction or exports raw errors',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../startupReadProof.js'),'utf8');
 assert.doesNotMatch(source,/\.set\(|\.update\(|\.create\(|runTransaction\(/);
 assert.doesNotMatch(source,/(?:console|logger)\.error\(\s*(?:err|error|exception)\s*\)/);
 const index=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
 assert.match(index,/if\(stagingReadProbe\)await runStartupReadProbe/);
 const probeOrder=index.indexOf('await runStartupReadProbe(stagingReadProbe)');
 const listenOrder=index.indexOf('createGateway({stagingReadProbe}).listen');
 assert.ok(probeOrder>=0&&listenOrder>probeOrder,'Firestore probe must complete before the server listens');
 const docker=fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8');
 assert.match(docker,/startupReadProof\.js/);
});

test('gRPC error code whitelisting never reveals raw SDK exception contents',async()=>{
 for(const [code,kind] of [[7,'PERMISSION_DENIED'],[16,'UNAUTHENTICATED'],
  [14,'UNAVAILABLE'],[4,'DEADLINE_EXCEEDED'],[5,'NOT_FOUND'],
  [3,'INVALID_ARGUMENT'],[9,'FAILED_PRECONDITION'],[8,'RESOURCE_EXHAUSTED']]){
  const s=sink();
  const failure=Object.assign(new Error('Private data in SDK failure'),{code});
  assert.equal(await runStartupReadProbe(async()=>{throw failure;},s.logger),'FAILED_OR_TIMED_OUT');
  assert.deepEqual(s.error,[VERDICT_PREFIX+' FAILED_OR_TIMED_OUT',
   VERDICT_PREFIX+' ERROR_CLASS: '+kind]);
  assert.doesNotMatch(JSON.stringify(s.error),/Private data|SDK failure/);
 }
});
