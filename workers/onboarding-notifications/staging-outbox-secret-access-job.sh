#!/usr/bin/env bash
# Separate source-SA access probe. Default --plan reads only metadata.
# --create-only creates a never-executed Job, never touches four prior jobs.
set -euo pipefail
set +x
PROJECT=lszh-automations
REGION=europe-west6
ACCOUNT=lars@lszh-automations.ch
BRANCH=feature/onboarding-notification-outbox-20261016
SOURCE=lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com
SECRET=lszh-airtable-readonly-staging
JOB=lszh-outbox-secret-access-probe-stg
DIGEST=sha256:c8e0b3de0519c8c562df743bb3d7f99fc6b23a2cc94e015f32f9f10d91ca1fac
IMAGE="$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/lszh-airtable-read-probe@$DIGEST"
MODE=--plan
if [[ $# -eq 1 ]];then MODE="$1";fi
[[ $# -le 1 && ( "$MODE" == --plan || "$MODE" == --create-only ) ]] ||
 { echo 'STOP: Only --plan or --create-only is supported.';exit 2; }
for c in gcloud git python3 mktemp;do
 command -v "$c" >/dev/null || { echo 'STOP: Required tool missing.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Reviewed checkout unavailable.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ||
      -n "$(git status --porcelain --untracked-files=normal)" ||
      "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Wrong/dirty/outdated Git checkout.';exit 2;fi
if [[ "$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)" != "$ACCOUNT" ||
      "$(gcloud config get-value project 2>/dev/null)" != "$PROJECT" ]];then
 echo 'STOP: Wrong LSZH account or project.';exit 2;fi
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
if ! gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" \
 --format='value(image_summary.digest)' > "$TMP/digest";then
 echo 'STOP: Immutable image missing.';exit 2;fi
[[ "$(cat "$TMP/digest")" == "$DIGEST" ]] ||
 { echo 'STOP: Immutable image digest mismatch.';exit 2; }
if ! gcloud iam service-accounts describe "$SOURCE" --project="$PROJECT" \
 --format='value(email)' > "$TMP/sa";then
 echo 'STOP: Outbox service account missing.';exit 2;fi
[[ "$(cat "$TMP/sa")" == "$SOURCE" ]] ||
 { echo 'STOP: Outbox identity mismatch.';exit 2; }
if ! gcloud secrets versions describe 1 --secret="$SECRET" --project="$PROJECT" \
 --format='value(state)' > "$TMP/secret-state";then
 echo 'STOP: Cannot inspect staging secret.';exit 2;fi
[[ "$(cat "$TMP/secret-state")" == ENABLED ]] ||
 { echo 'STOP: Staging secret version 1 not enabled.';exit 2; }
if ! gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" \
 --format=json > "$TMP/policy.json";then
 echo 'STOP: Secret IAM metadata unavailable.';exit 2;fi
if ! python3 - "$TMP/policy.json" "$SOURCE" <<'PY'
import json,sys
try:
 p=json.load(open(sys.argv[1]))
 roles=p.get('bindings',[])
 assert isinstance(roles,list)
 for b in roles:
  assert not any(m in ('allUsers','allAuthenticatedUsers') for m in b.get('members',[]))
 a=[b for b in roles if b.get('role')=='roles/secretmanager.secretAccessor']
 assert len(a)==1 and not a[0].get('condition')
 assert set(a[0]['members'])=={
  'serviceAccount:'+sys.argv[2],
  'serviceAccount:lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com'}
except (ValueError,TypeError,KeyError,AssertionError,OSError):
 sys.exit(1)
PY
then
 echo 'STOP: Unexpected secret-level IAM. No Job created.';exit 2;fi
if ! gcloud run jobs list --project="$PROJECT" --region="$REGION" \
 --format='json(metadata.name)' > "$TMP/jobs.json";then
 echo 'STOP: Cannot inventory existing jobs.';exit 2;fi
if ! python3 - "$TMP/jobs.json" "$JOB" <<'PY'
import json,sys
try:
 a=json.load(open(sys.argv[1]))
 names=[x['metadata']['name'].rsplit('/',1)[-1] for x in a]
 assert sys.argv[2] not in names
 assert len(names)==len(set(names))
 assert {'lszh-airtable-read-probe-fix-staging',
 'lszh-airtable-read-probe-staging',
 'lszh-firestore-read-probe-staging',
 'lszh-firestore-write-probe-staging'}<=set(names)
except (ValueError,TypeError,KeyError,AssertionError,OSError):
 sys.exit(1)
PY
then
 echo 'STOP: Job already exists or existing-job inventory changed.';exit 2;fi
echo 'PASS: Correct business identity, pinned pre-reviewed container image and source SA.'
echo 'PASS: Airtable secret v1 ENABLED, exact two direct secret-level accessors.'
echo 'PASS: All four existing STAGING Jobs untouched; new probe Job absent.'
echo "NEW JOB: $JOB"
echo 'ENTRYPOINT: /bin/sh only, overrides all Airtable or Firestore application code.'
if [[ "$MODE" == --plan ]];then
 echo 'PLAN ONLY: No cloud mutation, no Secret payload access, no Job creation/execution.'
 exit 0
fi
# Only test whether Cloud Run injected a nonempty secret from version 1.
# Not a network call. The shell never interpolates/prints the secret value.
PROBE='if [ "$LSZH_SECRET_PROBE_ONLY" = true ] && [ "$LSZH_OUTBOX_STAGE_ENABLED" = false ] && [ -n "$LSZH_PROBE_SECRET" ]; then echo PASS_SOURCE_SECRET_ACCESS; else echo BLOCKED_SOURCE_SECRET_ACCESS; exit 2; fi'
echo 'CREATE ONLY: Creating a separate disabled-by-nonexecution one-task zero-retry Job.'
if ! gcloud run jobs create "$JOB" --project="$PROJECT" --region="$REGION" \
 --image="$IMAGE" --service-account="$SOURCE" \
 --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=60s \
 --cpu=1 --memory=256Mi --command=/bin/sh --args="-c,$PROBE" \
 --set-env-vars='LSZH_SECRET_PROBE_ONLY=true,LSZH_OUTBOX_STAGE_ENABLED=false' \
 --set-secrets="LSZH_PROBE_SECRET=$SECRET:1" \
 --labels='environment=staging,purpose=secret-access-probe' --quiet;then
 echo 'STOP: Cloud Run create failure or ambiguity. DO NOT retry; inspect Job metadata.';exit 2;fi
if ! gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" \
 --format=json > "$TMP/newjob.json";then
 echo 'STOP: Job may be created, but metadata unavailable. DO NOT retry.';exit 2;fi
if ! python3 - "$TMP/newjob.json" "$IMAGE" "$SOURCE" "$SECRET" "$PROBE" <<'PY'
import json,sys
try:
 j=json.load(open(sys.argv[1]))
 if 'spec' in j:
  base=j['spec']['template']['spec']
  spec=base['template']['spec']
  who=spec['serviceAccountName']
 else:
  base=j['template']
  spec=base['template']
  who=spec['serviceAccount']
 assert who==sys.argv[3]
 assert int(base['taskCount'])==1
 assert int(spec['maxRetries'])==0
 containers=spec['containers']
 assert len(containers)==1
 c=containers[0]
 assert c['image']==sys.argv[2]
 assert c['command']==['/bin/sh'] and c['args']==['-c',sys.argv[5]]
 items=c['env']
 assert len(items)==3
 d={x['name']:x for x in items}
 assert set(d)=={'LSZH_SECRET_PROBE_ONLY','LSZH_OUTBOX_STAGE_ENABLED','LSZH_PROBE_SECRET'}
 assert d['LSZH_SECRET_PROBE_ONLY']=={'name':'LSZH_SECRET_PROBE_ONLY','value':'true'}
 assert d['LSZH_OUTBOX_STAGE_ENABLED']=={'name':'LSZH_OUTBOX_STAGE_ENABLED','value':'false'}
 ref=(d['LSZH_PROBE_SECRET'].get('valueFrom') or
      d['LSZH_PROBE_SECRET'].get('valueSource'))['secretKeyRef']
 assert 'value' not in d['LSZH_PROBE_SECRET']
 assert ref.get('name',ref.get('secret')) in (
  sys.argv[4], 'projects/lszh-automations/secrets/'+sys.argv[4])
 assert str(ref.get('key',ref.get('version'))) == '1'
except (ValueError,KeyError,TypeError,AssertionError,OSError,IndexError):
 sys.exit(1)
PY
then
 echo 'STOP: Job exists but spec verification failed. Do not execute or retry create.';exit 2;fi
if ! gcloud run jobs executions list --job="$JOB" --project="$PROJECT" \
 --region="$REGION" --format='value(metadata.name)' > "$TMP/executions";then
 echo 'STOP: Job exists but executions not inspectable.';exit 2;fi
[[ ! -s "$TMP/executions" ]] ||
 { echo 'STOP: Unexpected execution already exists. DO NOT execute.';exit 2; }
echo 'PASS: New isolated Job has pinned image, shell-only entrypoint, Secret v1, correct SA, one task and zero retries.'
echo 'PASS: New Job exists with ZERO executions.'
echo 'STOP HERE: Execution is a separate, explicitly verified step.'
