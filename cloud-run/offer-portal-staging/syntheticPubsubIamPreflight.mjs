// INERT G3 IAM/transport design preflight. No Google SDK, network,
// credential access, gcloud command, IAM binding, Pub/Sub publish or deploy.
// Positive results mean only that a MOCK design is internally consistent,
// NEVER that any real principal, connection or resource was verified.
const PROJECT='lszh-automations';
const TOPIC='projects/lszh-automations/topics/lszh-g3-review-staging';
const SUB='projects/lszh-automations/subscriptions/lszh-g3-review-staging';
const PUSH='lszh-g3-push-stg@lszh-automations.iam.gserviceaccount.com';
const RUNTIME='lszh-g3-reserve-stg@lszh-automations.iam.gserviceaccount.com';
const SERVICE='lszh-g3-review-staging';
const DB='lszh-offers-staging';
const PUBSUB_SCOPE='https://www.googleapis.com/auth/pubsub';
const CLOUD_SCOPE='https://www.googleapis.com/auth/cloud-platform';
const NO_ACTION={
  canCreateConnection:false,canGrantIam:false,canDeploy:false,
  canPublish:false,canCreateGoogleDoc:false,canWriteFirestore:false,
  canWriteAirtable:false,canSendEmail:false
};
const exactly=(o,keys)=>o && typeof o==='object'&&!Array.isArray(o) &&
  Object.getPrototypeOf(o)===Object.prototype &&
  Object.keys(o).sort().join('|')===keys.slice().sort().join('|');
const result=(status,reason)=>({status,reason,
  manualApprovalRequired:true,...NO_ACTION});
const okRole=(x,role,scope,member)=>
  exactly(x,['role','scope','member']) &&
  x.role===role && x.scope===scope && x.member===member;

/**
 * Synthetic architecture inventory, NEVER live IAM evidence. The prescribed
 * roles are precise; inherited/broad grants cannot be evaluated here.
 * Publisher OAuth principal is an ABSTRACT placeholder, not an owner email.
 */
export function assessSyntheticPubsubIamDesign(p){
  if(!exactly(p,['schemaVersion','mode','project','region','topic',
       'subscription','make','push','receiver','runtime','serviceAgent']) ||
     p.schemaVersion!==1||p.mode!=='OFFLINE_REVIEW_ONLY'||
     p.project!==PROJECT||p.region!=='europe-west6'||
     p.topic!==TOPIC||p.subscription!==SUB)
    return result('NO_GO','invalid_scope_or_structure');

  if(!exactly(p.make,['publisherKind','principal','oauthScope',
      'connectionState','topicIam','nativeDataEncoding']) ||
     p.make.publisherKind!=='GOOGLE_BUSINESS_OAUTH'||
     p.make.principal!=='BUSINESS_OAUTH_PRINCIPAL_TBD'||
     ![PUBSUB_SCOPE,CLOUD_SCOPE].includes(p.make.oauthScope) ||
     p.make.connectionState!=='NOT_CONNECTED'||
     p.make.nativeDataEncoding!=='UNVERIFIED'||
     !okRole(p.make.topicIam,'roles/pubsub.publisher',TOPIC,
       'BUSINESS_OAUTH_PRINCIPAL_TBD'))
    return result('NO_GO','publisher_would_be_unscoped_or_assumed_connected');

  if(!exactly(p.push,['serviceAccount','authMode','subscription',
      'targetService','invokerIam']) ||
     p.push.serviceAccount!==PUSH||
     p.push.authMode!=='PUBSUB_OIDC_PUSH_IAM'||
     p.push.subscription!==SUB||p.push.targetService!==SERVICE||
     !okRole(p.push.invokerIam,'roles/run.invoker',
       'projects/'+PROJECT+'/locations/europe-west6/services/'+SERVICE,
       'serviceAccount:'+PUSH))
    return result('NO_GO','push_invoker_not_service_scoped');

  if(!exactly(p.receiver,['project','service','ingress','urlKind',
      'requireIam','executionState','continueToMakeDocs']) ||
     p.receiver.project!==PROJECT||p.receiver.service!==SERVICE||
     p.receiver.ingress!=='internal'||
     p.receiver.urlKind!=='DEFAULT_RUN_APP_URL_TBD'||
     p.receiver.requireIam!==true||
     p.receiver.executionState!=='NOT_DEPLOYED'||
     p.receiver.continueToMakeDocs!==false)
    return result('NO_GO','receiver_exposure_or_dispatch_risk');

  if(!exactly(p.runtime,['serviceAccount','database','permissions',
      'effectiveIamVerified','quarantineAccess']) ||
     p.runtime.serviceAccount!==RUNTIME||p.runtime.database!==DB ||
     !Array.isArray(p.runtime.permissions)||
     p.runtime.permissions.slice().sort().join('|')!==
       ['datastore.entities.get','datastore.entities.create',
        'datastore.entities.update'].sort().join('|')||
     p.runtime.effectiveIamVerified!==false||
     p.runtime.quarantineAccess!==false)
    return result('NO_GO','runtime_database_scope_unverified_or_broad');

  if(!exactly(p.serviceAgent,['tokenPermissionState','grantScope',
      'preexistingRoleVerified','pushInvokerServiceAccount']) ||
     p.serviceAgent.tokenPermissionState!=='READ_ONLY_AUDIT_PENDING'||
     p.serviceAgent.grantScope!=='NO_NEW_GRANT'||
     p.serviceAgent.preexistingRoleVerified!==false||
     p.serviceAgent.pushInvokerServiceAccount!==PUSH)
    return result('NO_GO','service_agent_token_grant_not_reviewed');

  // A consistent plan can never be treated as permissions or production GO.
  return result('CONSISTENT_OFFLINE_PLAN_ONLY',
    'oauth_connection_scopes_iam_service_agent_ingress_and_encoding_unverified');
}
export function syntheticPubsubIamDesignFixture(){
  return {
    schemaVersion:1,mode:'OFFLINE_REVIEW_ONLY',
    project:PROJECT,region:'europe-west6',topic:TOPIC,subscription:SUB,
    make:{
      publisherKind:'GOOGLE_BUSINESS_OAUTH',
      principal:'BUSINESS_OAUTH_PRINCIPAL_TBD',
      oauthScope:PUBSUB_SCOPE,
      connectionState:'NOT_CONNECTED',
      topicIam:{role:'roles/pubsub.publisher',scope:TOPIC,
        member:'BUSINESS_OAUTH_PRINCIPAL_TBD'},
      nativeDataEncoding:'UNVERIFIED'
    },
    push:{
      serviceAccount:PUSH,authMode:'PUBSUB_OIDC_PUSH_IAM',
      subscription:SUB,targetService:SERVICE,
      invokerIam:{
        role:'roles/run.invoker',
        scope:'projects/'+PROJECT+'/locations/europe-west6/services/'+SERVICE,
        member:'serviceAccount:'+PUSH
      }
    },
    receiver:{
      project:PROJECT,service:SERVICE,ingress:'internal',
      urlKind:'DEFAULT_RUN_APP_URL_TBD',requireIam:true,
      executionState:'NOT_DEPLOYED',continueToMakeDocs:false
    },
    runtime:{
      serviceAccount:RUNTIME,database:DB,
      permissions:['datastore.entities.get','datastore.entities.create',
        'datastore.entities.update'],
      effectiveIamVerified:false,quarantineAccess:false
    },
    serviceAgent:{
      tokenPermissionState:'READ_ONLY_AUDIT_PENDING',
      grantScope:'NO_NEW_GRANT',preexistingRoleVerified:false,
      pushInvokerServiceAccount:PUSH
    }
  };
}
