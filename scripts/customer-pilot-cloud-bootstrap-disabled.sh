#!/usr/bin/env bash
# LSZH – create only missing named customer resources and an IAM-private, disabled Cloud Run pilot.
# This MAY CREATE BILLABLE GOOGLE CLOUD RESOURCES. No public access, customers, mail,
# contract sending, DNS, production secret, or change to staging is performed.
set -euo pipefail
PROJECT=lszh-automations
REGION=europe-west6
SERVICE=lszh-offer-portal
SA_NAME=lszh-offer-portal
SA=lszh-offer-portal@lszh-automations.iam.gserviceaccount.com
DATABASE=lszh-offers
cd "$(dirname "$0")/.."
for file in cloud-run/Dockerfile.offer-portal-production cloud-run/offer-portal-production/index.mjs; do
  test -f "$file" || { echo "BLOCK: missing source file $file" >&2; exit 2; }
done
command -v gcloud >/dev/null || { echo "BLOCK: Google Cloud CLI missing" >&2; exit 2; }
ACTIVE="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$ACTIVE" != "$PROJECT" ]]; then echo "BLOCK: wrong active project $ACTIVE" >&2; exit 2; fi
printf "%s\n" "PROJECT VERIFIED: $PROJECT"
echo "Enabling required Google Cloud APIs (if not enabled)"
gcloud services enable iam.googleapis.com firestore.googleapis.com run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --project="$PROJECT" --quiet
if gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format="value(email)" >/dev/null 2>&1; then
  echo "PASS: customer service account exists"
else
  echo "CREATE: customer service account"
  gcloud iam service-accounts create "$SA_NAME" --project="$PROJECT" --display-name="LSZH Kundenportal Laufzeit" --quiet
  gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format="value(email)" >/dev/null
fi
if gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" --format="value(name)" >/dev/null 2>&1; then
  echo "PASS: named customer database exists"
else
  echo "CREATE: named customer database in Zurich, delete protected"
  gcloud firestore databases create --project="$PROJECT" --database="$DATABASE" --location="$REGION" --type=firestore-native --delete-protection --quiet
  gcloud firestore databases describe --project="$PROJECT" --database="$DATABASE" --format="value(name)" >/dev/null
fi
echo "GRANT: Firestore data role restricted to the named customer database"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" --role="roles/datastore.user" \
  --condition="expression=resource.name==\"projects/$PROJECT/databases/$DATABASE\",title=lszh_customer_db_only,description=Named_customer_database_only" \
  --quiet >/dev/null
if gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" --format="value(metadata.name)" >/dev/null 2>&1; then
  echo "PASS: Cloud Run customer service already exists; will NOT overwrite"
else
  echo "DEPLOY: IAM-private customer pilot with all customer APIs disabled"
  if [[ -e Dockerfile ]]; then
    echo "BLOCK: root Dockerfile already exists; refusing to overwrite" >&2; exit 2
  fi
  cp cloud-run/Dockerfile.offer-portal-production Dockerfile
  trap 'rm -f Dockerfile' EXIT
  gcloud run deploy "$SERVICE" --source=. --region="$REGION" --project="$PROJECT" \
    --service-account="$SA" --no-allow-unauthenticated --ingress=all \
    --set-env-vars=LSZH_PORTAL_PRODUCTION_ENABLED=false \
    --min-instances=0 --max-instances=1 --cpu=1 --memory=512Mi --quiet
  rm -f Dockerfile
  trap - EXIT
fi
echo "VERIFY: Cloud Run runtime identity, URL, access settings"
gcloud run services describe "$SERVICE" --region="$REGION" --project="$PROJECT" \
  --format="yaml(metadata.name,spec.template.spec.serviceAccountName,spec.template.spec.containers[0].env,status.url)"
echo "PASS: pilot infrastructure present; CUSTOMER PORTAL REMAINS DISABLED and private"
echo "NEXT: final documents, business Drive read permission, secrets, verified domain and explicit pilot release."
