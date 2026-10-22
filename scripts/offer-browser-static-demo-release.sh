#!/usr/bin/env bash
# Operator-controlled TEMPORARY Cloud Run upgrade, static design preview only.
# NO writes to original lszh-offer-portal-staging, no DB, Drive or acceptance.
set -euo pipefail
PROJECT="lszh-automations"
REGION="europe-west6"
TEMP="lszh-offer-browser-staging"
SA_EMAIL="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fatal(){ echo "NO-GO: $*" >&2; exit 1; }
[ "$#" -eq 1 ] && { [ "$1" = "--check" ] || [ "$1" = "--apply" ]; } ||
 fatal "Usage: bash scripts/offer-browser-static-demo-release.sh --check | --apply"
for cmd in git gcloud python3; do command -v "$cmd" >/dev/null || fatal "Missing $cmd"; done
[ "$(git -C "$ROOT" branch --show-current)" = "feature/optional-avv-acceptance-staging-20261014" ] ||
 fatal "Wrong Git branch"
[ -z "$(git -C "$ROOT" status --porcelain)" ] || fatal "Local modifications: stop"
[ "$(gcloud config get-value account 2>/dev/null)" = "lars@lszh-automations.ch" ] ||
 fatal "Wrong Google account"

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Existing original service baseline changed"

STAGE_DIR=""
SERVICE_JSON="$(mktemp)"
POLICY_JSON="$(mktemp)"
cleanup(){
 rm -f "$SERVICE_JSON" "$POLICY_JSON"
 if [ -n "$STAGE_DIR" ]; then rm -rf "$STAGE_DIR"; fi
}
trap cleanup EXIT
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
 --format=json > "$SERVICE_JSON" || fatal "Temporary service missing"
gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
 --region="$REGION" --format=json > "$POLICY_JSON" || fatal "Cannot verify service IAM"
python3 - "$SERVICE_JSON" "$POLICY_JSON" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]));p=json.load(open(sys.argv[2]))
m=s.get("metadata") or {};ann=m.get("annotations") or {}
labels=m.get("labels") or {}
spec=(s.get("spec") or {}).get("template",{}).get("spec") or {}
env={e.get("name"):e.get("value") for c in spec.get("containers",[]) for e in c.get("env",[])}
traffic=s.get("status",{}).get("traffic") or []
assert m.get("name")=="lszh-offer-browser-staging"
assert labels.get("lszh-purpose")=="offer-browser-smoke"
assert labels.get("lszh-temporary")=="true"
assert ann.get("run.googleapis.com/ingress")=="all"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false"
assert env.get("LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED") in (None,"false")
assert len(traffic)==1
assert traffic[0].get("revisionName")=="lszh-offer-browser-staging-00001-7kx"
assert traffic[0].get("percent")==100
images=[c.get("image") for c in spec.get("containers",[])]
assert images==["europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:7f8602e762ce"]
bindings=p.get("bindings") or []
assert not any(x in ("allUsers","allAuthenticatedUsers")
  for b in bindings for x in b.get("members",[]))
assert any(b.get("role")=="roles/run.invoker" and
  "user:lars@lszh-automations.ch" in b.get("members",[]) for b in bindings)
print("PASS: exact disabled temporary revision, labels, IAM and runtime identity verified.")
PY
gcloud projects get-iam-policy "$PROJECT" --format=json |
 python3 -c '
import json,sys
p=json.load(sys.stdin)
for b in p.get("bindings",[]):
 if b.get("role") in ("roles/run.invoker","roles/run.admin","roles/owner","roles/editor") and any(
   x in ("allUsers","allAuthenticatedUsers") for x in b.get("members",[])
 ):
  raise SystemExit("NO-GO: project-level public Run binding")
' || fatal "Project IAM verification failed"

echo "PASS: original internal service and private temporary service are unchanged."
echo "PLAN: update only TEMP service to static GET ?demo=1 and hard-off APIs."
echo "PLAN: no new IAM/Drive/Firestore grants, no contracts or emails."
[ "$1" = "--apply" ] || {
 echo "READ-ONLY CHECK PASS: --apply builds and deploys static demo revision."
 exit 0
}

STAGE_DIR="$(mktemp -d)"
mkdir -p "$STAGE_DIR/cloud-run/offer-portal-staging" \
 "$STAGE_DIR/cloud-run/archive-reader-staging" "$STAGE_DIR/offerte-annehmen"
cp "$ROOT/cloud-run/offer-portal-staging/"*.mjs "$STAGE_DIR/cloud-run/offer-portal-staging/"
cp "$ROOT/cloud-run/offer-portal-staging/package.json" "$STAGE_DIR/cloud-run/offer-portal-staging/"
cp "$ROOT/cloud-run/archive-reader-staging/archiveBundleVerifier.mjs" \
 "$STAGE_DIR/cloud-run/archive-reader-staging/"
cp "$ROOT/offerte-annehmen/index.html" "$STAGE_DIR/offerte-annehmen/"
cp "$ROOT/cloud-run/Dockerfile.offer-portal-staging" "$STAGE_DIR/Dockerfile"
REV="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
IMAGE="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:$REV"
gcloud builds submit "$STAGE_DIR" --project="$PROJECT" --region="$REGION" \
 --tag="$IMAGE" --quiet || fatal "Cloud Build failed, temporary service unchanged."

# Static demo-only runtime. Full Portal is OFF; no acceptance or PDF API can run.
gcloud run deploy "$TEMP" --project="$PROJECT" --region="$REGION" \
 --image="$IMAGE" --service-account="$SA_EMAIL" \
 --ingress=all --no-allow-unauthenticated --invoker-iam-check \
 --set-env-vars="LSZH_PORTAL_STAGING_ENABLED=false,LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED=true,GOOGLE_CLOUD_PROJECT=lszh-automations" \
 --labels="lszh-purpose=offer-browser-smoke,lszh-temporary=true" \
 --min-instances=0 --max-instances=1 --concurrency=1 \
 --memory=512Mi --cpu=1 --timeout=30 --quiet ||
 fatal "Temporary deployment failed; original service unchanged."

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Protected original service unexpectedly changed"
echo "SUCCESS: temporary authenticated static design-preview-only revision deployed."
echo "NEXT: verify via IAM-authenticated proxy; never use real customer links."
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
 --format='value(status.url)'
