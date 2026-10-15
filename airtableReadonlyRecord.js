'use strict';
// Preparation for a trusted server-side Airtable READ-ONLY adapter.
// No tokens here, no default global fetch, no API calls until explicitly invoked.
// Not imported from a customer route or production service.
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const BASE=/^app[A-Za-z0-9]{14}$/;
const TABLE=/^tbl[A-Za-z0-9]{14}$/;
const MAX_RESPONSE_BYTES=256*1024;
class AirtableReadRejected extends Error {
 constructor(reason='airtable_read_unavailable'){
   super(reason);this.name='AirtableReadRejected';this.reason=reason;
 }
}
function createReadOnlyAirtableRecordReader({fetchImpl,baseId,tableId,getAccessToken}={}){
 if(typeof fetchImpl!=='function'||!BASE.test(String(baseId||''))||
   !TABLE.test(String(tableId||''))||typeof getAccessToken!=='function')
   throw new AirtableReadRejected('reader_not_configured');
 // This function deliberately does not read process.env or global fetch.
 // The caller must obtain its own server-side secret and protect it.
 return async function readRecord(recordId){
   if(!RECORD.test(String(recordId||'')))
     throw new AirtableReadRejected('invalid_record_id');
   let key;
   try{key=await getAccessToken();}catch{
     throw new AirtableReadRejected('reader_not_configured');
   }
   if(typeof key!=='string'||key.length<12||key.includes('\n')||
      key.includes('\r'))
     throw new AirtableReadRejected('reader_not_configured');
   const url='https://api.airtable.com/v0/'+baseId+'/'+tableId+'/'+recordId;
   let response;
   try{
     // Explicit GET, fixed HTTPS API host, no redirect, no cookies or referrer.
     response=await fetchImpl(url,{method:'GET',
       headers:{Authorization:'Bearer '+key,Accept:'application/json'},
       redirect:'error',cache:'no-store',credentials:'omit',
       referrerPolicy:'no-referrer',signal:AbortSignal.timeout(5000)});
   }catch{
     throw new AirtableReadRejected();
   }
   // Never expose response body, Airtable token or remote error internals.
   if(!response||response.status!==200||
      (response.url&&response.url!==url))
     throw new AirtableReadRejected();
   const rawLength=response.headers?.get?.('content-length');
   if(rawLength!=null&&(!/^\d+$/.test(rawLength)||
      Number(rawLength)>MAX_RESPONSE_BYTES))
     throw new AirtableReadRejected();
   let data;
   try{
     // Prefer checking byte length before JSON parsing. Real fetch responses
     // provide text(); legacy injected unit fakes can provide json() only.
     if(typeof response.text==='function'){
       const raw=await response.text();
       if(typeof raw!=='string'||
          Buffer.byteLength(raw,'utf8')>MAX_RESPONSE_BYTES)
          throw new Error('oversize');
       data=JSON.parse(raw);
     }else if(typeof response.json==='function'){
       data=await response.json();
       if(Buffer.byteLength(JSON.stringify(data),'utf8')>MAX_RESPONSE_BYTES)
         throw new Error('oversize');
     }else throw new Error('no_body');
   }catch{throw new AirtableReadRejected();}
   if(!data||data.id!==recordId||!data.fields||
      typeof data.fields!=='object'||Array.isArray(data.fields))
     throw new AirtableReadRejected('record_identity_mismatch');
   return {id:data.id,fields:structuredClone(data.fields)};
 };
}
module.exports={createReadOnlyAirtableRecordReader,AirtableReadRejected};
