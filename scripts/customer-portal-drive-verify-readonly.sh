#!/usr/bin/env bash
# Check two approved base PDFs through a short-lived, Drive-READONLY
# token impersonating the actual production Cloud Run service account.
# Makes NO Drive/GCP changes, never prints credentials or document bytes.
set -euo pipefail
umask 077

PROJECT=lszh-automations
SA=lszh-offer-portal@lszh-automations.iam.gserviceaccount.com
FOLDER=10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "LSZH Kundenportal – Geschäfts-Drive PDF-Integrität, nur lesen"
for bin in gcloud curl jq sha256sum; do
  command -v "$bin" >/dev/null || { echo "BLOCK: $bin fehlt"; exit 2; }
done
PROJECT_ACTIVE="$(gcloud config get-value project 2>/dev/null || true)"
[[ "$PROJECT_ACTIVE" == "$PROJECT" ]] || {
  echo "BLOCK: falsches aktives Google-Cloud-Projekt: $PROJECT_ACTIVE"; exit 2;
}
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
USER_TOKEN="$(gcloud auth print-access-token 2>/dev/null || true)"
[[ -n "$USER_TOKEN" ]] || { echo "BLOCK: Cloud-Shell-Google-Anmeldung fehlt"; exit 2; }
# The caller needs serviceAccounts.getAccessToken for this ONE read-only test.
# No IAM grant is made here. If not permitted, return an explicit blocker.
HTTP="$(curl -sS --max-time 25 -o "$TEMP_DIR/impersonation.json" -w '%{http_code}' \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: $PROJECT" \
  --data '{"scope":["https://www.googleapis.com/auth/drive.readonly"],"lifetime":"600s"}' \
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/$SA:generateAccessToken")"
unset USER_TOKEN
if [[ "$HTTP" != 200 ]]; then
  echo "OFFEN: kurzlebiges SA-Drive-Lesetoken nicht erhalten (HTTP $HTTP)."
  echo "Hinweis: iamcredentials API oder gezieltes serviceAccounts.getAccessToken-Recht prüfen; keine IAM-Änderung vorgenommen."
  exit 3
fi
DRIVE_TOKEN="$(jq -r '.accessToken // empty' "$TEMP_DIR/impersonation.json")"
[[ -n "$DRIVE_TOKEN" ]] || { echo "BLOCK: keine Servicekonto-Zugangsbestätigung"; exit 3; }

checks=0
while IFS='|' read -r label id expected; do
  [[ -n "$id" ]] || continue
  METADATA_HTTP="$(curl -sS --max-time 25 -o "$TEMP_DIR/meta.json" -w '%{http_code}' \
    -H "Authorization: Bearer $DRIVE_TOKEN" \
    -H "X-Goog-User-Project: $PROJECT" \
    "https://www.googleapis.com/drive/v3/files/$id?fields=id,mimeType,size,sha256Checksum,contentRestrictions,parents,trashed")"
  if [[ "$METADATA_HTTP" != 200 ]]; then
    echo "OFFEN: $label – Drive-Metadaten HTTP $METADATA_HTTP (Servicekonto)"; exit 4
  fi
  if ! jq -e --arg id "$id" --arg folder "$FOLDER" --arg hash "$expected" '
    .id == $id and .mimeType == "application/pdf" and .trashed != true
    and ((.parents // []) | index($folder) != null)
    and .sha256Checksum == $hash
    and ((.contentRestrictions // []) | any(.readOnly == true))
  ' "$TEMP_DIR/meta.json" >/dev/null; then
    echo "OFFEN: $label – Ordner, PDF-Typ, SHA-256 oder readOnly-Sperre nicht bestätigt"; exit 4
  fi
  MEDIA_HTTP="$(curl -sS --max-time 40 -o "$TEMP_DIR/$id.pdf" -w '%{http_code}' \
    -H "Authorization: Bearer $DRIVE_TOKEN" \
    -H "X-Goog-User-Project: $PROJECT" \
    "https://www.googleapis.com/drive/v3/files/$id?alt=media")"
  if [[ "$MEDIA_HTTP" != 200 ]]; then
    echo "OFFEN: $label – Original-PDF-Download HTTP $MEDIA_HTTP"; exit 4
  fi
  actual="$(sha256sum "$TEMP_DIR/$id.pdf")"
  actual="${actual%% *}"
  if [[ "$actual" != "$expected" ]] ||
     [[ "$(head -c 5 "$TEMP_DIR/$id.pdf")" != '%PDF-' ]]; then
    echo "BLOCK: $label – Originaldatei stimmt nicht mit freigegebenem PDF überein"; exit 5
  fi
  echo "PASS: $label – Reader-Lesezugriff, Produktionsordner, readOnly und PDF-SHA-256"
  checks=$((checks + 1))
done <<'LSZH_PDFS'
Projektbedingungen v1.0|1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX|b5421778dd88bdac6697cb4f258319fba6577a9b26cba75509ef4e55df4fc2aa
AVV-Rahmenvorlage v1.0|1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x|bde130a9cacd693265521df144fa236e43077ad8ed55388fae079cc7fd97ecc1
LSZH_PDFS
unset DRIVE_TOKEN
[[ "$checks" -eq 2 ]] || { echo "BLOCK: unvollständiger Check"; exit 5; }
echo "PASS: 2 von 2 PDFs über Produktionsdienstkonto gelesen und verifiziert; keine Schreibänderung."
