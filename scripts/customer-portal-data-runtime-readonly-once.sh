#!/usr/bin/env bash
# One-off, no-write Firestore/Airtable production wiring test.
# Uses current Cloud Run portal image+service identity with a single version-1
# Airtable Secret Manager reference. Creates/deletes only a temporary Job.
# No customer acceptance, no Airtable PATCH, no Firestore mutations, no mail.
set -euo pipefail
umask 077
PROJECT=lszh-automations
REGION=europe-west6
SERVICE=lszh-offer-portal
SA=lszh-offer-portal@lszh-automations.iam.gserviceaccount.com
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for bin in gcloud python3 base64; do
  command -v "$bin" >/dev/null || { echo "BLOCK: $bin nicht vorhanden"; exit 2; }
done
[[ "$(gcloud config get-value project 2>/dev/null)" == "$PROJECT" ]] || {
  echo "BLOCK: falsches Cloud-Projekt"; exit 2;
}
[[ -s "$DIR/customer-portal-data-runtime-readonly.cjs" ]] || {
  echo "BLOCK: Read-only-Pruefprogramm fehlt"; exit 2;
}
CONFIG="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json)"
CHECK="$(printf '%s' "$CONFIG" | python3 -c '
import json,sys
s=json.load(sys.stdin)
spec=s.get("spec",{}).get("template",{}).get("spec",{})
c=spec.get("containers",[{}])[0]
env={e.get("name"):e for e in c.get("env",[])}
traffic=s.get("status",{}).get("traffic",[])
ready=s.get("status",{}).get("latestReadyRevisionName","")
good=(env.get("LSZH_PORTAL_PRODUCTION_ENABLED",{}).get("value")=="false"
  and spec.get("serviceAccountName")=="lszh-offer-portal@lszh-automations.iam.gserviceaccount.com"
  and env.get("LSZH_PORTAL_DATABASE",{}).get("value")=="lszh-offers"
  and env.get("LSZH_PORTAL_TERMS_VERSION",{}).get("value")=="1.0"
  and env.get("LSZH_PORTAL_ORIGIN",{}).get("value")=="https://portal.lszh-automations.ch"
  and bool(env.get("LSZH_AIRTABLE_ACCESS_TOKEN",{}).get("valueFrom",{}).get("secretKeyRef"))
  and bool(c.get("image"))
  and len(traffic)==1 and traffic[0].get("percent")==100
  and traffic[0].get("revisionName")==ready)
print(c.get("image") if good else "BLOCK")
')"
[[ "$CHECK" != "BLOCK" && -n "$CHECK" ]] || {
  echo "BLOCK: Portal-Hard-Off, richtige Runtime, Secrets und 100%-Traffic nicht gemeinsam bestätigt"; exit 2;
}
IMAGE="$CHECK"

JOB="lszh-data-read-$(date +%Y%m%d%H%M%S)"
CREATED=0
cleanup(){
  if [[ "$CREATED" == 1 ]]; then
    if gcloud run jobs delete "$JOB" --project="$PROJECT" --region="$REGION" --quiet >/dev/null 2>&1; then
      echo "PASS: Temporärer Cloud Run Job entfernt"
    else
      echo "ACHTUNG: Temporären Testjob $JOB nachträglich entfernen"
    fi
  fi
}
trap cleanup EXIT

B64="$(base64 < "$DIR/customer-portal-data-runtime-readonly.cjs" | tr -d '\n')"
echo "LSZH – produktiver Firestore/Airtable-Lesetest (keine Schreibvorgänge)"
echo "PASS: Cloud-Run-Service, Live-Revision, Secret-Referenz und deaktivierte Annahme geprüft"
gcloud run jobs create "$JOB" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$SA" \
  --tasks=1 --max-retries=0 --task-timeout=180s \
  --command=node \
  --args='^@^-e@eval(Buffer.from(process.env.LSZH_RUNTIME_JS_B64,"base64").toString("utf8"))' \
  --set-env-vars="LSZH_RUNTIME_JS_B64=$B64" \
  --set-secrets="LSZH_AIRTABLE_ACCESS_TOKEN=lszh-offer-portal-airtable:1" \
  --quiet >/dev/null
CREATED=1
if gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait; then
  SUCCESS=1
else
  SUCCESS=0
fi
LOGS=""
for attempt in 1 2 3 4 5; do
  LOGS="$(gcloud logging read \
    "resource.type=\"cloud_run_job\" AND resource.labels.job_name=\"$JOB\"" \
    --project="$PROJECT" --limit=50 --format="value(textPayload)" 2>/dev/null \
    | grep -E '^(PASS:|OFFEN:|BLOCK:)' || true)"
  if [[ "$LOGS" == *"PASS: Produktiver Firestore- und Airtable-Lesetest abgeschlossen"* || "$LOGS" == *"OFFEN:"* ]]; then
    break
  fi
  sleep 5
done
echo "Nur PASS/OFFEN-Ergebnisse aus dem Testjob:"
printf '%s\n' "$LOGS"
if [[ "$SUCCESS" == 1 && "$LOGS" == *"PASS: Produktiver Firestore- und Airtable-Lesetest abgeschlossen"* ]]; then
  echo "PASS: Firestore/Airtable aus Produktionsidentität verbunden; keine Kundenänderung"
else
  echo "OFFEN: Keine vollständige produktive Firestore/Airtable-Verbindung nachgewiesen"
  exit 4
fi
