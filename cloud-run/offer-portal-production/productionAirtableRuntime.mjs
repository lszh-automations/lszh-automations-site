// Business Airtable client for post-commit acceptance writeback. No background job.
import {executeCustomerAirtableAcceptanceWriteback}
  from './customerAirtableWriteback.mjs';
const BASE='appzJiskpAdaR1HEv',TABLE='tbljeIUoD7wwKuSmS';
export function createCustomerAirtableCallback({config,fetcher}={}){
  if(config?.enabled!==true||typeof fetcher!=='function')
    throw Error('customer_airtable_runtime_disabled');
  const token=config.airtableAccessToken;
  if(typeof token!=='string'||token.length<12||/[\r\n]/.test(token))
    throw Error('customer_airtable_runtime_secret_missing');
  async function query(method,{baseId,tableId,recordId},payload){
    if(baseId!==BASE||tableId!==TABLE||
       !/^rec[A-Za-z0-9]{14}$/.test(recordId||''))
      throw Error('customer_airtable_invalid_address');
    const url='https://api.airtable.com/v0/'+BASE+'/'+TABLE+'/'+recordId;
    const response=await fetcher(url,{
      method,redirect:'error',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    if(!response?.ok)throw Error('customer_airtable_provider_error');
    const value=await response.json();
    if(value?.id!==recordId||!value.fields||
       typeof value.fields!=='object'||Array.isArray(value.fields))
      throw Error('customer_airtable_provider_invalid');
    return value;
  }
  const client={readRecord:address=>query('GET',address),
    patchRecord:(address,body)=>query('PATCH',address,body)};
  return acceptedOffer=>executeCustomerAirtableAcceptanceWriteback(acceptedOffer,client);
}
