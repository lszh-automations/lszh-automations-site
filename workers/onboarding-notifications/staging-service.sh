#!/usr/bin/env bash
# LSZH synthetic STAGING: separate private Cloud Run service, default DISABLED.
#
# No arguments: read-only plan; changes nothing.
# --build-only: explicitly authorized, builds and pushes a container image from
#               ONLY allowlisted runtime sources (no .git, docs, configs, secrets).
# --deploy-disabled: explicitly authorized, deploys the image to a NEW service
#                    with IAM authentication required, without secrets/fixture codes.
# Never deploys over any existing service; no automatic activation or email.
set -euo pipefail

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
DATABASE='lszh-offers-staging'
REPO='cloud-run-source-deploy'
SERVICE='lszh-onboarding-outbox-staging'
SA="lszh-onboarding-outbox-staging@${PROJECT}.iam.gserviceaccount.com"
BRANCH='feature/onboarding-notification-outbox-20261016'
MODE="${1:---plan}"

if [[ "$#" -gt 1 || ! "$MODE" =~ ^(--plan|--build-only|--deploy-disabled)$ ]]; then
  echo 'STOP: Use --plan, --build-only, or --deploy-disabled.'
  exit 2
fi
for command in gcloud git bash mktemp; do
  command -v "$command" >/dev/null || { echo "STOP: missing $command"; exit 2; }
done
# Only operate on the exact reviewed branch, with no uncommitted modifications.
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$ROOT" ]]; then echo 'STOP: Not a Git checkout'; exit 2; fi
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse refs/remotes/origin/$BRANCH)" ]]; then
  echo 'STOP: Wrong branch, checkout not clean or local HEAD differs from origin branch.'
  echo 'Run git pull --ff-only on the exact review branch first.'
  exit 2
fi
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong Google account or Cloud project.'
  exit 2
fi
gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" \
  --format='value(name)' >/dev/null
gcloud artifacts repositories describe "$REPO" --project="$PROJECT" \
  --location="$REGION" --format='value(name)' >/dev/null
gcloud iam service-accounts describe "$SA" --project="$PROJECT" \
  --format='value(email)' >/dev/null

COMMIT="$(git rev-parse --short=12 HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/lszh-onboarding-outbox:staging-${COMMIT}"
# Listing must succeed. An IAM failure must NOT be mistaken for 'not found'.
KNOWN_SERVICES="$(gcloud run services list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')"
if printf '%s\n' "$KNOWN_SERVICES" | grep -Fxq "$SERVICE"; then
  echo 'STOP: The named Outbox Cloud Run service already exists; refusing to modify it.'
  exit 2
fi

echo "Verified business project, account, existing Zurich Firestore, registry and service identity."
echo "Reviewed commit: $COMMIT"
echo "Image target: $IMAGE"
echo "NEW service: $SERVICE in $REGION"
echo 'Private API: Cloud Run IAM authentication required (--no-allow-unauthenticated).'
echo 'Cloud Run ingress=all permits network access but not unauthenticated requests.'
echo 'Outbox flag OFF; no Airtable token, control secret, fixture codes or Scheduler.'
echo 'No Make scenario change; no mail transport in container.'
if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: No build, image push, deployment, data access or IAM changes.'
  exit 0
fi

if [[ "$MODE" == '--build-only' ]]; then
  WORK="$(mktemp -d)"
  trap 'rm -rf "$WORK"' EXIT
  mkdir -p "$WORK/onboarding" "$WORK/workers/onboarding-notifications"
  for file in \
    onboarding/confirmation.js \
    workers/onboarding-notifications/outbox.js \
    workers/onboarding-notifications/airtable-candidates.js \
    workers/onboarding-notifications/paced-fetch.js \
    workers/onboarding-notifications/firestore-store.js \
    workers/onboarding-notifications/server.js \
    workers/onboarding-notifications/Dockerfile \
    workers/onboarding-notifications/cloudbuild.staging.yaml; do
    [[ -f "$ROOT/$file" && ! -L "$ROOT/$file" ]] ||
      { echo "STOP: Missing or symlinked runtime source: $file"; exit 2; }
    cp -- "$ROOT/$file" "$WORK/$file"
  done
  printf 'Preparing allowlisted build source (%s files only).\n' "$(find "$WORK" -type f | wc -l)"
  [[ "$(find "$WORK" -type f | wc -l | tr -d ' ')" == 8 ]] ||
    { echo 'STOP: Non-allowlisted build content'; exit 2; }
  gcloud builds submit "$WORK" \
    --project="$PROJECT" --region="$REGION" \
    --config="$WORK/workers/onboarding-notifications/cloudbuild.staging.yaml" \
    --substitutions="_IMAGE=$IMAGE"
  echo 'Build+push completed. No Cloud Run service was deployed.'
  exit 0
fi

# Deploy ONLY the previously pushed, reviewed image to a NEW, private, disabled service.
# Never add a service-level public/allUsers invoker; no sensitive env values set.
echo 'Deploying isolated, authentication-required, DISABLED Cloud Run STAGING service.'
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" \
  --service-account="$SA" \
  --no-allow-unauthenticated \
  --ingress=all \
  --min-instances=0 --max-instances=1 \
  --concurrency=1 --timeout=30 \
  --cpu=1 --memory=256Mi \
  --port=8080 \
  --set-env-vars="LSZH_OUTBOX_STAGE_ENABLED=false,FIRESTORE_PROJECT_ID=$PROJECT,FIRESTORE_DATABASE_ID=$DATABASE" \
  --labels='environment=staging,service=onboarding-outbox' \
  --quiet

echo 'DEPLOYED: disabled, authentication-required STAGING worker.'
echo 'No secrets configured; POST /internal/reconcile must return outbox_disabled (503) even when authenticated.'
echo 'No HTTP health test was performed here; review the service IAM before invoking.'
