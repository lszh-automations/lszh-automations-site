#!/usr/bin/env bash
# Clean up only the explicitly labelled, initially disabled synthetic test
# service created by offer-browser-cloud-bootstrap.sh. NEVER the preflight.
set -euo pipefail
PROJECT="lszh-automations"
REGION="europe-west6"
TEMP="lszh-offer-browser-staging"
SA_EMAIL="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fatal(){ echo "NO-GO: $*" >&2; exit 1; }
[ "$#" -eq 1 ] || fatal "Usage: bash scripts/offer-browser-cloud-cleanup.sh --check | --apply"
[ "$1" = "--check" ] || [ "$1" = "--apply" ] || fatal "Unknown option"
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Protected original preflight changed. Stop."

# Read exact service and verify its identity, labels, disabled flag and image
# before touching ANY Cloud resource. Do not follow untrusted service data.
SERVICE_JSON="$(mktemp)"
trap 'rm -f "$SERVICE_JSON"' EXIT
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
  --format=json > "$SERVICE_JSON" ||
  fatal "Temporary service not found. No deletion attempted."
IMAGE="$(python3 - "$SERVICE_JSON" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
m=s.get("metadata") or {}
labels=m.get("labels") or {}
spec=(s.get("spec") or {}).get("template",{}).get("spec",{})
env={x.get("name"):x.get("value")
 for c in spec.get("containers",[]) for x in c.get("env",[])}
images=[c.get("image","") for c in spec.get("containers",[])]
prefix="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:"
if m.get("name")!="lszh-offer-browser-staging" or labels.get("lszh-purpose")!="offer-browser-smoke" or labels.get("lszh-temporary")!="true":
    raise SystemExit("NO-GO: wrong service or missing temporary labels")
if spec.get("serviceAccountName")!="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com":
    raise SystemExit("NO-GO: service identity changed")
if env.get("LSZH_PORTAL_STAGING_ENABLED")!="false":
    raise SystemExit("NO-GO: test was activated, manual review needed")
if len(images)!=1 or not images[0].startswith(prefix):
    raise SystemExit("NO-GO: unexpected image")
print(images[0])
PY
)" || fatal "Exact temporary service safety check failed."

printf 'CHECKED: exact temporary disabled service and image.\n'
printf 'WOULD DELETE: %s and its separate temporary service account.\n' "$TEMP"
printf 'WOULD DELETE IMAGE: %s\n' "$IMAGE"
printf 'NEVER DELETE: lszh-offer-portal-staging or its existing account/revisions.\n'
[ "$1" = "--apply" ] || exit 0

# Remove the single owned service first, then its separate service account.
gcloud run services delete "$TEMP" --project="$PROJECT" \
  --region="$REGION" --quiet ||
  fatal "Service deletion failed, no further cleanup attempted."
gcloud iam service-accounts delete "$SA_EMAIL" \
  --project="$PROJECT" --quiet ||
  fatal "Service deleted but temporary SA cleanup failed; inspect manually."

# Cloud Build image in a shared repository: delete exact isolated image tag only.
# Never delete a repository, other image name, or unverified digest.
gcloud artifacts docker images delete "$IMAGE" --project="$PROJECT" \
  --delete-tags --quiet ||
  printf 'NOTICE: exact temporary container image could not be removed; clean it up separately.\n'

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Protected original Cloud Run baseline changed after cleanup."
echo "PASS: temporary test service and service account cleaned up."
echo "PASS: original Cloud Run service remained unchanged."
