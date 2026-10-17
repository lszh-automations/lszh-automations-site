#!/usr/bin/env bash
# One-purpose LSZH STAGING receiver provisioning. Defaults to read-only PLAN.
# Never invokes a customer workflow, changes the live site, deploys an Outbox
# revision, sends email or writes a quarantine CASE.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
SERVICE='lszh-quarantine-handoff-staging'
DEST='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com'
SOURCE='lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com'
SECRET='lszh-stg-quarantine-handoff-hmac'
REPOSITORY='cloud-run-source-deploy'
MODE="${1:---plan}"
case "$MODE" in
 --plan|--verify-disabled|--verify-review-only|--build-only|--deploy-private-disabled|--bind-invoker|--create-secret|--enable-review-only) ;;
 *) echo 'STOP: Unknown operation.';exit 2;;
esac
[[ $# -le 1 ]] || { echo 'STOP: One operation at a time.';exit 2; }
for cmd in git gcloud python3 mktemp;do
 command -v "$cmd" >/dev/null || { echo "STOP: missing $cmd";exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ||
      -n "$(git status --porcelain --untracked-files=normal)" ||
      "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Checkout is not a clean copy of the exact reviewed remote branch.'
 exit 2
fi
if [[ "$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)" != "$ACCOUNT" ||
      "$(gcloud config get-value project 2>/dev/null)" != "$PROJECT" ]];then
 echo 'STOP: Wrong active Google account or project.'
 exit 2
fi
gcloud iam service-accounts describe "$SOURCE" --project="$PROJECT" --format='value(email)' >/dev/null
gcloud iam service-accounts describe "$DEST" --project="$PROJECT" --format='value(email)' >/dev/null
gcloud firestore databases describe --project="$PROJECT" --database='lszh-quarantine-staging' --format='value(name)' >/dev/null
gcloud artifacts repositories describe "$REPOSITORY" --project="$PROJECT" --location="$REGION" --format='value(name)' >/dev/null
IMAGE="$REGION-docker.pkg.dev/$PROJECT/$REPOSITORY/lszh-quarantine-handoff:staging-$(git rev-parse --short=12 HEAD)"
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
# Fresh service inventory for EVERY check, including post-deployment:
# the old one-time snapshot misreported a successfully created receiver as absent.
# Failure to LIST / malformed metadata is fatal, never treated as "not found".
refresh_service_inventory(){
 if ! gcloud run services list --project="$PROJECT" --region="$REGION" \
   --format='json(metadata.name)' > "$TMP/services.json"; then
  echo 'STOP: Could not refresh Cloud Run service inventory.'
  exit 2
 fi
 if ! python3 - "$TMP/services.json" <<'PY'
import json,sys
try:
 obj=json.load(open(sys.argv[1]))
 assert isinstance(obj,list)
 assert all(isinstance(x,dict) and isinstance(x.get('metadata',{}).get('name'),str) for x in obj)
except (OSError,ValueError,TypeError,AssertionError):
 sys.exit(1)
PY
 then
  echo 'STOP: Cloud Run service inventory is malformed.'
  exit 2
 fi
}
service_exists(){
 refresh_service_inventory
 python3 - "$TMP/services.json" "$SERVICE" <<'PY'
import json,sys
sys.exit(0 if any(x.get('metadata',{}).get('name')==sys.argv[2] for x in json.load(open(sys.argv[1]))) else 1)
PY
}
verify_receiver(){
 service_exists || { echo 'STOP: Receiver not deployed.';exit 2; }
 gcloud run services describe "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/service.json"
 python3 - "$TMP/service.json" "$DEST" <<'PY'
import json,sys
obj=json.load(open(sys.argv[1]));dest=sys.argv[2]
template=obj.get('spec',{}).get('template',{}).get('spec',{})
assert template.get('serviceAccountName')==dest
assert obj.get('metadata',{}).get('name')=='lszh-quarantine-handoff-staging'
assert obj.get('metadata',{}).get('annotations',{}).get('run.googleapis.com/ingress') in (None,'all')
PY
 gcloud run services get-iam-policy "$SERVICE" --project="$PROJECT" --region="$REGION" --format=json > "$TMP/policy.json"
 python3 - "$TMP/policy.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]));assert isinstance(p.get('bindings',[]),list)
for b in p.get('bindings',[]):
 assert not any(v in ('allUsers','allAuthenticatedUsers') for v in b.get('members',[]))
PY
}
verify_invoker(){
 verify_receiver
 python3 - "$TMP/policy.json" "$SOURCE" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]));expected='serviceAccount:'+sys.argv[2]
b=[x for x in p.get('bindings',[]) if x.get('role')=='roles/run.invoker']
assert len(b)==1 and b[0].get('members')==[expected] and not b[0].get('condition')
PY
}
echo 'PASS: Business identity, project, scoped service accounts, database and container registry verified.'
echo "Reviewed branch/image: $BRANCH / $IMAGE"
echo "Action: $MODE (new private receiver only; no customer processing)."
if [[ "$MODE" == '--plan' ]];then
 if service_exists;then echo 'PLAN: Receiver exists; review before proceeding.';else
  echo 'PLAN: Receiver not yet deployed.';fi
 echo 'NEXT: --build-only, --deploy-private-disabled, --bind-invoker, --create-secret, --enable-review-only'
 echo 'STOP: PLAN performs no mutation.'
 exit 0
fi
# Separate READ-ONLY verification after a successful disabled receiver deploy.
# Never emits credential values or full runtime environment into logs.
if [[ "$MODE" == '--verify-disabled' ]];then
 verify_receiver
 if ! python3 - "$TMP/service.json" <<'PY'
import json,re,sys
try:
 data=json.load(open(sys.argv[1]))
 spec=data['spec']['template']['spec']
 containers=spec['containers']
 assert isinstance(containers,list) and len(containers)==1
 c=containers[0]
 assert re.fullmatch(
  r'europe-west6-docker\.pkg\.dev/lszh-automations/cloud-run-source-deploy/lszh-quarantine-handoff:staging-[a-f0-9]{12}',
  c['image'])
 items=c['env']
 assert isinstance(items,list)
 assert all(set(i)=={'name','value'} and isinstance(i['value'],str) for i in items)
 env={i['name']:i['value'] for i in items}
 expected={
  'LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED':'false',
  'LSZH_QUARANTINE_REPLAY_WRITE_ENABLED':'false',
  'LSZH_SCOPED_STAGING_READER_ENABLED':'false',
  'LSZH_SCOPED_READER_SCOPE':'quarantine',
  'LSZH_OUTBOX_STAGE_ENABLED':'false',
  'LSZH_QUARANTINE_HANDOFF_MODE':'REVIEW_ONLY',
  'FIRESTORE_PROJECT_ID':'lszh-automations',
  'FIRESTORE_DATABASE_ID':'lszh-quarantine-staging'
 }
 assert len(items)==len(expected) and env==expected
except (KeyError,TypeError,ValueError,AssertionError,OSError):
 sys.exit(1)
PY
 then
  echo 'STOP: Deployed receiver image/disabled gates not verified.'
  exit 2
 fi
 echo 'PASS: New receiver exists, expected reviewed image and all disabled gates verified.'
 echo 'PASS: Dedicated destination identity and no direct public invoker IAM binding verified.'
 echo 'READ ONLY: No IAM grants, secrets, Firestore writes, or customer processing.'
 exit 0
fi

# Read-only AFTER deploying the explicitly approved review-only revision.
# Never fetches any Secret Manager payload and never prints environment values.
if [[ "$MODE" == '--verify-review-only' ]];then
 verify_invoker
 if ! python3 - "$TMP/service.json" "$SECRET" <<'PY'
import json,re,sys
try:
 data=json.load(open(sys.argv[1]))
 assert data['metadata']['name']=='lszh-quarantine-handoff-staging'
 assert data['spec']['template']['spec']['serviceAccountName']==(
  'lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com')
 containers=data['spec']['template']['spec']['containers']
 assert isinstance(containers,list) and len(containers)==1
 c=containers[0]
 # This is the IMAGE ACTUALLY BUILT AND DEPLOYED, never the newest docs commit.
 assert c['image']==(
  'europe-west6-docker.pkg.dev/lszh-automations/cloud-run-source-deploy/'
  'lszh-quarantine-handoff:staging-131d67982f83')
 items=c['env']
 assert isinstance(items,list) and len(items)==9
 assert all(isinstance(i,dict) and isinstance(i.get('name'),str) for i in items)
 assert len({i['name'] for i in items})==len(items)
 got={i['name']:i for i in items}
 required={
  'LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED':'true',
  'LSZH_QUARANTINE_REPLAY_WRITE_ENABLED':'true',
  'LSZH_SCOPED_STAGING_READER_ENABLED':'true',
  'LSZH_SCOPED_READER_SCOPE':'quarantine',
  'LSZH_OUTBOX_STAGE_ENABLED':'false',
  'LSZH_QUARANTINE_HANDOFF_MODE':'REVIEW_ONLY',
  'FIRESTORE_PROJECT_ID':'lszh-automations',
  'FIRESTORE_DATABASE_ID':'lszh-quarantine-staging'}
 assert set(got)==set(required)|{'LSZH_QUARANTINE_HMAC_B64'}
 for name,val in required.items():
  assert got[name]=={'name':name,'value':val}
 bind=got['LSZH_QUARANTINE_HMAC_B64']
 assert set(bind)=={'name','valueFrom'}
 ref=bind['valueFrom']['secretKeyRef']
 assert set(bind['valueFrom'])=={'secretKeyRef'}
 assert set(ref)=={'name','key'}
 assert ref['name'] in (
  sys.argv[2],
  'projects/lszh-automations/secrets/'+sys.argv[2])
 assert str(ref['key'])=='1'
 assert data['status']['latestReadyRevisionName']==(
  'lszh-quarantine-handoff-staging-00002-ttf')
 traffic=data['status']['traffic']
 assert len(traffic)==1
 assert traffic[0]['revisionName']==data['status']['latestReadyRevisionName']
 assert traffic[0]['percent']==100
except (KeyError,ValueError,TypeError,AssertionError,OSError,IndexError):
 sys.exit(1)
PY
 then
  echo 'STOP: Enabled receiver revision, image, flag or secret binding not verified.'
  exit 2
 fi
 if ! gcloud secrets versions describe 1 --secret="$SECRET" --project="$PROJECT" \
   --format=json > "$TMP/secret-version.json";then
  echo 'STOP: Cannot inspect staging secret version metadata.'
  exit 2
 fi
 if ! gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" \
   --format=json > "$TMP/secret-policy.json";then
  echo 'STOP: Cannot inspect staging secret IAM metadata.'
  exit 2
 fi
 if ! python3 - "$TMP/secret-version.json" "$TMP/secret-policy.json" "$SOURCE" "$DEST" <<'PY'
import json,sys
try:
 version=json.load(open(sys.argv[1]))
 assert version['state']=='ENABLED'
 policy=json.load(open(sys.argv[2]))
 bindings=policy['bindings']
 assert isinstance(bindings,list)
 assert all(isinstance(b,dict) and isinstance(b.get('members'),list) for b in bindings)
 for b in bindings:
  assert not any(m in ('allUsers','allAuthenticatedUsers') for m in b['members'])
 accessor=[b for b in bindings if b.get('role')=='roles/secretmanager.secretAccessor']
 assert len(accessor)==1
 assert not accessor[0].get('condition')
 assert set(accessor[0]['members'])=={
  'serviceAccount:'+sys.argv[3], 'serviceAccount:'+sys.argv[4]}
 assert len(accessor[0]['members'])==2
except (KeyError,ValueError,TypeError,AssertionError,OSError,IndexError):
 sys.exit(1)
PY
 then
  echo 'STOP: Secret version or exact secret-level accessor IAM not verified.'
  exit 2
 fi
 echo 'PASS: Expected private review-only revision is live with exact original image, protected HMAC reference and all nine runtime settings.'
 echo 'PASS: Exact single source invoker at service level; HMAC secret version 1 enabled and exact two secret-level accessors.'
 echo 'READ ONLY: Secret payload not accessed. Inherited project/org IAM remains a separate verification step.'
 exit 0
fi

if [[ "$MODE" == '--build-only' ]];then
 mkdir -p "$TMP/context/onboarding" "$TMP/context/workers/onboarding-notifications"
 FILES=(
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
 workers/onboarding-notifications/Dockerfile.quarantine-handoff
 workers/onboarding-notifications/cloudbuild.quarantine-handoff.yaml
 )
 for f in "${FILES[@]}";do
  [[ -f "$f" && ! -L "$f" ]] || { echo 'STOP: Bad build source file.';exit 2; }
  cp "$f" "$TMP/context/$f"
 done
 [[ "$(find "$TMP/context/onboarding" "$TMP/context/workers" -type f | wc -l | tr -d ' ')" == "${#FILES[@]}" ]] ||
 { echo 'STOP: Build-context allowlist mismatch.';exit 2; }
 gcloud builds submit "$TMP/context" --project="$PROJECT" --region="$REGION" \
  --config="$TMP/context/workers/onboarding-notifications/cloudbuild.quarantine-handoff.yaml" \
  --substitutions="_IMAGE=$IMAGE"
 echo 'PASS: Image built and pushed. Nothing deployed.'
 exit 0
fi
if [[ "$MODE" == '--deploy-private-disabled' ]];then
 ! service_exists || { echo 'STOP: Receiver already exists; refusing overwrite.';exit 2; }
 gcloud artifacts docker images describe "$IMAGE" --project="$PROJECT" --format='value(image)' >/dev/null
 gcloud run deploy "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --image="$IMAGE" --service-account="$DEST" \
  --no-allow-unauthenticated --ingress=all \
  --min-instances=0 --max-instances=1 --concurrency=1 --timeout=30 \
  --cpu=1 --memory=256Mi --port=8080 \
  --set-env-vars='LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED=false,LSZH_QUARANTINE_REPLAY_WRITE_ENABLED=false,LSZH_SCOPED_STAGING_READER_ENABLED=false,LSZH_SCOPED_READER_SCOPE=quarantine,LSZH_OUTBOX_STAGE_ENABLED=false,LSZH_QUARANTINE_HANDOFF_MODE=REVIEW_ONLY,FIRESTORE_PROJECT_ID=lszh-automations,FIRESTORE_DATABASE_ID=lszh-quarantine-staging' \
  --labels='environment=staging,service=quarantine-handoff' --quiet
 verify_receiver
 echo 'PASS: New disabled private Cloud Run receiver. No traffic allowed without IAM.'
 exit 0
fi
if [[ "$MODE" == '--bind-invoker' ]];then
 verify_receiver
 python3 - "$TMP/policy.json" <<'PY'
import json,sys
p=json.load(open(sys.argv[1]))
assert not any(b.get('role')=='roles/run.invoker' for b in p.get('bindings',[]))
PY
 gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --member="serviceAccount:$SOURCE" --role='roles/run.invoker' --quiet >/dev/null
 verify_invoker
 echo 'PASS: Only source SA has direct service-level run.invoker grant.'
 exit 0
fi
if [[ "$MODE" == '--create-secret' ]];then
 gcloud secrets list --project="$PROJECT" --format='value(name)' > "$TMP/secrets.txt"
 ! grep -Fxq "$SECRET" "$TMP/secrets.txt" ||
   { echo 'STOP: Secret already exists, refusing rotation or overwriting.';exit 2; }
 gcloud secrets create "$SECRET" --project="$PROJECT" --replication-policy=automatic >/dev/null
 # Generate 32 CSPRNG bytes, encode once as canonical base64, do not print/log.
 python3 -c 'import base64,secrets,sys;sys.stdout.write(base64.b64encode(secrets.token_bytes(32)).decode())' |
  gcloud secrets versions add "$SECRET" --project="$PROJECT" --data-file=- >/dev/null
 for sa in "$SOURCE" "$DEST";do
  gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT" \
   --member="serviceAccount:$sa" --role='roles/secretmanager.secretAccessor' --quiet >/dev/null
 done
 echo 'PASS: New 32-byte staging HMAC in Secret Manager, version 1; accessor grants scoped to this one secret.'
 echo 'STOP: No secret material was printed or copied into GitHub.'
 exit 0
fi
if [[ "$MODE" == '--enable-review-only' ]];then
 verify_invoker
 gcloud secrets versions describe 1 --secret="$SECRET" --project="$PROJECT" --format='value(state)' |
  grep -Fxq ENABLED || { echo 'STOP: STAGING secret version unavailable.';exit 2; }
 gcloud run services update "$SERVICE" --project="$PROJECT" --region="$REGION" \
  --update-env-vars='LSZH_QUARANTINE_HANDOFF_HTTP_ENABLED=true,LSZH_QUARANTINE_REPLAY_WRITE_ENABLED=true,LSZH_SCOPED_STAGING_READER_ENABLED=true' \
  --update-secrets="LSZH_QUARANTINE_HMAC_B64=$SECRET:1" --quiet >/dev/null
 verify_invoker
 echo 'PASS: Private review-only receiver configured. No source dispatcher launched.'
 echo 'STOP: No real handoff, quarantine-case write, email or customer activation.'
 exit 0
fi
