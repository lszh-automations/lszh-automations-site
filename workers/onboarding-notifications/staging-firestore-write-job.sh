#!/usr/bin/env bash
# LSZH: isolated, explicit, one-shot STAGING synthetic Firestore write test.
# Default --plan only reads metadata. NO writes unless separately executing
# --build-only, --create-only, --execute-once in that order.
# The ONE task uses the existing outbox createOnce, fixed fake recordId only,
# GET readback + conditional DELETE, no Airtable or email.
set -euo pipefail
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
DATABASE='lszh-offers-staging'
REGISTRY='cloud-run-source-deploy'
SA="lszh-onboarding-outbox-staging@${PROJECT}.iam.gserviceaccount.com"
BRANCH='feature/onboarding-notification-outbox-20261016'
JOB='lszh-firestore-write-probe-staging'
SOURCE_COMMIT='618bf77b30d8bb520cd8211cb294b7e050983d32'
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REGISTRY}/lszh-firestore-write-probe:staging-${SOURCE_COMMIT:0:12}"
MODE="${1:---plan}"
if [[ "$#" -gt 1 ]]; then echo 'STOP: Exactly zero or one argument required.';exit 2;fi
case "$MODE" in
 --plan|--build-only|--create-only|--execute-once) ;;
 *) echo 'STOP: Allowed: --plan, --build-only, --create-only, --execute-once';exit 2;;
esac
for cmd in gcloud git bash python3 mktemp; do
 command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd"; exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in a Git checkout';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
 echo 'STOP: Wrong Git branch, dirty checkout, or not up to date with origin.'
 exit 2
fi
FILES=(
 onboarding/confirmation.js
 workers/onboarding-notifications/outbox.js
 workers/onboarding-notifications/firestore-store.js
 workers/onboarding-notifications/firestore-write-probe.js
 workers/onboarding-notifications/Dockerfile.firestore-write-probe
 workers/onboarding-notifications/cloudbuild.firestore-write-probe.yaml
)
if ! git cat-file -e "$SOURCE_COMMIT^{commit}" 2>/dev/null; then
 echo 'STOP: Pinned source commit not present.'; exit 2
fi
if ! git diff --quiet "$SOURCE_COMMIT" HEAD -- "${FILES[@]}"; then
 echo 'STOP: Changes to reviewed probe sources detected. New image + review required.'
 exit 2
fi
account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$account" != "$ACCOUNT" || "$project" != "$PROJECT" ]]; then
 echo 'STOP: Wrong LSZH Google business identity or project.';exit 2
fi
gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format='value(email)' >/dev/null
gcloud firestore databases describe --database="$DATABASE" --project="$PROJECT" --format='value(name)' >/dev/null
gcloud artifacts repositories describe "$REGISTRY" --location="$REGION" --project="$PROJECT" --format='value(name)' >/dev/null
# Job enumeration must succeed; fail closed if permission is missing.
JOBS="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')"
EXISTS=false
if printf '%s\n' "$JOBS" | grep -Eq "(^|/)$JOB$"; then EXISTS=true; fi
if [[ "$MODE" != '--execute-once' && "$EXISTS" == true ]]; then
 echo 'STOP: Isolated synthetic write probe job already exists. No overwrites allowed.'
 exit 2
fi
echo "PASS: Correct LSZH identity, named Zurich STAGING database and dedicated service account."
echo "Image pinned to unchanged reviewed six-file source: $IMAGE"
echo "Separate NEW job: $JOB"
echo 'Synthetic only: pre-GET 404; createOnce once; strict readback; conditional versioned DELETE; final GET 404.'
echo 'No customer data, Airtable, Make, email, external scheduler or production writes.'
if [[ "$MODE" == '--plan' ]]; then
 echo 'PLAN ONLY: No build, image upload, job creation/execution or Firestore change.'
 exit 0
fi
if [[ "$MODE" == '--build-only' ]]; then
 WORK="$(mktemp -d)"
 trap 'rm -rf "$WORK"' EXIT
 mkdir -p "$WORK/onboarding" "$WORK/workers/onboarding-notifications"
 for file in "${FILES[@]}"; do
  if [[ ! -f "$ROOT/$file" || -L "$ROOT/$file" ]]; then
   echo "STOP: Missing or linked source: $file";exit 2
  fi
  cp -- "$ROOT/$file" "$WORK/$file"
 done
 [[ "$(find "$WORK" -type f | wc -l | tr -d '[:space:]')" == 6 ]] ||
   { echo 'STOP: Unexpected build source files';exit 2; }
 echo 'BUILD ONLY: six allowlisted files, no deployment or Firestore operation.'
 gcloud builds submit "$WORK" --project="$PROJECT" --region="$REGION" \
  --config="$WORK/workers/onboarding-notifications/cloudbuild.firestore-write-probe.yaml" \
  --substitutions="_IMAGE=$IMAGE"
 echo 'PASS: Isolated synthetic probe image pushed; no job deployed/executed.'
 exit 0
fi
if [[ "$MODE" == '--create-only' ]]; then
 echo 'Creating only the NEW STAGING synthetic probe JOB; NOT executing it.'
 gcloud run jobs create "$JOB" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$SA" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=90s \
  --cpu=1 --memory=512Mi \
  --set-env-vars="LSZH_SYNTHETIC_WRITE_PROBE_ONLY=true,LSZH_OUTBOX_STAGE_ENABLED=false,FIRESTORE_PROJECT_ID=$PROJECT,FIRESTORE_DATABASE_ID=$DATABASE" \
  --labels='environment=staging,purpose=synthetic-firestore-write-probe' --quiet
 echo 'PASS: New STAGING write-probe Job CREATED; NOT EXECUTED.'
 exit 0
fi
# Explicit --execute-once: never run twice, including failed/partial executions.
if [[ "$EXISTS" != true ]]; then echo 'STOP: Exact staging job missing.';exit 2;fi
EXECUTIONS="$(gcloud run jobs executions list --job="$JOB" --project="$PROJECT" \
 --region="$REGION" --format='value(metadata.name)')"
if [[ -n "$EXECUTIONS" ]]; then
 echo 'STOP: At least one prior execution exists. No automatic or manual rerun.'
 exit 2
fi
if ! gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" --format=json |
 python3 -c '
import json,sys
d=json.load(sys.stdin)
job=d.get("spec",{}).get("template",{}).get("spec",{})
task=job.get("template",{}).get("spec",{})
containers=task.get("containers",[])
errors=[]
if len(containers)!=1:errors.append("containers not exactly one")
else:
 c=containers[0]
 if c.get("image")!=sys.argv[1]:errors.append("image mismatch")
 env={v.get("name"):v.get("value") for v in c.get("env",[])}
 expected={"LSZH_SYNTHETIC_WRITE_PROBE_ONLY":"true",
           "LSZH_OUTBOX_STAGE_ENABLED":"false",
           "FIRESTORE_PROJECT_ID":"lszh-automations",
           "FIRESTORE_DATABASE_ID":"lszh-offers-staging"}
 if env!=expected:errors.append("unexpected variables/secrets")
if task.get("serviceAccountName")!=sys.argv[2]:errors.append("service identity mismatch")
if str(task.get("maxRetries","0"))!="0":errors.append("retries not zero")
if job.get("taskCount")!=1:errors.append("unexpected number of tasks")
if errors:
 print("STOP: "+", ".join(errors))
 sys.exit(2)
print("PASS: reviewed image, only test env vars, dedicated identity, task=1, retries=0.")
' "$IMAGE" "$SA"; then
 echo 'STOP: Job spec failed validation. No Firestore operation executed.'
 exit 2
fi
echo 'Explicitly starting one synthetic STAGING write/verify/cleanup job now.'
gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait
echo 'Execution returned successfully: read the exact Cloud Run execution logs to verify create/read/delete PASS.'
echo 'Never run the same job again. No existing HTTP services, IAM roles or email transports touched.'
