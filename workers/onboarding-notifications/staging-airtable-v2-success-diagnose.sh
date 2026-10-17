#!/usr/bin/env bash
# LSZH: READ-ONLY evidence for the already completed ONE V2 Airtable staging execution.
# Never run/re-run Cloud Run, access Secret payload, or print raw Cloud Logging entries.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
JOB='lszh-airtable-read-probe-fix-staging'
EXEC='lszh-airtable-read-probe-fix-staging-7ppq4'
ORIGINAL_JOB='lszh-airtable-read-probe-staging'
ORIGINAL_EXEC='lszh-airtable-read-probe-staging-xglcz'
if [[ "$#" -ne 0 ]]; then
 echo 'STOP: Read-only success diagnosis accepts no arguments.';exit 2
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
 echo 'STOP: Wrong branch, dirty checkout or unsynced origin.';exit 2
fi
account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$account" != "$ACCOUNT" || "$project" != "$PROJECT" ]]; then
 echo 'STOP: Wrong LSZH business identity or cloud project.';exit 2
fi
original="$(gcloud run jobs executions list --job="$ORIGINAL_JOB" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Original execution inventory unavailable; no retry.';exit 2; }
if ! printf '%s\n' "$original" | python3 -c '
import sys,json
try:
 x=json.load(sys.stdin)
 assert isinstance(x,list) and len(x)==1
 name=x[0].get("name") or x[0].get("metadata",{}).get("name","")
 assert isinstance(name,str) and name.split("/")[-1]==sys.argv[1]
except (ValueError,AssertionError,TypeError,AttributeError,KeyError):
 print("STOP: Original failed job history changed; no retry.");sys.exit(2)
' "$ORIGINAL_EXEC"; then exit 2; fi
v2="$(gcloud run jobs executions list --job="$JOB" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: V2 execution inventory unavailable; no retry.';exit 2; }
if ! printf '%s\n' "$v2" | python3 -c '
import sys,json
try:
 x=json.load(sys.stdin)
 assert isinstance(x,list) and len(x)==1
 name=x[0].get("name") or x[0].get("metadata",{}).get("name","")
 assert isinstance(name,str) and name.split("/")[-1]==sys.argv[1]
except (ValueError,AssertionError,TypeError,AttributeError,KeyError):
 print("STOP: Expected exactly ONE V2 execution with approved ID; no retry.");sys.exit(2)
print("PASS: One and only one V2 execution; original historic failed job preserved.")
' "$EXEC"; then exit 2; fi
metadata="$(gcloud run jobs executions describe "$EXEC" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Exact V2 execution metadata unavailable; no retry.';exit 2; }
if ! printf '%s\n' "$metadata" | python3 -c '
import sys,json
try:
 d=json.load(sys.stdin)
 assert isinstance(d,dict)
 name=d.get("name") or d.get("metadata",{}).get("name","")
 assert isinstance(name,str) and name.split("/")[-1]==sys.argv[1]
 status=d.get("status",d)
 assert isinstance(status,dict)
 fail=status.get("failedCount",status.get("failed_count"))
 ok=status.get("succeededCount",status.get("succeeded_count"))
 if type(fail) is int:assert fail==0
 if type(ok) is int:assert ok==1
except (ValueError,AssertionError,TypeError,AttributeError,KeyError):
 print("STOP: V2 execution status/name inconsistent; no retry.");sys.exit(2)
print("PASS: Exact V2 execution metadata matches; no failed tasks reported.")
print("Successful tasks in metadata: "+(str(ok) if type(ok) is int else "not exposed"))
' "$EXEC"; then exit 2; fi

# Only the exact job + region. Python checks execution label and container stdout.
# Never echo returned JSON, raw textPayload, request URL, code, or a token.
FILTER='resource.type="cloud_run_job" AND resource.labels.job_name="lszh-airtable-read-probe-fix-staging" AND resource.labels.location="europe-west6"'
logs="$(gcloud logging read "$FILTER" --project="$PROJECT" --limit=500 --format=json)" ||
 { echo 'STOP: Cloud Logging read failed; never rerun the execution.';exit 2; }
if ! printf '%s\n' "$logs" | python3 -c '
import json,sys
expected=(
 "PASS: Existing verifyOnboardingState() used Airtable REST via exactly one GET.",
 "PASS: Fresh unprinted synthetic project code absent; processing (not completed).",
 "PASS: No Airtable writes, Firestore operations, service changes or emails.",
)
try:
 rows=json.load(sys.stdin)
 assert isinstance(rows,list)
except (ValueError,TypeError,AssertionError):
 print("STOP: Cloud Logging response invalid; no rerun.");sys.exit(2)
requested,job=sys.argv[1:3]
counts={k:0 for k in expected}
other=0
labelled=0
unlabelled=0
stop=False
for row in rows:
 if not isinstance(row,dict):continue
 resource=row.get("resource",{})
 if not isinstance(resource,dict) or resource.get("type")!="cloud_run_job":continue
 labels_resource=resource.get("labels",{})
 if not isinstance(labels_resource,dict) or labels_resource.get("job_name")!=job or labels_resource.get("location")!="europe-west6":
  continue
 labels=row.get("labels",{})
 if not isinstance(labels,dict):labels={}
 execution=labels.get("run.googleapis.com/execution_name",labels.get("execution_name"))
 if execution is None:
  unlabelled+=1
  continue  # conservative: no unlabelled log can prove live Airtable access
 if execution!=requested:
  other+=1
  continue
 labelled+=1
 name=row.get("logName","")
 if not isinstance(name,str):continue
 is_stdout=name.endswith("/logs/run.googleapis.com%2Fstdout") or name.endswith("/logs/run.googleapis.com/stdout")
 is_stderr=name.endswith("/logs/run.googleapis.com%2Fstderr") or name.endswith("/logs/run.googleapis.com/stderr")
 if not (is_stdout or is_stderr):continue
 msg=row.get("textPayload")
 if not isinstance(msg,str):
  payload=row.get("jsonPayload",{})
  msg=payload.get("message") if isinstance(payload,dict) else None
 if not isinstance(msg,str):continue
 stripped=msg.strip()
 if stripped.startswith("STOP:"):stop=True
 if is_stdout and stripped in counts:counts[stripped]+=1
print("PASS: Only exact labelled V2 execution logs inspected; raw logs never printed.")
print("Labelled entries for approved execution: "+str(labelled))
print("Unlabelled job entries excluded: "+str(unlabelled))
print("Other execution entries excluded: "+str(other))
for i,item in enumerate(expected,1):
 print("Expected safe application PASS "+str(i)+": "+("EXACTLY_ONCE" if counts[item]==1 else "NOT_EXACTLY_ONCE"))
print("Application STOP recorded: "+("YES" if stop else "NO"))
if labelled==0 or stop or any(n!=1 for n in counts.values()):
 print("STOP: Airtable REST GET not independently confirmed by exact success logs. Do not rerun.")
 sys.exit(2)
print("PASS: Live STAGING Cloud Run -> Airtable GET succeeded exactly once for an absent synthetic code.")
print("PASS: Expected no-write, no-email application checkpoints confirmed in runtime logs.")
' "$EXEC" "$JOB"; then exit 2; fi
echo 'READ ONLY: No execution, retry, Secret payload read, IAM edit, deployment or Airtable request.'
