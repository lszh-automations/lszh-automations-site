import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const FILE=fileURLToPath(new URL('./synthetic-source-fixture-local.js',import.meta.url));
const {generate,prepare}=require('./synthetic-source-fixture-local.js');
const {eventId}=require('./outbox.js');
const {decodeOutboxDraft}=require('./firestore-scoped-readers.js');
const {verifyOnboardingState}=require('../../onboarding/confirmation.js');
const UUID='d23190ab-89cd-4abc-9234-222222222222';
const date=new Date('2026-10-17T17:00:00.000Z');
function sample(){return generate({now:date,uuid:()=>UUID,choice:()=>1});}
test('offline fixture is a fresh-looking UUID and contains no send capability',()=>{
 const x=sample();
 assert.equal(x.projectCode,'ob_'+UUID);
 assert.equal(x.fixtureAllowlist,x.projectCode);
 assert.equal(x.airtableAbsenceVerified,false);
 assert.equal(x.firestorePersisted,false);
 assert.equal(x.syntheticOnly,true);
 assert.equal(x.airtableExpectedState,'processing');
 assert.match(x.draft.recordId,/^rec[A-Za-z0-9]{14}$/);
 assert.equal(x.documentId,eventId(x.draft.recordId));
 assert.equal(x.draft.state,'DRAFT_NOT_SENT');
 assert.equal(x.draft.testOnly,true);
 assert.equal(x.draft.deliveryEnabled,false);
 assert.equal(x.draft.emailSent,false);
 const body={name:'projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_onboarding_notification_drafts_staging/'+x.documentId,...x.firestoreBody};
 const parsed=decodeOutboxDraft(body,x.documentId);
 assert.deepEqual(parsed,x.draft);
});
test('absent synthetic UUID is a read-only, ONE-GET negative Airtable case when verified',async()=>{
 const x=sample();
 let n=0;
 const result=await verifyOnboardingState(x.projectCode,'test-not-real',async(input,options)=>{
  n++;
  assert.equal(n,1);
  const u=new URL(input);
  assert.equal(u.origin,'https://api.airtable.com');
  assert.equal(options.method,'GET');
  assert.equal(options.body,undefined);
  assert.equal(u.searchParams.get('filterByFormula'),"{Projektcode}='"+x.projectCode+"'");
  return {ok:true,json:async()=>({records:[]})};
 });
 assert.equal(n,1);
 assert.deepEqual(result,{state:'processing'});
});
test('private fixture is single-use, 0700 directory, 0600 file, no writes on subsequent attempt',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-fixture-home-'));
 try{
  const out=prepare({home,now:date,uuid:()=>UUID,choice:()=>1});
  assert.equal(out.created,true);
  const saved=JSON.parse(fs.readFileSync(out.privateFile,'utf8'));
  assert.equal(saved.projectCode,'ob_'+UUID);
  assert.equal(saved.firestorePersisted,false);
  assert.equal(fs.statSync(out.privateFile).mode&0o077,0);
  assert.equal(fs.statSync(path.dirname(out.privateFile)).mode&0o077,0);
  assert.equal(fs.statSync(path.dirname(path.dirname(out.privateFile))).mode&0o077,0);
  assert.throws(()=>prepare({home,now:date,uuid:()=>UUID,choice:()=>1}),/EEXIST/);
  assert.equal(JSON.parse(fs.readFileSync(out.privateFile,'utf8')).documentId,saved.documentId);
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('default --plan uses no cloud tools and never discloses project code',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-fixture-plan-'));
 try{
  const r=spawnSync(process.execPath,[FILE,'--plan'],{encoding:'utf8',env:{...process.env,HOME:home}});
  assert.equal(r.status,0,r.stderr);
  assert.match(r.stdout,/PLAN ONLY/);
  assert.doesNotMatch(r.stdout,/ob_[0-9a-f]{8}/);
  assert.equal(fs.existsSync(path.join(home,'.local','state','lszh-automations')),false);
  assert.equal(r.stderr,'');
 }finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('unsafe/generated UUID is refused before private file creation',()=>{
 assert.throws(()=>generate({now:date,uuid:()=> '00000000-0000-0000-0000-000000000000'}),/synthetic_code_invalid/);
 assert.throws(()=>generate({now:date,uuid:()=>UUID,choice:()=>62}),/synthetic_record_invalid/);
});
