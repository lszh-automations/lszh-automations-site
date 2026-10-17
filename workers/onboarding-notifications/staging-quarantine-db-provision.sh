#!/usr/bin/env bash
# Isolated LSZH quarantine Firestore database provisioning.
# Default --plan: READ ONLY. --create-once: separate explicit billable approval.
# Never creates service accounts, IAM grants, Cloud Run jobs or documents.
set -euo pipefail
set +x
PROJECT='lszh-automations'
DB='lszh-quarantine-staging'
LOCATION='europe-west6'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
APPROVAL='I_APPROVE_LSZH_QUARANTINE_STAGING_BILLABLE_DATABASE_CREATION'
MODE='--plan'
if [[ $# -gt 0 ]]; then MODE="$1"; fi
if [[ $# -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--create-once' ) ]]; then
 echo 'STOP: Allowed: --plan or --create-once only.';exit 2
fi
for cmd in gcloud git node mktemp bash;do
 command -v "$cmd" >/dev/null || { echo 'STOP: Required tool missing.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Git checkout missing.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Expected a clean, synced review branch.';exit 2
fi
ACTIVE="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
SELECTED="$(gcloud config get-value project 2>/dev/null)"
if [[ "$ACTIVE" != "$ACCOUNT" || "$SELECTED" != "$PROJECT" ]];then
 echo 'STOP: Wrong LSZH business identity or Cloud project.';exit 2
fi
# Re-evaluate billing/API/DB-count/custom-role preconditions using only reads.
bash workers/onboarding-notifications/staging-quarantine-provisioning-readiness.sh --plan
echo 'PLAN: Exact database lszh-quarantine-staging; Standard, Firestore Native, Zurich europe-west6.'
echo 'PLAN: Deletion protection enabled; existing offers staging unchanged.'
echo 'COST: Extra named Firestore database has usage billing and no own free tier.'
echo 'NOT INCLUDED: Service account, custom role, IAM, data write, deployment or email.'
if [[ "$MODE" == '--plan' ]];then
 echo 'PLAN ONLY: No Cloud resources changed. Separate explicit approval is needed.'
 exit 0
fi
# A deliberate explicit approval string is additionally required on the only
# mutating path; do not give users an execute command before they consent.
APPROVAL_ACTUAL="$(printenv LSZH_QUARANTINE_DB_CREATION_APPROVAL 2>/dev/null || true)"
if [[ "$APPROVAL_ACTUAL" != "$APPROVAL" ]];then
 echo 'STOP: Exact separate billable database creation approval is missing.';exit 2
fi
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
# Fresh final read, so two invocations cannot silently change an existing DB.
if ! gcloud firestore databases list --project="$PROJECT" --format=json > "$WORK/list.json" 2>/dev/null;then
 echo 'STOP: Could not reverify database inventory; nothing created.';exit 2
fi
if ! node - "$WORK/list.json" <<'NODE'
'use strict';
const fs=require('node:fs');
try{
 const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 if(!Array.isArray(data) ||
   data.length>=100 ||
   data.some(d=>d?.name==='projects/lszh-automations/databases/lszh-quarantine-staging') ||
   !data.some(d=>d?.name==='projects/lszh-automations/databases/lszh-offers-staging' &&
     d.locationId==='europe-west6' && ['FIRESTORE_NATIVE','FIRESTORE_NATIVE_MODE'].includes(d.type)))
  throw Error('inventory_invalid');
 console.log('PASS: Final database inventory allows isolated creation.');
}catch{
 console.log('STOP: Final inventory invalid, full or target already exists.');
 process.exitCode=2;
}
NODE
then
 exit 2
fi
echo 'APPROVED CREATION PATH: One Firestore database create attempt.'
if ! gcloud firestore databases create \
 --project="$PROJECT" --database="$DB" --location="$LOCATION" \
 --edition=standard --type=firestore-native --delete-protection --quiet \
 >"$WORK/create.stdout" 2>"$WORK/create.stderr";then
 echo 'UNVERIFIED: Create returned an error or timed out. DO NOT RETRY.'
 echo 'READ ONLY NEXT: Independently describe the exact intended database.'
 exit 2
fi
if ! gcloud firestore databases describe \
 --project="$PROJECT" --database="$DB" --format=json >"$WORK/describe.json" 2>/dev/null;then
 echo 'UNVERIFIED: Create success but database describe failed. DO NOT RETRY.'
 exit 2
fi
if ! node - "$WORK/describe.json" <<'NODE'
'use strict';
const fs=require('node:fs');
try{
 const d=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 if(d.name!=='projects/lszh-automations/databases/lszh-quarantine-staging' ||
    d.locationId!=='europe-west6' ||
    !['FIRESTORE_NATIVE','FIRESTORE_NATIVE_MODE'].includes(d.type) ||
    d.deleteProtectionState!=='DELETE_PROTECTION_ENABLED' ||
    (d.edition!==undefined && d.edition!=='STANDARD'))
  throw Error('postcreate_mismatch');
 console.log('PASS: Exact Zurich Native database and deletion protection verified.');
}catch{
 console.log('UNVERIFIED: Created database metadata differs from reviewed configuration. DO NOT RETRY.');
 process.exitCode=2;
}
NODE
then
 exit 2
fi
echo 'PASS: Exactly one billable isolated staging database created; no IAM/data changes.'
echo 'DO NOT RERUN. Service account, role, IAM and writes need separate approvals.'
