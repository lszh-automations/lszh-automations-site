#!/usr/bin/env bash
# READ-ONLY authenticated smoke test for the deployed STATIC design-only demo.
# No deployments, IAM grants, Firestore/Drive access, or offer tokens.
set -euo pipefail
PROJECT="lszh-automations"
REGION="europe-west6"
TEMP="lszh-offer-browser-staging"
EXPECTED_REVISION="lszh-offer-browser-staging-00002-fkq"
PORT="18087"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fatal(){ printf 'NO-GO: %s\n' "$*" >&2; exit 1; }

[ "$#" -eq 0 ] || fatal "Usage: bash scripts/offer-browser-static-demo-smoke.sh"
for cmd in gcloud python3 curl; do command -v "$cmd" >/dev/null || fatal "Missing $cmd"; done
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Original internal service no longer matches read-only baseline."

DIR="$(mktemp -d)"
PID=""
cleanup(){
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -rf "$DIR"
}
trap cleanup EXIT
gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
 --format=json > "$DIR/service.json" || fatal "Cannot inspect temporary service."
gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
 --region="$REGION" --format=json > "$DIR/iam.json" ||
 fatal "Cannot inspect temporary IAM."
python3 - "$DIR/service.json" "$DIR/iam.json" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
p=json.load(open(sys.argv[2]))
meta=s.get("metadata") or {}
ann=meta.get("annotations") or {}
labels=meta.get("labels") or {}
spec=(s.get("spec") or {}).get("template",{}).get("spec") or {}
env={v.get("name"):v.get("value") for c in spec.get("containers",[]) for v in c.get("env",[])}
traffic=s.get("status",{}).get("traffic") or []
assert meta.get("name")=="lszh-offer-browser-staging"
assert labels.get("lszh-purpose")=="offer-browser-smoke"
assert labels.get("lszh-temporary")=="true"
assert ann.get("run.googleapis.com/ingress")=="all"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false"
assert env.get("LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED")=="true"
assert env.get("GOOGLE_CLOUD_PROJECT")=="lszh-automations"
assert len(traffic)==1 and traffic[0].get("revisionName")=="lszh-offer-browser-staging-00002-fkq" and traffic[0].get("percent")==100
members=p.get("bindings") or []
assert not any(x in ("allUsers","allAuthenticatedUsers") for b in members for x in b.get("members",[]))
assert any(b.get("role")=="roles/run.invoker" and
 "user:lars@lszh-automations.ch" in b.get("members",[]) for b in members)
print("PASS: correct temporary static-demo revision, IAM and hard-disabled full portal.")
PY

# gcloud proxy injects IAM authentication; no bearer tokens printed or stored.
gcloud run services proxy "$TEMP" --project="$PROJECT" \
 --region="$REGION" --port="$PORT" > "$DIR/proxy.log" 2>&1 &
PID=$!
STATUS=""
for _ in $(seq 1 30); do
  STATUS="$(curl --max-time 4 --silent --show-error \
    -D "$DIR/headers" -o "$DIR/page" -w "%{http_code}" \
    "http://127.0.0.1:$PORT/offerte-annehmen/?demo=1" 2>/dev/null || true)"
  [ "$STATUS" = "200" ] && break
  sleep 1
done
[ "$STATUS" = "200" ] ||
 fatal "Expected authenticated static demo HTTP 200; got $STATUS."
grep -Fq 'MUSTER-2026-001' "$DIR/page" ||
 fatal "Expected synthetic-only customer design page missing."
grep -Fq 'unverbindliche Designvorschau' "$DIR/page" ||
 fatal "Synthetic-only demo label missing."
grep -Fqi 'Content-Type: text/html' "$DIR/headers" ||
 fatal "Unexpected response type."
grep -Fqi "connect-src 'none'" "$DIR/headers" ||
 fatal "Browser must not connect to any backend."
grep -Fqi "form-action 'none'" "$DIR/headers" ||
 fatal "Browser form submission must remain blocked."
grep -Fqi 'Cache-Control: no-store' "$DIR/headers" ||
 fatal "Protected demo should not be cached."
echo "PASS: real authenticated Cloud Run design demo serves synthetic HTML with strict CSP."

for route in '/offerte-annehmen/' '/offerte-annehmen/?code=SYNTHETIC_NOT_A_LINK' \
 '/offerte-annehmen/?demo=1&code=SYNTHETIC_NOT_A_LINK' \
 '/api/offer/preview' '/api/offer/document' '/api/offer/accept'; do
 STATUS="$(curl -sS --max-time 6 -o /dev/null -w "%{http_code}" \
  "http://127.0.0.1:$PORT$route" 2>/dev/null || true)"
 [ "$STATUS" = "503" ] ||
  fatal "Expected GET HTTP 503 for protected route; got $STATUS."
done
for route in '/api/offer/preview' '/api/offer/document' '/api/offer/accept'; do
 STATUS="$(curl -sS --max-time 6 -o /dev/null -w "%{http_code}" \
   -X POST -H 'Content-Type: application/json' \
   --data '{"code":"SYNTHETIC_INVALID_TOKEN"}' \
   "http://127.0.0.1:$PORT$route" 2>/dev/null || true)"
 [ "$STATUS" = "503" ] ||
  fatal "Expected POST HTTP 503 for disabled API; got $STATUS."
done
echo "PASS: personal links and every API/PDF/contract route return HTTP 503."

python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
 fatal "Protected original service changed after smoke."
echo "SUCCESS: deployed temporary static-demo live smoke passed; no cloud mutation."
