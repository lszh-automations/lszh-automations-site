#!/usr/bin/env bash
# LSZH Airtable STAGING: inspect the ONE already failed Cloud Run execution.
# Strictly READ ONLY. Print only allowlisted failure categories, never raw logs.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
REGION='europe-west6'
BRANCH='feature/onboarding-notification-outbox-20261016'
JOB='lszh-airtable-read-probe-staging'
EXEC='lszh-airtable-read-probe-staging-xglcz'
if [[ "$#" -ne 0 ]]; then
 echo 'STOP: This read-only diagnosis accepts no arguments.';exit 2
fi
for c in gcloud git python3; do
 command -v "$c" >/dev/null || { echo "STOP: Missing $c";exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
 echo 'STOP: Wrong review branch, modified tree or origin mismatch.';exit 2
fi
acct="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
proj="$(gcloud config get-value project 2>/dev/null)"
if [[ "$acct" != "$ACCOUNT" || "$proj" != "$PROJECT" ]]; then
 echo 'STOP: Wrong LSZH business account or GCP project.';exit 2
fi

# Use exact execution identity; never infer latest or run a new execution.
list="$(gcloud run jobs executions list --job="$JOB" --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Could not enumerate historical job executions.';exit 2; }
if ! printf '%s\n' "$list" | python3 -c '
import json,sys
try:
 x=json.load(sys.stdin)
 assert isinstance(x,list) and len(x)==1
 item=x[0]
 assert isinstance(item,dict)
 name=item.get("name") or item.get("metadata",{}).get("name","")
 assert name.split("/")[-1]==sys.argv[1]
except (ValueError,TypeError,AttributeError,AssertionError):
 print("STOP: Expected exactly the previously failed STAGING execution.");sys.exit(2)
print("PASS: Exactly one recorded Job execution; expected failed execution ID confirmed.")
' "$EXEC"; then exit 2; fi
details="$(gcloud run jobs executions describe "$EXEC" \
 --project="$PROJECT" --region="$REGION" --format=json)" ||
 { echo 'STOP: Exact execution metadata unavailable.';exit 2; }
if ! printf '%s\n' "$details" | python3 -c '
import json,sys
try:
 d=json.load(sys.stdin)
 assert isinstance(d,dict)
 name=d.get("name") or d.get("metadata",{}).get("name","")
 assert isinstance(name,str) and name.split("/")[-1]==sys.argv[1]
except (ValueError,TypeError,AttributeError,AssertionError):
 print("STOP: Wrong execution metadata returned.");sys.exit(2)
 s=d.get("status",d)
 if not isinstance(s,dict): s={}
 failures=s.get("failedCount",s.get("failed_count"))
 successes=s.get("succeededCount",s.get("succeeded_count"))
 print("PASS: Exact execution metadata read; no new task started.")
 print("Execution reported failed tasks: "+(str(failures) if type(failures) is int else "not reported"))
 print("Execution reported successful tasks: "+(str(successes) if type(successes) is int else "not reported"))
' "$EXEC"; then exit 2; fi

# Official Cloud Run Job log dimensions, scoped to the exact execution.
# Redirect all raw payload JSON through the sanitizer: do not copy logs verbatim.
FILTER='resource.type="cloud_run_job" AND resource.labels.job_name="lszh-airtable-read-probe-staging" AND labels.execution_name="lszh-airtable-read-probe-staging-xglcz"'
logs="$(gcloud logging read "$FILTER" --project="$PROJECT" --limit=100 --format=json)" ||
 { echo 'STOP: Could not access execution logs. No retry allowed.';exit 2; }
if ! printf '%s\n' "$logs" | python3 -c '
import json,re,sys
try:
 rows=json.load(sys.stdin)
 assert isinstance(rows,list)
except (ValueError,TypeError,AssertionError):
 print("STOP: Execution log inventory invalid. Do not rerun.");sys.exit(2)
print("PASS: Cloud Logging query restricted to the one failed execution.")
print("Matching log entries: "+str(len(rows)))
# Even if logs contain sensitive values, NEVER print textPayload/jsonPayload.
known={
 "airtable_runtime_probe_disabled","airtable_secret_unavailable",
 "invalid_read_only_token","unsafe_synthetic_code","unexpected_airtable_request",
 "airtable_token_not_authorized","airtable_rate_limited",
 "synthetic_absence_not_verified","airtable_status_unavailable",
 "invalid_status_response","airtable_runtime_probe_unavailable"
}
signals=set()
categories=set()
pass_count=0
for x in rows:
 if not isinstance(x,dict):
  continue
 text=x.get("textPayload","")
 payload=x.get("jsonPayload")
 if isinstance(payload,dict):
  v=payload.get("message",payload.get("msg",""))
  if isinstance(v,str): text=(text+" "+v if isinstance(text,str) else v)
 if not isinstance(text,str):continue
 signals.update(k for k in known if re.search(r"(?<![a-zA-Z_])"+re.escape(k)+r"(?![a-zA-Z_])",text))
 for needle,label in (
  ("Cannot find module","NODE_MODULE_NOT_FOUND"),
  ("MODULE_NOT_FOUND","NODE_MODULE_NOT_FOUND"),
  ("ERR_MODULE_NOT_FOUND","NODE_MODULE_NOT_FOUND"),
  ("ERR_REQUIRE_ESM","NODE_MODULE_FORMAT_ERROR"),
  ("SyntaxError","NODE_SYNTAX_ERROR"),
  ("ReferenceError","NODE_REFERENCE_ERROR"),
  ("TypeError","NODE_TYPE_ERROR"),
  ("EACCES","FILE_PERMISSION_DENIED"),
  ("Permission denied","FILE_PERMISSION_DENIED"),
  ("ENOENT","FILE_NOT_FOUND"),
  ("getaddrinfo","DNS_ERROR"),
  ("ETIMEDOUT","NETWORK_TIMEOUT"),
  ("ECONNRESET","NETWORK_CONNECTION_RESET"),
  ("exit code: 1","EXIT_CODE_1"),
  ("exited with an error","CONTAINER_EXIT_ERROR"),
 ):
  if needle in text:categories.add(label)
 if text.startswith("PASS: "): pass_count+=1
if signals:print("Safe application STOP code(s): "+", ".join(sorted(signals)))
else:print("Safe application STOP code(s): none observed")
if categories:print("Recognized runtime error category: "+", ".join(sorted(categories)))
else:print("Recognized runtime error category: none identified")
print("Application PASS log count: "+str(pass_count))
if not rows:print("STOP: No exact-execution logs found; check Cloud console filters. Never rerun.")
elif not signals and not categories and pass_count==0:
 print("STOP: Cause not classifiable from sanitized logs; inspect Cloud console privately.")
print("No raw log text or Secret Manager payload printed.")
'; then exit 2; fi
echo 'READ ONLY: No Job execution, Secret read, IAM edit, deployment, Airtable request or customer data action.'
