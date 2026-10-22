#!/usr/bin/env node
// Operator-only, one-off customer link issuer for a controlled FIRST PILOT.
// Dry-run by default. Never log the PAT, Firestore tokens or personal data.
// Execute only after final contracts, customer route and GCP IAM are ready.
import {randomBytes} from 'node:crypto';
import {Firestore} from '@google-cloud/firestore';
import {AIRTABLE_CUSTOMER_SOURCE as F,mapApprovedCustomerOffer,
  tokenFingerprint} from './approvedCustomerOffer.mjs';
import {createCustomerOfferStore} from './customerFirestoreStore.mjs';
import {CUSTOMER_RUNTIME as I} from './productionConfig.mjs';

const args=process.argv.slice(2);
const execute=args[0]==='--execute';
const recordId=args[execute?1:args[0]==='--dry-run'?1:0];
const REC=/^rec[A-Za-z0-9]{14}$/;
function fail(msg){throw Error('CUSTOMER_ISSUE_NO_GO:'+msg);}
if(!REC.test(recordId||''))fail('record_id_invalid');
if(args.length>(execute||args[0]==='--dry-run'?2:1))fail('unexpected_arguments');
const key=String(process.env.LSZH_AIRTABLE_ACCESS_TOKEN||'');
const version=String(process.env.LSZH_PORTAL_TERMS_VERSION||'');
if(key.length<12||/[\r\n]/.test(key))fail('airtable_business_pat_missing');
if(!version||/test|rc|draft|entwurf/i.test(version))fail('approved_terms_version_missing');
if((process.env.GOOGLE_CLOUD_PROJECT||process.env.GCLOUD_PROJECT)!==I.projectId)
  fail('google_project_mismatch');
if(execute && process.env.LSZH_CUSTOMER_OFFER_ISSUE_ENABLED!=='true')
  fail('operator_execution_gate_missing');
const url='https://api.airtable.com/v0/'+F.baseId+'/'+F.tableId+'/'+recordId+
  '?returnFieldsByFieldId=true';
const headers={Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function request(method,payload){
  const r=await fetch(url,{
    method,headers,redirect:'error',
    ...(payload?{body:JSON.stringify(payload)}:{}),
    signal:AbortSignal.timeout(15000)
  });
  if(!r.ok)fail('airtable_request_'+r.status);
  const record=await r.json();
  if(record?.id!==recordId||!record.fields||
     typeof record.fields!=='object'||Array.isArray(record.fields))
    fail('airtable_response_invalid');
  return {id:record.id,cellValuesByFieldId:record.fields};
}
try{
  const original=await request('GET');
  const existing=original.cellValuesByFieldId[F.tokenHash];
  if(existing)fail('existing_token_requires_manual_review');
  // Validate everything before changing Airtable or Firestore.
  const token=randomBytes(32).toString('base64url');
  const tokenHash=tokenFingerprint(token);
  const sample={...original,cellValuesByFieldId:{
    ...original.cellValuesByFieldId,[F.tokenHash]:tokenHash
  }};
  const prepared=mapApprovedCustomerOffer(sample,{termsVersion:version});
  if(!execute){
    console.log('DRY_RUN_PASS: eligible customer offer and PDFs found; NO writes, NO link, NO email.');
    process.exit(0);
  }
  const patched=await request('PATCH',{fields:{[F.tokenHash]:tokenHash}});
  if(patched.cellValuesByFieldId[F.tokenHash]!==tokenHash)
    fail('token_patch_not_confirmed');
  // Named production database: no fallback to (default) or staging.
  const db=new Firestore({projectId:I.projectId,databaseId:I.databaseId,
    host:I.firestoreHost});
  const registered=await createCustomerOfferStore(db).register(prepared);
  if(registered.result!=='registered')fail('source_already_registered');
  const link=new URL('/offerte-annehmen/',I.origin);
  link.hash=new URLSearchParams({code:token}).toString();
  console.log('ISSUE_PASS: Customer offer registered once; NO email sent.');
  console.log('PERSONAL_LINK_DISPLAY_ONCE: '+link.toString());
  console.log('Private link: send only through the approved business email path.');
}catch(e){
  // An error after a successful Airtable PATCH may be ambiguous; do not replay
  // automatically or overwrite a source record with another token.
  const code=String(e.message||'unknown');
  console.error(/^CUSTOMER_ISSUE_NO_GO:[A-Za-z0-9_]+$/.test(code)?code:
    'CUSTOMER_ISSUE_NO_GO:provider_or_transaction_error_manual_review');
  process.exitCode=1;
}
