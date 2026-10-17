import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,chmodSync,existsSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT=fileURLToPath(new URL('./staging-quarantine-handoff-provision.sh',import.meta.url));
const git=String.raw`#!/bin/sh
set -eu
case "$1 $2" in
 "rev-parse --show-toplevel") printf '%s\n' "$MOCK_ROOT";;
 "branch --show-current") echo feature/onboarding-notification-outbox-20261016;;
 "status --porcelain") exit 0;;
 "rev-parse HEAD") echo 123456abcdef123456abcdef;;
 "rev-parse refs/remotes/origin/feature/onboarding-notification-outbox-20261016") echo 123456abcdef123456abcdef;;
 "rev-parse --short=12") echo 123456abcdef;;
 *) echo unexpected_git_call >&2; exit 2;;
esac
`;
const gcloud=String.raw`#!/bin/sh
set -eu
printf '%s\n' "$*" >> "$MOCK_ROOT/actions.log"
case "$1 $2 $3" in
 "auth list "*) echo lars@lszh-automations.ch;;
 "config get-value project") echo lszh-automations;;
 "iam service-accounts describe") :;;
 "firestore databases describe") :;;
 "artifacts repositories describe") :;;
 "artifacts docker images") :;;
 "run services list")
   if [ "$MOCK_LIST_FAILURE" = yes ];then echo forbidden >&2;exit 1;fi
   if [ -f "$MOCK_ROOT/deployed" ];then
    echo '[{"metadata":{"name":"lszh-quarantine-handoff-staging"}}]'
   else
    echo '[]'
   fi;;
 "run deploy lszh-quarantine-handoff-staging")
   touch "$MOCK_ROOT/deployed"
   echo 'MOCK: New private service deployed';;
 "run services describe")
   printf '%s\n' "$MOCK_SERVICE_JSON";;
 "run services get-iam-policy")
   if [ "$MOCK_REVIEW" = yes ]; then
    printf '%s\n' '{"bindings":[{"role":"roles/run.invoker","members":["serviceAccount:lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com"]}]}'
   else
    echo '{"bindings":[]}'
   fi;;
 "secrets versions describe") echo '{"state":"ENABLED"}';;
 "secrets get-iam-policy "*) printf '%s\n' "$MOCK_SECRET_POLICY";;
 *) echo unexpected_gcloud_call >&2; exit 2;;
esac
`;
function simulate(mode,{preexisting=false,listFailure=false,badGate=false,badImage=false,
 reviewEnabled=false,badSecretRef=false,badSecretIam=false,badRevision=false}={}){
 const flags={
  LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED:badGate?(reviewEnabled?'false':'true'):(reviewEnabled?'true':'false'),
  LSZH_QUARANTINE_REPLAY_WRITE_ENABLED:reviewEnabled?'true':'false',
  LSZH_SCOPED_STAGING_READER_ENABLED:reviewEnabled?'true':'false',
  LSZH_SCOPED_READER_SCOPE:'quarantine',
  LSZH_OUTBOX_STAGE_ENABLED:'false',
  LSZH_QUARANTINE_HANDOFF_MODE:'REVIEW_ONLY',
  FIRESTORE_PROJECT_ID:'lszh-automations',
  FIRESTORE_DATABASE_ID:'lszh-quarantine-staging'
 };
 const serviceDescription={
  metadata:{name:'lszh-quarantine-handoff-staging',
   annotations:{'run.googleapis.com/ingress':'all'}},
  ...(reviewEnabled?{status:{
   latestReadyRevisionName:badRevision?'lszh-quarantine-handoff-staging-00001-qs8':
    'lszh-quarantine-handoff-staging-00002-ttf',
   traffic:[{revisionName:'lszh-quarantine-handoff-staging-00002-ttf',percent:100}]
  }}:{}),
  spec:{template:{spec:{
   serviceAccountName:'lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com',
   containers:[{
    image:badImage?'fake.registry.example/untrusted:tag':
     'europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-quarantine-handoff:staging-131d67982f83',
    env:[
     ...Object.entries(flags).map(([name,value])=>({name,value})),
     ...(reviewEnabled?[{name:'LSZH_QUARANTINE_HMAC_B64',valueFrom:{secretKeyRef:{
      name:badSecretRef?'wrong-secret':'lszh-stg-quarantine-handoff-hmac',key:'1'}}}]:[])
    ]
   }]
  }}}
 };
 const accessor=[ 
  'serviceAccount:lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com',
  'serviceAccount:lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com',
  ...(badSecretIam?['serviceAccount:unexpected@lszh-automations.iam.gserviceaccount.com']:[])
 ];
 const secretPolicy={bindings:[{role:'roles/secretmanager.secretAccessor',members:accessor}]};
 const root=mkdtempSync(join(tmpdir(),'lszh-handoff-inventory-'));
 const bin=join(root,'bin');mkdirSync(bin);
 for(const [name,source] of [['git',git],['gcloud',gcloud]]){
  writeFileSync(join(bin,name),source);chmodSync(join(bin,name),0o755);
 }
 if(preexisting)writeFileSync(join(root,'deployed'),'');
 try{
  const proc=spawnSync('bash',[SCRIPT,mode],{
   cwd:root,encoding:'utf8',timeout:15000,
   env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_ROOT:root,
    MOCK_LIST_FAILURE:listFailure?'yes':'no',
    MOCK_SERVICE_JSON:JSON.stringify(serviceDescription),
    MOCK_REVIEW:reviewEnabled?'yes':'no',
    MOCK_SECRET_POLICY:JSON.stringify(secretPolicy)}
  });
  const actions=existsSync(join(root,'actions.log'))?
   readFileSync(join(root,'actions.log'),'utf8').split('\n'):[];
  return {proc,actions,deployed:existsSync(join(root,'deployed'))};
 }finally{rmSync(root,{recursive:true,force:true});}
}
test('fresh inventory verifies a successful new deployment instead of stale pre-deploy list',()=>{
 const {proc,actions,deployed}=simulate('--deploy-private-disabled');
 assert.equal(proc.status,0,proc.stderr+'\n'+proc.stdout);
 assert.match(proc.stdout,/PASS: New disabled private Cloud Run receiver/);
 assert.equal(deployed,true);
 assert.equal(actions.filter(x=>x.startsWith('run services list')).length,2);
 assert.equal(actions.filter(x=>x.startsWith('run deploy')).length,1);
 assert.equal(actions.filter(x=>x.startsWith('run services describe')).length,1);
 assert.equal(actions.filter(x=>x.startsWith('run services get-iam-policy')).length,1);
});
test('the same deployment mode refuses to redeploy an existing receiver',()=>{
 const {proc,actions,deployed}=simulate('--deploy-private-disabled',{preexisting:true});
 assert.equal(proc.status,2);
 assert.equal(deployed,true);
 assert.match(proc.stdout,/STOP: Receiver already exists/);
 assert.equal(actions.some(x=>x.startsWith('run deploy')),false);
});
test('service inventory authorization failures stop before deployment, not treated as absence',()=>{
 const {proc,actions}=simulate('--deploy-private-disabled',{listFailure:true});
 assert.equal(proc.status,2);
 assert.match(proc.stdout,/STOP: Could not refresh Cloud Run service inventory/);
 assert.equal(actions.some(x=>x.startsWith('run deploy')),false);
});
test('subsequent plan identifies the newly existing disabled receiver without mutation',()=>{
 const {proc,actions}=simulate('--plan',{preexisting:true});
 assert.equal(proc.status,0,proc.stderr+'\n'+proc.stdout);
 assert.match(proc.stdout,/PLAN: Receiver exists/);
 assert.equal(actions.some(x=>x.startsWith('run deploy')),false);
});

test('read-only disabled verification confirms exact deployed image, gates and private IAM',()=>{
 const {proc,actions}=simulate('--verify-disabled',{preexisting:true});
 assert.equal(proc.status,0,proc.stderr+'\n'+proc.stdout);
 assert.match(proc.stdout,/PASS: New receiver exists/);
 assert.equal(actions.some(x=>x.startsWith('run deploy')||x.includes('add-iam-policy-binding')),false);
 assert.equal(actions.some(x=>x.startsWith('run services get-iam-policy')),true);
});
test('disabled verification fails closed for enabled processing gate',()=>{
 const {proc,actions}=simulate('--verify-disabled',{preexisting:true,badGate:true});
 assert.equal(proc.status,2);
 assert.match(proc.stdout,/STOP: Deployed receiver image\/disabled gates not verified/);
 assert.equal(actions.some(x=>x.startsWith('run deploy')),false);
});
test('disabled verification rejects unexpected images even with correct disabled flags',()=>{
 const {proc}=simulate('--verify-disabled',{preexisting:true,badImage:true});
 assert.equal(proc.status,2);
 assert.match(proc.stdout,/STOP: Deployed receiver image\/disabled gates not verified/);
});

test('read-only review-only verification checks actual revision and a secret reference without accessing payload',()=>{
 const {proc,actions}=simulate('--verify-review-only',{preexisting:true,reviewEnabled:true});
 assert.equal(proc.status,0,proc.stderr+'\n'+proc.stdout);
 assert.match(proc.stdout,/PASS: Expected private review-only revision/);
 assert.match(proc.stdout,/Secret payload not accessed/);
 assert.equal(actions.some(x=>x.includes('secrets versions access')),false);
 assert.equal(actions.some(x=>x.startsWith('run services update')||x.startsWith('run deploy')),false);
});
test('review-only verification blocks a missing or substituted HMAC binding',()=>{
 const {proc}=simulate('--verify-review-only',{preexisting:true,reviewEnabled:true,badSecretRef:true});
 assert.equal(proc.status,2);
 assert.match(proc.stdout,/STOP: Enabled receiver revision, image, flag or secret binding/);
});
test('review-only verification blocks additional secret accessor IAM principals',()=>{
 const {proc}=simulate('--verify-review-only',{preexisting:true,reviewEnabled:true,badSecretIam:true});
 assert.equal(proc.status,2);
 assert.match(proc.stdout,/STOP: Secret version or exact secret-level accessor IAM/);
});
test('review-only verification blocks changed revision and disabled gates',()=>{
 for(const options of [{badRevision:true},{badGate:true}]){
  const {proc}=simulate('--verify-review-only',{preexisting:true,reviewEnabled:true,...options});
  assert.equal(proc.status,2);
  assert.match(proc.stdout,/STOP: Enabled receiver revision, image, flag or secret binding/);
 }
});
