#!/usr/bin/env bash
# LSZH one-shot Cloud Run JOB – Firestore STAGING READ-ONLY identity verification.
#
# No args / --plan: verifies known resources, git SHA and intended new job name.
# --build-only: separately approved Cloud Build container push; NO Cloud Run job.
# --create-only: separately approved create of a NEW job; DOES NOT EXECUTE.
# --execute-once: separately approved execution of existing pinned job, 1 task,
#                 zero retries, hard-coded 2 Firestore GETs via runtime identity.
#
# Never writes to Firestore, edits IAM, touches existing Cloud Run services,
# creates a secret/key, configures scheduler, or sends mail.
set -euo pipefail

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
DATABASE='lszh-offers-staging'
SA="lszh-onboarding-outbox-staging@${PROJECT}.iam.gserviceaccount.com"
REGISTRY='cloud-run-source-deploy'
JOB='lszh-firestore-read-probe-staging'
BRANCH='feature/onboarding-notification-outbox-20261016'
MODE="${1:---plan}"

if [[ "$#" -gt 1 ]]; then
  echo 'STOP: Exactly zero or one option allowed.'
  exit 2
fi
case "$MODE" in
  --plan|--build-only|--create-only|--execute-once) ;;
  *) echo 'STOP: Valid options are --plan, --build-only, --create-only, --execute-once.'; exit 2;;
esac
for cmd in gcloud git mktemp python3; do
  command -v "$cmd" >/dev/null || { echo "STOP: Missing command: $cmd"; exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then
  echo 'STOP: Not inside a Git checkout';exit 2
fi
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
  echo 'STOP: Wrong Git branch, dirty working tree, or checkout differs from origin.'
  echo 'Run git pull --ff-only; never build unreviewed local files.'
  exit 2
fi
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong business account or Cloud project.'
  exit 2
fi

# Fail closed if resource read permissions are absent. Do not confuse 403 and 404.
gcloud iam service-accounts describe "$SA" --project="$PROJECT" \
  --format='value(email)' >/dev/null
gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" \
  --format='value(name)' >/dev/null
gcloud artifacts repositories describe "$REGISTRY" --project="$PROJECT" \
  --location="$REGION" --format='value(name)' >/dev/null
KNOWN_JOBS="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" \
  --format='value(metadata.name)')"
COMMIT="$(git rev-parse --short=12 HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REGISTRY}/lszh-firestore-read-probe:staging-${COMMIT}"

if [[ "$MODE" == '--plan' || "$MODE" == '--build-only' || "$MODE" == '--create-only' ]]; then
  if printf '%s\n' "$KNOWN_JOBS" | grep -Eq "(^|/)$JOB$"; then
    echo 'STOP: A job with the intended name exists. Refusing overwrite or unexpected build.'
    exit 2
  fi
fi

echo "PASS: Business identity/project and existing Zurich resources."
echo "Reviewed Git commit: $COMMIT"
echo "Read-only Cloud Run JOB: $JOB; distinct from existing HTTP services."
echo "Pinned image: $IMAGE"
echo 'The job is not scheduled. No keys, SMTP, Airtable reads or Firestore writes.'
echo 'One task, zero retries, one explicit execution; Cloud billing may apply.'
if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: No build, image push, job create/execute, tokens or data access.'
  exit 0
fi

if [[ "$MODE" == '--build-only' ]]; then
  BUILD="$(mktemp -d)"
  trap 'rm -rf "$BUILD"' EXIT
  mkdir -p "$BUILD/workers/onboarding-notifications"
  for file in \
    workers/onboarding-notifications/Dockerfile.firestore-probe \
    workers/onboarding-notifications/firestore-runtime-probe.js \
    workers/onboarding-notifications/cloudbuild.firestore-probe.yaml; do
    if [[ ! -f "$ROOT/$file" || -L "$ROOT/$file" ]]; then
      echo "STOP: Missing or linked allowlisted file: $file";exit 2
    fi
    cp -- "$ROOT/$file" "$BUILD/$file"
  done
  count="$(find "$BUILD" -type f | wc -l | tr -d '[:space:]')"
  if [[ "$count" != '3' ]]; then
    echo 'STOP: Unexpected build context files';exit 2
  fi
  echo 'Building ONLY three allowlisted, nonsecret files (no deployment).'
  gcloud builds submit "$BUILD" --project="$PROJECT" --region="$REGION" \
    --config="$BUILD/workers/onboarding-notifications/cloudbuild.firestore-probe.yaml" \
    --substitutions="_IMAGE=$IMAGE"
  echo 'PASS: Probe image built and pushed, no Cloud Run job created or executed.'
  exit 0
fi

if [[ "$MODE" == '--create-only' ]]; then
  # No --execute-now and NO scheduler. Scope ONLY the new one-off job.
  echo 'Creating a new STAGING read-only job. It WILL NOT EXECUTE.'
  gcloud run jobs create "$JOB" \
    --project="$PROJECT" --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$SA" \
    --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=60s \
    --cpu=1 --memory=256Mi \
    --set-env-vars="LSZH_FIRESTORE_READ_PROBE_ONLY=true,FIRESTORE_PROJECT_ID=$PROJECT,FIRESTORE_DATABASE_ID=$DATABASE" \
    --labels='environment=staging,purpose=firestore-read-probe' \
    --quiet
  echo 'PASS: New Cloud Run Job CREATED but NOT EXECUTED. No Firestore traffic.'
  exit 0
fi

# --execute-once
if ! printf '%s\n' "$KNOWN_JOBS" | grep -Eq "(^|/)$JOB$"; then
  echo 'STOP: Exact staging probe job not found, refusing execution.'
  exit 2
fi
# Double-check runtime image, account, env and retry constraints right before execution.
if ! gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" \
  --format=json | python3 -c '
import json,sys
data=json.load(sys.stdin)
template=data.get("spec",{}).get("template",{}).get("spec",{})
# Cloud Run API job v1: spec.template.spec.template.spec containers.
task=template.get("template",{}).get("spec",{})
containers=task.get("containers",[])
if not containers:
    # API versions can differ: refuse rather than guess at a different format.
    print("STOP: Unrecognized Cloud Run Job description; no execution.")
    sys.exit(2)
expected_image=sys.argv[1]
expected_sa=sys.argv[2]
expected_env={
    "LSZH_FIRESTORE_READ_PROBE_ONLY":"true",
    "FIRESTORE_PROJECT_ID":"lszh-automations",
    "FIRESTORE_DATABASE_ID":"lszh-offers-staging"
}
envs={e.get("name"):e.get("value") for e in containers[0].get("env",[])}
problems=[]
if containers[0].get("image")!=expected_image: problems.append("unexpected image")
if task.get("serviceAccountName")!=expected_sa: problems.append("unexpected service account")
if envs!=expected_env: problems.append("unexpected environment or hidden secret")
if str(task.get("maxRetries","0"))!="0": problems.append("unexpected retries")
if template.get("taskCount",1)!=1: problems.append("unexpected task count")
if problems:
    print("STOP: Job configuration mismatch: "+", ".join(problems))
    sys.exit(2)
print("PASS: Job pinned to reviewed image, exact service identity and fixed read-only config.")
' "$IMAGE" "$SA"; then
  echo 'STOP: Job spec verification failed; no execution.'
  exit 2
fi
echo 'Explicitly executing ONE read-only Cloud Run Job now. No retries.'
gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait
echo 'Execution returned successfully; inspect task logs for exact PASS/FAIL lines.'
echo 'No Cloud Run HTTP service, scheduler, IAM role, customer record or email was changed.'
