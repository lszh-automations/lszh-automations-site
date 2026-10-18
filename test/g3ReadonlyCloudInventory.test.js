'use strict';
// Mocked only: test a strictly READ-ONLY CLI allowlist and sanitised summary.
// CI must never run gcloud or use Google credentials.
const test=require('node:test');
const assert=require('node:assert/strict');
const PROJECT='lszh-automations';
const PREFIX='projects/'+PROJECT;
const TOPIC=PREFIX+'/topics/lszh-g3-review-staging';
const SUB=PREFIX+'/subscriptions/lszh-g3-review-staging';
const PUSH='lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com';
const RUNTIME='lszh-g3-reserve-stg@lszh-automations.iam.gserviceaccount.com';
const GCP_NUM='123456789012';
const MODULE=()=>import('../scripts/g3-readonly-cloud-inventory.mjs');
function sample(opts={}){
  const calls=[];
  const read=(args)=>{
    calls.push([...args]);
    const op=args.filter(x=>!x.startsWith('--')).join(' ');
    if(opts.fail==='project'||(opts.fail==='services'&&op==='services list'))
      return {ok:false,error:'UNAVAILABLE_OR_PERMISSION_DENIED'};
    const out={
      ['projects describe '+PROJECT]:{
        projectId:opts.wrongProject?'other-project':PROJECT,
        projectNumber:GCP_NUM,lifecycleState:'ACTIVE'
      },
      'services list':opts.noPubsub?[
        {config:{name:'run.googleapis.com'}},
        {config:{name:'iam.googleapis.com'}}
      ]:[
        {config:{name:'pubsub.googleapis.com'}},
        {config:{name:'run.googleapis.com'}},
        {config:{name:'iam.googleapis.com'}},
        {config:{name:'firestore.googleapis.com'}},
        {config:{name:'serviceusage.googleapis.com'}}
      ],
      'pubsub topics list':[{name:TOPIC}],
      'pubsub subscriptions list':[{
        name:SUB,topic:TOPIC,
        pushConfig:{oidcToken:{serviceAccountEmail:PUSH}}
      }],
      'iam service-accounts list':[{email:PUSH},{email:RUNTIME}],
      ['projects get-iam-policy '+PROJECT]:{
        bindings:[
          {role:'roles/pubsub.serviceAgent',
            members:['serviceAccount:service-'+GCP_NUM+'@gcp-sa-pubsub.iam.gserviceaccount.com']},
          {role:'roles/owner',members:['user:PRIVATE_PERSON@example.invalid'],
            condition:{title:'TEMP'}}
        ]
      },
      ['pubsub topics get-iam-policy '+TOPIC]:{
        bindings:[{role:'roles/pubsub.publisher',
          members:['user:PRIVATE_PERSON@example.invalid']}]},
      ['pubsub subscriptions get-iam-policy '+SUB]:{bindings:[]},
      ['iam service-accounts get-iam-policy '+PUSH]:{bindings:[]},
      ['iam service-accounts get-iam-policy '+RUNTIME]:{bindings:[]},
      'run services list':[{metadata:{name:'lszh-g3-review-staging'}}],
      'run services get-iam-policy lszh-g3-review-staging':{
        bindings:[{role:'roles/run.invoker',
          members:['serviceAccount:'+PUSH]}]
      }
    };
    if(opts.fail===op || !Object.hasOwn(out,op))
      return {ok:false,error:'UNAVAILABLE_OR_PERMISSION_DENIED'};
    return {ok:true,data:out[op]};
  };
  return {read,calls};
}
test('full fake inventory summarises direct IAM only and never enables any action',async()=>{
  const {inventory,validateCommand}=await MODULE();
  const {read,calls}=sample();
  const data=inventory(args=>{validateCommand(args);return read(args);});
  assert.equal(data.result,'READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM');
  assert.equal(data.projectIdentityVerified,true);
  assert.equal(data.readOnly,true);
  assert.equal(data.releaseStatus,'NO_GO');
  assert.equal(data.apiStatus['pubsub.googleapis.com'],'ENABLED');
  assert.equal(data.pubsub.topicCount,1);
  assert.equal(data.pubsub.subscriptionCount,1);
  assert.equal(data.pubsub.plannedTopic,'PRESENT');
  assert.equal(data.pubsub.plannedSubscription,'PRESENT');
  assert.equal(data.pubsub.serviceAgentProjectRole,'DIRECT_POLICY_BINDING_FOUND');
  assert.equal(data.pubsub.serviceAgentTokenMintingEffective,'NOT_EVALUATED');
  assert.equal(data.cloudRun.plannedReceiver,'PRESENT');
  assert.equal(data.identities.plannedPushSa,'PRESENT');
  assert.equal(data.identities.plannedRuntimeSa,'PRESENT');
  assert.equal(data.identities.inheritedIamGroupDenyPab,'NOT_EVALUATED');
  assert.equal(data.pubsub.topicDirectIam.bindingCount,1);
  assert.ok(calls.length>=9);
  const output=JSON.stringify(data);
  assert.ok(!output.includes('PRIVATE_PERSON@'));
  assert.ok(!output.includes(GCP_NUM));
  assert.ok(!output.includes(PUSH));
  assert.ok(!output.includes(RUNTIME));
  for(const key of ['canEnableApi','canCreateIdentity','canWriteIam',
    'canPublish','canDeploy','canCreateCustomerOffer','canSendEmail'])
    assert.equal(data[key],false);
  for(const cmd of calls){
    assert.ok(cmd.includes('--project='+PROJECT));
    assert.ok(cmd.includes('--format=json'));
    assert.ok(cmd.includes('--quiet'));
    assert.ok(!cmd.some(x=>/create|enable|delete|publish|ack|pull|token|set-iam|add-iam/.test(x)
      && !x.includes('topic') && !x.includes('subscription') &&
      !x.includes('get-iam-policy') &&
      !x.includes('lszh-g3-review-staging')));
  }
});
test('wrong project refuses any inventory reads after project describe',async()=>{
  const {inventory}=await MODULE();
  const {read,calls}=sample({wrongProject:true});
  const out=inventory(read);
  assert.equal(out.result,'STOP_PROJECT_NOT_VERIFIED');
  assert.equal(calls.length,1);
  assert.equal(out.releaseStatus,'NO_GO');
});
test('missing Service Usage read stops instead of guessing which APIs are enabled',async()=>{
  const {inventory}=await MODULE();
  const {read,calls}=sample({fail:'services list'});
  const out=inventory(read);
  assert.equal(out.result,'STOP_ENABLED_API_INVENTORY_UNAVAILABLE');
  assert.equal(calls.length,2);
});
test('disabled Pub/Sub skips topic/subscription reads, does not claim absence',async()=>{
  const {inventory}=await MODULE();
  const {read,calls}=sample({noPubsub:true});
  const out=inventory(read);
  assert.equal(out.apiStatus['pubsub.googleapis.com'],'NOT_IN_ENABLED_LIST');
  assert.equal(out.pubsub.plannedTopic,'UNKNOWN');
  assert.equal(out.pubsub.plannedSubscription,'UNKNOWN');
  assert.equal(out.pubsub.topicCount,null);
  assert.ok(!calls.some(x=>x.join(' ').includes('pubsub topics list')));
  assert.ok(!calls.some(x=>x.join(' ').includes('pubsub subscriptions list')));
});
test('partial IAM visibility remains UNKNOWN, never suggests TokenCreator grants',async()=>{
  const {inventory}=await MODULE();
  const {read}=sample({fail:'projects get-iam-policy '+PROJECT});
  const out=inventory(read);
  assert.equal(out.pubsub.serviceAgentProjectRole,'UNKNOWN');
  assert.equal(out.pubsub.serviceAgentTokenMintingEffective,'NOT_EVALUATED');
  assert.equal(out.releaseStatus,'NO_GO');
});
test('gcloud allowlist rejects mutating and identity-creating commands',async()=>{
  const {validateCommand}=await MODULE();
  const fixed=['--project='+PROJECT,'--format=json','--quiet'];
  const forbidden=[
    ['services','enable','pubsub.googleapis.com',...fixed],
    ['pubsub','topics','create','x',...fixed],
    ['pubsub','topics','publish','x',...fixed],
    ['pubsub','subscriptions','pull','x',...fixed],
    ['pubsub','subscriptions','ack','x',...fixed],
    ['iam','service-accounts','create','x',...fixed],
    ['beta','services','identity','create',...fixed],
    ['projects','add-iam-policy-binding',PROJECT,...fixed],
    ['run','deploy','x',...fixed],
    ['projects','get-iam-policy',PROJECT,...fixed,'--impersonate-service-account=x@p.iam.gserviceaccount.com'],
    ['projects','get-iam-policy',PROJECT,...fixed,'--log-http'],
    ['projects','get-iam-policy','different-project',...fixed],
  ];
  for(const cmd of forbidden)
    assert.throws(()=>validateCommand(cmd),/unapproved_gcloud_argument/,
      'unexpected command permitted: '+cmd.join(' '));
  assert.doesNotThrow(()=>validateCommand([
    'pubsub','topics','get-iam-policy',TOPIC,...fixed]));
  assert.doesNotThrow(()=>validateCommand([
    'run','services','get-iam-policy','lszh-g3-review-staging',...fixed,
    '--region=europe-west6']));
});
