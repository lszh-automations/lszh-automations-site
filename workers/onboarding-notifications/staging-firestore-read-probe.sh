#!/usr/bin/env bash
# LSZH Cloud STAGING: controlled Firestore IAM read probe with a short-lived
# IMPERSONATED service-account token. No keys, no data writes, no deployments.
#
# Default (--plan): only checks existing resources via user's gcloud identity.
# --probe-read: explicit approval to attempt impersonation and TWO fixed GETs:
#    1. metadata for the named STAGING database
#    2. known-never-created document in the outbox STAGING collection
# Response bodies and credentials are NEVER displayed or saved in files.
# Exit 2 on any unresolved permission or unexpected HTTP response.
set -euo pipefail

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
DATABASE='lszh-offers-staging'
SA="lszh-onboarding-outbox-staging@${PROJECT}.iam.gserviceaccount.com"
REGION='europe-west6'
SERVICE='lszh-onboarding-outbox-staging'
COLLECTION='lszh_onboarding_notification_drafts_staging'
# Intentional nonexistent ID: this script NEVER creates anything.
PROBE_ID='lszh_readonly_probe_no_document_created_20261016'
BASE_URL="https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${DATABASE}"
MODE="${1:---plan}"

if [[ "$#" -gt 1 || "$MODE" != '--plan' && "$MODE" != '--probe-read' ]]; then
  echo 'STOP: Use --plan (read-only preflight) or --probe-read (explicit impersonated GET).'
  exit 2
fi
for cmd in gcloud curl; do
  command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd"; exit 2; }
done
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong business account or Google Cloud project.'
  exit 2
fi
gcloud iam service-accounts describe "$SA" --project="$PROJECT" \
  --format='value(email)' >/dev/null
gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" \
  --format='value(name)' >/dev/null

echo 'PASS: Correct business identity, target database and STAGING service account.'
echo 'Probe scope: exactly two GET calls to the named STAGING Firestore database.'
echo 'Data path: only the exact nonexistent document in the staging outbox collection.'
echo 'No body printed; no secrets, keys, IAM grants, writes, deployments or emails.'
if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: Did not impersonate the service account or call Firestore REST.'
  exit 0
fi

# No role granting. This succeeds only if the business user ALREADY has permission
# to generate short-lived tokens for the service identity.
# If impersonation fails, do not grant broad project roles to work around it.
echo 'Attempting short-lived service account impersonation (NO IAM changes).'
if ! ACCESS_TOKEN="$(gcloud auth print-access-token \
  --impersonate-service-account="$SA" --lifetime=600 2>/dev/null)"; then
  echo 'UNVERIFIED: Could not impersonate dedicated STAGING service account.'
  echo 'No IAM role changes were made. Do NOT add Editor/Owner or project-wide Token Creator.'
  echo 'Use a separately approved identity-only Cloud Run probe if needed.'
  exit 2
fi
if [[ -z "$ACCESS_TOKEN" ]]; then
  echo 'FAIL: No access token received.'
  exit 2
fi

# Never save or print HTTP bodies. No curl --verbose; token never logged.
get_status() {
  curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout 8 --max-time 20 \
    --header "Authorization: Bearer ${ACCESS_TOKEN}" \
    --header 'Accept: application/json' \
    "$1"
}
echo 'Checking database metadata GET permission with dedicated identity...'
if ! METADATA_HTTP="$(get_status "$BASE_URL")"; then
  echo 'FAIL: Firestore metadata transport error (no data changed).'
  exit 2
fi
if [[ "$METADATA_HTTP" != '200' ]]; then
  echo "UNVERIFIED: Database metadata GET returned HTTP ${METADATA_HTTP} (expected 200)."
  echo 'No permissions were changed.'
  exit 2
fi
echo 'PASS: Dedicated STAGING identity can read its named database metadata.'

echo 'Checking entity GET permission against intentionally absent STAGING document...'
if ! DOCUMENT_HTTP="$(get_status "$BASE_URL/documents/$COLLECTION/$PROBE_ID")"; then
  echo 'FAIL: Firestore document GET transport error (no data changed).'
  exit 2
fi
case "$DOCUMENT_HTTP" in
  404)
    echo 'PASS: Firestore answered NOT_FOUND for fixed absent document (expected).'
    echo 'PASS: Effective STAGING Firestore metadata/entity read probe complete.'
    ;;
  200)
    echo 'STOP: Readiness probe document unexpectedly exists. No response body exposed.'
    exit 2
    ;;
  *)
    echo "UNVERIFIED: Staging document GET HTTP ${DOCUMENT_HTTP} (expected 404)."
    echo 'No IAM roles were changed and no data was written.'
    exit 2
    ;;
esac
echo 'NOTE: Negative testing of access to other databases was not performed.'
echo 'NOTE: No document-create, outbox processing or customer notification tested.'
unset ACCESS_TOKEN
