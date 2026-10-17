#!/usr/bin/env bash
# Read-only, authenticated smoke test of the disabled TEMPORARY browser service.
# Never updates, deploys, grants access, uploads data or exposes bearer tokens.
set -euo pipefail
PROJECT=lszh-automations
REGION=europe-west6
TEMP="lszh-offer-browser-staging"
PORT=18086
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fatal(){ echo "NO-GO: $*" >&2; exit 1; }

[ "$#" -eq 0 ] || fatal "Usage: bash scripts/offer-browser-cloud-smoke.sh"
for tool in gcloud python3 curl; do command -v "$tool" >/dev/null || fatal "Missing $tool"; done
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Original internal preflight has changed"
SERVICE="$(mktemp)"
POLICY="$(mktemp)"
LOG="$(mktemp)"
PID=""
cleanup(){
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -f "$SERVICE" "$POLICY" "$LOG"
}
trap cleanup EXIT

gcloud run services describe "$TEMP" --project="$PROJECT" --region="$REGION" \
  --format=json > "$SERVICE" || fatal "Temporary service not found."
gcloud run services get-iam-policy "$TEMP" --project="$PROJECT" \
  --region="$REGION" --format=json > "$POLICY" ||
  fatal "Cannot inspect temporary IAM."
python3 - "$SERVICE" "$POLICY" <<'PY'
import json,sys
s=json.load(open(sys.argv[1]))
p=json.load(open(sys.argv[2]))
m=s.get("metadata",{})
a=m.get("annotations",{})
labels=m.get("labels",{})
spec=s.get("spec",{}).get("template",{}).get("spec",{})
env={e["name"]:e.get("value") for c in spec.get("containers",[]) for e in c.get("env",[])}
assert m.get("name")=="lszh-offer-browser-staging"
assert labels.get("lszh-purpose")=="offer-browser-smoke"
assert labels.get("lszh-temporary")=="true"
assert a.get("run.googleapis.com/ingress")=="all"
assert spec.get("serviceAccountName")=="lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com"
assert env.get("LSZH_PORTAL_STAGING_ENABLED")=="false"
assert not any(x in ("allUsers","allAuthenticatedUsers")
    for b in p.get("bindings",[]) for x in b.get("members",[]))
assert any(b.get("role")=="roles/run.invoker" and
    "user:lars@lszh-automations.ch" in b.get("members",[])
    for b in p.get("bindings",[]))
print("PASS: temporary Cloud Run service is labelled, disabled and IAM protected.")
PY

# Proxy handles authentication; never print an ID token to screen or a file.
gcloud run services proxy "$TEMP" --project="$PROJECT" \
  --region="$REGION" --port="$PORT" > "$LOG" 2>&1 &
PID=$!
STATUS=""
for _ in $(seq 1 25); do
  STATUS="$(curl -sS --connect-timeout 2 --max-time 3 \
     -o /dev/null -w "%{http_code}" \
     "http://127.0.0.1:$PORT/offerte-annehmen/?demo=1" 2>/dev/null || true)"
  [ "$STATUS" = "503" ] && break
  sleep 1
done
[ "$STATUS" = "503" ] ||
  fatal "Expected disabled GET HTTP 503 through IAM proxy; received $STATUS."
STATUS="$(curl -sS --connect-timeout 2 --max-time 6 \
  -o /dev/null -w "%{http_code}" \
  -X POST -H "Content-Type: application/json" \
  --data '{"code":"SYNTHETIC_NOT_VALID"}' \
  "http://127.0.0.1:$PORT/api/offer/accept" 2>/dev/null || true)"
[ "$STATUS" = "503" ] ||
  fatal "Expected blocked POST HTTP 503; received $STATUS."
echo "PASS: authenticated temporary Cloud Run GET returns HTTP 503 as designed."
echo "PASS: acceptance POST is HTTP 503 (no legal acceptance possible)."
python3 "$ROOT/scripts/offer-cloud-readiness-readonly.py" ||
  fatal "Original internal Cloud Run preflight changed after smoke test."
echo "SUCCESS: real Cloud Run network smoke passed without any deployment or data writes."
