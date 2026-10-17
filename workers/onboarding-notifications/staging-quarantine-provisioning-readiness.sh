#!/usr/bin/env bash
# Read-only inventory for separate LSZH quarantine named Firestore STAGING.
# No resource creation, role grant, API enable, token minting or document access.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
[[ "$#" -eq 0 || ( "$#" -eq 1 && "$1" == '--plan' ) ]] ||
 { echo 'STOP: Only --plan is allowed.';exit 2; }
for cmd in git gcloud node mktemp;do
 command -v "$cmd" >/dev/null || { echo 'STOP: Required tool missing.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Git repository not found.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
 [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
 [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Expected synced, clean quarantine review branch.';exit 2
fi
ACTIVE="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)"
SELECTED="$(gcloud config get-value project 2>/dev/null)"
if [[ "$ACTIVE" != "$ACCOUNT" || "$SELECTED" != "$PROJECT" ]];then
 echo 'STOP: Wrong LSZH business account or project.';exit 2
fi
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
if ! gcloud billing projects describe "$PROJECT" --format=json > "$WORK/billing.json" 2>/dev/null;then
 echo 'BLOCKED: Billing status inaccessible; do not create a paid named database.';exit 2
fi
if ! gcloud services list --enabled --project="$PROJECT" --format=json > "$WORK/services.json" 2>/dev/null;then
 echo 'BLOCKED: Enabled API inventory inaccessible.';exit 2
fi
if ! gcloud firestore databases list --project="$PROJECT" --format=json > "$WORK/databases.json" 2>/dev/null;then
 echo 'BLOCKED: Cannot verify existing Firestore databases and target absence.';exit 2
fi
if ! gcloud iam list-testable-permissions \
 "//cloudresourcemanager.googleapis.com/projects/$PROJECT" --format=json > "$WORK/permissions.json" 2>/dev/null;then
 echo 'BLOCKED: Cannot confirm custom-role compatibility for Firestore entity permissions.';exit 2
fi
# Do not print raw billing references, IAM data, tokens, database listings, or
# permission inventories. Delete temporary metadata at process exit.
node - "$WORK" <<'NODE'
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {assessReadiness}=require('./workers/onboarding-notifications/quarantine-provisioning-readiness');
try{
 const folder=process.argv[2],read=name=>JSON.parse(fs.readFileSync(path.join(folder,name+'.json'),'utf8'));
 const result=assessReadiness({
  billing:read('billing'),services:read('services'),
  databases:read('databases'),permissions:read('permissions')
 });
 if(result.status==='BLOCKED'){
  for(const reason of result.findings)console.log('BLOCKED: '+reason);
  process.exitCode=2;
 }else{
  console.log('PASS: Billing active, Firestore API enabled, existing Zurich staging recognized.');
  console.log('PASS: Separate quarantine database not present and project DB count below 100.');
  console.log('PASS: Three requested Firestore permissions are eligible for a GA custom role.');
  console.log('METADATA ONLY: Creation rights and effective IAM grants NOT confirmed.');
  console.log('COST: Extra named database is usage-billed and has no free tier.');
  console.log('NO APPROVAL: Database, service account, IAM role and write test remain unapproved.');
 }
}catch{
 console.log('STOP: Metadata classification failed; no changes made.');
 process.exitCode=2;
}
NODE
echo 'READ ONLY: No cloud resources, IAM policy, database documents or credentials changed.'
