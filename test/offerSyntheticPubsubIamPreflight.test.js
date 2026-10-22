'use strict';
// Pure synthetic IAM policy linting. NEVER calls Google APIs or writes IAM.
const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../cloud-run/offer-portal-staging/syntheticPubsubIamPreflight.mjs');
function inert(r){
  assert.equal(r.manualApprovalRequired,true);
  for(const key of ['canCreateConnection','canGrantIam','canDeploy','canPublish',
    'canCreateGoogleDoc','canWriteFirestore','canWriteAirtable','canSendEmail'])
    assert.equal(r[key],false,key);
}
test('scoped PubSub design is only OFFLINE-CONSISTENT, never permission or deployment GO',async()=>{
  const {assessSyntheticPubsubIamDesign:assess,
    syntheticPubsubIamDesignFixture:fixture}=await load();
  const p=fixture(),out=assess(p);
  assert.equal(out.status,'CONSISTENT_OFFLINE_PLAN_ONLY');inert(out);
  assert.match(out.reason,/unverified/);
  assert.deepEqual(out,assess(structuredClone(p)));
  assert.equal(p.make.connectionState,'NOT_CONNECTED');
  assert.equal(p.serviceAgent.grantScope,'NO_NEW_GRANT');
  assert.equal(p.receiver.executionState,'NOT_DEPLOYED');
  assert.equal(p.make.nativeDataEncoding,'UNVERIFIED');
  assert.equal(p.receiver.continueToMakeDocs,false);
  assert.equal(JSON.stringify(p).includes('private_key'),false);
});
test('project, topic and subscription cannot be cross-project or guessed',async()=>{
  const {assessSyntheticPubsubIamDesign:assess,syntheticPubsubIamDesignFixture:fixture}=await load();
  for(const change of [
    x=>{x.project='demo-lszh-automations';},
    x=>{x.topic='projects/other/topics/lszh-g3-review-staging';},
    x=>{x.subscription='projects/other/subscriptions/lszh-g3-review-staging';},
    x=>{x.region='us-central1';},
    x=>{x.schemaVersion=2;},
    x=>{x.extra='injection';}
  ]){
    const p=fixture();change(p);const r=assess(p);
    assert.equal(r.status,'NO_GO');inert(r);
  }
});
test('privileged publisher, broad topic scope, uncertain OAuth and native encoding fail',async()=>{
  const {assessSyntheticPubsubIamDesign:assess,syntheticPubsubIamDesignFixture:fixture}=await load();
  for(const change of [
    x=>{x.make.principal='lars@example.com';},
    x=>{x.make.topicIam.scope='projects/lszh-automations';},
    x=>{x.make.topicIam.role='roles/editor';},
    x=>{x.make.connectionState='CONNECTED';},
    x=>{x.make.nativeDataEncoding='ASSUMED_BASE64';},
    x=>{x.make.oauthScope='https://evil.example.invalid';},
    x=>{x.make.clientSecret='DO_NOT_STORE';}
  ]){
    const p=fixture();change(p);const r=assess(p);
    assert.equal(r.status,'NO_GO');inert(r);
  }
});
test('public receiver, broad invoker, foreign push SA and Make docs continuation fail',async()=>{
  const {assessSyntheticPubsubIamDesign:assess,syntheticPubsubIamDesignFixture:fixture}=await load();
  for(const change of [
    x=>{x.push.invokerIam.scope='projects/lszh-automations';},
    x=>{x.push.invokerIam.role='roles/owner';},
    x=>{x.push.serviceAccount='quarantine-cas@example.invalid';},
    x=>{x.push.authMode='UNAUTHENTICATED';},
    x=>{x.receiver.ingress='all';},
    x=>{x.receiver.requireIam=false;},
    x=>{x.receiver.urlKind='CUSTOM_PUBLIC_DOMAIN';},
    x=>{x.receiver.continueToMakeDocs=true;},
    x=>{x.receiver.executionState='DEPLOYED';}
  ]){
    const p=fixture();change(p);const r=assess(p);
    assert.equal(r.status,'NO_GO');inert(r);
  }
});
test('Firestore broad permissions, quarantine read and presumed service-agent grant fail',async()=>{
  const {assessSyntheticPubsubIamDesign:assess,syntheticPubsubIamDesignFixture:fixture}=await load();
  for(const change of [
    x=>{x.runtime.database='lszh-quarantine-staging';},
    x=>{x.runtime.serviceAccount=x.push.serviceAccount;},
    x=>{x.runtime.permissions.push('datastore.entities.delete');},
    x=>{x.runtime.permissions=x.runtime.permissions.filter(
      permission=>permission!=='datastore.databases.get');},
    x=>{x.runtime.effectiveIamVerified=true;},
    x=>{x.runtime.quarantineAccess=true;},
    x=>{x.serviceAgent.tokenPermissionState='GRANTED_AUTOMATICALLY';},
    x=>{x.serviceAgent.grantScope='PROJECT_TOKEN_CREATOR';},
    x=>{x.serviceAgent.preexistingRoleVerified=true;},
    x=>{x.serviceAgent.pushInvokerServiceAccount='other@example.invalid';}
  ]){
    const p=fixture();change(p);const r=assess(p);
    assert.equal(r.status,'NO_GO');inert(r);
  }
});
