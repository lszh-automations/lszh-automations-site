'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../scripts/g3-readonly-service-agent-role.mjs');
const allow=()=>import('../scripts/g3-readonly-cloud-inventory.mjs');
const PROJECT='lszh-automations',NUM='123456789012';
const BASE=['--project='+PROJECT,'--format=json','--quiet'];
function fixture(overrides={}){
  const calls=[];
  const docs={
    ['projects describe '+PROJECT]:{
      projectId:overrides.project||PROJECT,projectNumber:NUM
    },
    'services list':overrides.noIam?[{config:{name:'pubsub.googleapis.com'}}]:
      [{config:{name:'iam.googleapis.com'}},{config:{name:'pubsub.googleapis.com'}}],
    'iam roles describe roles/pubsub.serviceAgent':{
      name:'roles/pubsub.serviceAgent',
      includedPermissions:overrides.permissionAbsent?
        ['iam.serviceAccounts.get']:
        ['iam.serviceAccounts.get','iam.serviceAccounts.getOpenIdToken']
    },
    ['projects get-iam-policy '+PROJECT]:{
      bindings:overrides.conditional?[{
        role:'roles/pubsub.serviceAgent',
        members:['serviceAccount:service-'+NUM+
          '@gcp-sa-pubsub.iam.gserviceaccount.com'],
        condition:{title:'Restricted',expression:'request.time < timestamp("2099-01-01T00:00:00Z")'}
      }]:[{
        role:'roles/pubsub.serviceAgent',
        members:['serviceAccount:service-'+NUM+
          '@gcp-sa-pubsub.iam.gserviceaccount.com']
      }]
    },
    'iam service-accounts list':[]
  };
  const read=args=>{
    calls.push(args);
    const key=args.filter(x=>!x.startsWith('--')).join(' ');
    if(overrides.fail===key)return {ok:false,error:'permission_denied'};
    if(!Object.hasOwn(docs,key))throw Error('Unexpected command '+key);
    return {ok:true,data:docs[key]};
  };
  return {calls,read};
}
const denied=out=>{
  assert.equal(out.releaseStatus,'NO_GO');
  assert.equal(out.readOnly,true);
  for(const field of ['canGrantIam','canCreateServiceAccount',
    'canEnableApi','canPublish','canDeploy','canSendEmail'])
    assert.equal(out[field],false);
};
test('role, direct IAM binding, target absence must NOT become effective TokenCreator claim',async()=>{
  const {auditPubsubAgentRole}=await load();
  const {read,calls}=fixture();
  const out=auditPubsubAgentRole(read);
  assert.equal(out.result,'READ_ONLY_ROLE_DEFINITION_CHECK');
  assert.equal(out.roleDefinitionPermission,'PRESENT_IN_PREDEFINED_ROLE');
  assert.equal(out.serviceAgentProjectBinding,'DIRECT_UNCONDITIONAL_BINDING_FOUND');
  assert.equal(out.plannedPushSa,'ABSENT_IN_THIS_LIST');
  assert.equal(out.serviceAgentEffectiveOidc,'NOT_EVALUATED');
  assert.equal(out.groupDenyPab,'NOT_EVALUATED');
  assert.equal(out.tokenCreatorAdditionalGrant,
    'NOT_RECOMMENDED_WITHOUT_EFFECTIVE_CHECK');
  assert.ok(!JSON.stringify(out).includes(NUM));
  assert.ok(!JSON.stringify(out).includes('@gcp-sa-pubsub'));
  assert.ok(calls.every(x=>x.includes('--project='+PROJECT)));
  denied(out);
});
test('conditional role stays uncertain; missing IAM role permission never becomes GO',async()=>{
  const {auditPubsubAgentRole}=await load();
  const conditional=auditPubsubAgentRole(fixture({conditional:true}).read);
  assert.equal(conditional.serviceAgentProjectBinding,'DIRECT_CONDITIONAL_BINDING_UNEVALUATED');
  assert.equal(conditional.serviceAgentEffectiveOidc,'NOT_EVALUATED');
  denied(conditional);
  const absent=auditPubsubAgentRole(fixture({permissionAbsent:true}).read);
  assert.equal(absent.roleDefinitionPermission,'ABSENT_IN_PREDEFINED_ROLE');
  assert.equal(absent.tokenCreatorAdditionalGrant,'NOT_RECOMMENDED_WITHOUT_EFFECTIVE_CHECK');
  denied(absent);
});
test('fail closed for wrong project, unreadable services, disabled IAM',async()=>{
  const {auditPubsubAgentRole}=await load();
  const cases=[
    {o:{project:'wrong'},status:'STOP_PROJECT_UNVERIFIED'},
    {o:{fail:'services list'},status:'STOP_ENABLED_APIS_UNREADABLE'},
    {o:{noIam:true},status:'STOP_IAM_API_NOT_ENABLED'}
  ];
  for(const {o,status} of cases){
    const {read,calls}=fixture(o);
    const result=auditPubsubAgentRole(read);
    assert.equal(result.result,status);
    assert.ok(calls.length<=2);
    denied(result);
  }
});
test('missing role description or project IAM policy remains UNKNOWN, no secrets echoed',async()=>{
  const {auditPubsubAgentRole}=await load();
  const noRole=auditPubsubAgentRole(fixture({
    fail:'iam roles describe roles/pubsub.serviceAgent'
  }).read);
  assert.equal(noRole.roleDefinitionPermission,'UNKNOWN_ROLE_DEFINITION');
  denied(noRole);
  const noPolicy=auditPubsubAgentRole(fixture({
    fail:'projects get-iam-policy '+PROJECT
  }).read);
  assert.equal(noPolicy.serviceAgentProjectBinding,'UNKNOWN_POLICY_UNREADABLE');
  denied(noPolicy);
});
test('gcloud read allowlist permits only exact PubSub role and rejects impersonation',async()=>{
  const {validateCommand}=await allow();
  assert.doesNotThrow(()=>validateCommand([
    'iam','roles','describe','roles/pubsub.serviceAgent',...BASE
  ]));
  for(const args of [
    ['iam','roles','describe','roles/owner',...BASE],
    ['iam','roles','create','newrole',...BASE],
    ['iam','roles','describe','roles/pubsub.serviceAgent',...BASE,
      '--impersonate-service-account=admin@example.invalid'],
    ['iam','roles','update','roles/pubsub.serviceAgent',...BASE]
  ])assert.throws(()=>validateCommand(args),/unapproved_gcloud_argument/);
});
