'use strict';
// Read-only startup probe for private-ingress Cloud Run; log *only* fixed verdict.
// Never logs data, paths, tokens, raw exceptions, IDs or SDK credentials.
const VERDICT_PREFIX='LSZH_FIRESTORE_READ_PREFLIGHT:';
const TIMEOUT_MS=10000;
// Only known fixed error classes are emitted. Never log raw SDK errors.
const SAFE_CODES=Object.freeze({
 '3':'INVALID_ARGUMENT','4':'DEADLINE_EXCEEDED','5':'NOT_FOUND',
 '7':'PERMISSION_DENIED','8':'RESOURCE_EXHAUSTED','9':'FAILED_PRECONDITION',
 '14':'UNAVAILABLE','16':'UNAUTHENTICATED'
});
function safeFailureClass(err){
 if(err?.message==='probe_timeout')return 'LOCAL_TIMEOUT';
 const value=err?.code;
 return SAFE_CODES[typeof value==='number'||typeof value==='string'?String(value):'']
   ||'UNKNOWN';
}
async function runStartupReadProbe(read,logger=console,{timeoutMs=TIMEOUT_MS}={}){
 if(typeof read!=='function')throw Error('invalid_read_probe');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)
  throw Error('invalid_probe_timeout');
 let handle;
 try{
  const result=await Promise.race([
   Promise.resolve().then(()=>read()),
   new Promise((_,reject)=>{handle=setTimeout(()=>reject(new Error('probe_timeout')),timeoutMs);})
  ]);
  if(result?.reachable!==true||typeof result.fixtureExists!=='boolean')
   throw Error('invalid_probe_result');
  const verdict=result.fixtureExists?'PASS_SYNTHETIC_PRESENT':'PASS_MISSING';
  logger.info(VERDICT_PREFIX+' '+verdict);
  return verdict;
 }catch(err){
  // A timeout or error is fail-closed; failure is never a successful read.
  logger.error(VERDICT_PREFIX+' FAILED_OR_TIMED_OUT');
  logger.error(VERDICT_PREFIX+' ERROR_CLASS: '+safeFailureClass(err));
  return 'FAILED_OR_TIMED_OUT';
 }finally{
  if(handle)clearTimeout(handle);
 }
}
module.exports={VERDICT_PREFIX,TIMEOUT_MS,runStartupReadProbe};
