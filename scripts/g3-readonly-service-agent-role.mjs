// G3 read-only verification of the EXISTING Pub/Sub service-agent role.
// This does NOT test effective IAM of a not-yet-created push service account.
// No API enablement, service-account creation, authentication or IAM writes.
// Prints no principal emails, project numbers, access tokens or raw policies.
import {readGcloud} from './g3-readonly-cloud-inventory.mjs';
import {pathToFileURL} from 'node:url';

const PROJECT='lszh-automations';
const ROLE='roles/pubsub.serviceAgent';
const PERMISSION='iam.serviceAccounts.getOpenIdToken';
const PUSH='lszh-g3-push-stg@'+PROJECT+'.iam.gserviceaccount.com';
const COMMON=['--project='+PROJECT,'--format=json','--quiet'];
const base={
  schemaVersion:1,kind:'LSZH_G3_READ_ONLY_SERVICE_AGENT_ROLE',
  project:PROJECT,readOnly:true,
  canGrantIam:false,canCreateServiceAccount:false,canEnableApi:false,
  canPublish:false,canDeploy:false,canSendEmail:false,
  releaseStatus:'NO_GO'
};

const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function readJson(read,args){
  const out=read(args);
  return out?.ok===true&&isObject(out.data)?out.data:null;
}
function readList(read,args){
  const out=read(args);
  return out?.ok===true&&Array.isArray(out.data)?out.data:null;
}
export function auditPubsubAgentRole(read=readGcloud){
  const project=readJson(read,['projects','describe',PROJECT,...COMMON]);
  if(!project||project.projectId!==PROJECT ||
    !/^\d+$/.test(String(project.projectNumber||'')))
    return {...base,result:'STOP_PROJECT_UNVERIFIED'};
  const number=String(project.projectNumber);
  const enabled=readList(read,['services','list',...COMMON,'--enabled']);
  if(!enabled)
    return {...base,result:'STOP_ENABLED_APIS_UNREADABLE'};
  const enabledNames=enabled.map(x=>x.config?.name||x.name);
  if(!enabledNames.includes('iam.googleapis.com'))
    return {...base,result:'STOP_IAM_API_NOT_ENABLED'};

  // The previous cloud run returned UNKNOWN_ROLE_DEFINITION while the
  // separate project-IAM read worked. For predefined roles, Google documents
  // a read form WITHOUT --project. Prefer original project-scoped read but
  // retry EXACTLY this one immutable, unscoped role if unreadable/invalid.
  // Failure causes neither IAM changes nor permissions recommendations.
  const validRole=x=>x&&x.name===ROLE&&
    Array.isArray(x.includedPermissions)&&
    x.includedPermissions.every(p=>typeof p==='string');
  let role=readJson(read,['iam','roles','describe',ROLE,...COMMON]);
  let roleReadVariant=validRole(role)?'PROJECT_SCOPED':'UNVERIFIED';
  if(!validRole(role)){
    role=readJson(read,['iam','roles','describe',ROLE,
      '--format=json','--quiet']);
    if(validRole(role))roleReadVariant='PREDEFINED_UNSCOPED_FALLBACK';
  }
  const rolePermission=!validRole(role)?'UNKNOWN_ROLE_DEFINITION':
    role.includedPermissions.includes(PERMISSION)?
      'PRESENT_IN_PREDEFINED_ROLE':'ABSENT_IN_PREDEFINED_ROLE';

  const policy=readJson(read,['projects','get-iam-policy',PROJECT,...COMMON]);
  const agent='serviceAccount:service-'+number+
    '@gcp-sa-pubsub.iam.gserviceaccount.com';
  let directRole='UNKNOWN_POLICY_UNREADABLE';
  if(policy&&Array.isArray(policy.bindings)){
    const entries=policy.bindings.filter(b=>b.role===ROLE &&
      Array.isArray(b.members)&&b.members.includes(agent));
    directRole=entries.length===0?'NOT_IN_DIRECT_PROJECT_POLICY':
      entries.some(b=>!b.condition)?'DIRECT_UNCONDITIONAL_BINDING_FOUND':
      'DIRECT_CONDITIONAL_BINDING_UNEVALUATED';
  }

  const accounts=readList(read,['iam','service-accounts','list',...COMMON]);
  const plannedPush=accounts===null?'UNKNOWN':
    accounts.some(x=>x.email===PUSH)?
      'EXISTS_NEEDS_SEPARATE_REVIEW':'ABSENT_IN_THIS_LIST';

  // Even if BOTH role and project binding are present, an uncreated
  // service account has no actual token-minting target. Deny/PAB and other
  // runtime policies have not been assessed here.
  return {...base,result:'READ_ONLY_ROLE_DEFINITION_CHECK',
    projectIdentityVerified:true,roleDefinitionPermission:rolePermission,
    roleReadVariant,serviceAgentProjectBinding:directRole,
    plannedPushSa:plannedPush,
    serviceAgentEffectiveOidc:'NOT_EVALUATED',
    groupDenyPab:'NOT_EVALUATED',
    tokenCreatorAdditionalGrant:'NOT_RECOMMENDED_WITHOUT_EFFECTIVE_CHECK',
    publishAndPushTransport:'NOT_TESTED'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length!==2){
    process.stderr.write('Usage: node scripts/g3-readonly-service-agent-role.mjs\n');
    process.exitCode=2;
  }else{
    const out=auditPubsubAgentRole();
    process.stdout.write(JSON.stringify(out,null,2)+'\n');
    if(out.result.startsWith('STOP_'))process.exitCode=2;
  }
}
