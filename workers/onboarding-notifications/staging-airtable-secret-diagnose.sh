#!/usr/bin/env bash
# LSZH STAGING secret metadata diagnosis. READ ONLY.
# No secret payload access, no version creation, no IAM writes, no deployment.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
SECRET='lszh-airtable-readonly-staging'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
if [[ "$#" -ne 0 ]]; then echo 'STOP: No arguments supported (read-only).'; exit 2; fi
for c in git gcloud python3; do
  command -v "$c" >/dev/null || { echo "STOP: Missing $c"; exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in Git checkout.'; exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
 echo 'STOP: Wrong branch, dirty checkout or not in sync with origin.'; exit 2
fi
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
 echo 'STOP: Wrong company account or GCP project.'; exit 2
fi
project_number="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
  { echo 'STOP: Cannot independently verify project number.';exit 2; }
if [[ ! "$project_number" =~ ^[0-9]+$ ]]; then
 echo 'STOP: Project number format unexpected.'; exit 2
fi
echo 'PASS: Company identity and independently verified project number.'
# Strict read of metadata only, NOT versions access.
metadata="$(gcloud secrets describe "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Cannot read created secret metadata.'; exit 2; }
if ! printf '%s\n' "$metadata" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 name=d.get("name","")
 parts=name.split("/")
 project_id=sys.argv[1]
 project_number=sys.argv[2]
 expected_secret=sys.argv[3]
 location=sys.argv[4]
 same_secret=len(parts)==4 and parts[0]=="projects" and parts[2]=="secrets" and parts[3]==expected_secret
 same_project=same_secret and parts[1] in (project_id,project_number)
 rep=d.get("replication",{})
 managed=(rep.get("userManaged",rep.get("user_managed"))
          if isinstance(rep,dict) else None)
 replicas=managed.get("replicas") if isinstance(managed,dict) else None
 regions=[r.get("location") for r in replicas] if isinstance(replicas,list) else []
 region_ok=regions==[location]
 print("Secret identifier matches: "+("PASS" if same_secret else "STOP"))
 print("Secret project verified (ID or numeric): "+("PASS" if same_project else "STOP"))
 print("Replication mode: "+("user-managed" if isinstance(managed,dict) else "MISSING_OR_UNEXPECTED"))
 print("Replica regions: "+(",".join(str(x) for x in regions) if regions else "MISSING"))
 print("Zurich-only replica: "+("PASS" if region_ok else "STOP"))
 if not(same_secret and same_project and isinstance(managed,dict) and region_ok):
  sys.exit(2)
except (ValueError,TypeError,AttributeError,KeyError):
 print("STOP: Unrecognized metadata format.")
 sys.exit(2)
' "$PROJECT" "$project_number" "$SECRET" "$REGION"; then
 echo 'STOP: Secret metadata needs manual review; do NOT add token or IAM grants.'
 exit 2
fi
# Lists version metadata only; never retrieves payload.
versions="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='value(name)')" ||
 { echo 'STOP: Cannot enumerate version metadata.'; exit 2; }
if [[ -n "$versions" ]]; then
 echo 'STOP: At least one secret version already exists. Do not modify.'
 exit 2
fi
echo 'PASS: Exactly zero secret versions.'
echo 'PASS: Existing empty Zurich-only STAGING secret independently verified.'
echo 'READ ONLY: No token, IAM grants, Cloud Run resources or customer data touched.'
