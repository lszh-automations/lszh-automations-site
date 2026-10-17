#!/usr/bin/env bash
# LSZH: verify completed Airtable-read STAGING Cloud Build, Artifact Registry
# image digest, source pin, and absence of Cloud Run probe job. READ ONLY.
# No secret access, no build, no deploy, no IAM updates, no execution.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
REGION='europe-west6'
REGISTRY='cloud-run-source-deploy'
SOURCE_COMMIT='c7ebdde79b67ca767c3d36f28959a668fecbd458'
BUILD='1b909760-deb7-49a9-bfe8-b4e20af68133'
JOB='lszh-airtable-read-probe-staging'
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REGISTRY}/lszh-airtable-read-probe:stg-${SOURCE_COMMIT:0:12}"
if [[ "$#" -ne 0 ]]; then
 echo 'STOP: Read-only verifier takes no arguments.';exit 2
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
 echo 'STOP: Wrong reviewed branch, dirty checkout or origin mismatch.';exit 2
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
 echo 'STOP: Pinned source changed or unavailable. No image verification claim.';exit 2
fi
account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$account" != "$ACCOUNT" || "$project" != "$PROJECT" ]];then
 echo 'STOP: Wrong company account or Google Cloud project.';exit 2
fi
build_json="$(gcloud builds describe "$BUILD" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Exact successful Cloud Build unavailable.';exit 2; }
if ! printf '%s\n' "$build_json" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 assert isinstance(d,dict)
 assert d.get("id")==sys.argv[1] and d.get("status")=="SUCCESS"
 images=d.get("images")
 assert isinstance(images,list) and images==[sys.argv[2]]
 assert d.get("name","").endswith("/builds/"+sys.argv[1]) or not d.get("name")
 r=d.get("results",{})
 if isinstance(r,dict):
  for im in r.get("images",[]):
   assert isinstance(im,dict)
   if im.get("name")==sys.argv[2] and im.get("digest"):
    assert str(im["digest"]).startswith("sha256:")
except (ValueError,AssertionError,TypeError,AttributeError):
 print("STOP: Build ID, completed status or exact output image mismatched.")
 sys.exit(2)
print("PASS: Pinned Cloud Build ID reports SUCCESS for exactly the expected image tag.")
' "$BUILD" "$IMAGE"; then exit 2; fi

digest="$(gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" \
 --format='value(image_summary.digest)')" ||
 { echo 'STOP: Image tag not present in Zurich Artifact Registry.';exit 2; }
if [[ ! "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]; then
 echo 'STOP: Artifact Registry digest missing or malformed. Do not use image tag.';exit 2
fi

# If Cloud Build exposes a digest, it must match the registry digest.
if ! printf '%s\n' "$build_json" | python3 -c '
import json,sys
b=json.load(sys.stdin)
tag=sys.argv[1]
digest=sys.argv[2]
r=b.get("results")
if not isinstance(r,dict):
 print("NOTE: Build result digest not exposed; registry digest independently confirmed.")
 sys.exit(0)
images=r.get("images",[])
matching=[x.get("digest") for x in images if isinstance(x,dict) and x.get("name")==tag and x.get("digest")]
if matching:
 if matching != [digest]:
  print("STOP: Artifact Registry digest disagrees with Build result.");sys.exit(2)
 print("PASS: Cloud Build result digest matches Artifact Registry.")
else:
 print("NOTE: Build result digest not exposed; registry digest independently confirmed.")
' "$IMAGE" "$digest"; then exit 2; fi
jobs="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" ||
 { echo 'STOP: Unable to enumerate existing STAGING jobs.';exit 2; }
if printf '%s\n' "$jobs" | grep -Eq "(^|/)$JOB$"; then
 echo 'STOP: Separate STAGING job already exists. Do not create/overwrite.';exit 2
fi

echo 'PASS: Reviewed five-file source pin unchanged; tagged Artifact Registry image exists.'
echo "PASS: Immutable digest: $digest"
echo "PASS: Deployable read-only image reference: ${IMAGE%:*}@$digest"
echo "PASS: Cloud Run job $JOB not yet created."
echo 'READ ONLY: No Cloud Build, image upload, Job deployment/execution, PAT read or IAM changes.'
