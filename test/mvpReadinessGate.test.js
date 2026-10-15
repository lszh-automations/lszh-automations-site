'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {evaluate,SYNTHETIC,PILOT}=require('../scripts/mvp-readiness-gate');
const state=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/LSZH_MVP_READINESS_SNAPSHOT_20261015.json'),'utf8'));
const copy=()=>structuredClone(state);
test('current evidence is NO_GO for both stages and does not trigger actions',()=>{
 const result=evaluate(copy());
 assert.equal(result.syntheticEndToEnd.ready,false);
 assert.equal(result.customerPilot.ready,false);
 assert.equal(result.realContractAccepted,false);
 assert.equal(result.cloudChangesExecuted,false);
 assert.equal(result.sendEmailExecuted,false);
 assert.ok(result.syntheticEndToEnd.blockers.some(b=>b.gate==='privateCloudRunConfigured'));
 assert.ok(result.syntheticEndToEnd.blockers.some(b=>b.gate==='explicit_syntheticExecution'));
 assert.ok(result.customerPilot.blockers.some(b=>b.gate==='immutableArchiveRetentionApproved'));
 assert.ok(result.customerPilot.blockers.some(b=>b.gate==='explicit_realPilot'));
});
test('synthetic isolated test approval can never authorize a real customer pilot',()=>{
 const x=copy();
 for(const key of SYNTHETIC)x.tests[key].status='PASS';
 x.approvals.syntheticExecution=true;
 const result=evaluate(x);
 assert.equal(result.syntheticEndToEnd.ready,true);
 assert.equal(result.customerPilot.ready,false);
 assert.ok(result.customerPilot.blockers.some(b=>b.gate==='rc1LegalReviewComplete'));
 assert.ok(result.customerPilot.blockers.some(b=>b.gate==='explicit_realPilot'));
});
test('even all-green evidence without explicit approval can never unlock a test',()=>{
 const x=copy();
 for(const key of PILOT)x.tests[key].status='PASS';
 const result=evaluate(x);
 assert.equal(result.syntheticEndToEnd.ready,false);
 assert.equal(result.customerPilot.ready,false);
 assert.deepEqual(result.syntheticEndToEnd.blockers.map(b=>b.gate),['explicit_syntheticExecution']);
 assert.deepEqual(result.customerPilot.blockers.map(b=>b.gate),['explicit_realPilot']);
});
test('omitted, malformed or unknown statuses always fail closed',()=>{
 for(const change of [
  x=>delete x.tests.privateCloudRunConfigured,
  x=>x.tests.realNamedFirestoreReadVerified.status='probably',
  x=>delete x.tests.rc1LegalReviewComplete.evidence,
  x=>x.tests.mailTransportDisabled.status=true
 ]){
  const x=copy();change(x);
  assert.throws(()=>evaluate(x),/missing_or_invalid_gate/);
 }
 assert.throws(()=>evaluate({}),/invalid_status_kind/);
});
test('CLI only reads fixed local snapshot with no create, send or deploy',()=>{
 const output=execFileSync(process.execPath,
  ['scripts/mvp-readiness-gate.js','--status'],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
 const result=JSON.parse(output);
 assert.equal(result.syntheticEndToEnd.ready,false);
 assert.equal(result.customerPilot.ready,false);
 assert.ok(Object.isFrozen(evaluate(copy())));
});
