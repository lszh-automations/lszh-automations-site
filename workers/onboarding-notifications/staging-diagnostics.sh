#!/usr/bin/env bash
# LSZH STAGING diagnostics. Read-only: NO creation, IAM modifications or deploys.
# Run with the existing business account/project in Cloud Shell.
set -uo pipefail
PROJECT="lszh-automations"
ACCOUNT="lars@lszh-automations.ch"
REGION="europe-west6"
echo "=== LSZH Cloud STAGING diagnostics (READ ONLY) ==="
current_account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' 2>/dev/null | head -n 1)"
current_project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$current_account" != "$ACCOUNT" || "$current_project" != "$PROJECT" ]]; then
  echo "STOP: Cloud account/project mismatch; nothing accessed."
  exit 2
fi
echo "PASS: Business identity and project."

echo
echo "=== Firestore databases (all; exposes 403 vs no resource) ==="
gcloud firestore databases list --project="$PROJECT" \
  --format='table(name,locationId,type,state)' 2>&1
echo "Firestore list exit: ${PIPESTATUS[0]}"

echo
echo "=== (default) database full metadata or error ==="
gcloud firestore databases describe --project="$PROJECT" --database='(default)' \
  --format='yaml(name,locationId,type,state)' 2>&1
echo "Firestore describe exit: ${PIPESTATUS[0]}"

echo
echo "=== Existing service accounts (names only, no keys) ==="
gcloud iam service-accounts list --project="$PROJECT" \
  --format='table(email,disabled)' 2>&1
echo "Service account list exit: ${PIPESTATUS[0]}"

echo
echo "=== Artifact Registry repositories in Zurich ==="
gcloud artifacts repositories list --project="$PROJECT" --location="$REGION" \
  --format='table(name,format,location)' 2>&1
echo "Artifact Registry list exit: ${PIPESTATUS[0]}"

echo
echo "=== Outbox Cloud Run service existence ==="
gcloud run services list --project="$PROJECT" --region="$REGION" \
  --format='table(metadata.name,status.url)' 2>&1
echo "Cloud Run list exit: ${PIPESTATUS[0]}"

echo
echo "=== Result ==="
echo "Read-only diagnostics completed; no resources or credentials changed."
