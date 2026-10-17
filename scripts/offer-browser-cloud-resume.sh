#!/usr/bin/env bash
# Resume the single authorised Cloud Run browser-preview deployment after
# Cloud Run rejected iam.serviceAccounts.actAs. No rebuild or new SA creation.
# Only the prebuilt exact image tag+digest from the 2026-10-17 build is allowed.
set -euo pipefail

PROJECT="lszh-automations"
REGION="europe-west6"
TEMP="lszh-offer-browser-staging"
SA_EMAIL="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
ACCOUNT_EXPECTED="lars@lszh-automations.ch"
IMAGE="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:7f8602e762ce"
IMAGE_DIGEST="sha256:ba69188de7d71b9410ccc519b0249388d66401a01c20d09bb687932265f71678"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fatal(){ echo "NO-GO: $*" >&2; exit 1; }

[ "$#" -eq 1 ] || fatal "Usage: bash scripts/offer-browser-cloud-resume.sh --check | --apply"
[ "$1" = "--check" ] || [ "$1" = "--apply" ] || fatal "Unrecognised option"
for tool in gcloud git python3; do
  command -v "$tool" >/dev/null || fatal "Missing $tool"
done

# The original Cloud Run service must remain fully protected. No broad role
# grants, overrides of the existing service or application activation allowed.
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Protected original service baseline changed."

ACCOUNT="$(gcloud config get-value account 2>/dev/null)"
[ "$ACCOUNT" = "$ACCOUNT_EXPECTED" ] ||
  fatal "Active Google user must be $ACCOUNT_EXPECTED."
gcloud iam service-accounts describe "$SA_EMAIL" \
  --project="$PROJECT" --format='value(email)' >/dev/null ||
  fatal "The previous build's temporary service account is absent."

# Prevent accidental takeover / update of a partially created service.
if gcloud run services describe "$TEMP" --project="$PROJECT" \
  --region="$REGION" --format='value(metadata.name)' >/dev/null 2>&1; then
  fatal "A test service already exists (possibly created partially). Inspect before retrying."
fi

# Pin to the digest reported by the already successful Cloud Build. A changed
# image tag cannot be deployed by this resume script.
ACTUAL_DIGEST="$(gcloud artifacts docker images describe "$IMAGE" \
  --project="$PROJECT" --format='value(image_summary.digest)')" ||
  fatal "Unable to verify existing image."
[ "$ACTUAL_DIGEST" = "$IMAGE_DIGEST" ] ||
  fatal "Existing image digest does not match the approved Cloud Build artifact."
printf 'PASS: preflight unchanged, temporary service absent, existing image SHA256 verified.\n'
printf 'PASS: existing service account present; no new Cloud Build or image upload needed.\n'
printf 'FIX: grant Service Account User only to %s on temporary identity %s.\n' "$ACCOUNT" "$SA_EMAIL"
[ "$1" = "--apply" ] || {
  printf 'READ-ONLY CHECK COMPLETE. Use --apply for the narrowly scoped IAM change and deploy.\n'
  exit 0
}

# No project-wide Service Account User grant; only this individual, temporary
# runtime identity. Fails safely if current user lacks setIamPolicy.
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT" \
  --member="user:$ACCOUNT" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null ||
  fatal "Cannot grant narrow iam.serviceAccountUser binding. Ask an IAM admin; do NOT grant at project scope."
printf 'PASS: specific deployment identity binding added.\n'

gcloud run deploy "$TEMP" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$SA_EMAIL" \
  --ingress=all --no-allow-unauthenticated --invoker-iam-check \
  --set-env-vars="LSZH_PORTAL_STAGING_ENABLED=false" \
  --labels="lszh-purpose=offer-browser-smoke,lszh-temporary=true" \
  --min-instances=0 --max-instances=1 --concurrency=1 \
  --memory=512Mi --cpu=1 --timeout=30 --quiet ||
  fatal "Cloud Run deployment failed; no other services were modified."

gcloud run services add-iam-policy-binding "$TEMP" \
  --project="$PROJECT" --region="$REGION" \
  --member="user:$ACCOUNT" --role="roles/run.invoker" --quiet >/dev/null ||
  fatal "Could not add named Invoker; service remains authentication-protected."

# Verify only the new resource and its disabled flag. No secrets are printed.
gcloud run services describe "$TEMP" --project="$PROJECT" \
  --region="$REGION" --format=json |
python3 -c '
import json,sys
s=json.load(sys.stdin)
m=s.get("metadata",{})
a=m.get("annotations",{})
labels=m.get("labels",{})
spec=s.get("spec",{}).get("template",{}).get("spec",{})
env={x.get("name"):x.get("value") for c in spec.get("containers",[]) for x in c.get("env",[])}
assert m.get("name")=="lszh-offer-browser-staging"
assert a.get("run.googleapis.com/ingress")=="all"
assert labels.get("lszh-purpose")=="offer-browser-smoke"
assert labels.get("lszh-temporary")=="true"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false"
print("PASS: labelled temporary service uses dedicated account and application stays disabled.")
' || fatal "Post-deployment safe configuration not verified."

gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
  --region="$REGION" --format=json |
python3 -c '
import json,sys
policy=json.load(sys.stdin)
bindings=policy.get("bindings",[])
assert not any(x in ("allUsers","allAuthenticatedUsers") for b in bindings for x in b.get("members",[]))
assert any(b.get("role")=="roles/run.invoker" and "user:lars@lszh-automations.ch" in b.get("members",[]) for b in bindings)
print("PASS: only named test user explicitly authorised; no direct public Invoker.")
' || fatal "Direct Invoker policy unsafe, investigate."

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Original read-only service baseline changed."

printf '\nSUCCESS: temporary browser Cloud Run test service deployed privately and disabled.\n'
printf 'No database or Drive access granted; no customer data, acceptance or emails.\n'
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
  --format='value(status.url)'
