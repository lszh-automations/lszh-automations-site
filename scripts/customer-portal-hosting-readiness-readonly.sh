#!/usr/bin/env bash
# Read-only first-customer Firebase Hosting / DNS / Cloud Run readiness inventory.
# No Firebase project initialization, no resource creation, no secret reads, no deployment.
set -euo pipefail
PROJECT=lszh-automations
REGION=europe-west6
SERVICE=lszh-offer-portal
HOST=portal.lszh-automations.ch
SITE=lszh-automations-portal
echo "LSZH KUNDENPORTAL HOSTING INVENTUR – NUR LESEN"
echo "Ziel: $HOST | Projekt: $PROJECT | Cloud Run: $SERVICE ($REGION)"
command -v gcloud >/dev/null || { echo "BLOCK: Google Cloud CLI nicht vorhanden"; exit 2; }
ACTIVE="$(gcloud config get-value project 2>/dev/null || true)"
[[ "$ACTIVE" == "$PROJECT" ]] || { echo "BLOCK: falsches Cloud-Projekt: $ACTIVE"; exit 2; }
if gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format="value(status.latestReadyRevisionName)" 2>/dev/null | grep -Eq '^lszh-offer-portal-[0-9]{5}-[a-z0-9]+$'; then
 echo "PASS: Kunden-Cloud-Run-Dienst vorhanden"
else
 echo "OFFEN: Kunden-Cloud-Run-Dienst nicht nachgewiesen"
fi
if gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format="value(spec.template.spec.containers[0].env[0].value)" 2>/dev/null | grep -Fxq false; then
 echo "PASS: Kundenannahme im Runtime-Flag weiterhin deaktiviert"
else
 echo "PRUEFEN: Kundenannahme-Flag muss vor Go-live gesondert kontrolliert werden"
fi
if gcloud services list --enabled --project="$PROJECT" --format="value(config.name)" 2>/dev/null | grep -Fxq 'firebase.googleapis.com'; then
 echo "PASS: Firebase Management API im Projekt aktiviert"
else
 echo "OFFEN: Firebase Management API nicht als aktiviert nachgewiesen"
fi
if command -v firebase >/dev/null; then
 echo "PASS: Firebase CLI vorhanden"
 if firebase hosting:sites:list --project "$PROJECT" 2>/dev/null | grep -Fq "$SITE"; then
   echo "PASS: isolierte Hosting-Site $SITE vorhanden"
 else
   echo "OFFEN: Hosting-Site $SITE nicht sichtbar (ggf. Firebase-Projekt/CLI-Anmeldung)"
 fi
else
 echo "OFFEN: Firebase CLI fehlt – noch kein Hosting-Deployment starten"
fi
if command -v dig >/dev/null; then
 A="$(dig +short "$HOST" A | tr '\n' ',' || true)"
 CNAME="$(dig +short "$HOST" CNAME | tr '\n' ',' || true)"
 echo "DNS A: ${A:-kein Eintrag}"
 echo "DNS CNAME: ${CNAME:-kein Eintrag}"
else
 echo "INFO: dig nicht installiert, DNS nicht ausgewertet"
fi
echo "ABSCHLUSS: reine Bestandsaufnahme. Kein Firebase-Deploy, kein Domain-/IAM-/Secret-Änderung, keine E-Mail."
