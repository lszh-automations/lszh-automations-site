'use strict';
// Read-only startup probe for private-ingress Cloud Run; log *only* fixed verdict.
// Never logs data, paths, tokens, raw exceptions, IDs or SDK credentials.
const VERDICT_PREFIX='LSZH_FIRESTORE_READ_PREFLIGHT:';
const TIMEOUT_MS=10000;
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
 }catch{
  // A timeout or error is fail-closed; failure is never a successful read.
  logger.error(VERDICT_PREFIX+' FAILED_OR_TIMED_OUT');
  return 'FAILED_OR_TIMED_OUT';
 }finally{
  if(handle)clearTimeout(handle);
 }
}
module.exports={VERDICT_PREFIX,TIMEOUT_MS,runStartupReadProbe};
