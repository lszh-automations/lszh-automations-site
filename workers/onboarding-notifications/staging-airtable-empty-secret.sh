#!/usr/bin/env bash
# LSZH isolated Airtable STAGING: create an EMPTY Secret Manager metadata resource
# only after separate --plan. NEVER handles PAT, IAM grants or secret versions.
set -euo pipefail
set +x

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
REGION='europe-west6'
SA='lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com'
SECRET='lszh-airtable-readonly-staging'
JOB='lszh-airtable-read-probe-staging'
MODE="${1:---plan}"

if [[ "$#" -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--create-empty' ) ]]; then
  echo 'STOP: Allowed: --plan (default), --create-empty.'
  exit 2
fi
for cmd in gcloud git python3; do
  command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd";exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
  echo 'STOP: Wrong branch, dirty checkout or HEAD differs from origin.'
  exit 2
fi
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong business account or project.';exit 2
fi

sa_json="$(gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json)" ||
  { echo 'STOP: Expected dedicated SA missing or inaccessible.';exit 2; }
printf '%s\n' "$sa_json" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("email")!="lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com" or d.get("disabled",False) is not False:
 print("STOP: Dedicated STAGING service identity unexpected or disabled.")
 sys.exit(2)
print("PASS: Dedicated STAGING service identity exists and is enabled.")
'
# Enumerate all the *resource names*; a failed listing is NEVER interpreted
# as absence (which could cause an unintended create).
secrets="$(gcloud secrets list --project="$PROJECT" --format='value(name)')" ||
  { echo 'STOP: Cannot list Secret Manager resource metadata.';exit 2; }
jobs="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" ||
  { echo 'STOP: Cannot list Cloud Run job resource metadata.';exit 2; }
secret_exists=false
job_exists=false
if printf '%s\n' "$secrets" | grep -Eq "(^|/)$SECRET$"; then secret_exists=true; fi
if printf '%s\n' "$jobs" | grep -Eq "(^|/)$JOB$"; then job_exists=true; fi

echo 'PASS: Company identity, reviewed branch and separate service account verified.'
echo "Expected empty Secret Manager resource: $SECRET"
echo "Replication: user-managed, exactly one replica in $REGION (Zurich)."
echo "Existing secret/job: $secret_exists/$job_exists"
echo 'No PAT, secret version, IAM grant, Cloud Run job/service or customer data operation.'

if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: no Secret Manager resources or versions created.'
  exit 0
fi
if [[ "$secret_exists" == true || "$job_exists" == true ]]; then
  echo 'STOP: Secret or probe job already exists. Refusing to overwrite.'
  exit 2
fi

echo 'Creating only EMPTY STAGING Secret Manager metadata (no secret value).'
gcloud secrets create "$SECRET" --project="$PROJECT" \
 --replication-policy=user-managed --locations="$REGION" \
 --labels='environment=staging,purpose=airtable-read-probe' --quiet

metadata="$(gcloud secrets describe "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Created secret metadata could not be read back.';exit 2; }
printf '%s\n' "$metadata" | python3 -c '
import json,sys
d=json.load(sys.stdin)
expected="projects/lszh-automations/secrets/lszh-airtable-readonly-staging"
rep=d.get("replication",{})
managed=rep.get("userManaged",rep.get("user_managed",{}))
replicas=managed.get("replicas") if isinstance(managed,dict) else None
if d.get("name")!=expected or not isinstance(replicas,list) or len(replicas)!=1 or replicas[0].get("location")!="europe-west6":
 print("STOP: Secret name or Zurich-only replication mismatch; inspect metadata, do not add PAT.")
 sys.exit(2)
print("PASS: Exact STAGING secret identity and Zurich-only user-managed replication confirmed.")
'

# Explicitly verify that NO secret version exists. Never read secret payloads.
versions="$(gcloud secrets versions list --secret="$SECRET" --project="$PROJECT" --format='value(name)')" ||
 { echo 'STOP: Could not verify secret versions. Do not add any payload.';exit 2; }
if [[ -n "$versions" ]]; then
 echo 'STOP: Unexpected secret version detected. Investigate; do not modify.'
 exit 2
fi
echo 'PASS: Secret is EMPTY – zero secret versions.'
echo 'STOP HERE: No Airtable token stored, no IAM access granted and no Cloud Run job deployed.'
