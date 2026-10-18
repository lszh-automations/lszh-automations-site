#!/usr/bin/env bash
# Operator-controlled fixed-code diagnostics of an IAM-protected READ-ONLY
# Drive probe on the existing TEMPORARY browser service. No new service,
# no IAM change, no original service mutation, no real contracts or Firestore.
set -euo pipefail
PROJECT="lszh-automations"
REGION="europe-west6"
TEMP="lszh-offer-browser-staging"
SA="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
BEFORE_REV="lszh-offer-browser-staging-00003-j2p"
BEFORE_IMAGE="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:c19d8bb0f514"
BRANCH="feature/optional-avv-acceptance-staging-20261014"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# Four SHA256s of *post-upload Google Drive bytes*, not original fixture
# bytes. All four were independently verified with readOnly=true.
HASHES="2dd5c5377461c969b9a436f36999150dc53cf159f02e4985e2f2536b683b004c,1c337295c205697dd940668bfc2fb4141fbc67d9dc21f27e764d67ac02e48233,baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279,53f9deda2000e219f79e0496b33f1e74df8ac00eac09f221b2436c3fd848d060"
fatal(){ echo "NO-GO: $*" >&2;exit 1; }

[ "$#" -eq 2 ] && { [ "$1" = "--check" ] || [ "$1" = "--apply" ]; } ||
 fatal "Usage: bash scripts/offer-temp-drive-phase-release.sh --check|--apply FOLDER_ID"
MODE="$1";FOLDER="$2"
[[ "$FOLDER" =~ ^[a-zA-Z0-9_-]{20,100}$ ]] ||
 fatal "Unexpected folder identifier"
[ "$FOLDER" != "1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in" ] ||
 fatal "Cannot run probe on main archive"
for cmd in gcloud git python3;do command -v "$cmd" >/dev/null || fatal "Missing $cmd";done
[ "$(git -C "$ROOT" branch --show-current)" = "$BRANCH" ] ||
 fatal "Must use audited feature branch"
[ -z "$(git -C "$ROOT" status --porcelain)" ] || fatal "Dirty Git working tree"
[ "$(gcloud config get-value account 2>/dev/null)" = "lars@lszh-automations.ch" ] ||
 fatal "Wrong Google account (business identity required)"
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Original protected internal preflight changed"
DESC="$(mktemp)";POLICY="$(mktemp)";STAGE=""
cleanup(){ rm -f "$DESC" "$POLICY"; if [ -n "$STAGE" ];then rm -rf "$STAGE";fi; }
trap cleanup EXIT
gcloud run services describe "$TEMP" --project="$PROJECT" \
 --region="$REGION" --format=json > "$DESC" || fatal "Temporary service missing"
gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
 --region="$REGION" --format=json > "$POLICY" || fatal "Temporary IAM unavailable"

python3 - "$DESC" "$POLICY" "$FOLDER" <<'PY'
import json,sys,re
s=json.load(open(sys.argv[1]));p=json.load(open(sys.argv[2]));folder=sys.argv[3]
meta=s.get("metadata") or {}
labels=meta.get("labels") or {}
annotations=meta.get("annotations") or {}
spec=(s.get("spec") or {}).get("template",{}).get("spec") or {}
env={x.get("name"):x.get("value") for c in spec.get("containers",[]) for x in c.get("env",[])}
traffic=(s.get("status") or {}).get("traffic") or []
images=[c.get("image") for c in spec.get("containers",[])]
assert meta.get("name")=="lszh-offer-browser-staging"
assert labels.get("lszh-purpose")=="offer-browser-smoke"
assert labels.get("lszh-temporary")=="true"
assert annotations.get("run.googleapis.com/ingress")=="all"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false"
assert env.get("LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED")=="true"
assert env.get("LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED")=="true"
assert env.get("LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED") in (None,"false")
assert re.fullmatch(r"[0-9a-f]{64}(,[0-9a-f]{64}){3}",env.get("LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES") or "")
assert env.get("LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER")==folder
assert env.get("GOOGLE_CLOUD_PROJECT")=="lszh-automations"
assert len(traffic)==1
assert traffic[0].get("revisionName")=="lszh-offer-browser-staging-00003-j2p"
assert traffic[0].get("percent")==100
assert images==["europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:c19d8bb0f514"]
bindings=p.get("bindings") or []
assert not any(x in ("allUsers","allAuthenticatedUsers")
    for b in bindings for x in b.get("members",[]))
assert any(b.get("role")=="roles/run.invoker" and
    "user:lars@lszh-automations.ch" in b.get("members",[]) for b in bindings)
print("PASS: current synthetic-only read probe unchanged and named IAM Invoker only.")
PY

# Ensure expected business test child folder is accessible and contains exactly
# the four test PDFs before *any* build/deploy. This call is purely read-only
# and delegates to the independently tested, narrow Drive grant guard.
# The original grant tool is pinned to older temporary revision 00002,
# so reuse ONLY its pure read-only Drive validations here. This release script
# separately verifies exact current revision 00003 above and never grants IAM.
python3 - "$ROOT" "$FOLDER" <<'PY' ||
 fatal "Business Drive synthetic subfolder verification failed"
import runpy,sys
root,folder=sys.argv[1:]
try:
    check=runpy.run_path(root+"/scripts/offer-temp-drive-folder-reader.py")
    token=check["get_token"]()
    meta_url,list_url,_=check["urls"](folder)
    granted=check["verify_folder"](check["api"](token,"GET",meta_url),folder)
    files_ok=check["verify_list"](check["api"](token,"GET",list_url),folder)
    if not granted or files_ok is not True:
        raise ValueError("scoped_reader_or_pdf_set_unverified")
    print("PASS: business-owned synthetic PDF folder, four files and scoped temporary reader verified.")
except Exception:
    sys.exit("NO-GO: cannot verify synthetic business folder and reader without writes")
PY
gcloud projects get-iam-policy "$PROJECT" --format=json |
 python3 -c '
import json,sys
p=json.load(sys.stdin)
for b in p.get("bindings",[]):
 if b.get("role") in ("roles/run.invoker","roles/run.admin","roles/owner","roles/editor") and any(
    x in ("allUsers","allAuthenticatedUsers") for x in b.get("members",[])
 ):
  raise SystemExit("NO-GO: project-wide public Cloud Run role")
' || fatal "Cannot prove safe project IAM"

echo "PASS: existing temporary static demo and four synthetic business Drive PDFs verified."
echo "PLAN: deploy only TEMP browser service with no Firestore, mail, offer or contract route."
echo "PLAN: keep the same IAM-only Drive probe and log only fixed failure phases, no raw Google errors."
[ "$MODE" = "--apply" ] || {
 echo "READ-ONLY CHECK PASS: run --apply to build and deploy a temporary read-only check revision."
 exit 0
}

STAGE="$(mktemp -d)"
mkdir -p "$STAGE/cloud-run/offer-portal-staging" \
 "$STAGE/cloud-run/archive-reader-staging" "$STAGE/offerte-annehmen"
cp "$ROOT/cloud-run/offer-portal-staging/"*.mjs "$STAGE/cloud-run/offer-portal-staging/"
cp "$ROOT/cloud-run/offer-portal-staging/package.json" "$STAGE/cloud-run/offer-portal-staging/"
cp "$ROOT/cloud-run/archive-reader-staging/archiveBundleVerifier.mjs" \
 "$STAGE/cloud-run/archive-reader-staging/"
cp "$ROOT/offerte-annehmen/index.html" "$STAGE/offerte-annehmen/"
cp "$ROOT/cloud-run/Dockerfile.offer-portal-staging" "$STAGE/Dockerfile"

# Never commit the child folder ID or customer/test file IDs to GitHub. The
# source archive contains no environment config or secrets.
REV="$(git -C "$ROOT" rev-parse --short=12 HEAD)"
IMAGE="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:$REV"
gcloud builds submit "$STAGE" --project="$PROJECT" --region="$REGION" \
 --tag="$IMAGE" --quiet || fatal "Build failed; existing demo was not changed"
cat > "$STAGE/temp-env.yaml" <<EOF
LSZH_PORTAL_STAGING_ENABLED: "false"
LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED: "true"
LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED: "true"
LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED: "true"
LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER: "$FOLDER"
LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES: "$HASHES"
GOOGLE_CLOUD_PROJECT: "lszh-automations"
EOF
chmod 600 "$STAGE/temp-env.yaml"

gcloud run deploy "$TEMP" --project="$PROJECT" --region="$REGION" \
 --image="$IMAGE" --service-account="$SA" \
 --ingress=all --no-allow-unauthenticated --invoker-iam-check \
 --env-vars-file="$STAGE/temp-env.yaml" \
 --labels="lszh-purpose=offer-browser-smoke,lszh-temporary=true" \
 --min-instances=0 --max-instances=1 --concurrency=1 \
 --memory=512Mi --cpu=1 --timeout=30 --quiet ||
 fatal "New temporary revision deploy failed; investigate without changing original."

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Original internal preflight changed after temporary deployment!"
echo "SUCCESS: temporary read-only Drive phase diagnostic revision deployed. No data writes."
echo "NEXT: perform one IAM-authenticated GET /_lszh/synthetic-drive-check, then read ONLY fixed LSZH_TEMP_DRIVE_DIAG log codes."
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
 --format='value(status.url)'
