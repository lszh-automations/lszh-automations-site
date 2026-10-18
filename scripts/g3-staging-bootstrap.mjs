// LSZH G3: ONE guarded operator script for an isolated CANARY-ONLY
// private Pub/Sub -> Cloud Run transport, never the production receipt pipeline.
// DEFAULT --plan is read-only. No API enablement, OAuth setup, Firestore IAM,
// PubSub publisher, SA key, Make scenario, PDF, mail or contract actions.
// --apply needs an independently approved immutable image SHA digest and
// explicit future OPERATOR APPROVAL. NOT AUTHORISED by "Vamos" alone.
// Incomplete operations stop without trying to "repair" unrelated resources.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {inventory} from './g3-readonly-cloud-inventory.mjs';
import {auditPubsubAgentRole} from './g3-readonly-service-agent-role.mjs';

const PROJECT='lszh-automations',REGION='europe-west6';
const TOPIC='lszh-g3-review-staging',SUB='lszh-g3-review-staging';
const SERVICE='lszh-g3-review-staging';
const PUSH_ID='lszh-g3-push-stg',RUNTIME_ID='lszh-g3-reserve-stg';
const PUSH=PUSH_ID+'@'+PROJECT+'.iam.gserviceaccount.com';
const RUNTIME=RUNTIME_ID+'@'+PROJECT+'.iam.gserviceaccount.com';
const APPROVAL='LSZH_G3_SYNTHETIC_PRIVATE_TRANSPORT_ONLY';
const IMAGE_RE=/^europe-west6-docker\.pkg\.dev\/lszh-automations\/lszh-g3-review-staging\/receiver@sha256:[0-9a-f]{64}$/;
const IAM_MEMBER='serviceAccount:'+PUSH;
const COMMON=['--project='+PROJECT,'--quiet'];
const list=(x)=>Array.isArray(x)?x:null;
const status={project:PROJECT,region:REGION,isolated:true,
  liveOfferProcessingEnabled:false,canSendMail:false,canWriteFirestore:false,
  canAuthorizeCustomerContracts:false,makeScenarioChanged:false,
  businessPublisherGrant:false,releaseStatus:'NO_GO'};

export function verifyReadOnlySnapshot(x,role){
  const bad=[];
  if(!x||x.project!==PROJECT||x.region!==REGION||
     !x.projectIdentityVerified||x.result!=='READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM')
    bad.push('project_identity_unverified');
  for(const api of ['pubsub.googleapis.com','run.googleapis.com',
      'iam.googleapis.com','serviceusage.googleapis.com','artifactregistry.googleapis.com']){
    if(x?.apiStatus?.[api]!=='ENABLED')
      bad.push('api_unverified:'+api);
  }
  if(x?.pubsub?.plannedTopic!=='ABSENT_IN_THIS_LIST'||
     x?.pubsub?.plannedSubscription!=='ABSENT_IN_THIS_LIST')
    bad.push('g3_pubsub_resource_exists_or_unknown');
  if(x?.identities?.plannedPushSa!=='ABSENT_IN_THIS_LIST'||
     x?.identities?.plannedRuntimeSa!=='ABSENT_IN_THIS_LIST')
    bad.push('g3_service_account_exists_or_unknown');
  if(x?.cloudRun?.plannedReceiver!=='ABSENT_IN_THIS_REGION_LIST')
    bad.push('g3_receiver_exists_or_unknown');
  if(role?.projectIdentityVerified!==true||
     role?.roleDefinitionPermission!=='PRESENT_IN_PREDEFINED_ROLE'||
     role?.serviceAgentProjectBinding!=='DIRECT_UNCONDITIONAL_BINDING_FOUND'||
     role?.plannedPushSa!=='ABSENT_IN_THIS_LIST')
    bad.push('pubsub_service_agent_role_not_verified');
  return {status:bad.length?'BLOCKED':'PRECHECK_READ_ONLY_ONLY',
    reasons:bad,releaseStatus:'NO_GO'};
}
export function validateOperatorIntent({mode='plan',approval,image}={}){
  if(!['plan','apply'].includes(mode))
    return {status:'BLOCKED',reason:'invalid_mode'};
  if(mode==='plan')
    return {status:'PLAN_ONLY',releaseStatus:'NO_GO',applyAllowed:false};
  if(approval!==APPROVAL)
    return {status:'BLOCKED',reason:'operator_approval_missing'};
  if(typeof image!=='string'||!IMAGE_RE.test(image))
    return {status:'BLOCKED',reason:'approved_pinned_image_digest_missing'};
  return {status:'APPLY_ALLOWED_ONLY_AFTER_REAL_OPERATOR_APPROVAL',
    releaseStatus:'NO_GO',imageApprovedForScope:false};
}
export function buildCommands(image,url){
  if(!IMAGE_RE.test(image))throw Error('pinned_image_required');
  if(typeof url!=='string'||!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(url))
    throw Error('invalid_private_run_app_default_url');
  // No grants to Make; no Firestore grants; no org/project-wide IAM.
  return [
    {step:'new_push_sa',args:['iam','service-accounts','create',PUSH_ID,
      '--display-name=LSZH G3 staging PubSub invoker',...COMMON]},
    {step:'new_runtime_sa_no_firestore',args:['iam','service-accounts',
      'create',RUNTIME_ID,'--display-name=LSZH G3 staging no-data runtime',
      ...COMMON]},
    {step:'new_topic_ch_only',args:['pubsub','topics','create',TOPIC,
      '--message-storage-policy-allowed-regions='+REGION,
      '--labels=lszh_env=staging,lszh_scope=g3',...COMMON]},
    {step:'private_canary_cloud_run',args:['run','deploy',SERVICE,
      '--image='+image,'--region='+REGION,'--ingress=internal',
      '--no-allow-unauthenticated','--invoker-iam-check',
      '--service-account='+RUNTIME,'--min-instances=0','--max-instances=1',
      '--timeout=15s','--concurrency=1',
      '--labels=lszh_env=staging,lszh_scope=g3',
      ...COMMON]},
    {step:'scoped_push_invoker',args:['run','services','add-iam-policy-binding',
      SERVICE,'--region='+REGION,'--member='+IAM_MEMBER,
      '--role=roles/run.invoker',...COMMON]},
    {step:'authenticated_push_subscription',args:[
      'pubsub','subscriptions','create',SUB,'--topic='+TOPIC,
      '--push-endpoint='+url+'/g3-review',
      '--push-auth-service-account='+PUSH,
      '--push-auth-token-audience='+url,
      '--ack-deadline=30','--min-retry-delay=60s',
      '--max-retry-delay=600s',
      '--message-retention-duration=600s',
      '--labels=lszh_env=staging,lszh_scope=g3',...COMMON]}
  ];
}
export function auditImageReference(image){
  return typeof image==='string'&&IMAGE_RE.test(image);
}
function gcloud(args,{parseJson=false}={}){
  const stdout=execFileSync('gcloud',args,{encoding:'utf8',
    timeout:120000,maxBuffer:4*1024*1024,stdio:['ignore','pipe','pipe'],
    env:{...process.env,CLOUDSDK_CORE_DISABLE_PROMPTS:'1',
      CLOUDSDK_CORE_DISABLE_USAGE_REPORTING:'1'}});
  return parseJson?JSON.parse(stdout):null;
}
function lookup(args){
  try{return {ok:true,data:gcloud(args,{parseJson:true})};}
  catch{return {ok:false,data:null};}
}
const redactFail=(step)=>({status:'PARTIAL_APPLY_HALTED',
  lastAttemptedStep:step,manualReviewAndRollbackRequired:true,...status});
export function validatePrivateReceiver(config,policy){
  const url=config?.status?.url;
  const metadata=config?.metadata;
  const svcName=metadata?.name||config?.name?.split('/').at(-1);
  const ingress=metadata?.annotations?.['run.googleapis.com/ingress']||
    config?.metadata?.annotations?.['run.googleapis.com/ingress'];
  const v2Ingress=config?.ingress;
  const templateServiceAccount=config?.spec?.template?.spec?.serviceAccountName||
    config?.template?.serviceAccount;
  const allBindings=list(policy?.bindings);
  const publiclyInvokable=allBindings?.some(b=>b?.members?.some(
    x=>x==='allUsers'||x==='allAuthenticatedUsers'));
  // Before the grant the new service must not have any pre-existing invoker.
  // A prior non-public invoker is not acceptable just because it isn't allUsers.
  const preExistingInvokers=allBindings?.some(b=>b?.role==='roles/run.invoker');
  const iamBypassed=config?.metadata?.annotations?.['run.googleapis.com/invoker-iam-disabled']==='true'||
    config?.invokerIamDisabled===true;
  return svcName===SERVICE&&
    (ingress==='internal'||v2Ingress==='INGRESS_TRAFFIC_INTERNAL_ONLY') &&
    templateServiceAccount===RUNTIME&&
    typeof url==='string'&&
    /^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(url)&&
    allBindings!==null&&!publiclyInvokable&&!preExistingInvokers&&!iamBypassed?url:null;
}
// Invoker policy is read again after the single permitted service-level grant,
// BEFORE creating a push subscription. This is not an effective-IAM proof.
export function verifyScopedInvoker(policy){
  const bindings=list(policy?.bindings);
  if(!bindings)return false;
  if(bindings.some(b=>b?.members?.some(
    x=>x==='allUsers'||x==='allAuthenticatedUsers')))return false;
  const invokers=bindings.filter(b=>b?.role==='roles/run.invoker');
  return invokers.length===1&&!invokers[0].condition&&
    Array.isArray(invokers[0].members)&&
    invokers[0].members.length===1&&
    invokers[0].members[0]===IAM_MEMBER;
}

export function formatPlan(preflight,role,image){
  const pre=verifyReadOnlySnapshot(preflight,role);
  const hasImage=auditImageReference(image);
  return {...status,mode:'PLAN_READ_ONLY',precheck:pre,
    imageDigestShape:hasImage?'PINNED_DIGEST_PRESENT':'MISSING_OR_INVALID',
    noGoogleResourcesCreated:true,
    next:'Requires explicit separate change approval, independent image review and private-receiver IAM review',
    proposedActions:[
      'create_one_push_service_account',
      'create_one_runtime_service_account_without_firestore_access',
      'create_one_pubsub_topic_in_europe_west6',
      'deploy_one_private_IAM_required_canary_receiver_from_approved_digest',
      'grant_one_service_scoped_run_invoker',
      'create_one_oidc_push_subscription_without_Make_publisher'
    ]};
}
async function main(){
  const [modeArg,...rest]=process.argv.slice(2);
  const mode=!modeArg||modeArg==='--plan'?'plan':
    modeArg==='--apply'?'apply':'invalid';
  if(rest.some(x=>!x.startsWith('--approval=')&&!x.startsWith('--image='))){
    console.log(JSON.stringify({status:'BLOCKED',reason:'unexpected_cli_argument',...status}));
    process.exitCode=2;return;
  }
  const approval=rest.find(x=>x.startsWith('--approval='))?.slice(11);
  const image=rest.find(x=>x.startsWith('--image='))?.slice(8);
  const intent=validateOperatorIntent({mode,approval,image});
  if(intent.status==='BLOCKED'){
    console.log(JSON.stringify({status:'BLOCKED',reason:intent.reason,
      ...status}));process.exitCode=2;return;
  }
  // Hard release hold: a syntactically valid image and known approval phrase
  // are NOT independently verified provenance or a signed change decision.
  // Future operator-approved work must intentionally replace this guard
  // with a reviewed trusted attestation verifier and change authorization.
  // This guard sits BEFORE any gcloud read or write, including --apply.
  if(mode==='apply'){
    console.log(JSON.stringify({status:'BLOCKED_G3_SIGNED_PROVENANCE_GATE',
      reason:'independent_signed_image_provenance_and_change_approval_not_implemented',
      ...status}));process.exitCode=2;return;
  }
  // Read-only status uses our previously tested, fixed-scope GCP queries.
  // Extend API map for Artifact Registry (the former snapshot had only 5 APIs).
  const original=inventory();
  const services=lookup(['services','list','--project='+PROJECT,
    '--format=json','--quiet','--enabled']);
  const names=Array.isArray(services.data)?
    services.data.map(x=>x.config?.name||x.name):[];
  const snap={...original,apiStatus:{
    ...original.apiStatus,
    'artifactregistry.googleapis.com':
      services.ok&&names.includes('artifactregistry.googleapis.com')?
        'ENABLED':'NOT_IN_ENABLED_LIST'
  }};
  const role=auditPubsubAgentRole();
  const plan=formatPlan(snap,role,image);
  if(mode==='plan'){
    console.log(JSON.stringify(plan,null,2));return;
  }
  if(plan.precheck.status!=='PRECHECK_READ_ONLY_ONLY'){
    console.log(JSON.stringify({status:'BLOCKED_PREFLIGHT',...status,
      reasons:plan.precheck.reasons},null,2));process.exitCode=2;return;
  }
  // No user/consumer token, no Make OAuth, no Firestore permission.
  // Only the operator's already authenticated business Cloud Shell can apply.
  const accounts=lookup(['auth','list','--format=json','--quiet']);
  const active=Array.isArray(accounts.data)?
    accounts.data.filter(x=>x.status==='ACTIVE'):[];
  if(active.length!==1||
     !/^[-a-z0-9._+]+@lszh-automations\.ch$/i.test(active[0].account||'')){
    console.log(JSON.stringify({status:'BLOCKED_BUSINESS_AUTH',...status}));
    process.exitCode=2;return;
  }
  if(!image||!auditImageReference(image)||
      !lookup(['artifacts','docker','images','describe',image,
        '--project='+PROJECT,'--format=json','--quiet']).ok){
    console.log(JSON.stringify({status:'BLOCKED_PINNED_IMAGE_UNVERIFIED',...status}));
    process.exitCode=2;return;
  }
  // Only now can a future separately-authorised operator start any changes.
  const actions=buildCommands(image,'https://example.run.app');
  try{
    for(const item of actions.slice(0,4)){
      gcloud(item.args);
      console.log('G3_STEP_COMPLETED '+item.step);
    }
    const config=lookup(['run','services','describe',SERVICE,
      '--region='+REGION,'--project='+PROJECT,'--format=json','--quiet']);
    const policy=lookup(['run','services','get-iam-policy',SERVICE,
      '--region='+REGION,'--project='+PROJECT,'--format=json','--quiet']);
    const url=validatePrivateReceiver(config.data,policy.data);
    if(!url){
      console.log(JSON.stringify(redactFail('verify_private_receiver')));
      process.exitCode=2;return;
    }
    const scoped=buildCommands(image,url);
    gcloud(scoped[4].args);
    console.log('G3_STEP_COMPLETED '+scoped[4].step);
    const granted=lookup(['run','services','get-iam-policy',SERVICE,
      '--region='+REGION,'--project='+PROJECT,'--format=json','--quiet']);
    if(!granted.ok||!verifyScopedInvoker(granted.data)){
      console.log(JSON.stringify(redactFail('verify_scoped_invoker')));
      process.exitCode=2;return;
    }
    // The only remaining write is the single OIDC push subscription.
    gcloud(scoped[5].args);
    console.log('G3_STEP_COMPLETED '+scoped[5].step);
    console.log(JSON.stringify({...status,
      status:'STAGING_CANARY_TRANSPORT_CREATED_NOT_PUBLISHED',
      followup:'Verify scoped IAM, OIDC and cost/rollback; no Make OAuth or publisher permission'}));
  }catch{
    console.log(JSON.stringify(redactFail('gcloud_operator_step')));
    process.exitCode=2;
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().catch(()=>{
    console.log(JSON.stringify({status:'STOP_UNEXPECTED_ERROR',...status}));
    process.exitCode=2;
  });
}
