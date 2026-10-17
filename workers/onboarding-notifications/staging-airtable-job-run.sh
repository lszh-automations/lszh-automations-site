#!/usr/bin/env bash
# LSZH: plan-first one-shot STAGING Cloud Run -> Airtable READ test.
# --plan (default) reads metadata only. --execute-once may start exactly ONE
# isolated existing job, never creates/updates resources or sends email.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
JOB='lszh-airtable-read-probe-staging'
SA='lszh-airtable-read-stg@lszh-automations.iam.gserviceaccount.com'
SECRET='lszh-airtable-readonly-staging'
DIGEST='sha256:ce88fa70db14f5d297095da3e8faa26b72e69cdc837ca133212ebc10a09fe8ab'
IMAGE="europe-west6-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/lszh-airtable-read-probe@${DIGEST}"
TAG="europe-west6-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/lszh-airtable-read-probe:stg-c7ebdde79b67"
SOURCE_COMMIT='c7ebdde79b67ca767c3d36f28959a668fecbd458'
BUILD_ID='1b909760-deb7-49a9-bfe8-b4e20af68133'
MODE="${1:---plan}"
if [[ "$#" -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--execute-once' ) ]]; then
 echo 'STOP: Allowed: --plan (default), --execute-once.'
 exit 2
fi
for cmd in gcloud git python3; do
 command -v "$cmd" >/dev/null || { echo "STOP: Missing $cmd";exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
 echo 'STOP: Incorrect branch, dirty tree or origin mismatch.';exit 2
fi
FILES=(
 onboarding/confirmation.js
 workers/onboarding-notifications/staging-airtable-rest-read.js
 workers/onboarding-notifications/airtable-runtime-probe.js
 workers/onboarding-notifications/Dockerfile.airtable-read-probe
 workers/onboarding-notifications/cloudbuild.airtable-read-probe.yaml
)
if ! git cat-file -e "$SOURCE_COMMIT^{commit}" 2>/dev/null ||
   ! git diff --quiet "$SOURCE_COMMIT" HEAD -- "${FILES[@]}"; then
 echo 'STOP: Runtime image source pin differs from original successful build.';exit 2
fi
account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$account" != "$ACCOUNT" || "$project" != "$PROJECT" ]]; then
 echo 'STOP: Wrong LSZH business identity or GCP project.';exit 2
fi
build="$(gcloud builds describe "$BUILD_ID" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Original Cloud Build metadata not accessible.';exit 2; }
if ! printf '%s\n' "$build" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 assert d.get("id")==sys.argv[1] and d.get("status")=="SUCCESS"
 assert d.get("images")==[sys.argv[2]]
 result=d.get("results",{})
 if isinstance(result,dict):
  images=[x.get("digest") for x in result.get("images",[])
          if isinstance(x,dict) and x.get("name")==sys.argv[2] and x.get("digest")]
  assert not images or images==[sys.argv[3]]
except (TypeError,ValueError,AssertionError):
 print("STOP: Original Cloud Build failed exact image/digest verification.");sys.exit(2)
' "$BUILD_ID" "$TAG" "$DIGEST"; then exit 2; fi
digest="$(gcloud artifacts docker images describe "$TAG" --project="$PROJECT" --format='value(image_summary.digest)')" ||
 { echo 'STOP: Artifact Registry image not available.';exit 2; }
if [[ "$digest" != "$DIGEST" ]]; then
 echo 'STOP: Registry image does not match original immutable digest.';exit 2
fi

sa_data="$(gcloud iam service-accounts describe "$SA" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Dedicated Cloud Run service account unavailable.';exit 2; }
if ! printf '%s\n' "$sa_data" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 assert d.get("email")==sys.argv[1] and d.get("disabled",False) is False
except (ValueError,TypeError,AssertionError):
 print("STOP: Dedicated service account incorrect or disabled.");sys.exit(2)
' "$SA"; then exit 2; fi
secret_meta="$(gcloud secrets describe "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Secret metadata inaccessible.';exit 2; }
pnum="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')" ||
 { echo 'STOP: Project number not independently verifiable.';exit 2; }
if [[ ! "$pnum" =~ ^[0-9]+$ ]]; then echo 'STOP: Invalid project number.';exit 2; fi
if ! printf '%s\n' "$secret_meta" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin);p=d["name"].split("/")
 assert len(p)==4 and p[0]=="projects" and p[1] in (sys.argv[1],sys.argv[2])
 assert p[2:]==["secrets",sys.argv[3]]
 m=d["replication"].get("userManaged",{})
 assert [x.get("location") for x in m.get("replicas",[])]==["europe-west6"]
except (TypeError,KeyError,ValueError,AssertionError):
 print("STOP: Secret project/name/Zurich-only replica mismatched.");sys.exit(2)
' "$PROJECT" "$pnum" "$SECRET"; then exit 2; fi
versions="$(gcloud secrets versions list "$SECRET" --project="$PROJECT" --format='json(name,state)')" ||
 { echo 'STOP: Secret version list unavailable.';exit 2; }
if ! printf '%s\n' "$versions" | python3 -c '
import json,sys
try:
 v=json.load(sys.stdin)
 assert isinstance(v,list) and len(v)==1 and isinstance(v[0],dict)
 assert str(v[0].get("name","")).rsplit("/",1)[-1]=="1"
 assert v[0].get("state")=="ENABLED"
except (TypeError,ValueError,AssertionError):
 print("STOP: Expected only ENABLED secret version 1.");sys.exit(2)
'; then exit 2; fi
policy="$(gcloud secrets get-iam-policy "$SECRET" --project="$PROJECT" --format=json)" ||
 { echo 'STOP: Secret IAM policy not accessible.';exit 2; }
if ! printf '%s\n' "$policy" | python3 -c '
import json,sys
try:
 rows=json.load(sys.stdin).get("bindings",[])
 assert isinstance(rows,list)
 member=sys.argv[1]
 matches=[x for x in rows if member in x.get("members",[])]
 assert len(matches)==1 and matches[0].get("role")=="roles/secretmanager.secretAccessor"
 assert not matches[0].get("condition")
 assert all("allUsers" not in x.get("members",[]) and
            "allAuthenticatedUsers" not in x.get("members",[]) for x in rows)
except (ValueError,TypeError,AssertionError,AttributeError):
 print("STOP: Secret-specific IAM access no longer matches.");sys.exit(2)
' "serviceAccount:$SA"; then exit 2; fi
job_data="$(gcloud run jobs describe "$JOB" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Previously created isolated job not available.';exit 2; }
if ! printf '%s\n' "$job_data" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 if "spec" in d:
  s=d["spec"]["template"]["spec"]
  task=s["template"]["spec"]
  account=task.get("serviceAccountName")
 else:
  s=d["template"]
  task=s["template"]
  account=task.get("serviceAccount")
 assert int(s["taskCount"])==1
 assert int(s["parallelism"])==1
 assert int(task["maxRetries"])==0
 assert account==sys.argv[1]
 cs=task["containers"]
 assert isinstance(cs,list) and len(cs)==1
 c=cs[0]
 assert c.get("image")==sys.argv[2]
 assert c.get("command") in (None,[])
 assert c.get("args") in (None,[])
 expected={
  "LSZH_AIRTABLE_RUNTIME_PROBE_ONLY":"true",
  "LSZH_OUTBOX_STAGE_ENABLED":"false",
  "GOOGLE_CLOUD_PROJECT":"lszh-automations"
 }
 assert {x["name"]:x["value"] for x in c["env"]}==expected
 assert len(c["volumeMounts"])==1
 mount=c["volumeMounts"][0]
 assert mount["mountPath"]=="/var/secrets/lszh"
 assert len(task["volumes"])==1
 v=task["volumes"][0]
 assert v["name"]==mount["name"]
 secret=v["secret"]
 assert secret.get("secretName",secret.get("secret")) in (
  sys.argv[3],
  "projects/"+sys.argv[4]+"/secrets/"+sys.argv[3],
  "projects/lszh-automations/secrets/"+sys.argv[3])
 items=secret["items"]
 assert len(items)==1
 assert str(items[0].get("key",items[0].get("version")))=="1"
 assert items[0]["path"]=="airtable-read-pat"
except (ValueError,KeyError,TypeError,AssertionError,AttributeError):
 print("STOP: Job config does not exactly match reviewed read-only one-shot design.")
 sys.exit(2)
print("PASS: Existing Job has immutable image, dedicated identity, safe env and file-mounted Secret v1.")
print("PASS: One task, parallelism one, retries zero, no overridden commands or args.")
' "$SA" "$IMAGE" "$SECRET" "$pnum"; then exit 2; fi

# Full unfiltered JSON is necessary: empty value(metadata.name) can hide v2
# jobs due to different representation. Fail closed on malformed or nonempty.
function assert_no_executions() {
 local inventory
 inventory="$(gcloud run jobs executions list --job="$JOB" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Execution inventory query failed.';return 2; }
 printf '%s\n' "$inventory" | python3 -c '
import json,sys
try:
 x=json.load(sys.stdin)
 assert isinstance(x,list) and len(x)==0
except (ValueError,TypeError,AssertionError):
 print("STOP: Job was already executed, or execution list invalid. No rerun.");sys.exit(2)
print("PASS: Zero Cloud Run executions registered for this exact Job.")
'
}
assert_no_executions
echo 'PASS: Original successful Cloud Build and matching immutable registry digest.'
echo 'PASS: Company identity, Zurich-only secret v1 and secret-level SecretAccessor IAM.'
echo 'PASS: Cloud Run one-shot job configuration independently verified.'
if [[ "$MODE" == '--plan' ]]; then
 echo 'PLAN ONLY: No live Airtable GET, Job execution, secret payload read or other writes.'
 exit 0
fi
# A second read prevents accidental launch if an execution appeared after the
# original preflight. No retries on failure or ambiguous start response.
assert_no_executions
echo 'EXECUTE ONCE: Starting the isolated read-only STAGING Cloud Run Job.'
if ! gcloud run jobs execute "$JOB" --project="$PROJECT" --region="$REGION" --wait; then
 echo 'STOP: Execution failed or result ambiguous. DO NOT RERUN. Inspect execution metadata/logs read-only.'
 exit 2
fi
echo 'Cloud Run execution command returned success. DO NOT RERUN.'
echo 'Next step: Inspect exact execution and PASS/STOP logs before claiming Airtable connection success.'
