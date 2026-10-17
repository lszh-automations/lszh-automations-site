#!/usr/bin/env bash
# LSZH: isolated Cloud Run STAGING Airtable-read identity. Plan by default.
# --create-identity creates only one NEW service account, WITHOUT IAM grants,
# keys, secrets, images, jobs, deploys, writes, or customer data operations.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
IDENTITY='lszh-airtable-read-stg'
SA="${IDENTITY}@${PROJECT}.iam.gserviceaccount.com"
SECRET='lszh-airtable-readonly-staging'
JOB='lszh-airtable-read-probe-staging'
MODE="${1:---plan}"

if [[ "$#" -gt 1 || "$MODE" != '--plan' && "$MODE" != '--create-identity' ]]; then
  echo 'STOP: Allowed: --plan (default), --create-identity.'
  exit 2
fi
for c in gcloud git; do command -v "$c" >/dev/null || {
  echo "STOP: Missing $c";exit 2;
}; done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
  echo 'STOP: Wrong branch, dirty checkout or branch differs from origin.'
  exit 2
fi

active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong business account or GCP project.'
  exit 2
fi

# Enumerating complete collections fails closed on IAM errors: no 403-as-404.
accounts="$(gcloud iam service-accounts list --project="$PROJECT" --format='value(email)')" ||
  { echo 'STOP: Cannot enumerate service accounts.';exit 2; }
secrets="$(gcloud secrets list --project="$PROJECT" --format='value(name)')" ||
  { echo 'STOP: Cannot enumerate Secret Manager metadata.';exit 2; }
jobs="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" ||
  { echo 'STOP: Cannot enumerate Cloud Run jobs.';exit 2; }
existing_identity=false
existing_secret=false
existing_job=false
if printf '%s\n' "$accounts" | grep -Fxq "$SA"; then existing_identity=true; fi
if printf '%s\n' "$secrets" | grep -Eq "(^|/)$SECRET$"; then existing_secret=true; fi
if printf '%s\n' "$jobs" | grep -Eq "(^|/)$JOB$"; then existing_job=true; fi

echo 'PASS: LSZH company identity, clean pinned branch and read-only metadata enumeration.'
echo "Proposed service account: $SA"
echo "Proposed separate job: $JOB"
echo 'No Firestore role, no emails, no production service changes and no customer records.'
echo "Existing resources (identity/secret/job): $existing_identity/$existing_secret/$existing_job"

if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: no IAM grant, new service account, secret, image, job or execution.'
  exit 0
fi
if [[ "$existing_identity" == true || "$existing_secret" == true || "$existing_job" == true ]]; then
  echo 'STOP: Some named resources already exist; require an independent audit, never overwrite.'
  exit 2
fi
echo 'Creating only a brand-new dedicated STAGING service account; no role or key granted.'
gcloud iam service-accounts create "$IDENTITY" --project="$PROJECT" \
  --display-name='LSZH Airtable one-GET STAGING read probe only' --quiet
actual="$(gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format='value(email)')"
if [[ "$actual" != "$SA" ]]; then
  echo 'STOP: Service-account creation could not be verified.'
  exit 2
fi
echo 'PASS: Dedicated staging Airtable-read service account exists, with NO new IAM grants.'
echo 'STOP HERE: Secret creation, IAM secret access, job deployment and execution require separate gated steps.'
