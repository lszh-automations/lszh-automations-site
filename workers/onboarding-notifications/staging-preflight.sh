#!/usr/bin/env bash
# Read-only inspection for the separately isolated LSZH outbox STAGING service.
# Must run with the *business* Google Cloud identity in Cloud Shell.
# NO resource creation, authentication changes, IAM changes or deployments.
set -euo pipefail

PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
SERVICE='lszh-onboarding-outbox-staging'
SA="${SERVICE}@${PROJECT}.iam.gserviceaccount.com"
ARTIFACT_REPO='cloud-run-source-deploy'

command -v gcloud >/dev/null || { echo 'FAIL: gcloud CLI fehlt'; exit 2; }
current_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
current_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$current_account" != "$ACCOUNT" ]]; then
  echo 'STOP: Falsches Google-Konto. Nur das LSZH-Geschaeftskonto verwenden.'
  exit 2
fi
if [[ "$current_project" != "$PROJECT" ]]; then
  echo 'STOP: Falsches Cloud-Projekt.'
  exit 2
fi
echo "PASS: Geschaeftskonto und Cloud-Projekt stimmen."

missing=0
enabled="$(gcloud services list --project="$PROJECT" --enabled --format='value(config.name)' 2>/dev/null || true)"
for api in run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com secretmanager.googleapis.com; do
  if printf '%s\n' "$enabled" | grep -Fxq "$api"; then
    echo "PASS: API $api aktiviert"
  else
    echo "OFFEN: API $api nicht als aktiviert bestaetigt"
    missing=1
  fi
done

if gcloud firestore databases describe --project="$PROJECT" --database='lszh-offers-staging' \
     --format='value(name)' >/dev/null 2>&1; then
  echo 'PASS: Firestore lszh-offers-staging lesbar'
else
  echo 'OFFEN: Firestore lszh-offers-staging nicht lesbar'
  missing=1
fi
if gcloud iam service-accounts describe "$SA" --project="$PROJECT" \
     --format='value(email)' >/dev/null 2>&1; then
  echo 'PASS: Dediziertes Outbox-STAGING-Dienstkonto vorhanden'
else
  echo 'OFFEN: Dediziertes Outbox-STAGING-Dienstkonto fehlt oder nicht lesbar'
  missing=1
fi
if gcloud artifacts repositories describe "$ARTIFACT_REPO" --project="$PROJECT" \
     --location="$REGION" --format='value(name)' >/dev/null 2>&1; then
  echo 'PASS: Bestehendes Container-Repository vorhanden'
else
  echo 'OFFEN: Separates Container-Repository fehlt oder nicht lesbar'
  missing=1
fi
if gcloud run services describe "$SERVICE" --project="$PROJECT" \
     --region="$REGION" --format='value(metadata.name)' >/dev/null 2>&1; then
  echo 'HINWEIS: Staging-Service existiert bereits; vor jeder Aenderung manuell pruefen!'
else
  echo 'HINWEIS: Kein Outbox-STAGING-Cloud-Run-Service vorhanden (erwartbar).'
fi

if [[ "$missing" -ne 0 ]]; then
  echo 'RESULTAT: Staging-Voraussetzungen nicht vollstaendig. KEINE AENDERUNGEN.'
  exit 2
fi
echo 'RESULTAT: Grundvoraussetzungen lesend bestaetigt; IAM/Secrets/Go-live NICHT geprueft.'
