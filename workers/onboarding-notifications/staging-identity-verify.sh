#!/usr/bin/env bash
# READ ONLY. Verify the identity and *project-level* IAM binding set by --apply.
# Do not impersonate the service account, write to Firestore or expose keys.
set -euo pipefail

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
DATABASE='lszh-offers-staging'
SERVICE_ACCOUNT='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v gcloud >/dev/null || { echo 'FAIL: gcloud is not installed'; exit 2; }
command -v python3 >/dev/null || { echo 'FAIL: python3 is not installed'; exit 2; }
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Expected LSZH business identity / Cloud project not selected.'
  exit 2
fi
echo 'PASS: LSZH business account and project.'

sa_info="$(gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT" --format='json(email,disabled)')"
printf '%s\n' "$sa_info" | python3 -c '
import json,sys
d=json.load(sys.stdin)
expected="lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com"
if d.get("email") != expected or d.get("disabled", False) is not False:
    print("FAIL: Dedicated service account is missing, unexpected, or disabled.")
    sys.exit(2)
print("PASS: Dedicated STAGING service account exists and is enabled.")
'

gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" \
 --format='json(name,locationId,type)' | python3 -c '
import json,sys
d=json.load(sys.stdin)
if (d.get("name") != "projects/lszh-automations/databases/lszh-offers-staging"
    or d.get("locationId") != "europe-west6"
    or d.get("type") not in ("FIRESTORE_NATIVE","FIRESTORE_NATIVE_MODE")):
    print("FAIL: Target Firestore database identity/location/type mismatch.")
    sys.exit(2)
print("PASS: Named Firestore STAGING database is in Zurich.")
'

gcloud projects get-iam-policy "$PROJECT" --format=json \
 | python3 "$SCRIPT_DIR/verify_iam_policy.py"

# No user-managed keys. Check status without printing key identifiers.
user_keys="$(gcloud iam service-accounts keys list \
 --iam-account="$SERVICE_ACCOUNT" --project="$PROJECT" --managed-by=user \
 --format='value(name)')"
if [[ -n "$user_keys" ]]; then
  echo 'FAIL: User-managed service-account key metadata exists; investigate before proceeding.'
  exit 2
fi
echo 'PASS: No user-managed service-account keys detected.'
echo 'READ-ONLY RESULT: Project-level IAM binding and service identity checks complete.'
echo 'NOTE: Firestore IAM changes can take up to 5 minutes to propagate.'
echo 'NOTE: No IAM impersonation, actual Firestore API access, or inherited roles have been tested.'
echo 'NO data was read from Firestore collections or written; no Cloud Run deploy was started.'
