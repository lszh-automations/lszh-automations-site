'use strict';
// No gcloud, deployment, IAM writes or PubSub delivery in these tests.
const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../scripts/g3-staging-bootstrap.mjs');
const digest='europe-west6-docker.pkg.dev/lszh-automations/lszh-g3-review-staging/receiver@sha256:'+'a'.repeat(64);
const url='https://lszh-g3-review-staging-abc-ew.a.run.app';
const GOOD_ROLE={
  projectIdentityVerified:true,roleDefinitionPermission:'PRESENT_IN_PREDEFINED_ROLE',
  serviceAgentProjectBinding:'DIRECT_UNCONDITIONAL_BINDING_FOUND',
  plannedPushSa:'ABSENT_IN_THIS_LIST'};
const GOOD_SNAP={
  project:'lszh-automations',region:'europe-west6',projectIdentityVerified:true,
  result:'READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM',
  apiStatus:Object.fromEntries(['pubsub.googleapis.com','run.googleapis.com',
    'iam.googleapis.com','serviceusage.googleapis.com',
    'artifactregistry.googleapis.com'].map(x=>[x,'ENABLED'])),
  pubsub:{plannedTopic:'ABSENT_IN_THIS_LIST',plannedSubscription:'ABSENT_IN_THIS_LIST'},
  identities:{plannedPushSa:'ABSENT_IN_THIS_LIST',plannedRuntimeSa:'ABSENT_IN_THIS_LIST'},
  cloudRun:{plannedReceiver:'ABSENT_IN_THIS_REGION_LIST'}
};
test('without explicit approval default is read only and cannot create GCP resources',async()=>{
  const {validateOperatorIntent,formatPlan}=await load();
  const i=validateOperatorIntent();
  assert.equal(i.status,'PLAN_ONLY');assert.equal(i.applyAllowed,false);
  const plan=formatPlan(GOOD_SNAP,GOOD_ROLE,undefined);
  assert.equal(plan.mode,'PLAN_READ_ONLY');
  assert.equal(plan.releaseStatus,'NO_GO');
  assert.equal(plan.canWriteFirestore,false);
  assert.equal(plan.canSendMail,false);
  assert.equal(plan.businessPublisherGrant,false);
  assert.equal(plan.imageDigestShape,'MISSING_OR_INVALID');
  assert.equal(plan.precheck.status,'PRECHECK_READ_ONLY_ONLY');
});
test('approve is fail closed without separate future scope and pinned image SHA',async()=>{
  const {validateOperatorIntent,auditImageReference}=await load();
  for(const a of [
    {mode:'invalid'},
    {mode:'apply'},
    {mode:'apply',approval:'Vamos',image:digest},
    {mode:'apply',approval:'LSZH_G3_SYNTHETIC_PRIVATE_TRANSPORT_ONLY',
      image:'europe-west6-docker.pkg.dev/lszh-automations/a/b:latest'},
    {mode:'apply',approval:'LSZH_G3_SYNTHETIC_PRIVATE_TRANSPORT_ONLY',
      image:'us-central1-docker.pkg.dev/lszh-automations/a/b@sha256:'+'a'.repeat(64)},
    {mode:'apply',approval:'LSZH_G3_SYNTHETIC_PRIVATE_TRANSPORT_ONLY',
      image:'europe-west6-docker.pkg.dev/another-project/a/b@sha256:'+'a'.repeat(64)}
  ])assert.equal(validateOperatorIntent(a).status,'BLOCKED',JSON.stringify(a));
  assert.equal(auditImageReference(digest),true);
  assert.equal(validateOperatorIntent({mode:'apply',
    approval:'LSZH_G3_SYNTHETIC_PRIVATE_TRANSPORT_ONLY',
    image:digest}).status,'APPLY_ALLOWED_ONLY_AFTER_REAL_OPERATOR_APPROVAL');
});
test('strict fixed resource scope rejects existing, unknown or missing APIs',async()=>{
  const {verifyReadOnlySnapshot}=await load();
  assert.equal(verifyReadOnlySnapshot(GOOD_SNAP,GOOD_ROLE).status,'PRECHECK_READ_ONLY_ONLY');
  const mutate=[
    x=>{x.pubsub.plannedTopic='PRESENT';},
    x=>{x.pubsub.plannedSubscription='UNKNOWN';},
    x=>{x.identities.plannedPushSa='PRESENT';},
    x=>{x.identities.plannedRuntimeSa='UNKNOWN';},
    x=>{x.cloudRun.plannedReceiver='PRESENT';},
    x=>{x.apiStatus['artifactregistry.googleapis.com']='NOT_IN_ENABLED_LIST';},
    x=>{x.project='another-project';},
    x=>{x.projectIdentityVerified=false;},
  ];
  for(const update of mutate){
    const x=structuredClone(GOOD_SNAP);update(x);
    const r=verifyReadOnlySnapshot(x,GOOD_ROLE);
    assert.equal(r.status,'BLOCKED');assert.equal(r.releaseStatus,'NO_GO');
  }
  for(const role of [
    {...GOOD_ROLE,serviceAgentProjectBinding:'DIRECT_CONDITIONAL_BINDING_UNEVALUATED'},
    {...GOOD_ROLE,roleDefinitionPermission:'UNKNOWN_ROLE_DEFINITION'},
    {...GOOD_ROLE,plannedPushSa:'PRESENT'}
  ])assert.equal(verifyReadOnlySnapshot(GOOD_SNAP,role).status,'BLOCKED');
});
test('all intended gcloud writes only create 2 SAs, 1 region-constrained topic, private receiver, 1 scoped invoker, 1 push sub',async()=>{
  const {buildCommands}=await load();
  const c=buildCommands(digest,url);
  assert.deepEqual(c.map(x=>x.step),[
    'new_push_sa','new_runtime_sa_no_firestore','new_topic_ch_only',
    'private_canary_cloud_run','scoped_push_invoker','authenticated_push_subscription'
  ]);
  assert.equal(c.length,6);
  assert.ok(c.every(x=>x.args.includes('--project=lszh-automations')));
  const commands=c.map(x=>x.args.join(' ')).join('\n');
  assert.match(commands,/--ingress=internal/);
  assert.match(commands,/--no-allow-unauthenticated/);
  assert.match(commands,/--invoker-iam-check/);
  assert.match(commands,/--min-instances=0/);
  assert.match(commands,/--max-instances=1/);
  assert.match(commands,/--message-storage-policy-allowed-regions=europe-west6/);
  assert.match(commands,/--member=serviceAccount:lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com/);
  assert.match(commands,/--role=roles\/run.invoker/);
  assert.match(commands,/--push-auth-service-account=/);
  assert.match(commands,/--push-endpoint=https:\/\/lszh-g3-review-staging-abc-ew.a.run.app\/g3-review/);
  assert.match(commands,/--push-auth-token-audience=https:\/\/lszh-g3-review-staging-abc-ew.a.run.app/);
  for(const s of ['--allow-unauthenticated','roles/iam.serviceAccountTokenCreator',
    'roles/owner','roles/editor','roles/pubsub.publisher','firestore','datastore',
    'gcloud services enable','service-accounts keys','--source','--no-invoker-iam-check',
    'allUsers','allAuthenticatedUsers','email','docs','drive','offer']) {
    assert.ok(!commands.includes(s),'forbidden item in commands: '+s);
  }
  assert.throws(()=>buildCommands('latest',url),/pinned_image_required/);
  assert.throws(()=>buildCommands(digest,'https://evil.example.invalid'),/invalid_private_run_app_default_url/);
});
test('private Cloud Run metadata with any public IAM member or insecure ingress stops before push subscription',async()=>{
  const {validatePrivateReceiver}=await load();
  const good={metadata:{name:'lszh-g3-review-staging',annotations:{
    'run.googleapis.com/ingress':'internal'}},status:{url},
    spec:{template:{spec:{serviceAccountName:'lszh-g3-reserve-stg@lszh-automations.iam.gserviceaccount.com'}}}};
  const policy={bindings:[{role:'roles/run.invoker',members:['serviceAccount:fake@demo.invalid']}]};
  assert.equal(validatePrivateReceiver(good,policy),url);
  for(const mod of [
    x=>{x.metadata.annotations['run.googleapis.com/ingress']='all';},
    x=>{x.status.url='https://evil.example.invalid';},
    x=>{x.spec.template.spec.serviceAccountName='quarantine-cas@example.invalid';},
    x=>{x.metadata.name='existing-production-service';}
  ]){
    const d=structuredClone(good);mod(d);
    assert.equal(validatePrivateReceiver(d,policy),null);
  }
  assert.equal(validatePrivateReceiver(good,{bindings:[{role:'roles/run.invoker',
    members:['allUsers']}]}),null);
  assert.equal(validatePrivateReceiver(good,{}),null);
});
