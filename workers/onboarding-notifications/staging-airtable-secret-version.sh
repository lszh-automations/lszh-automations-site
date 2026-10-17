#!/usr/bin/env bash
# LSZH Airtable STAGING: plan-first ONE secret version upload from hidden TTY input.
# Does not assign IAM, run Cloud Run, access existing payloads, or touch CRM.
set -euo pipefail
set +x
umask 077
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
SECRET='lszh-airtable-readonly-staging'
MODE="${1:---plan}"

if [[ "$#" -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--add-once' ) ]]; then
  echo 'STOP: Allowed: --plan (default), --add-once.'; exit 2
fi
for cmd in gcloud git python3; do
  command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd"; exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in a Git checkout.'; exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
  echo 'STOP: Wrong branch, modified source tree or origin mismatch.'; exit 2
fi
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong business account or GCP project.'; exit 2
fi
# Independent metadata check also verifies the correct named secret belongs
# to this project's independently retrieved project number and one Zurich replica.
bash workers/onboarding-notifications/staging-airtable-secret-diagnose.sh
# A second immediate, machine-readable check rejects nonempty or malformed lists.
before="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='json(name,state)')" ||
  { echo 'STOP: Secret version inventory failed.'; exit 2; }
if ! printf '%s\n' "$before" | python3 -c '
import json,sys
try:
 versions=json.load(sys.stdin)
 if not isinstance(versions,list) or versions: raise ValueError("nonempty")
except (ValueError,TypeError):
 print("STOP: Secret does not have precisely zero versions.");sys.exit(2)
print("PASS: Secret has zero versions immediately before requested operation.")
'; then
  exit 2
fi

echo 'PASS: Verified unchanged business source, Zurich-only secret and zero versions.'
echo 'Only the read-only Airtable PAT for LSZH Website CRM may be entered.'
echo 'No IAM grants, Cloud Run jobs, Firestore writes, messages or customer changes.'
if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: No credential requested or stored, no secret version created.'
  exit 0
fi
if [[ ! -t 0 ]]; then
  echo 'STOP: Private interactive Cloud Shell terminal required.'; exit 2
fi
echo 'Enter your Airtable PAT with ONLY data.records:read scoped to LSZH Website CRM.'
echo 'Do not paste PAT in ChatGPT, GitHub, gcloud command arguments or shell history.'
token=''
trap 'unset token' EXIT
if ! IFS= read -r -s -p 'Airtable read-only PAT (hidden): ' token; then
  printf '\n'
  echo 'STOP: Secret entry cancelled.'; exit 2
fi
printf '\n'
if [[ "${#token}" -lt 20 || "${#token}" -gt 512 ||
      "$token" =~ [[:space:]] || "$token" != pat* ]]; then
  echo 'STOP: Expected valid Airtable PAT format; no version uploaded.'
  exit 2
fi
# Exactly ONE mutation. The value exists in local Bash memory and travels via
# ephemeral stdin pipe, never CLI argv/env/file/GitHub or printed output.
if ! printf '%s' "$token" | gcloud secrets versions add "$SECRET" \
   --project="$PROJECT" --data-file=- --quiet --format='value(name)' >/dev/null; then
  echo 'STOP: Version add command failed or ambiguous. DO NOT RETRY; run read-only diagnostics.'
  exit 2
fi
unset token
# No payload access: only one new ENABLED version should exist.
after="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='json(name,state)')" ||
 { echo 'STOP: Version was sent but post-write inventory failed. Do not retry.'; exit 2; }
if ! printf '%s\n' "$after" | python3 -c '
import json,sys
try:
 items=json.load(sys.stdin)
 if not isinstance(items,list) or len(items)!=1: raise ValueError("not one")
 v=items[0]
 if str(v.get("name","")).rsplit("/",1)[-1]!="1" or v.get("state")!="ENABLED":
  raise ValueError("unexpected version or state")
except (ValueError,TypeError,AttributeError):
 print("STOP: Secret version written, but version 1 ENABLED not verified. Never retry blindly.")
 sys.exit(2)
print("PASS: Exactly one ENABLED STAGING secret version (1) verified; payload not read.")
'; then exit 2; fi
echo 'PASS: Airtable PAT was stored once in Secret Manager without plaintext logs or files.'
echo 'STOP HERE: Service-account SecretAccessor IAM and Cloud Run deployment are separate gates.'
