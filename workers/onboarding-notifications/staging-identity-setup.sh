#!/usr/bin/env bash
# Safe opt-in: run without arguments for a read-only plan.
# --apply: creates a dedicated STAGING service identity if absent and
# grants an IAM Condition scoped to the EXISTING named Firestore database.
# Never creates keys, databases, repositories, Cloud Run services, or schedules.
set -euo pipefail
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
SA_ID='lszh-onboarding-outbox-staging'
SA_EMAIL="${SA_ID}@${PROJECT}.iam.gserviceaccount.com"
DATABASE='lszh-offers-staging'
CONDITION='expression=resource.name=="projects/lszh-automations/databases/lszh-offers-staging",title=LSZHOutboxSyntheticStaging,description=Restricted to existing named Zurich staging database'

active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong active business account or Cloud project.'
  exit 2
fi
if ! gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" \
    --format='value(name)' >/dev/null; then
  echo 'STOP: Existing named Firestore database is not accessible.'
  exit 2
fi
if ! gcloud artifacts repositories describe cloud-run-source-deploy --project="$PROJECT" \
    --location=europe-west6 --format='value(name)' >/dev/null; then
  echo 'STOP: Expected existing Zurich artifact repository not accessible.'
  exit 2
fi
echo 'PASS: Account, project, existing named database and registry.'
echo "Service identity: ${SA_EMAIL}"
echo "Scope: only Firestore database projects/${PROJECT}/databases/${DATABASE}"
echo "WARNING: Firestore IAM scope is DATABASE-WIDE, not collection-specific."
echo 'No mail sends, Cloud Run deployment, or customer data actions.'

if [[ "${1:-}" != '--apply' ]]; then
  echo 'PLAN ONLY: No changes made. Pass --apply to explicitly authorize STAGING IAM changes.'
  exit 0
fi
if [[ "$#" -ne 1 ]]; then echo 'STOP: Unsupported arguments';exit 2;fi
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" \
    --format='value(email)' >/dev/null 2>&1; then
  echo 'Creating dedicated STAGING service account (no keys)...'
  gcloud iam service-accounts create "$SA_ID" --project="$PROJECT" \
     --display-name='LSZH Outbox synthetic STAGING'
fi
echo 'Applying database-scoped Firestore IAM condition...'
gcloud projects add-iam-policy-binding "$PROJECT" \
 --member="serviceAccount:${SA_EMAIL}" \
 --role='roles/datastore.user' \
 --condition="$CONDITION" >/dev/null

echo "PASS: STAGING identity/IAM configuration command completed for ${SA_EMAIL}"
echo 'No Cloud Run service or private key was created; no data was written.'
