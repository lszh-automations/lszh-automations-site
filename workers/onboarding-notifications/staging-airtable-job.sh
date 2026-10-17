#!/usr/bin/env bash
# LSZH one-shot Airtable READ STAGING Cloud Run JOB.
# Default --plan is READ ONLY. --create-only creates ONE new job but never executes it.
# Never touches existing HTTP services, sends emails, writes CRM/Firestore or reads PAT.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
SA='lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com'
SECRET='lszh-airtable-readonly-staging'
JOB='lszh-airtable-read-probe-staging'
DIGEST='sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab'
IMAGE="europe-west6-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/lszh-airtable-read-probe@${DIGEST}"
MODE="${1:---plan}"
if [[ "$#" -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--create-only' ) ]]; then
 echo 'STOP: Allowed only --plan (default) and --create-only.';exit 2
fi
for cmd in gcloud git python3; do
 command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd";exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: No reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
 echo 'STOP: Wrong Git branch, dirty checkout or origin mismatch.';exit 2
fi
acct="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
proj="$(gcloud config get-value project 2>/dev/null)"
if [[ "$acct" != "$ACCOUNT" || "$proj" != "$PROJECT" ]]; then
 echo 'STOP: Wrong company identity or cloud project.';exit 2
fi
# The independent verifier checks the reviewed five-file source pin, original
# SUCCESS build ID, exact image/tag and matching registry digest, and job absence.
bash workers/onboarding-notifications/staging-airtable-image-verify.sh
# Independent confirmation that the tag still maps to the exact locked SHA.
TAG="europe-west6-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67"
live_digest="$(gcloud artifacts docker images describe "$TAG" --project="$PROJECT" --format='value(image_summary.digest)')" ||
 { echo 'STOP: Registry digest unavailable.';exit 2; }
if [[ "$live_digest" != "$DIGEST" ]]; then
 echo 'STOP: Image digest drift; cannot create job.';exit 2
fi
info="$(gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Dedicated service account not available.';exit 2; }
if ! printf '%s\n' "$info" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 assert d.get("email")==sys.argv[1] and d.get("disabled",False) is False
except (ValueError,AssertionError,TypeError):
 print("STOP: Dedicated job service account identity or status mismatch.");sys.exit(2)
' "$SA"; then exit 2; fi
metadata="$(gcloud secrets describe "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Secret metadata unavailable.';exit 2; }
pnum="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
 { echo 'STOP: Project number unavailable.';exit 2; }
if [[ ! "$pnum" =~ ^[0-9]+$ ]]; then
 echo 'STOP: Unexpected cloud project number.';exit 2
fi
if ! printf '%s\n' "$metadata" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin);parts=d["name"].split("/")
 m=d["replication"].get("userManaged",{})
 assert len(parts)==4 and parts[0]=="projects"
 assert parts[1] in (sys.argv[1],sys.argv[2])
 assert parts[2:]==["secrets",sys.argv[3]]
 assert [r.get("location") for r in m.get("replicas",[])]==["europe-west6"]
except (KeyError,ValueError,TypeError,AssertionError,AttributeError):
 print("STOP: Wrong secret/project/Zurich replication.");sys.exit(2)
' "$PROJECT" "$pnum" "$SECRET"; then exit 2; fi
versions="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='json(name,state)')" ||
 { echo 'STOP: Cannot verify pinned secret version.';exit 2; }
if ! printf '%s\n' "$versions" | python3 -c '
import json,sys
try:
 a=json.load(sys.stdin)
 assert isinstance(a,list) and len(a)==1
 assert str(a[0]["name"]).rsplit("/",1)[-1]=="1" and a[0]["state"]=="ENABLED"
except (ValueError,AssertionError,TypeError,KeyError):
 print("STOP: Expected exactly one ENABLED version 1.");sys.exit(2)
'; then exit 2; fi
policy="$(gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Cannot read secret-specific IAM policy.';exit 2; }
if ! printf '%s\n' "$policy" | python3 -c '
import json,sys
try:
 p=json.load(sys.stdin); rows=p.get("bindings",[])
 member=sys.argv[1]; role="roles/secretmanager.secretAccessor"
 found=[b for b in rows if member in b.get("members",[])]
 assert len(found)==1 and found[0].get("role")==role and not found[0].get("condition")
 assert all("allUsers" not in b.get("members",[]) and
            "allAuthenticatedUsers" not in b.get("members",[]) for b in rows)
except (ValueError,AssertionError,TypeError,AttributeError):
 print("STOP: Secret-specific service identity IAM grant mismatch.");sys.exit(2)
' "serviceAccount:$SA"; then exit 2; fi
# Race guard before create: never reuse or overwrite any existing job.
jobs="$(gcloud run jobs list --project="$PROJECT" --region="$REGION" --format='value(metadata.name)')" ||
 { echo 'STOP: Cloud Run job inventory failed.';exit 2; }
if printf '%s\n' "$jobs" | grep -Eq "(^|/)$JOB$"; then
 echo 'STOP: Exact STAGING job already exists. Never overwrite.';exit 2
fi
echo 'PASS: Company identity, original five-file Cloud Build and exact SHA-256 image.'
echo 'PASS: Dedicated service identity, single Zurich secret version 1 and secret-specific IAM.'
echo "New separate Cloud Run Job: $JOB"
echo "Immutable image: $IMAGE"
echo 'Secret version 1 mounted only as read-only file /var/secrets/lszh/airtable-read-pat.'
echo 'Exactly one task, max retries zero, default-disabled outbox.'
echo 'No existing services, customer data, Make, Firestore, external mail or scheduler affected.'
if [[ "$MODE" == '--plan' ]]; then
 echo 'PLAN ONLY: No Cloud Run Job created/executed and no secret payload read.'
 exit 0
fi
echo 'CREATE ONLY: Creating one new staging Cloud Run Job; NEVER executing.'
if ! gcloud run jobs create "$JOB" --project="$PROJECT" --region="$REGION" \
 --image="$IMAGE" --service-account="$SA" \
 --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=90s \
 --cpu=1 --memory=512Mi \
 --set-env-vars="LSZH_AIRTABLE_RUNTIME_PROBE_ONLY=true,LSZH_OUTBOX_STAGE_ENABLED=false,GOOGLE_CLOUD_PROJECT=$PROJECT" \
 --set-secrets="/var/secrets/lszh/airtable-read-pat=$SECRET:1" \
 --labels='environment=staging,purpose=airtable-read-probe' --quiet; then
 echo 'STOP: Cloud Run Job create returned failure/ambiguous result; DO NOT RETRY. Inspect Job metadata.'
 exit 2
fi
# Cloud Run Job creation without --execute-now is a deployment only.
# Read-only evidence of exact image+identity+secret mount and no executions.
spec="$(gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Job may exist but metadata read failed; do NOT rerun create.';exit 2; }
if ! printf '%s\n' "$spec" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 s=d.get("spec",{}).get("template",{}).get("spec",{})
 task=s.get("template",{}).get("spec",{})
 containers=task.get("containers",[])
 assert len(containers)==1
 c=containers[0]
 assert c.get("image")==sys.argv[1]
 assert task.get("serviceAccountName")==sys.argv[2]
 assert int(s.get("taskCount",1))==1
 assert int(task.get("maxRetries",0))==0
 env={x["name"]:x["value"] for x in c.get("env",[])}
 assert env=={"LSZH_AIRTABLE_RUNTIME_PROBE_ONLY":"true",
             "LSZH_OUTBOX_STAGE_ENABLED":"false",
             "GOOGLE_CLOUD_PROJECT":"lszh-automations"}
 mounts=c.get("volumeMounts",[])
 assert len(mounts)==1 and mounts[0].get("mountPath")=="/var/secrets/lszh"
 volume_name=mounts[0]["name"]
 volumes=task.get("volumes",[])
 assert len(volumes)==1 and volumes[0]["name"]==volume_name
 secret=volumes[0]["secret"]
 assert secret.get("secretName") in (sys.argv[3],"projects/"+sys.argv[4]+"/secrets/"+sys.argv[3])
 items=secret["items"]
 assert len(items)==1 and str(items[0].get("key"))=="1"
 assert items[0].get("path")=="airtable-read-pat"
except (ValueError,KeyError,AssertionError,TypeError,AttributeError):
 print("STOP: Job CREATED but exact configuration not verified. Do NOT execute or retry.")
 sys.exit(2)
print("PASS: Created Job spec pinned to exact digest, service identity, env gate and Secret v1 file.")
' "$IMAGE" "$SA" "$SECRET" "$pnum"; then exit 2; fi
execs="$(gcloud run jobs executions list --job="$JOB" --project="$PROJECT" \
 --region="$REGION" --format='value(metadata.name)')" ||
 { echo 'STOP: Job created, but execution inventory unavailable. Do not execute.';exit 2; }
if [[ -n "$execs" ]]; then
 echo 'STOP: Unexpected prior execution exists. Do not execute.';exit 2
fi
echo 'PASS: New STAGING Cloud Run Job created and verified, with ZERO executions.'
echo 'STOP HERE: Running job and live Airtable GET require a separate explicit step.'
