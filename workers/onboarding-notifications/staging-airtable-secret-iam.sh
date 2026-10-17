#!/usr/bin/env bash
# LSZH: separate, secret-level IAM grant for the one STAGING Airtable read job.
# Default --plan is METADATA READ ONLY. --grant-secret-only adds exactly one
# roles/secretmanager.secretAccessor binding on ONE named secret. No token reads.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
SECRET='lszh-airtable-readonly-staging'
REGION='europe-west6'
SA='lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com'
MEMBER="serviceAccount:$SA"
ROLE='roles/secretmanager.secretAccessor'
MODE="${1:---plan}"
if [[ "$#" -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--grant-secret-only' ) ]]; then
 echo 'STOP: Allowed: --plan (default), --grant-secret-only.'; exit 2
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
 echo 'STOP: Wrong branch, dirty checkout or unsynced origin.';exit 2
fi
acct="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
proj="$(gcloud config get-value project 2>/dev/null)"
if [[ "$acct" != "$ACCOUNT" || "$proj" != "$PROJECT" ]]; then
 echo 'STOP: Wrong business account or GCP project.';exit 2
fi
project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
 { echo 'STOP: Project number inaccessible.';exit 2; }
if [[ ! "$project_number" =~ ^[0-9]+$ ]]; then
 echo 'STOP: Invalid independent GCP project number.';exit 2
fi
sa_info="$(gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Dedicated Airtable job service account unavailable.';exit 2; }
if ! printf '%s\n' "$sa_info" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 assert d.get("email")==sys.argv[1] and d.get("disabled",False) is False
except (ValueError,TypeError,AssertionError):
 print("STOP: Unexpected or disabled service identity.");sys.exit(2)
' "$SA"; then exit 2; fi
metadata="$(gcloud secrets describe "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Cannot inspect secret metadata.';exit 2; }
if ! printf '%s\n' "$metadata" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 parts=d["name"].split("/")
 r=d["replication"]
 m=r.get("userManaged",r.get("user_managed"))
 valid=(len(parts)==4 and parts[0]=="projects" and
        parts[1] in (sys.argv[1],sys.argv[2]) and
        parts[2]=="secrets" and parts[3]==sys.argv[3] and
        isinstance(m,dict) and
        m.get("replicas")==[{"location":sys.argv[4]}])
 if not valid: raise ValueError("wrong secret identity, project or Zurich-only replica")
except (KeyError,ValueError,TypeError,AttributeError):
 print("STOP: Secret does not match independent company/Zürich checks.");sys.exit(2)
' "$PROJECT" "$project_number" "$SECRET" "$REGION"; then exit 2; fi
versions="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='json(name,state)')" ||
 { echo 'STOP: Cannot enumerate secret versions.';exit 2; }
if ! printf '%s\n' "$versions" | python3 -c '
import json,sys
try:
 l=json.load(sys.stdin)
 assert isinstance(l,list) and len(l)==1
 d=l[0]
 assert isinstance(d,dict)
 assert str(d.get("name","")).rsplit("/",1)[-1]=="1"
 assert d.get("state")=="ENABLED"
except (TypeError,ValueError,AssertionError):
 print("STOP: Require exactly one ENABLED secret version (1).");sys.exit(2)
'; then exit 2; fi
policy="$(gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Cannot read secret-specific IAM policy.';exit 2; }
if ! printf '%s\n' "$policy" | python3 -c '
import json,sys
try:
 p=json.load(sys.stdin)
 assert isinstance(p,dict)
 b=p.get("bindings",[])
 assert isinstance(b,list)
 for row in b:
  assert isinstance(row,dict)
  members=row.get("members",[])
  assert isinstance(members,list)
  # Any current permission for this isolated service account is a stop:
  # no silent broad pre-existing rights or duplicate grant.
  assert sys.argv[1] not in members
  assert "allUsers" not in members and "allAuthenticatedUsers" not in members
except (ValueError,TypeError,AssertionError):
 print("STOP: Existing secret IAM bindings require human review (no grant).")
 sys.exit(2)
' "$MEMBER"; then exit 2; fi
echo 'PASS: Company identity, clean review branch and dedicated service account.'
echo 'PASS: Correct global STAGING secret, Zurich-only replica, exactly one ENABLED version (1).'
echo 'PASS: Existing secret-specific IAM policy inspected; no binding for the dedicated identity.'
echo "Proposed new member: $MEMBER"
echo "Proposed role: $ROLE"
echo "Scope: EXACTLY the one Secret Manager secret $SECRET (not project-wide)."
echo 'No PAT access, email, Firestore, Make, Cloud Run job or customer data operations.'
if [[ "$MODE" == '--plan' ]]; then
 echo 'PLAN ONLY: No IAM changes, no secret contents read and no Cloud Run deployment.'
 exit 0
fi
echo 'Adding exactly one secret-specific Secret Accessor binding (no project IAM changes).'
if ! gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" \
 --member="$MEMBER" --role="$ROLE" --condition=None --quiet --format=json >/dev/null; then
 echo 'STOP: IAM binding command failed or ambiguous; DO NOT RETRY blindly.'
 exit 2
fi
after="$(gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: IAM was modified, but policy recheck failed. Do not repeat blindly.';exit 2; }
if ! printf '%s\n' "$after" | python3 -c '
import json,sys
try:
 p=json.load(sys.stdin)
 b=p.get("bindings",[])
 assert isinstance(b,list)
 bindings=[x for x in b if sys.argv[1] in x.get("members",[])]
 assert len(bindings)==1
 assert bindings[0].get("role")==sys.argv[2]
 assert not bindings[0].get("condition")
 assert "allUsers" not in bindings[0]["members"]
 assert "allAuthenticatedUsers" not in bindings[0]["members"]
except (TypeError,ValueError,AssertionError,KeyError):
 print("STOP: Secret IAM changed but exact binding verification failed. No automatic retry.")
 sys.exit(2)
print("PASS: Dedicated service account has exactly one secret-level Secret Accessor binding.")
' "$MEMBER" "$ROLE"; then exit 2; fi
echo 'PASS: Exactly one secret-level IAM grant verified; no PAT payload read.'
echo 'STOP HERE: No Cloud Run job deployment or execution; review next gate separately.'
