// One-off, read-only production connectivity check in the deployed portal image.
// Identity: Cloud Run job uses the exact existing production portal service account.
// No customer content, Airtable record IDs, Firestore documents, or tokens in logs.
// No writes, no invitations, no PDF or email, no contract acceptance.
const {Firestore}=require('@google-cloud/firestore');

const PROJECT='lszh-automations';
const SERVICE_ACCOUNT='lszh-offer-portal@lszh-automations.iam.gserviceaccount.com';
const DATABASE='lszh-offers';
const HOST='firestore.europe-west6.rep.googleapis.com';
const AIRTABLE_BASE='appzJiskpAdaR1HEv';
const AIRTABLE_TABLE='tbljeIUoD7wwKuSmS';

async function check(){
  const metadata=await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',
    {headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(8000)}
  );
  if(!metadata.ok||(await metadata.text()).trim()!==SERVICE_ACCOUNT)
    throw Error('runtime_identity_mismatch');
  console.log('PASS: Laufzeitidentität ist das Kundenportal-Dienstkonto');

  // Same named database and regional endpoint as the real portal configuration.
  const db=new Firestore({projectId:PROJECT,databaseId:DATABASE,host:HOST});
  try{
    const result=await db.collection('lszh_customer_offers_v1').limit(1).get();
    if(!result||!Array.isArray(result.docs))throw Error('firestore_invalid_response');
    // Do NOT reveal document identifiers or contents; 1-record bounded read.
    console.log('PASS: Firestore lszh-offers – lesender SDK-Zugriff in Zürich');
  }catch(err){
    const code=String(err?.code??'').slice(0,16);
    throw Error('firestore_read_failed'+(code?'_code_'+code:''));
  }finally{
    await db.terminate().catch(()=>{});
  }
  const token=String(process.env.LSZH_AIRTABLE_ACCESS_TOKEN||'');
  if(token.length<12||/[\r\n]/.test(token))
    throw Error('airtable_secret_not_mounted');
  const u=new URL('https://api.airtable.com/v0/'+AIRTABLE_BASE+'/'+AIRTABLE_TABLE);
  u.searchParams.set('pageSize','1');
  const response=await fetch(u,{
    method:'GET',redirect:'error',
    headers:{Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw Error('airtable_read_http_'+response.status);
  const body=await response.json();
  if(!Array.isArray(body?.records)||body.records.length>1)
    throw Error('airtable_read_invalid_response');
  console.log('PASS: Airtable Kunden-Offertentabelle – lesender API-Zugriff mit Produktions-Secret');
  console.log('PASS: Produktiver Firestore- und Airtable-Lesetest abgeschlossen; 0 Schreibvorgänge, 0 E-Mails.');
}
check().catch(err=>{
  // Only emit our own safe error code, never provider payloads or secret contents.
  const code=String(err?.message||'unknown');
  console.error('OFFEN: '+(/^(runtime_identity_mismatch|firestore_read_failed(?:_code_[0-9]+)?|firestore_invalid_response|airtable_secret_not_mounted|airtable_read_http_[0-9]+|airtable_read_invalid_response)$/.test(code)?code:'runtime_readonly_check_failed'));
  process.exitCode=1;
});
