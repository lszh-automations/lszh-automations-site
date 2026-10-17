#!/usr/bin/env bash
# One-shot synthetic source E2E Cloud Run preparation. Stage fixture separately.
# --plan (default) READ ONLY, --build-only, --create-only, --verify-only.
# NEVER executes the E2E job, never runs scheduled or product customer workflows.
set -euo pipefail
set +x
PROJECT=lszh-automations
ACCOUNT=lars@lszh-automations.ch
REGION=europe-west6
BRANCH=feature/onboarding-notification-outbox-20261016
SOURCE=lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com
FIXTURE=lszh-stg-onboarding-e2e-fixture-20261017
AIRT=lszh-airtable-readonly-staging
HMAC=lszh-stg-quarantine-handoff-hmac
JOB=lszh-quarantine-source-e2e-staging
EXPECTED_SHA=7e8e90c6bac9e76e11bbbd072f62098a12b6aa68bbdf8a697e9af96459dc9a91
RECEIVER=https://lszh-quarantine-handoff-staging-470613067122.europe-west6.run.app
MODE=--plan
if [[ $# -eq 1 ]];then MODE="$1";fi
[[ $# -le 1 && ( "$MODE" == --plan || "$MODE" == --build-only ||
 "$MODE" == --create-only || "$MODE" == --verify-only ) ]] ||
 { echo 'STOP: Invalid source E2E action.';exit 2; }
for command in git gcloud node python3 mktemp sha256sum;do
 command -v "$command" >/dev/null || { echo 'STOP: Required CLI missing.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Git checkout unavailable.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ||
      -n "$(git status --porcelain --untracked-files=normal)" ||
      "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Wrong, modified, or outdated Git review branch.';exit 2;fi
if [[ "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)" != "$ACCOUNT" ||
      "$(gcloud config get-value project 2>/dev/null)" != "$PROJECT" ]];then
 echo 'STOP: Wrong LSZH Cloud account or project.';exit 2;fi
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
# Refuse changed fixture. Local SHA is not a secret; no project code is printed.
if ! node workers/onboarding-notifications/synthetic-source-fixture-local.js --fingerprint |
 grep -Fxq "FINGERPRINT_SHA256: $EXPECTED_SHA";then
 echo 'STOP: Local private synthetic fixture integrity invalid.';exit 2;fi
if ! gcloud iam service-accounts describe "$SOURCE" --project="$PROJECT" \
 --format='value(email)' >"$TMP/identity";then
 echo 'STOP: Dedicated source identity missing.';exit 2;fi
[[ "$(cat "$TMP/identity")" == "$SOURCE" ]] ||
 { echo 'STOP: Source principal mismatch.';exit 2; }
gcloud firestore databases describe --project="$PROJECT" \
 --database=lszh-offers-staging --format='value(name)' >/dev/null ||
 { echo 'STOP: Outbox staging database missing.';exit 2; }
# Protected receiver and Invoker grant already provisioned; READ ONLY inspect.
bash workers/onboarding-notifications/staging-quarantine-handoff-provision.sh \
 --verify-review-only >/dev/null ||
 { echo 'STOP: Private review-only receiver state changed.';exit 2; }
for secret in "$FIXTURE" "$AIRT" "$HMAC";do
 if ! gcloud secrets versions describe 1 --secret="$secret" --project="$PROJECT" \
 --format='value(state)' >"$TMP/state-$secret";then
  echo 'STOP: Required Secret Manager version 1 unavailable.';exit 2;fi
 [[ "$(cat "$TMP/state-$secret")" == ENABLED ]] ||
  { echo 'STOP: Required secret version not enabled.';exit 2; }
 if ! gcloud secrets get-iam-policy "$secret" --project="$PROJECT" \
 --format=json >"$TMP/iam-$secret";then
  echo 'STOP: Required secret IAM unreadable.';exit 2;fi
done
if ! python3 - "$TMP/iam-$FIXTURE" "$TMP/iam-$AIRT" "$TMP/iam-$HMAC" "$SOURCE" <<'PY'
import json,sys
try:
 who='serviceAccount:'+sys.argv[4]
 for i,p in enumerate(sys.argv[1:4]):
  policy=json.load(open(p))
  b=policy.get('bindings',[])
  assert isinstance(b,list)
  a=[x for x in b if x.get('role')=='roles/secretmanager.secretAccessor'
     and who in x.get('members',[]) and not x.get('condition')]
  assert len(a)==1
  assert all('allUsers' not in x.get('members',[]) and
             'allAuthenticatedUsers' not in x.get('members',[]) for x in b)
  if i==0:
   assert len(b)==1 and b[0].get('members')==[who]
except (ValueError,KeyError,TypeError,AssertionError,OSError):
 sys.exit(1)
PY
then
 echo 'STOP: Scoped source access to one of three secrets missing or unsafe.';exit 2;fi
if ! gcloud run jobs list --project="$PROJECT" --region="$REGION" \
 --format='json(metadata.name)' >"$TMP/jobs";then
 echo 'STOP: Cloud Run staging job inventory inaccessible.';exit 2;fi
STATUS="$(python3 - "$TMP/jobs" "$JOB" <<'PY'
import json,sys
a=json.load(open(sys.argv[1]))
names=[x['metadata']['name'].rsplit('/',1)[-1] for x in a]
expected={'lszh-airtable-read-probe-fix-staging','lszh-airtable-read-probe-staging',
'lszh-firestore-read-probe-staging','lszh-firestore-write-probe-staging',
'lszh-outbox-secret-access-probe-stg'}
if len(names)!=len(set(names)) or not expected.issubset(set(names)):
 print('BAD')
else:
 print('EXISTS' if sys.argv[2] in names else 'ABSENT')
PY
)"
[[ "$STATUS" == EXISTS || "$STATUS" == ABSENT ]] ||
 { echo 'STOP: Existing Cloud Run inventory changed or malformed.';exit 2; }
# Explicit, immutable, secret-free build context files. NEVER copy repo root.
FILES="$(cat <<'FILES'
onboarding/confirmation.js
workers/onboarding-notifications/airtable-candidates.js
workers/onboarding-notifications/draft-review-gate.js
workers/onboarding-notifications/outbox.js
workers/onboarding-notifications/firestore-store.js
workers/onboarding-notifications/firestore-quarantine-cas.js
workers/onboarding-notifications/quarantine-plan.js
workers/onboarding-notifications/quarantine-cas-offline-cycle.js
workers/onboarding-notifications/firestore-scoped-readers.js
workers/onboarding-notifications/quarantine-handoff-protocol.js
workers/onboarding-notifications/quarantine-handoff-offline-flow.js
workers/onboarding-notifications/quarantine-handoff-replay-cas.js
workers/onboarding-notifications/quarantine-handoff-http-contract.js
workers/onboarding-notifications/quarantine-handoff-replay-runtime.js
workers/onboarding-notifications/quarantine-handoff-receiver.js
workers/onboarding-notifications/quarantine-handoff-source.js
workers/onboarding-notifications/staging-synthetic-source-e2e-once.js
workers/onboarding-notifications/Dockerfile.quarantine-source-e2e
workers/onboarding-notifications/cloudbuild.quarantine-source-e2e.yaml
FILES
)"
while IFS= read -r f;do
 [[ -f "$f" && ! -L "$f" ]] ||
  { echo 'STOP: Source build input missing or symlinked.';exit 2; }
done <<<"$FILES"
BUILD_KEY="$(while IFS= read -r f;do sha256sum "$f";done <<<"$FILES" |
 sha256sum | cut -c1-12)"
[[ "$BUILD_KEY" =~ ^[a-f0-9]{12}$ ]] ||
 { echo 'STOP: Invalid source content fingerprint.';exit 2; }
IMAGE_NAME="$REGION-docker.pkg.dev/$PROJECT/cloud-run-source-deploy/lszh-quarantine-source-e2e"
TAG="$IMAGE_NAME:staging-$BUILD_KEY"
echo 'PASS: Correct identity, private reviewed receiver, three strict secret bindings and private local fixture.'
echo 'PASS: Five earlier jobs intact; exact review-only synthetic source image inputs verified.'
echo "SOURCE CONTENT FINGERPRINT: $BUILD_KEY"
echo "NEW SOURCE JOB STATUS: $STATUS"
if [[ "$MODE" == --plan ]];then
 echo 'PLAN ONLY: No images, secret payloads, Cloud Run Jobs, Firestore or Airtable writes or email.'
 echo 'NEXT: --build-only, then --create-only, then read-only --verify-only.'
 exit 0
fi
if [[ "$MODE" == --build-only ]];then
 [[ "$STATUS" == ABSENT ]] ||
  { echo 'STOP: Source E2E Job already exists. No rebuild needed.';exit 2; }
 mkdir -p "$TMP/context/onboarding" "$TMP/context/workers/onboarding-notifications"
 count=0
 while IFS= read -r f;do
  cp -- "$f" "$TMP/context/$f"
  count=$((count+1))
 done <<<"$FILES"
 found="$(find "$TMP/context" -type f | wc -l | tr -d ' ')"
 [[ "$found" == "$count" && "$count" == 19 ]] ||
  { echo 'STOP: Build context must contain exactly 19 reviewed files.';exit 2; }
 echo 'BUILD ONLY: Strict 19-file context; no secrets, private project code, fixture or user data.'
 if ! gcloud builds submit "$TMP/context" --project="$PROJECT" --region="$REGION" \
  --config="$TMP/context/workers/onboarding-notifications/cloudbuild.quarantine-source-e2e.yaml" \
  --substitutions="_IMAGE=$TAG";then
  echo 'STOP: Build failed or ambiguous; inspect build status before retry.';exit 2;fi
 echo 'PASS: Synthetic-only source image built. NO Job created or executed.'
 exit 0
fi
if [[ "$MODE" == --create-only && "$STATUS" == EXISTS ]];then
 echo 'STOP: Source E2E Job already exists; never overwrite.';exit 2;fi
if [[ "$MODE" == --verify-only && "$STATUS" != EXISTS ]];then
 echo 'STOP: Source E2E Job does not exist.';exit 2;fi
DIGEST="$(gcloud artifacts docker images describe "$TAG" --project="$PROJECT" \
 --format='value(image_summary.digest)')" ||
 { echo 'STOP: Source image not built or image metadata inaccessible.';exit 2; }
[[ "$DIGEST" =~ ^sha256:[a-f0-9]{64}$ ]] ||
 { echo 'STOP: Immutable image digest unavailable.';exit 2; }
IMAGE="$IMAGE_NAME@$DIGEST"
if [[ "$MODE" == --create-only ]];then
 echo 'CREATE ONLY: New synthetic-source E2E Job; zero task retries, no scheduling or execution.'
 if ! gcloud run jobs create "$JOB" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$SOURCE" \
  --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=120s \
  --cpu=1 --memory=512Mi \
  --set-env-vars="LSZH_SYNTHETIC_SOURCE_E2E_ONCE=true,LSZH_SOURCE_HANDOFF_ENABLED=true,LSZH_OUTBOX_STAGE_ENABLED=false,LSZH_SCOPED_STAGING_READER_ENABLED=true,LSZH_SCOPED_READER_SCOPE=outbox,FIRESTORE_PROJECT_ID=$PROJECT,FIRESTORE_DATABASE_ID=lszh-offers-staging,LSZH_QUARANTINE_HANDOFF_MODE=REVIEW_ONLY,LSZH_QUARANTINE_SERVICE_URL=$RECEIVER,LSZH_EXPECTED_FIXTURE_SHA256=$EXPECTED_SHA" \
  --set-secrets="LSZH_SYNTHETIC_FIXTURE_JSON=$FIXTURE:1,AIRTABLE_ONBOARDING_READ_TOKEN=$AIRT:1,LSZH_QUARANTINE_HMAC_B64=$HMAC:1" \
  --labels='environment=staging,purpose=synthetic-source-review-e2e' --quiet;then
  echo 'STOP: Job may be partially created. Do NOT retry create; inspect state.';exit 2;fi
fi
# Read back the newly deployed configuration, never the secret values.
if ! gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" \
 --format=json >"$TMP/actualjob";then
 echo 'STOP: Job could exist, metadata read failed. Do not recreate.';exit 2;fi
if ! python3 - "$TMP/actualjob" "$IMAGE" "$SOURCE" "$FIXTURE" "$AIRT" "$HMAC" "$EXPECTED_SHA" "$RECEIVER" <<'PY'
import json,sys
try:
 d=json.load(open(sys.argv[1]))
 if 'spec' in d:
  top=d['spec']['template']['spec']
  t=top['template']['spec'];sa=t['serviceAccountName']
 else:
  top=d['template']
  t=top['template'];sa=t['serviceAccount']
 assert sa==sys.argv[3]
 assert int(top['taskCount'])==1 and int(t['maxRetries'])==0
 c=t['containers'];assert len(c)==1;c=c[0]
 assert c['image']==sys.argv[2]
 assert c.get('command') in (None,[]) and c.get('args') in (None,[])
 env=c['env'];assert len(env)==13
 d={x['name']:x for x in env};assert len(d)==13
 expected={
 'LSZH_SYNTHETIC_SOURCE_E2E_ONCE':'true','LSZH_SOURCE_HANDOFF_ENABLED':'true',
 'LSZH_OUTBOX_STAGE_ENABLED':'false','LSZH_SCOPED_STAGING_READER_ENABLED':'true',
 'LSZH_SCOPED_READER_SCOPE':'outbox','FIRESTORE_PROJECT_ID':'lszh-automations',
 'FIRESTORE_DATABASE_ID':'lszh-offers-staging',
 'LSZH_QUARANTINE_HANDOFF_MODE':'REVIEW_ONLY',
 'LSZH_QUARANTINE_SERVICE_URL':sys.argv[8],
 'LSZH_EXPECTED_FIXTURE_SHA256':sys.argv[7]}
 for k,v in expected.items():
  assert d.pop(k)=={'name':k,'value':v}
 secrets={'LSZH_SYNTHETIC_FIXTURE_JSON':sys.argv[4],
 'AIRTABLE_ONBOARDING_READ_TOKEN':sys.argv[5],
 'LSZH_QUARANTINE_HMAC_B64':sys.argv[6]}
 assert set(d)==set(secrets)
 for k,secret in secrets.items():
  assert 'value' not in d[k]
  ref=(d[k].get('valueFrom') or d[k].get('valueSource'))['secretKeyRef']
  assert ref.get('name',ref.get('secret')) in (
   secret,'projects/lszh-automations/secrets/'+secret)
  assert str(ref.get('key',ref.get('version')))=='1'
except (KeyError,TypeError,ValueError,AssertionError,OSError,IndexError):
 sys.exit(1)
PY
then
 echo 'STOP: Created E2E Job metadata mismatch. Do not run or recreate.';exit 2;fi
if ! gcloud run jobs executions list --job="$JOB" --project="$PROJECT" \
 --region="$REGION" --format='value(metadata.name)' >"$TMP/executions";then
 echo 'STOP: Job exists but execution inventory unreadable.';exit 2;fi
[[ ! -s "$TMP/executions" ]] ||
 { echo 'STOP: Source E2E Job has previous execution, NEVER rerun.';exit 2; }
echo 'PASS: New synthetic source E2E Job pinned to built SHA256, exact outbox SA, 3 secret version 1 references, 512Mi, one task, no retries.'
echo 'PASS: ZERO executions. Receiver private and read-only staged prerequisites verified.'
echo 'STOP HERE: One actual E2E run is a separately controlled action, never automatic.'
