#!/usr/bin/env bash
# One-off Cloud Run Job readback using the same service identity and image as
# the real production portal. Creates and then deletes only its TEMPORARY JOB.
# No SA impersonation, no IAM change, no deploy/update of the portal service.
set -euo pipefail
umask 077
PROJECT=lszh-automations
REGION=europe-west6
SERVICE=lszh-offer-portal
SA=lszh-offer-portal@lszh-automations.iam.gserviceaccount.com
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for command in gcloud base64; do
  command -v "$command" >/dev/null || { echo "BLOCK: $command nicht installiert"; exit 2; }
done
[[ "$(gcloud config get-value project 2>/dev/null)" == "$PROJECT" ]] || {
  echo "BLOCK: falsches GCP-Projekt"; exit 2;
}
CONFIG="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json)"
FLAG="$(printf '%s' "$CONFIG" | python3 -c 'import json,sys; s=json.load(sys.stdin); print(next((x.get("value","") for c in s.get("spec",{}).get("template",{}).get("spec",{}).get("containers",[]) for x in c.get("env",[]) if x.get("name")=="LSZH_PORTAL_PRODUCTION_ENABLED"),"MISSING"))')"
[[ "$FLAG" == false ]] || { echo "BLOCK: Kundenannahme nicht nachweislich ausgeschaltet"; exit 2; }
IMAGE="$(printf '%s' "$CONFIG" | python3 -c 'import json,sys; s=json.load(sys.stdin); print(next((c.get("image","") for c in s["spec"]["template"]["spec"]["containers"]),""))')"
[[ -n "$IMAGE" ]] || { echo "BLOCK: Cloud-Run-Image nicht ermittelt"; exit 2; }
LIVE_SA="$(printf '%s' "$CONFIG" | python3 -c 'import json,sys; s=json.load(sys.stdin); print(s["spec"]["template"]["spec"].get("serviceAccountName",""))')"
[[ "$LIVE_SA" == "$SA" ]] || { echo "BLOCK: Servicekonto des aktuellen Portals stimmt nicht überein"; exit 2; }
[[ -s "$DIR/customer-portal-drive-runtime-check.cjs" ]] || { echo "BLOCK: JS-Prüfdatei fehlt"; exit 2; }

JOB="lszh-drive-pdfcheck-$(date +%Y%m%d%H%M%S)"
B64="$(base64 < "$DIR/customer-portal-drive-runtime-check.cjs" | tr -d '\n')"
CREATED=0
cleanup(){
  if [[ "$CREATED" == 1 ]]; then
    if gcloud run jobs delete "$JOB" --project="$PROJECT" --region="$REGION" --quiet >/dev/null 2>&1; then
      echo "PASS: Temporärer Cloud Run Job entfernt"
    else
      echo "ACHTUNG: Job $JOB manuell aufräumen; keine Produktionsdienste betroffen"
    fi
  fi
}
trap cleanup EXIT
echo "LSZH – einmaliger echter Cloud-Run-Dienstidentitätstest"
echo "PASS: Kundenannahme weiterhin deaktiviert; bestehendes Image/Dienstkonto bestätigt"
echo "Erzeuge einmaligen Lesetest-Job in $REGION (keine Secrets, keine Kundenaktionen)"
gcloud run jobs create "$JOB" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$SA" \
  --tasks=1 --max-retries=0 --task-timeout=180s \
  --command=node \
  --args='^@^-e@eval(Buffer.from(process.env.LSZH_RUNTIME_JS_B64,"base64").toString("utf8"))' \
  --set-env-vars="LSZH_RUNTIME_JS_B64=$B64" \
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
  if [[ "$LOGS" == *"PASS: 2/2 Geschäfts-PDFs"* || "$LOGS" == *"OFFEN:"* ]]; then
    break
  fi
  sleep 5
done
echo "Ergebnis aus Cloud-Run-Logs (nur PASS/OFFEN):"
printf '%s\n' "$LOGS"
if [[ "$SUCCESS" == 1 && "$LOGS" == *"PASS: 2/2 Geschäfts-PDFs"* ]]; then
  echo "PASS: kompletter Laufzeit-Lesetest bestanden"
else
  echo "OFFEN: Kein vollständiger PDF-PASS nachgewiesen (Job-Logs prüfen)"
  exit 4
fi
