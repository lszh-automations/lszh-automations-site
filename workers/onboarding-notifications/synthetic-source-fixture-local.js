'use strict';
// Local-only one-time synthetic source fixture; no Airtable/Firestore/Cloud calls.
// Creates secure private state OUTSIDE the Git checkout. No secret/code printed.
// A deliberately absent onboarding code must later receive a separate authenticated
// read-only Airtable verification before this can be used in a cloud handoff.
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {randomUUID,randomInt,createHash}=require('node:crypto');
const {makeDraft,eventId}=require('./outbox');
const {toFirestore,PROJECT,DATABASE,COLLECTION}=require('./firestore-store');
const {listCandidateCodes}=require('./airtable-candidates');
const FILE='fixture.json';
const DIR='handoff-source-fixture-20261017';
const ID_CHARS='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function generate({now=new Date(),uuid=randomUUID,choice=randomInt}={}){
 if(!(now instanceof Date)||!Number.isFinite(now.valueOf()))
  throw Error('invalid_fixture_date');
 const uuidValue=uuid();
 const code='ob_'+uuidValue;
 if(listCandidateCodes(code)[0]!==code || !/^ob_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(code))
  throw Error('synthetic_code_invalid');
 let suffix='';
 for(let i=0;i<14;i++){
  const n=choice(62);
  if(!Number.isInteger(n)||n<0||n>=62)throw Error('synthetic_record_invalid');
  suffix+=ID_CHARS[n];
 }
 const recordId='rec'+suffix;
 const draft=makeDraft(recordId,now);
 const documentId=eventId(recordId);
 const fields=toFirestore(draft);
 const expectedFields=[
  'schemaVersion','eventType','recordId','state',
  'testOnly','deliveryEnabled','emailSent','createdAt'
 ];
 if(Object.keys(fields.fields).length!==expectedFields.length ||
    !expectedFields.every(x=>Object.hasOwn(fields.fields,x)) ||
    fields.fields.testOnly.booleanValue!==true ||
    fields.fields.deliveryEnabled.booleanValue!==false ||
    fields.fields.emailSent.booleanValue!==false)
  throw Error('synthetic_firestore_body_invalid');
 return Object.freeze({
  schemaVersion:1,syntheticOnly:true,airtableExpectedState:'processing',
  airtableAbsenceVerified:false,firestorePersisted:false,
  project:PROJECT,database:DATABASE,collection:COLLECTION,
  documentId,projectCode:code,fixtureAllowlist:code,
  draft,firestoreBody:fields
 });
}
function prepare({home=os.homedir(),now=new Date(),uuid=randomUUID,choice=randomInt}={}){
 if(typeof home!=='string'||!path.isAbsolute(home)||!home)
  throw Error('fixture_home_invalid');
 const state=path.join(home,'.local','state','lszh-automations');
 fs.mkdirSync(state,{recursive:true,mode:0o700});
 const stat=fs.lstatSync(state);
 if(!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode&0o077)!==0)
  throw Error('fixture_state_directory_not_private');
 const target=path.join(state,DIR);
 // Fail closed if any prior attempt occurred; do not overwrite unknown work.
 fs.mkdirSync(target,{mode:0o700});
 let saved=false;
 try{
  const fixture=generate({now,uuid,choice});
  const file=path.join(target,FILE);
  fs.writeFileSync(file,JSON.stringify(fixture,null,2)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});
  const dirStat=fs.statSync(target),fileStat=fs.statSync(file);
  if((dirStat.mode&0o077)!==0 || (fileStat.mode&0o077)!==0 ||
     !fileStat.isFile())throw Error('fixture_permissions_invalid');
  saved=true;
  return Object.freeze({created:true,privateFile:file});
 }finally{
  if(!saved){
   // Keep any partial creation for human inspection instead of silent retry.
   // No secrets are printed by the CLI, including on error.
  }
 }
}
function fingerprint({home=os.homedir()}={}){
 if(typeof home!=='string'||!path.isAbsolute(home)||!home)
  throw Error('fixture_home_invalid');
 const state=path.join(home,'.local','state','lszh-automations');
 const dir=path.join(state,DIR);
 const file=path.join(dir,FILE);
 for(const p of [state,dir,file]){
  const st=fs.lstatSync(p);
  if(st.isSymbolicLink() || (st.mode&0o077)!==0 ||
     (p===file?!st.isFile():!st.isDirectory()))
   throw Error('fixture_permissions_invalid');
 }
 const x=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!x||x.schemaVersion!==1||x.syntheticOnly!==true||
    x.airtableAbsenceVerified!==false||x.firestorePersisted!==false||
    x.project!==PROJECT||x.database!==DATABASE||x.collection!==COLLECTION||
    typeof x.projectCode!=='string'||
    !/^ob_[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(x.projectCode)||
    x.fixtureAllowlist!==x.projectCode||
    x.airtableExpectedState!=='processing'||
    !x.draft||!/^rec[A-Za-z0-9]{14}$/.test(x.draft.recordId)||
    eventId(x.draft.recordId)!==x.documentId||
    x.draft.testOnly!==true||x.draft.deliveryEnabled!==false||
    x.draft.emailSent!==false||x.draft.state!=='DRAFT_NOT_SENT'||
    x.draft.schemaVersion!==1||x.draft.eventType!=='ONBOARDING_INPUT_PROCESSED_V1'||
    JSON.stringify(x.firestoreBody)!==JSON.stringify(toFirestore(x.draft)))
  throw Error('fixture_integrity_invalid');
 return createHash('sha256').update(x.projectCode,'utf8').digest('hex');
}

if(require.main===module){
 const mode=process.argv[2]??'--plan';
 if(process.argv.length>3 || !['--plan','--prepare-local','--fingerprint'].includes(mode)){
  console.error('STOP: Use --plan, --prepare-local or --fingerprint only.');
  process.exitCode=2;
 }else if(mode==='--plan'){
  console.log('PASS: Offline synthetic fixture strategy: random nonexistent Airtable code + random mock record ID.');
  console.log('PLAN: One strict Firestore staging DRAFT_NOT_SENT with both delivery flags false.');
  console.log('PLAN: Project code is private local state; cannot be printed, committed, or passed on CLI.');
  console.log('PLAN: Absence in real Airtable must be verified later by an authenticated GET before any cloud write.');
  console.log('PLAN ONLY: No file created, no network, IAM, Cloud Run, Airtable or Firestore changes.');
 }else if(mode==='--fingerprint'){
  try{
   console.log('FINGERPRINT_SHA256: '+fingerprint());
   console.log('PASS: Fingerprint from validated private synthetic fixture; project code not disclosed.');
  }catch{
   console.error('STOP: Private synthetic fixture unavailable, malformed, or permissions unsafe.');
   process.exitCode=2;
  }
 }else{
  try{
   prepare();
   console.log('PASS: One private synthetic fixture created outside the Git checkout (directory 0700, file 0600).');
   console.log('PASS: Staging-only draft is DRAFT_NOT_SENT and send/approval disabled.');
   console.log('STOP: No Airtable lookup or Firestore write; further use needs separate review.');
  }catch{
   console.error('STOP: Could not safely prepare a private local fixture; never overwrite or retry blindly.');
   process.exitCode=2;
  }
 }
}
module.exports=Object.freeze({generate,prepare,fingerprint});
