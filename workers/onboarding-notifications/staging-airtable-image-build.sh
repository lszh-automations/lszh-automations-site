#!/usr/bin/env bash
# LSZH: plan-first *isolated* Airtable-read STAGING container build.
# --build-only makes a registry image from exactly five reviewed source files.
# NO secret value read, no Cloud Run Job, no execution, no IAM grants, no Airtable request.
set -euo pipefail
set +x
umask 077
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
REGION='europe-west6'
REGISTRY='cloud-run-source-deploy'
SECRET='lszh-airtable-readonly-staging'
SA='lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com'
MEMBER="serviceAccount:${SA}"
ROLE='roles/secretmanager.secretAccessor'
JOB='lszh-airtable-read-probe-staging'
SOURCE_COMMIT='c7ebdde79b67ca767c3d36f28959a668fecbd458'
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REGISTRY}/lszh-airtable-read-probe:stg-${SOURCE_COMMIT:0:12}"
MODE="${1:---plan}"
if [[ "$#" -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--build-only' ) ]]; then
 echo 'STOP: Allowed: --plan (default), --build-only.'
 exit 2
fi
for cmd in gcloud git python3 mktemp; do
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
FILES=(
 onboarding/confirmation.js
 workers/onboarding-notifications/staging-airtable-rest-read.js
 workers/onboarding-notifications/airtable-runtime-probe.js
 workers/onboarding-notifications/Dockerfile.airtable-read-probe
 workers/onboarding-notifications/cloudbuild.airtable-read-probe.yaml
)
if ! git cat-file -e "$SOURCE_COMMIT^{commit}" 2>/dev/null ||
   ! git diff --quiet "$SOURCE_COMMIT" HEAD -- "${FILES[@]}"; then
 echo 'STOP: Reviewed five-file source pin missing or changed. Do not build.'
 exit 2
fi
for file in "${FILES[@]}"; do
 if [[ ! -f "$ROOT/$file" || -L "$ROOT/$file" ]]; then
  echo 'STOP: Reviewed file missing or symbolic link; no build.'
  exit 2
 fi
done
account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$account" != "$ACCOUNT" || "$project" != "$PROJECT" ]]; then
 echo 'STOP: Wrong LSZH Google business identity or project.';exit 2
fi
sa_email="$(gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format='value(email)')" ||
 { echo 'STOP: Dedicated job service account unavailable.';exit 2; }
if [[ "$sa_email" != "$SA" ]]; then
 echo 'STOP: Unexpected job service account.';exit 2
fi
gcloud artifacts repositories describe "$REGISTRY" \
 --project="$PROJECT" --location="$REGION" --format='value(name)' >/dev/null ||
 { echo 'STOP: Zurich Artifact Registry repository unavailable.';exit 2; }
meta="$(gcloud secrets describe "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Secret metadata unavailable.';exit 2; }
pnum="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
 { echo 'STOP: Project number unavailable.';exit 2; }
if [[ ! "$pnum" =~ ^[0-9]+$ ]]; then echo 'STOP: Unexpected project number.';exit 2; fi
if ! printf '%s\n' "$meta" | python3 -c '
import sys,json
try:
 d=json.load(sys.stdin)
 p=d["name"].split("/")
 m=d["replication"].get("userManaged",{})
 assert len(p)==4 and p[0]=="projects" and p[1] in (sys.argv[1],sys.argv[2])
 assert p[2:] == ["secrets",sys.argv[3]]
 assert [x.get("location") for x in m.get("replicas",[])]==["europe-west6"]
except (KeyError,TypeError,ValueError,AssertionError):
 print("STOP: Unexpected secret identity or replica configuration.");sys.exit(2)
' "$PROJECT" "$pnum" "$SECRET"; then exit 2; fi
versions="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='json(name,state)')" ||
 { echo 'STOP: Cannot inspect secret versions.';exit 2; }
if ! printf '%s\n' "$versions" | python3 -c '
import sys,json
try:
 a=json.load(sys.stdin)
 assert isinstance(a,list) and len(a)==1
 assert a[0].get("state")=="ENABLED"
 assert str(a[0].get("name","")).rsplit("/",1)[-1]=="1"
except (TypeError,ValueError,AssertionError):
 print("STOP: Expected exactly one enabled Staging secret version 1.");sys.exit(2)
'; then exit 2; fi
policy="$(gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Could not verify secret-only IAM grant.';exit 2; }
if ! printf '%s\n' "$policy" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 entries=d.get("bindings",[])
 assert isinstance(entries,list)
 a=[row for row in entries if sys.argv[1] in row.get("members",[])]
 assert len(a)==1 and a[0].get("role")==sys.argv[2] and not a[0].get("condition")
 assert all("allUsers" not in row.get("members",[]) and
            "allAuthenticatedUsers" not in row.get("members",[]) for row in entries)
except (ValueError,TypeError,AssertionError,AttributeError):
 print("STOP: Secret IAM grant not exactly as reviewed.");sys.exit(2)
' "$MEMBER" "$ROLE"; then exit 2; fi
jobs="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" ||
 { echo 'STOP: Cannot inventory existing Cloud Run Jobs.';exit 2; }
if printf '%s\n' "$jobs" | grep -Eq "(^|/)${JOB}$"; then
 echo 'STOP: Dedicated STAGING Airtable read probe Job already exists. Never overwrite.'
 exit 2
fi
echo 'PASS: LSZH identity, reviewed immutable five-file source and Zurich registry.'
echo 'PASS: Exactly one enabled Secret version 1 and the secret-only IAM grant.'
echo "Isolated image target: $IMAGE"
echo "Separate STAGING Job (NOT created): $JOB"
echo 'No PAT payload access, CRM/Make/Firestore operations, Cloud Run deployment or emails.'
if [[ "$MODE" == '--plan' ]]; then
 echo 'PLAN ONLY: no Cloud Build submission, image push, Job creation/execution or IAM changes.'
 exit 0
fi
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/onboarding" "$WORK/workers/onboarding-notifications"
for file in "${FILES[@]}"; do cp -- "$ROOT/$file" "$WORK/$file"; done
count="$(find "$WORK" -type f | wc -l | tr -d '[:space:]')"
if [[ "$count" != 5 ]]; then
 echo 'STOP: Unexpected build context file count.';exit 2
fi
echo 'BUILD ONLY: five reviewed files; pushing separate image, but no Cloud Run Job.'
gcloud builds submit "$WORK" --project="$PROJECT" --region="$REGION" \
 --config="$WORK/workers/onboarding-notifications/cloudbuild.airtable-read-probe.yaml" \
 --substitutions="_IMAGE=$IMAGE"
echo 'PASS: Separate STAGING Airtable-read image build returned successfully.'
echo 'STOP HERE: No Job was deployed or executed. Build image digest and service config require further review.'
