#!/usr/bin/env bash
# LSZH Cloud Run STAGING only. Read-only service/IAM inspection + authenticated
# GET /health. Not authorized to call /internal/reconcile or change any resources.
set -euo pipefail
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
SERVICE='lszh-onboarding-outbox-staging'
SA='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'
for cmd in gcloud curl python3; do
  command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd"; exit 2; }
done
active_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
active_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$active_account" != "$ACCOUNT" || "$active_project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong business account/project'; exit 2
fi
echo 'Checking Cloud Run spec (read-only)...'
gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --format=json | python3 -c '
import json,sys
d=json.load(sys.stdin)
m=d.get("metadata") or {}
spec=((d.get("spec") or {}).get("template") or {}).get("spec") or {}
annotations=m.get("annotations") or {}
containers=spec.get("containers") or []
envs={x.get("name"):x.get("value") for x in (containers[0].get("env") or [])} if containers else {}
expect={
 "LSZH_OUTBOX_STAGE_ENABLED":"false",
 "FIRESTORE_PROJECT_ID":"lszh-automations",
 "FIRESTORE_DATABASE_ID":"lszh-offers-staging"
}
errors=[]
if m.get("name")!="lszh-onboarding-outbox-staging":errors.append("wrong service name")
if spec.get("serviceAccountName")!="lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com":errors.append("wrong runtime service account")
if annotations.get("run.googleapis.com/ingress")!="all":errors.append("unexpected ingress")
if envs!=expect:errors.append("unexpected environment values (or secret source)")
if errors:
 for e in errors:print("FAIL: "+e)
 sys.exit(2)
print("PASS: Cloud Run name, identity, ingress and disabled no-secret runtime environment.")
'
echo 'Checking no public invoker on this service...'
gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --format=json | python3 -c '
import json,sys
policy=json.load(sys.stdin)
for binding in policy.get("bindings", []):
 if any(m in ("allUsers","allAuthenticatedUsers") for m in binding.get("members",[])):
  print("FAIL: Public principal detected in service IAM policy.")
  sys.exit(2)
print("PASS: No allUsers/allAuthenticatedUsers entries in service IAM policy.")
print("NOTE: Parent-level inherited invoker access is not checked.")
'
URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(status.url)')"
if [[ ! "$URL" =~ ^https://[A-Za-z0-9.-]+\.run\.app$ ]]; then
  echo 'STOP: Cloud Run returned an invalid service URL'; exit 2
fi
echo 'Invoking authenticated health check (GET only, no data writes)...'
curl -fsS --connect-timeout 8 --max-time 20 \
  -H "Authorization: Bearer $(gcloud auth print-identity-token)" \
  "$URL/health" | python3 -c '
import json,sys
v=json.load(sys.stdin)
if v != {"service":"lszh-onboarding-draft-outbox","enabled":False}:
 print("FAIL: Unexpected health response; not confirmed disabled.");sys.exit(2)
print("PASS: Authenticated health returned enabled=false.")
'
echo 'PASS: Disabled private STAGING health check; no onboarding/Firestore/write path executed.'
