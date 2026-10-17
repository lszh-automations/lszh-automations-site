#!/usr/bin/env bash
# LSZH quarantine-CAS IAM: exact metadata-only staging readiness inspection.
# No IAM grants, Cloud Run executions, impersonation, Firestore GET/POST or secrets.
set -euo pipefail
set +x
PROJECT='lszh-automations'
BRANCH='feature/onboarding-notification-outbox-20261016'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
DB='lszh-quarantine-staging'
SA="lszh-quarantine-cas-stg@${PROJECT}.iam.gserviceaccount.com"
ROLE_ID='lszhQuarantineCasStaging'
if [[ "$#" -gt 1 || ( "$#" -eq 1 && "$1" != '--plan' ) ]]; then
  echo 'STOP: Only --plan (default) is accepted.';exit 2
fi
for cmd in git gcloud node mktemp; do
  command -v "$cmd" >/dev/null || { echo 'STOP: A required read-only tool is missing.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in the reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
  echo 'STOP: Wrong Git branch, dirty checkout or remote revision mismatch.';exit 2
fi
ACTIVE="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
SELECTED="$(gcloud config get-value project 2>/dev/null)"
if [[ "$ACTIVE" != "$ACCOUNT" || "$SELECTED" != "$PROJECT" ]]; then
 echo 'STOP: Wrong company identity or Cloud project.';exit 2
fi
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
if ! gcloud firestore databases describe --project="$PROJECT" --database="$DB" --format=json > "$WORK/db.json" 2>/dev/null; then
  echo 'BLOCKED: Dedicated quarantine STAGING database absent or inaccessible. No database created.';exit 2
fi
if ! gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json > "$WORK/sa.json" 2>/dev/null; then
  echo 'BLOCKED: Separate quarantine STAGING service identity absent or inaccessible. No identity created.';exit 2
fi
if ! gcloud iam roles describe "$ROLE_ID" --project="$PROJECT" --format=json > "$WORK/role.json" 2>/dev/null; then
  echo 'BLOCKED: Dedicated minimal custom IAM role absent or inaccessible. No role created.';exit 2
fi
if ! gcloud projects get-iam-policy "$PROJECT" --format=json > "$WORK/policy.json" 2>/dev/null; then
  echo 'STOP: Project IAM policy metadata inaccessible.';exit 2
fi
# Input files contain only metadata; never print raw JSON, keys, access tokens,
# emails, policy bindings or secret values.
node - "$WORK" <<'NODE'
'use strict';
const fs=require('node:fs');
const p=require('node:path');
const {assessQuarantineIam}=require('./workers/onboarding-notifications/quarantine-iam-plan');
const home=process.argv[2];
try{
 const read=n=>JSON.parse(fs.readFileSync(p.join(home,n),'utf8'));
 const result=assessQuarantineIam({
  database:read('db.json'),serviceAccount:read('sa.json'),
  customRole:read('role.json'),projectPolicy:read('policy.json')
 });
 if(result.status!=='METADATA_MATCH_ONLY'){
  for(const code of result.findings)console.log('BLOCKED: '+code);
  console.log('No permission changes or Firestore activity performed.');
  process.exitCode=2;
 }else{
  console.log('PASS: Dedicated quarantine identity metadata verified.');
  console.log('PASS: Exact 3-permission role and one database-conditioned IAM binding.');
  console.log('LIMIT: Database-level access, NOT collection-specific isolation.');
  console.log('LIMIT: Inherited permissions, effective REST access and service-account keys not independently verified.');
  console.log('PLAN ONLY: No IAM grants, token minting, Firestore requests or Job executions.');
 }
}catch {
 console.log('STOP: IAM metadata could not be classified safely.');
 process.exitCode=2;
}
NODE