#!/usr/bin/env bash
# LSZH Cloud Shell – no-write, no-token, read-only diagnostics.
# Purpose: explain why the user's optional gcloud impersonation could fail.
# DO NOT create IAM bindings, change APIs, generate access tokens, deploy or touch data.
set -euo pipefail

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
SA='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'

for tool in gcloud python3; do
  command -v "$tool" >/dev/null || { echo "STOP: Missing $tool"; exit 2; }
done
current_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
current_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$current_account" != "$ACCOUNT" || "$current_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong LSZH business account or Cloud project.'
  exit 2
fi
gcloud iam service-accounts describe "$SA" --project="$PROJECT" \
  --format='value(email)' >/dev/null
echo 'PASS: Business identity, project, and dedicated STAGING service account.'

echo 'Checking whether the IAM Service Account Credentials API is enabled...'
enabled="$(gcloud services list --enabled --project="$PROJECT" --format='value(config.name)')"
if printf '%s\n' "$enabled" | grep -Fxq 'iamcredentials.googleapis.com'; then
  echo 'PASS: iamcredentials.googleapis.com is enabled.'
else
  echo 'POSSIBLE CAUSE: iamcredentials.googleapis.com is not enabled in this project.'
  echo 'NO API changes made. Do not enable anything without a separate decision.'
fi

echo 'Examining exact service-account IAM allow-policy (metadata only)...'
if gcloud iam service-accounts get-iam-policy "$SA" --project="$PROJECT" \
  --format=json | python3 -c '
import json,sys
policy=json.load(sys.stdin)
person="user:lars@lszh-automations.ch"
roles=sorted({b.get("role","") for b in policy.get("bindings",[])
              if person in b.get("members",[])})
if "roles/iam.serviceAccountTokenCreator" in roles:
    print("PASS: Direct Token Creator binding for business user exists on this service account.")
else:
    print("NOTE: No directly assigned Token Creator role for business user on service-account policy.")
print("NOTE: Group, custom-role and inherited grants are not evaluated by this check.")
'; then
  :
else
  echo 'UNVERIFIED: Could not read this service account IAM policy.'
  exit 2
fi

echo 'Examining only project-level IAM roles for this business user...'
if gcloud projects get-iam-policy "$PROJECT" --format=json | python3 -c '
import json,sys
policy=json.load(sys.stdin)
person="user:lars@lszh-automations.ch"
roles=sorted({b.get("role","") for b in policy.get("bindings",[])
              if person in b.get("members",[])})
if "roles/iam.serviceAccountTokenCreator" in roles:
    print("NOTE: Project-level Token Creator role appears for business user.")
else:
    print("NOTE: No direct project-level Token Creator role for business user found.")
print("NOTE: Other/custom/group/folder/organization permissions are not proven absent.")
'; then
  :
else
  echo 'UNVERIFIED: Project IAM policy read failed.'
  exit 2
fi

echo 'READ-ONLY RESULT: No tokens generated, API/IAM settings changed,'
echo 'Firestore data accessed, or Cloud Run services changed.'
echo 'NEXT: Prefer an approved, one-off Cloud Run runtime-identity probe rather'
echo 'than assigning broad or permanent Token Creator rights for this test.'
