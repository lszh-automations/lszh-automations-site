#!/usr/bin/env bash
# Create exactly ONE temporary, IAM-protected, initially DISABLED Cloud Run
# offer browser staging service. This is a deliberate operator-run cloud write.
# Nothing here updates the original lszh-offer-portal-staging service.
set -euo pipefail

PROJECT="lszh-automations"
REGION="europe-west6"
ORIGINAL="lszh-offer-portal-staging"
TEMP="lszh-offer-browser-staging"
SA_ID="lszh-offer-browser-tmp"
SA_EMAIL="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
REPOSITORY="cloud-run-source-deploy"
BRANCH="feature/optional-avv-acceptance-staging-20261014"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

fatal() { printf 'NO-GO: %s\n' "$*" >&2; exit 1; }
[ "$#" -eq 1 ] || fatal "Usage: bash scripts/offer-browser-cloud-bootstrap.sh --check | --apply"
[ "$1" = "--check" ] || [ "$1" = "--apply" ] || fatal "Only --check or --apply allowed."
for command in gcloud git python3; do
  command -v "$command" >/dev/null 2>&1 || fatal "Missing tool $command"
done
[ "$(git -C "$ROOT" branch --show-current)" = "$BRANCH" ] ||
  fatal "Checkout the exact audited feature branch first."
[ -z "$(git -C "$ROOT" status --porcelain)" ] ||
  fatal "Working tree has local modifications; use a clean checkout."
[ -f "$ROOT/offerte-annehmen/index.html" ] || fatal "Offer HTML missing."
[ -f "$ROOT/cloud-run/Dockerfile.offer-portal-staging" ] || fatal "Dockerfile missing."

# Block if existing protected preflight changed. Prints only high-level states.
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Existing service no longer matches protected baseline."
ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
case "$ACCOUNT" in
  *@*.*) ;;
  *) fatal "A normal named Google user account must be active." ;;
esac
case "$ACCOUNT" in
  *gserviceaccount.com) fatal "Do not run the browser-test setup as a service account." ;;
esac
gcloud artifacts repositories describe "$REPOSITORY" \
  --project="$PROJECT" --location="$REGION" --format='value(name)' >/dev/null ||
  fatal "Expected existing Artifact Registry repo is missing."
if gcloud run services describe "$TEMP" \
    --project="$PROJECT" --region="$REGION" --format='value(metadata.name)' \
    >/dev/null 2>&1; then
  fatal "Temporary service already exists. Never overwrite an existing service."
fi
if gcloud iam service-accounts describe "$SA_EMAIL" \
    --project="$PROJECT" --format='value(email)' >/dev/null 2>&1; then
  fatal "Temporary service account already exists. Inspect before proceeding."
fi
# Additional conservative check: do not expose a temporary service if the
# project already grants Cloud Run invocation to the entire internet.
gcloud projects get-iam-policy "$PROJECT" --format=json |
python3 -c '
import json,sys
policy=json.load(sys.stdin)
unsafe={"roles/run.invoker","roles/run.admin","roles/owner","roles/editor"}
for binding in policy.get("bindings",[]):
    if binding.get("role") in unsafe and set(binding.get("members",[])) & {"allUsers","allAuthenticatedUsers"}:
        raise SystemExit("NO-GO: project-level public Cloud Run invocation permission")
' || fatal "Project-level public invoke policy requires a security review."

printf 'PASS: existing read-only service unchanged, temporary name unused.\n'
printf 'PLAN: create %s with its own least-privilege identity.\n' "$TEMP"
printf 'PLAN: no Firestore/Drive roles, no data, no token secret, disabled HTTP 503.\n'
printf 'PLAN: ingress=all but authenticated Invoker access only for %s.\n' "$ACCOUNT"
printf 'PLAN: initial build and first Cloud Run revision may incur small costs.\n'
[ "$1" = "--apply" ] || {
  printf 'READ-ONLY CHECK COMPLETE: run with --apply only after approving creation.\n'
  exit 0
}

# Only controlled sources, not the entire git checkout or developer secrets,
# are uploaded to Cloud Build. The Dockerfile paths expect repository-root layout.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/cloud-run/offer-portal-staging" \
  "$STAGE/cloud-run/archive-reader-staging" "$STAGE/offerte-annehmen"
cp "$ROOT/cloud-run/offer-portal-staging/"*.mjs "$STAGE/cloud-run/offer-portal-staging/"
cp "$ROOT/cloud-run/offer-portal-staging/package.json" \
  "$STAGE/cloud-run/offer-portal-staging/package.json"
cp "$ROOT/cloud-run/archive-reader-staging/archiveBundleVerifier.mjs" \
  "$STAGE/cloud-run/archive-reader-staging/"
cp "$ROOT/offerte-annehmen/index.html" "$STAGE/offerte-annehmen/"
cp "$ROOT/cloud-run/Dockerfile.offer-portal-staging" "$STAGE/Dockerfile"
REV="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
IMAGE="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:$REV"

printf 'BUILD: uploading only the isolated, audited portal package.\n'
gcloud builds submit "$STAGE" --project="$PROJECT" --region="$REGION" \
  --tag="$IMAGE" --quiet ||
  fatal "Cloud Build failed. No temporary service or account was created."

printf 'CREATE: dedicated account (without access to any Firestore DB or Drive folder).\n'
gcloud iam service-accounts create "$SA_ID" --project="$PROJECT" \
  --display-name="LSZH temporary browser preview ONLY" --quiet ||
  fatal "Could not create temporary service account. Inspect before retrying."

printf 'CREATE: protected disabled Cloud Run test service. Original service is untouched.\n'
gcloud run deploy "$TEMP" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$SA_EMAIL" \
  --ingress=all --no-allow-unauthenticated --invoker-iam-check \
  --set-env-vars="LSZH_PORTAL_STAGING_ENABLED=false" \
  --min-instances=0 --max-instances=1 --concurrency=1 \
  --memory=512Mi --cpu=1 --timeout=30 --quiet ||
  fatal "Deployment failed. Account/image may exist; inspect before retrying."

printf 'IAM: granting only the active test user Invoker on this temporary service.\n'
gcloud run services add-iam-policy-binding "$TEMP" --project="$PROJECT" \
  --region="$REGION" --member="user:$ACCOUNT" --role="roles/run.invoker" \
  --quiet >/dev/null ||
  fatal "Invoker binding failed. Temporary service remains authentication-protected."

# Check the actual deployed service, not merely CLI intentions; no credentials
# or full environment metadata are displayed.
gcloud run services describe "$TEMP" --project="$PROJECT" \
  --region="$REGION" --format=json |
  python3 -c '
import json,sys
s=json.load(sys.stdin)
a=s.get("metadata",{}).get("annotations") or {}
spec=s.get("spec",{}).get("template",{}).get("spec",{})
assert a.get("run.googleapis.com/ingress")=="all","ingress changed"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com","wrong identity"
env={x["name"]:x.get("value") for c in spec.get("containers",[]) for x in c.get("env",[])}
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false","not disabled"
assert s.get("metadata",{}).get("name")=="lszh-offer-browser-staging"
print("PASS: new service isolated and application hard-disabled.")
' || fatal "Post-deploy configuration mismatch. Stop and inspect."
gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
  --region="$REGION" --format=json |
  python3 -c '
import json,sys
p=json.load(sys.stdin)
assert not any(x in ("allUsers","allAuthenticatedUsers")
  for b in p.get("bindings",[]) for x in b.get("members",[])),"public invoker!"
print("PASS: new service has no direct public Invoker binding.")
' || fatal "Temporary service IAM unsafe; inspect immediately."

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Existing read-only service drifted: do not proceed."
printf '\nSUCCESS: separate temporary service exists but returns HTTP 503 by design.\n'
printf 'No customer data, Firestore/Drive rights, emails or contract acceptance enabled.\n'
printf 'NEXT: paste only these non-secret output lines and service URL into ChatGPT.\n'
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
  --format='value(status.url)'
