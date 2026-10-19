#!/usr/bin/env bash
# LSZH Automations first customer pilot: READ ONLY cloud inventory.
# Does not create databases, accounts, IAM grants, secrets, services, DNS or customers.
set -euo pipefail
PROJECT="lszh-automations"
REGION="europe-west6"
SERVICE="lszh-offer-portal"
ACCOUNT="lszh-offer-portal@lszh-automations.iam.gserviceaccount.com"
DATABASE="lszh-offers"
if ! command -v gcloud >/dev/null 2>&1; then
  echo "BLOCK: gcloud nicht gefunden" >&2
  exit 2
fi
active="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$active" != "$PROJECT" ]]; then
  echo "BLOCK: aktives Google-Cloud-Projekt ist nicht $PROJECT (Wert: ${active:-keines})" >&2
  exit 2
fi
printf '%s\n' "LSZH READ_ONLY PILOT INVENTORY – keine Ressourcen werden verändert"
printf '%s\n' "Projekt: $PROJECT | Region: $REGION"
failed=0
run_check(){
  local label="$1";shift
  if "$@" >/dev/null 2>&1; then
    printf 'PASS: %s vorhanden/lesbar\n' "$label"
  else
    printf 'OFFEN: %s nicht vorhanden oder kein Leserecht\n' "$label"
    failed=$((failed+1))
  fi
}
run_check "Kundenservice Cloud Run ($SERVICE)" \
  gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format='value(metadata.name)'
run_check "eigenes Kunden-Servicekonto" \
  gcloud iam service-accounts describe "$ACCOUNT" --project="$PROJECT" --format='value(email)'
run_check "benannte Kunden-Firestore-DB ($DATABASE)" \
  gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" --format='value(name)'
printf '%s\n' "HINWEIS: Dieser Check prüft weder IAM-Wirksamkeit noch Secrets, Domain/HTTPS, Drive-Lesezugriff oder finale Vertragsunterlagen."
printf '%s\n' "HINWEIS: Auch 3x PASS bedeutet KEIN Go-live; getrennte Funktions-/Kundentests bleiben erforderlich."
if [[ "$failed" -gt 0 ]]; then
  printf 'ERGEBNIS: %s fehlende oder nicht lesbare Infrastruktur-Prüfpunkte\n' "$failed"
else
  printf '%s\n' "ERGEBNIS: Basisressourcen lesbar; weiter mit Identitäts-/Domain-/Enddokument-Prüfung"
fi
