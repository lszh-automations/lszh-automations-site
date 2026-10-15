'use strict';
// Preparation for a trusted server-side Airtable READ-ONLY adapter.
// No tokens here, no default global fetch, no API calls until explicitly invoked.
// Not imported from a customer route or production service.
const RECORD=/^rec[A-Za-z0-9]{14}$/;
const BASE=/^app[A-Za-z0-9]{14}$/;
const TABLE=/^tbl[A-Za-z0-9]{14}$/;
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
   const key=await getAccessToken();
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
       referrerPolicy:'no-referrer'});
   }catch{
     throw new AirtableReadRejected();
   }
   // Never expose response body, Airtable token or remote error internals.
   if(!response||response.status!==200||typeof response.json!=='function')
     throw new AirtableReadRejected();
   let data;
   try{data=await response.json();}catch{throw new AirtableReadRejected();}
   if(!data||data.id!==recordId||!data.fields||
      typeof data.fields!=='object'||Array.isArray(data.fields))
     throw new AirtableReadRejected('record_identity_mismatch');
   return {id:data.id,fields:structuredClone(data.fields)};
 };
}
module.exports={createReadOnlyAirtableRecordReader,AirtableReadRejected};
