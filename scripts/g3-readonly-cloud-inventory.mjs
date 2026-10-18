// LSZH G3: read-only, human-invoked Google Cloud inventory.
// Exact project only; no auth/login, IAM write, create, publish, pull/ack,
// deployment, enable API, service identity generation or token impersonation.
// Prints only aggregate/redacted facts. NO raw IAM policies, emails or tokens.
// Execute manually in an already-authenticated *business* Cloud Shell.
// Tests use a fake read function; CI never runs live gcloud from this script.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const PROJECT='lszh-automations';
const REGION='europe-west6';
const TOPIC='projects/'+PROJECT+'/topics/lszh-g3-review-staging';
const SUB='projects/'+PROJECT+'/subscriptions/lszh-g3-review-staging';
const SERVICE='lszh-g3-review-staging';
const PUSH_SA='lszh-g3-push-stg@'+PROJECT+'.iam.gserviceaccount.com';
const RUNTIME_SA='lszh-g3-reserve-stg@'+PROJECT+'.iam.gserviceaccount.com';
const API=['pubsub.googleapis.com','run.googleapis.com','iam.googleapis.com',
  'firestore.googleapis.com','serviceusage.googleapis.com'];
const COMMON=['--project='+PROJECT,'--format=json','--quiet'];
const allowedCommandHeads=new Set([
  'projects describe','services list','pubsub topics list',
  'pubsub subscriptions list','iam service-accounts list',
  'projects get-iam-policy','pubsub topics get-iam-policy',
  'pubsub subscriptions get-iam-policy','iam service-accounts get-iam-policy',
  'run services list','run services get-iam-policy'
]);
const safeError=()=>({ok:false,error:'UNAVAILABLE_OR_PERMISSION_DENIED'});
const isObject=v=>v && typeof v==='object'&&!Array.isArray(v);
function validateCommand(args){
  if(!Array.isArray(args)||!args.every(s=>typeof s==='string')||
    args.some(s=>/--(impersonate|access-token-file|log-http|billing-project|trace-token)/.test(s)))
    throw Error('unapproved_gcloud_argument');
  const head=args.slice(0,args.indexOf('--project='+PROJECT)).join(' ');
  const legal=[...allowedCommandHeads].some(s=>head===s||
    (s==='projects describe'&&head==='projects describe '+PROJECT)||
    (s==='projects get-iam-policy'&&head==='projects get-iam-policy '+PROJECT)||
    (s==='pubsub topics get-iam-policy'&&head==='pubsub topics get-iam-policy '+TOPIC)||
    (s==='pubsub subscriptions get-iam-policy'&&head==='pubsub subscriptions get-iam-policy '+SUB)||
    (s==='iam service-accounts get-iam-policy'&&
      [PUSH_SA,RUNTIME_SA].some(sa=>head==='iam service-accounts get-iam-policy '+sa))||
    (s==='run services get-iam-policy'&&head==='run services get-iam-policy '+SERVICE));
  if(!legal || !args.includes('--format=json')||!args.includes('--quiet')||
    !args.includes('--project='+PROJECT) ||
    args.some(x=>x.startsWith('--')&&![
      '--project='+PROJECT,'--region='+REGION,'--format=json','--quiet','--enabled'
    ].includes(x)))
    throw Error('unapproved_gcloud_argument');
}
export function readGcloud(args){
  validateCommand(args);
  try{
    const out=execFileSync('gcloud',args,{
      encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024,
      stdio:['ignore','pipe','pipe'],
      env:{...process.env,CLOUDSDK_CORE_DISABLE_PROMPTS:'1',
        CLOUDSDK_CORE_DISABLE_USAGE_REPORTING:'1',
        CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK:'1'}
    });
    return {ok:true,data:JSON.parse(out)};
  }catch{return safeError();}
}
function getList(read,args){
  const reply=read(args);
  return reply?.ok===true&&Array.isArray(reply.data)?reply.data:null;
}
function getObject(read,args){
  const reply=read(args);
  return reply?.ok===true&&isObject(reply.data)?reply.data:null;
}
function bindingReport(raw){
  if(!raw||!Array.isArray(raw.bindings))return {
    state:'UNKNOWN',bindingCount:null,publicBindingCount:null,
    conditionalBindingCount:null};
  let publicBindingCount=0,conditionalBindingCount=0;
  for(const b of raw.bindings){
    if(!Array.isArray(b.members)||typeof b.role!=='string')
      return {state:'UNKNOWN',bindingCount:null,
        publicBindingCount:null,conditionalBindingCount:null};
    if(b.members.some(m=>m==='allUsers'||m==='allAuthenticatedUsers'))
      publicBindingCount++;
    if(b.condition)conditionalBindingCount++;
  }
  return {state:'READ_ONLY_SNAPSHOT',bindingCount:raw.bindings.length,
    publicBindingCount,conditionalBindingCount};
}
const seen=(items,name)=>items===null?'UNKNOWN':
  items.some(x=>x.name===name)?'PRESENT':'ABSENT_IN_THIS_LIST';
const roleStatus=(policy,member,role)=>!policy?'UNKNOWN':
  policy.bindings?.some(x=>x.role===role&&x.members?.includes(member))?
    'DIRECT_POLICY_BINDING_FOUND':'NO_DIRECT_BINDING_IN_THIS_POLICY';
export function inventory(read=readGcloud){
  const base={
    schemaVersion:1,kind:'LSZH_G3_READ_ONLY_INVENTORY',
    project:PROJECT,region:REGION,readOnly:true,
    canEnableApi:false,canCreateIdentity:false,canWriteIam:false,
    canPublish:false,canDeploy:false,canCreateCustomerOffer:false,
    canSendEmail:false,releaseStatus:'NO_GO'
  };
  const project=getObject(read,['projects','describe',PROJECT,...COMMON]);
  if(!project||project.projectId!==PROJECT ||
     !/^\d+$/.test(String(project.projectNumber||'')))
    return {...base,result:'STOP_PROJECT_NOT_VERIFIED'};
  const number=String(project.projectNumber);
  const enabled=getList(read,['services','list',...COMMON,'--enabled']);
  if(!enabled)return {...base,result:'STOP_ENABLED_API_INVENTORY_UNAVAILABLE',
    projectIdentityVerified:true};
  const enabledNames=enabled.map(x=>x.config?.name||x.name).filter(Boolean);
  const apiStatus=Object.fromEntries(API.map(n=>[n,
    enabledNames.includes(n)?'ENABLED':'NOT_IN_ENABLED_LIST']));
  // Never call a disabled API, which could cause ambiguous responses.
  const topics=enabledNames.includes('pubsub.googleapis.com')?
    getList(read,['pubsub','topics','list',...COMMON]):null;
  const subs=enabledNames.includes('pubsub.googleapis.com')?
    getList(read,['pubsub','subscriptions','list',...COMMON]):null;
  const accounts=getList(read,['iam','service-accounts','list',...COMMON]);
  const projectIam=getObject(read,['projects','get-iam-policy',PROJECT,...COMMON]);
  const run=enabledNames.includes('run.googleapis.com')?
    getList(read,['run','services','list',...COMMON,'--region='+REGION]):null;
  const proposedTopic=seen(topics,TOPIC);
  const proposedSubscription=seen(subs,SUB);
  const proposedPush=accounts===null?'UNKNOWN':
    accounts.some(a=>a.email===PUSH_SA)?'PRESENT':'ABSENT_IN_THIS_LIST';
  const proposedRuntime=accounts===null?'UNKNOWN':
    accounts.some(a=>a.email===RUNTIME_SA)?'PRESENT':'ABSENT_IN_THIS_LIST';
  const proposedRun=run===null?'UNKNOWN':
    run.some(x=>x.metadata?.name===SERVICE||x.name===SERVICE)?
      'PRESENT':'ABSENT_IN_THIS_REGION_LIST';
  const agent='service-'+number+'@gcp-sa-pubsub.iam.gserviceaccount.com';
  const projectPubsubAgent=roleStatus(projectIam,'serviceAccount:'+agent,
    'roles/pubsub.serviceAgent');
  const topicIam=proposedTopic==='PRESENT'?
    bindingReport(getObject(read,['pubsub','topics','get-iam-policy',TOPIC,...COMMON])):
    bindingReport(null);
  const subIam=proposedSubscription==='PRESENT'?
    bindingReport(getObject(read,['pubsub','subscriptions','get-iam-policy',SUB,...COMMON])):
    bindingReport(null);
  const pushSaIam=proposedPush==='PRESENT'?
    bindingReport(getObject(read,['iam','service-accounts','get-iam-policy',PUSH_SA,...COMMON])):
    bindingReport(null);
  const runtimeSaIam=proposedRuntime==='PRESENT'?
    bindingReport(getObject(read,['iam','service-accounts','get-iam-policy',RUNTIME_SA,...COMMON])):
    bindingReport(null);
  const runIam=proposedRun==='PRESENT'?
    bindingReport(getObject(read,['run','services','get-iam-policy',SERVICE,...COMMON,
      '--region='+REGION])):bindingReport(null);
  return {...base,result:'READ_ONLY_INVENTORY_WITH_UNVERIFIED_EFFECTIVE_IAM',
    projectIdentityVerified:true,
    apiStatus,
    pubsub:{
      topicCount:topics?.length??null,
      subscriptionCount:subs?.length??null,
      plannedTopic:proposedTopic,plannedSubscription:proposedSubscription,
      topicDirectIam:topicIam,subscriptionDirectIam:subIam,
      serviceAgentProjectRole:projectPubsubAgent,
      serviceAgentTokenMintingEffective:'NOT_EVALUATED',
      pushDeliveryCapability:'NOT_TESTED'
    },
    identities:{
      localServiceAccountCount:accounts?.length??null,
      plannedPushSa:proposedPush,plannedRuntimeSa:proposedRuntime,
      pushSaDirectIam:pushSaIam,runtimeSaDirectIam:runtimeSaIam,
      inheritedIamGroupDenyPab:'NOT_EVALUATED'
    },
    cloudRun:{
      regionalServiceCount:run?.length??null,
      plannedReceiver:proposedRun,plannedReceiverDirectIam:runIam,
      effectiveIngress:'NOT_EVALUATED'
    },
    make:{
      businessGoogleOauthConnection:'NOT_CONFIGURED_AS_OF_PRIOR_READ',
      nativeDataEncoding:'NOT_VERIFIED'
    }
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==2){
    process.stderr.write('Usage: node scripts/g3-readonly-cloud-inventory.mjs\n');
    process.exitCode=2;
  }else{
    const result=inventory();
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.result.startsWith('STOP_'))process.exitCode=2;
  }
}
