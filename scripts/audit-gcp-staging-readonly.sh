#!/usr/bin/env bash
# LSZH Automations – Google Cloud Staging ONLY, READ-ONLY inventory.
# Does NOT create/update database documents, deployments, IAM, or secrets.
set -euo pipefail
set +x
PROJECT='lszh-automations'
DB='lszh-offers-staging'
REGION='europe-west6'

if ! command -v gcloud >/dev/null 2>&1; then
  printf 'FEHLER: gcloud CLI fehlt. Bitte in Google Cloud Shell ausfuehren.\n' >&2
  exit 1
fi
printf '=== LSZH READ-ONLY STAGING AUDIT ===\n'
printf 'Projekt=%s Datenbank=%s Region=%s\n' "$PROJECT" "$DB" "$REGION"
printf 'Aktives Google-Konto: '
gcloud config get-value account 2>/dev/null || true
printf '\n--- Firestore-Datenbank (nur Metadaten) ---\n'
if ! gcloud firestore databases describe \
    --project="$PROJECT" --database="$DB" \
    --format='table(name,locationId,type,concurrencyMode)' ; then
  printf 'NICHT VERIFIZIERT: Firestore-Lesezugriff fehlgeschlagen.\n' >&2
fi

for SERVICE in lszh-offer-portal-staging lszh-archive-reader-staging; do
  printf '\n--- Cloud Run: %s (keine Environment-Variablen / Secrets) ---\n' "$SERVICE"
  if ! gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --format='table(metadata.name,status.latestReadyRevisionName,spec.template.spec.serviceAccountName,spec.template.spec.containers[0].image)' ; then
    printf 'NICHT VERIFIZIERT: Cloud Run Dienst %s nicht abrufbar.\n' "$SERVICE" >&2
    continue
  fi
  REV="$(gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" \
      --format='value(status.latestReadyRevisionName)' 2>/dev/null || true)"
  if [[ -n "$REV" ]]; then
    printf 'Revision (nur Image-Digest und Dienstkonto):\n'
    if ! gcloud run revisions describe "$REV" --project="$PROJECT" --region="$REGION" \
        --format='table(metadata.name,status.imageDigest,spec.serviceAccountName,spec.containers[0].image)' ; then
      printf 'NICHT VERIFIZIERT: Revision %s nicht lesbar.\n' "$REV" >&2
    fi
  else
    printf 'Keine zuletzt bereite Revision abfragbar.\n'
  fi
done
printf '\nFERTIG: Nur Metadaten gelesen; keine Aenderungen ausgeloest.\n'
printf 'ACHTUNG: Ein Image-Digest beweist nicht automatisch, welcher Git-Commit deployt ist.\n'
