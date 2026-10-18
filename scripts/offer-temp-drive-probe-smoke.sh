#!/usr/bin/env bash
# READ-ONLY, IAM authenticated Cloud Run -> Google Drive PDF integrity smoke.
# No deployments, IAM edits, email, acceptance or Firestore/Drive writes.
set -euo pipefail
PROJECT="lszh-automations"
REGION="europe-west6"
TEMP="lszh-offer-browser-staging"
EXPECTED_REVISION="lszh-offer-browser-staging-00003-j2p"
EXPECTED_IMAGE="europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:c19d8bb0f514"
SA_EMAIL="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
FOLDER="10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko"
PORT="18089"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fatal(){ echo "NO-GO: $*" >&2; exit 1; }
[ "$#" -eq 0 ] || fatal "Usage: bash scripts/offer-temp-drive-probe-smoke.sh"
for cmd in gcloud python3 curl;do command -v "$cmd" >/dev/null || fatal "Missing $cmd";done
[ "$(gcloud config get-value account 2>/dev/null)" = "lars@lszh-automations.ch" ] ||
 fatal "Business Cloud user identity required"

DIR="$(mktemp -d)"
PROXY_PID=""
cleanup(){
 if [ -n "$PROXY_PID" ];then
  kill "$PROXY_PID" 2>/dev/null || true
  wait "$PROXY_PID" 2>/dev/null || true
 fi
 rm -rf "$DIR"
}
trap cleanup EXIT

# Protect the old internal service before and after network exercise.
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Original internal portal preflight baseline has changed."
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
 --format=json > "$DIR/service.json" || fatal "Cannot inspect temporary service."
gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
 --region="$REGION" --format=json > "$DIR/iam.json" ||
 fatal "Cannot inspect temporary service IAM."

python3 - "$DIR/service.json" "$DIR/iam.json" <<'PY'
import json,sys,re
s=json.load(open(sys.argv[1]));p=json.load(open(sys.argv[2]))
meta=s.get("metadata") or {}
ann=meta.get("annotations") or {}
labels=meta.get("labels") or {}
spec=(s.get("spec") or {}).get("template",{}).get("spec") or {}
env={x.get("name"):x.get("value") for c in spec.get("containers",[]) for x in c.get("env",[])}
traffic=(s.get("status") or {}).get("traffic") or []
images=[c.get("image") for c in spec.get("containers",[])]
assert meta.get("name")=="lszh-offer-browser-staging"
assert labels.get("lszh-purpose")=="offer-browser-smoke"
assert labels.get("lszh-temporary")=="true"
assert ann.get("run.googleapis.com/ingress")=="all"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
assert env.get("GOOGLE_CLOUD_PROJECT")=="lszh-automations"
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false"
assert env.get("LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED")=="true"
assert env.get("LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED")=="true"
assert env.get("LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER")=="10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko"
hashes=(env.get("LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES") or "").split(",")
assert len(hashes)==4 and len(set(hashes))==4 and all(re.fullmatch(r"[0-9a-f]{64}",x) for x in hashes)
assert not env.get("LSZH_PORTAL_DATABASE")
assert len(traffic)==1 and traffic[0].get("revisionName")=="lszh-offer-browser-staging-00003-j2p" and traffic[0].get("percent")==100
assert images==["europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/lszh-offer-browser-staging:c19d8bb0f514"]
bindings=p.get("bindings") or []
assert not any(x in ("allUsers","allAuthenticatedUsers") for b in bindings for x in b.get("members",[]))
assert any(b.get("role")=="roles/run.invoker" and
 "user:lars@lszh-automations.ch" in b.get("members",[]) for b in bindings)
print("PASS: exact temporary revision, business IAM invoker, read-only Drive test and disabled full portal.")
PY

# All network requests use the IAM-authenticated gcloud proxy. No token printed.
gcloud run services proxy "$TEMP" --project="$PROJECT" \
 --region="$REGION" --port="$PORT" > "$DIR/proxy.log" 2>&1 &
PROXY_PID=$!
STATUS=""
for _ in $(seq 1 30);do
 STATUS="$(curl --silent --max-time 5 -o "$DIR/page.html" -D "$DIR/page.headers" \
  -w "%{http_code}" "http://127.0.0.1:$PORT/offerte-annehmen/?demo=1" 2>/dev/null || true)"
 [ "$STATUS" = "200" ] && break
 sleep 1
done
[ "$STATUS" = "200" ] || fatal "Design demo should return 200 but returned $STATUS."
grep -Fq 'MUSTER-2026-001' "$DIR/page.html" ||
 fatal "Expected synthetic demo HTML missing."
grep -Fqi "connect-src 'none'" "$DIR/page.headers" ||
 fatal "Strict Content Security Policy absent."
grep -Fqi "form-action 'none'" "$DIR/page.headers" ||
 fatal "Browser form submissions must stay blocked."
echo "PASS: authenticated Cloud Run design preview still HTTP 200 and strictly static."

# Actual IAM service-account Google Drive verification in a hard-disabled
# noncontract endpoint: four PDFs, metadata locks and full byte SHA256.
STATUS="$(curl --silent --max-time 100 \
 -o "$DIR/drive-result.json" -D "$DIR/drive-result.headers" \
 -w "%{http_code}" "http://127.0.0.1:$PORT/_lszh/synthetic-drive-check" 2>/dev/null || true)"
if [ "$STATUS" != "200" ];then
 echo "NO-GO: authenticated Cloud Run -> Drive returned HTTP $STATUS (expected 200)." >&2
 echo "Review Cloud Run diagnostic logs with redaction; do NOT deploy again or widen IAM." >&2
 exit 1
fi
python3 - "$DIR/drive-result.json" "$DIR/drive-result.headers" <<'PY'
import json,sys
result=json.load(open(sys.argv[1]))
if result!={"status":"PASS_SYNTHETIC_ARCHIVE_READ_ONLY","verifiedFiles":4}:
 raise SystemExit("NO-GO: exact four-file archive PASS response missing.")
headers=open(sys.argv[2]).read().lower()
if "cache-control: no-store" not in headers or "content-type: application/json" not in headers:
 raise SystemExit("NO-GO: unexpected probe response headers.")
print("PASS: real Cloud Run service account read and verified four locked business Google Drive PDFs.")
PY

# Reject all calls which could access individual PDF or legal acceptance.
for path in '/_lszh/synthetic-drive-check?demo=1' \
 '/_lszh/synthetic-drive-check/' '/offerte-annehmen/?code=SYNTHETIC_INVALID' \
 '/offerte-annehmen/?demo=1&code=SYNTHETIC_INVALID' \
 '/api/offer/preview' '/api/offer/document' '/api/offer/accept';do
 STATUS="$(curl --silent --max-time 8 -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:$PORT$path" 2>/dev/null || true)"
 [ "$STATUS" = "503" ] || fatal "Protected GET endpoint unexpectedly returned HTTP $STATUS."
done
for path in '/_lszh/synthetic-drive-check' '/api/offer/preview' \
 '/api/offer/document' '/api/offer/accept';do
 STATUS="$(curl --silent --max-time 8 -o /dev/null -w "%{http_code}" \
  -X POST -H 'Content-Type: application/json' \
  --data '{"code":"SYNTHETIC_INVALID_NOT_A_TOKEN"}' \
  "http://127.0.0.1:$PORT$path" 2>/dev/null || true)"
 [ "$STATUS" = "503" ] || fatal "Protected POST endpoint unexpectedly returned HTTP $STATUS."
done
echo "PASS: all token, PDF/contract and POST endpoints remain disabled HTTP 503."
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Original internal protected service changed after read-only smoke."
echo "SUCCESS: temporary Cloud Run -> business Drive four-file integrity live smoke passed; no cloud data or IAM mutations."
