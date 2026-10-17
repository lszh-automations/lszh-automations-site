#!/usr/bin/env bash
# LSZH: dedicated quarantine IAM resources. --plan reads metadata ONLY.
# --apply-once is restricted to explicitly approved SA, custom role and
# one DATABASE-scoped IAM condition; never creates keys/Cloud Run jobs or data.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
DB='lszh-quarantine-staging'
SA_ID='lszh-quarantine-cas-stg'
SA='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com'
ROLE_ID='lszhQuarantineCasStaging'
ROLE='projects/lszh-automations/roles/lszhQuarantineCasStaging'
PERMS='datastore.entities.create,datastore.entities.get,datastore.entities.update'
CONDITION='expression=resource.name=="projects/lszh-automations/databases/lszh-quarantine-staging",title=LSZHQuarantineCASStaging,description=Quarantine staging database only'
APPROVAL='I_APPROVE_LSZH_QUARANTINE_SA_CUSTOM_ROLE_AND_CONDITIONAL_IAM'
MODE='--plan'
if [[ $# -gt 0 ]]; then MODE="$1"; fi
if [[ $# -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--apply-once' ) ]];then
 echo 'STOP: Only --plan or --apply-once accepted.';exit 2
fi
for cmd in git gcloud node mktemp;do
 command -v "$cmd" >/dev/null || { echo 'STOP: Required tool unavailable.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Reviewed Git checkout unavailable.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Wrong, dirty, or unsynchronized review branch.';exit 2
fi
ACTIVE="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
SELECTED="$(gcloud config get-value project 2>/dev/null)"
if [[ "$ACTIVE" != "$ACCOUNT" || "$SELECTED" != "$PROJECT" ]];then
 echo 'STOP: Wrong active LSZH account or project.';exit 2
fi
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
# No action on incomplete inventory; do not hide authorization errors as NOT_FOUND.
if ! gcloud firestore databases describe --project="$PROJECT" --database="$DB" --format=json >"$WORK/database.json" 2>/dev/null;then
 echo 'BLOCKED: Dedicated Firestore database unreadable.';exit 2
fi
if ! gcloud iam service-accounts list --project="$PROJECT" --format=json >"$WORK/serviceAccounts.json" 2>/dev/null;then
 echo 'BLOCKED: Cannot inventory service identities.';exit 2
fi
if ! gcloud iam roles list --project="$PROJECT" --format=json >"$WORK/customRoles.json" 2>/dev/null;then
 echo 'BLOCKED: Cannot inventory custom roles.';exit 2
fi
if ! gcloud projects get-iam-policy "$PROJECT" --format=json >"$WORK/projectPolicy.json" 2>/dev/null;then
 echo 'BLOCKED: Cannot read project-level IAM policy.';exit 2
fi
if ! node - "$WORK" <<'NODE'
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {assessBefore}=require('./workers/onboarding-notifications/quarantine-iam-provisioning');
try{
 const p=process.argv[2],read=n=>JSON.parse(fs.readFileSync(path.join(p,n+'.json'),'utf8'));
 const r=assessBefore({
  database:read('database'),serviceAccounts:read('serviceAccounts'),
  customRoles:read('customRoles'),projectPolicy:read('projectPolicy')
 });
 if(r.status!=='CREATE_METADATA_PRECONDITIONS_PASS_ONLY'){
  for(const f of r.findings)console.log('BLOCKED: '+f);
  process.exitCode=2;
 }else console.log('PASS: Dedicated Zurich database with deletion protection; new SA/role/binding not present.');
}catch{console.log('BLOCKED: Metadata parsing or review failed.');process.exitCode=2;}
NODE
then
 exit 2
fi
echo 'SCOPE: New quarantine SA, exactly 3 entity permissions, one database condition.'
echo 'LIMIT: IAM is database-wide, not collection-wide. No other databases granted.'
echo 'NOT INCLUDED: Cloud Run, keys, token impersonation, Firestore data, mail or production.'
if [[ "$MODE" == '--plan' ]];then
 echo 'PLAN ONLY: Zero cloud changes. Explicitly authorized one-time setup is separate.'
 exit 0
fi
if [[ "$(printenv LSZH_QUARANTINE_IAM_PROVISIONING_APPROVAL 2>/dev/null || true)" != "$APPROVAL" ]];then
 echo 'STOP: Exact explicit quarantine IAM provisioning approval flag missing.';exit 2
fi
echo 'APPROVED: Creating separate keyless quarantine service identity once.'
if ! gcloud iam service-accounts create "$SA_ID" --project="$PROJECT" \
 --display-name='LSZH Quarantine CAS STAGING' --quiet >"$WORK/sa-create.txt" 2>"$WORK/sa-error.txt";then
 echo 'UNVERIFIED: Service identity creation failed or timed out. DO NOT RETRY.';exit 2
fi
if ! gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json >"$WORK/sa.json" 2>/dev/null;then
 echo 'UNVERIFIED: New service identity cannot be read back. DO NOT RETRY.';exit 2
fi
if ! node - "$WORK/sa.json" <<'NODE'
'use strict';
try {
 const d=require(process.argv[2]);
 if(d.email!=='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com' ||
    d.disabled===true)throw Error('wrong');
 console.log('PASS: New quarantine service identity matches approved name.');
}catch{console.log('UNVERIFIED: Service identity metadata mismatch.');process.exitCode=2;}
NODE
then
 exit 2
fi
echo 'APPROVED: Creating exactly one minimal project custom role.'
if ! gcloud iam roles create "$ROLE_ID" --project="$PROJECT" \
 --title='LSZH Quarantine CAS Staging' \
 --description='Dedicated named Firestore quarantine staging database entity GET, CREATE and UPDATE only' \
 --permissions="$PERMS" --stage=GA --quiet >"$WORK/role-create.txt" 2>"$WORK/role-error.txt";then
 echo 'UNVERIFIED: Custom role creation failed or timed out. DO NOT RETRY.';exit 2
fi
if ! gcloud iam roles describe "$ROLE_ID" --project="$PROJECT" --format=json >"$WORK/role.json" 2>/dev/null;then
 echo 'UNVERIFIED: Custom role cannot be read back. DO NOT RETRY.';exit 2
fi
if ! node - "$WORK/role.json" <<'NODE'
'use strict';
try{
 const d=require(process.argv[2]),p=[
  'datastore.entities.create','datastore.entities.get','datastore.entities.update'
 ];
 if(d.name!=='projects/lszh-automations/roles/lszhQuarantineCasStaging' ||
    d.stage!=='GA' || !Array.isArray(d.includedPermissions) ||
    d.includedPermissions.length!==3 ||
    !p.every(x=>d.includedPermissions.includes(x)))throw Error('wrong');
 console.log('PASS: Custom role exactly matches the 3 approved permissions.');
}catch{console.log('UNVERIFIED: Custom role metadata mismatch.');process.exitCode=2;}
NODE
then
 exit 2
fi
# Exactly one IAM change. No IAM Editor, Owner, datastore.user or unconditioned role.
echo 'APPROVED: Applying one database-conditioned custom role binding.'
if ! gcloud projects add-iam-policy-binding "$PROJECT" \
 --member="serviceAccount:$SA" --role="$ROLE" --condition="$CONDITION" --quiet \
 >"$WORK/binding-create.txt" 2>"$WORK/binding-error.txt";then
 echo 'UNVERIFIED: IAM binding failed or timed out. DO NOT RETRY.';exit 2
fi
if ! gcloud projects get-iam-policy "$PROJECT" --format=json >"$WORK/postPolicy.json" 2>/dev/null ||
   ! gcloud iam service-accounts keys list --iam-account="$SA" --project="$PROJECT" \
      --managed-by=user --format=json >"$WORK/keys.json" 2>/dev/null;then
 echo 'UNVERIFIED: Post-IAM policy/key metadata unavailable. DO NOT RETRY.';exit 2
fi
if ! node - "$WORK" <<'NODE'
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {assessAfter}=require('./workers/onboarding-notifications/quarantine-iam-provisioning');
try{
 const folder=process.argv[2],read=n=>JSON.parse(fs.readFileSync(path.join(folder,n+'.json'),'utf8'));
 const keys=read('keys');
 const r=assessAfter({
  database:read('database'),serviceAccount:read('sa'),
  customRole:read('role'),projectPolicy:read('postPolicy'),
  userManagedKeyNames:Array.isArray(keys)?keys.map(k=>k?.name):null
 });
 if(r.status!=='IAM_METADATA_VERIFIED'){
  for(const f of r.findings)console.log('UNVERIFIED: '+f);
  process.exitCode=2;
 }else{
  console.log('PASS: Exact quarantine SA, minimal custom role, single DB-scoped IAM condition.');
  console.log('PASS: No user-managed service account keys detected.');
  console.log('LIMIT: Inherited IAM and effective Firestore access are NOT verified.');
  console.log('PASS: No runtime deployment or document write performed.');
 }
}catch{console.log('UNVERIFIED: Post-IAM validation failed.');process.exitCode=2;}
NODE
then
 exit 2
fi
echo 'DONE: One isolated quarantine IAM setup completed; DO NOT RERUN.'
echo 'Separate approval required before any Firestore write, deploy, or activation.'
