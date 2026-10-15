'use strict';
// Pure, local-only LSZH MVP readiness evaluator. No app network or cloud calls.
// A "PASS" is an evidence declaration, NOT independent verification.
// Never authorizes sending mail, deploying, IAM changes or real contracts.
const fs=require('node:fs');
const path=require('node:path');

const SYNTHETIC=[
 'onlySyntheticIdentities','dummyContractClearlyMarked',
 'mailTransportDisabled','realAcceptanceDisabled',
 'syntheticOfferAndAttachmentsReadback',
 'privateCloudRunConfigured','realNamedFirestoreReadVerified',
 'stagingOfferAcceptanceRehearsal','stagingInvoiceQrRehearsal',
 'reconciliationAndRetriesRehearsal'
];
const PILOT=[
 ...SYNTHETIC,'rc1LegalReviewComplete','avvLegalReviewComplete',
 'immutableArchiveRetentionApproved','commercialPaymentDataChecked',
 'customerAccessSecurityReviewed','customerDeliveryEndToEndVerified'
];
function evaluate(state){
 if(!state||typeof state!=='object'||Array.isArray(state))throw Error('invalid_status');
 if(state.kind!=='LSZH_MVP_TEST_READINESS_V1')throw Error('invalid_status_kind');
 const tests=state.tests;
 if(!tests||typeof tests!=='object'||Array.isArray(tests))throw Error('invalid_tests');
 const all=new Set([...SYNTHETIC,...PILOT]);
 for(const k of all){
  const t=tests[k];
  if(!t||!['PASS','NOT_TESTED','BLOCKED'].includes(t.status)||
     typeof t.evidence!=='string'||t.evidence.length<8)
   throw Error('missing_or_invalid_gate_'+k);
 }
 function tier(keys,approval){
  const blockers=keys.filter(k=>tests[k].status!=='PASS')
   .map(k=>Object.freeze({gate:k,status:tests[k].status}));
  if(state.approvals?.[approval]!==true)
   blockers.push(Object.freeze({gate:'explicit_'+approval,status:'NOT_GRANTED'}));
  return Object.freeze({ready:blockers.length===0,blockers:Object.freeze(blockers)});
 }
 return Object.freeze({
  kind:'LSZH_MVP_READINESS_DECISION_V1',
  snapshotAt:state.snapshotAt,
  syntheticEndToEnd:tier(SYNTHETIC,'syntheticExecution'),
  customerPilot:tier(PILOT,'realPilot'),
  realContractAccepted:false,
  cloudChangesExecuted:false,
  sendEmailExecuted:false
 });
}
const file=path.resolve(__dirname,'../docs/LSZH_MVP_READINESS_SNAPSHOT_20261015.json');
if(require.main===module){
 if(process.argv.length!==3||process.argv[2]!=='--status'){
  process.stderr.write('Only --status supported; this is a local read-only report.\n');
  process.exitCode=2;
 }else{
  const state=JSON.parse(fs.readFileSync(file,'utf8'));
  process.stdout.write(JSON.stringify(evaluate(state),null,2)+'\n');
 }
}
module.exports={SYNTHETIC,PILOT,evaluate};
