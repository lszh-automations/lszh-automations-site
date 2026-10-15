import {http} from '@google-cloud/functions-framework';
import {Firestore} from '@google-cloud/firestore';
import {runSyntheticTransactionTest} from './transactionTest.mjs';

// TEMPORARY ONE-OFF VALIDATION REVISION. Do NOT use as actual offer portal.
// Never use JSON keys, customer PDFs, real offers, or an external HTTP endpoint.
const SERVICE='lszh-offer-portal-staging';
const PRINCIPAL='lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com';
const PROJECT='lszh-automations';
const DATABASE='lszh-offers-staging';
const HOST='firestore.europe-west6.rep.googleapis.com';
const META='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';

async function runtimeIdentity(){
  const r=await fetch(META+'/email',{
    headers:{'Metadata-Flavor':'Google'},
    signal:AbortSignal.timeout(8000)
  });
  if(!r.ok||(await r.text()).trim()!==PRINCIPAL)
    throw Error('wrong_runtime_identity');
}

// IAM negative test: zero changes and no existing customer's data touched.
// If (default) DB does not exist, NOT_FOUND is inconclusive, not a PASS.
async function negativeDatabaseCheck(){
  const other=new Firestore({projectId:PROJECT,databaseId:'(default)',host:HOST});
  try{
    const snap=await other.collection('lszh_synthetic_guard_only_v1').limit(1).get();
    // If empty query succeeds, principal has broader permission than planned.
    if(snap)throw Error('unexpected_broad_access');
  }catch(err){
    if(err?.message==='unexpected_broad_access')throw err;
    if(err?.code===7)return 'DENIED';
    if(err?.code===5)return 'INCONCLUSIVE_DB_ABSENT';
    throw Error('negative_iam_check_failed');
  }finally{await other.terminate();}
  throw Error('unexpected_broad_access');
}
const safeErrors=new Set(['wrong_runtime_identity','negative_iam_check_failed',
  'unexpected_broad_access','configuration_invalid','synthetic_missing',
  'synthetic_mismatch','synthetic_changed','transaction_check_failed',
  'cleanup_failed','cleanup_identity_mismatch']);
async function run(){
  console.info('LSZH_PORTAL_TX_SMOKE: START');
  const db=new Firestore({projectId:PROJECT,databaseId:DATABASE,host:HOST});
  try{
    await runtimeIdentity();
    console.info('LSZH_PORTAL_TX_SMOKE: IDENTITY_PASS');
    const negative=await negativeDatabaseCheck();
    console.info('LSZH_PORTAL_TX_SMOKE: IAM_NEGATIVE_'+negative);
    const result=await runSyntheticTransactionTest(db);
    if(result?.attempts!==12||result?.accepted!==1||result?.declined!==11)
      throw Error('transaction_check_failed');
    console.info('LSZH_PORTAL_TX_SMOKE: TRANSACTION_PASS (12_ATTEMPTS_1_COMMIT_11_DECLINED)');
    console.info('LSZH_PORTAL_TX_SMOKE: CLEANUP_PASS');
    console.info('LSZH_PORTAL_TX_SMOKE: PASS');
  }catch(e){
    const code=safeErrors.has(e?.message)?e.message:'unexpected';
    console.error('LSZH_PORTAL_TX_SMOKE: FAIL ('+code+')');
  }finally{
    try{await db.terminate();}catch{console.error('LSZH_PORTAL_TX_SMOKE: CLOSE_FAILED');}
  }
}
// Await startup while Cloud Run allocates CPU; do not run in background.
if(process.env.K_SERVICE===SERVICE && String(process.env.K_REVISION||'').startsWith(SERVICE+'-')){
  await run();
}
http('lszhPortalPreflight',(req,res)=>{
  res.set('Cache-Control','no-store');
  res.set('X-Robots-Tag','noindex, nofollow');
  res.status(503).json({error:'staging_disabled'});
});
