#!/usr/bin/env bash
# One approved synthetic Firestore CAS CREATE+UPDATE, not a read-check rerun.
# conditional automatic expiration and best-effort immediate revoke.
# One test-only case retained; no DELETE, Cloud Run, mail, keys or broad grants.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
SA='lszh-quarantine-cas-stg@lszh-automations.iam.gserviceaccount.com'
MEMBER='user:lars@lszh-automations.ch'
ROLE='roles/iam.serviceAccountTokenCreator'
TITLE='LSZHQuarantineCASWriteOneShot20261017'
APPROVAL='I_APPROVE_SINGLE_SYNTHETIC_QUARANTINE_CAS_WRITE'
MODE='--plan'
if [[ $# -gt 0 ]];then MODE="$1";fi
if [[ $# -gt 1 || ( "$MODE" != '--plan' && "$MODE" != '--run-approved-once' ) ]];then
 echo 'STOP: Only --plan or --run-approved-once allowed.';exit 2
fi
for tool in git gcloud python3 mktemp date sleep node;do
 command -v "$tool" >/dev/null || { echo 'STOP: Required tool unavailable.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Expected reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ||
      -n "$(git status --porcelain --untracked-files=normal)" ||
      "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Wrong/dirty/outdated Git review checkout.';exit 2
fi
if [[ "$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n 1)" != "$ACCOUNT" ||
      "$(gcloud config get-value project 2>/dev/null)" != "$PROJECT" ]];then
 echo 'STOP: Wrong active LSZH account/project.';exit 2
fi
bash workers/onboarding-notifications/staging-quarantine-iam-preflight.sh --plan
node --check workers/onboarding-notifications/staging-quarantine-cas-write-once.js
if ! gcloud services list --enabled --project="$PROJECT" \
 --filter='config.name=iamcredentials.googleapis.com' --format='value(config.name)' |
 grep -Fxq 'iamcredentials.googleapis.com';then
 echo 'BLOCKED: IAM Service Account Credentials API unavailable.';exit 2
fi
WORK="$(mktemp -d)"
chmod 700 "$WORK"
GRANT_ATTEMPTED=0
CONDITION_FILE="$WORK/condition.json"
cleanup(){
 local ec=$?
 trap - EXIT
 if [[ "$GRANT_ATTEMPTED" == 1 ]];then
   if ! gcloud iam service-accounts remove-iam-policy-binding "$SA" \
    --project="$PROJECT" --member="$MEMBER" --role="$ROLE" \
    --condition-from-file="$CONDITION_FILE" --quiet \
    >"$WORK/revoke.out" 2>"$WORK/revoke.err";then
     echo 'WARNING: Immediate scoped IAM revoke failed; time condition still expires automatically.'
     ec=2
   else
     echo 'PASS: Exact temporary Service Account Token Creator binding revoked.'
   fi
   if gcloud iam service-accounts get-iam-policy "$SA" --project="$PROJECT" \
     --format=json > "$WORK/after-policy.json" 2>/dev/null &&
     python3 - "$WORK/after-policy.json" "$MEMBER" "$ROLE" "$TITLE" <<'PY'
import json,sys
try:
    p=json.load(open(sys.argv[1]))
    expected_member,role,title=sys.argv[2:]
    bindings=p.get("bindings",[])
    assert isinstance(bindings,list)
    assert not any(
        b.get("role")==role and expected_member in b.get("members",[])
        and b.get("condition",{}).get("title")==title
        for b in bindings
    )
except Exception:
    sys.exit(2)
PY
   then
     echo 'PASS: Temporary IAM binding absent in fresh readback.'
   else
     echo 'WARNING: Temporary IAM removal not verified; do not rerun. The timed condition remains the fallback.'
     ec=2
   fi
 fi
 rm -rf "$WORK"
 exit "$ec"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
if ! gcloud iam service-accounts get-iam-policy "$SA" --project="$PROJECT" \
 --format=json >"$WORK/before-policy.json" 2>/dev/null;then
 echo 'BLOCKED: Cannot read target service-account IAM policy.';exit 2
fi
if ! python3 - "$WORK/before-policy.json" "$MEMBER" <<'PY'
import json,sys
try:
    p=json.load(open(sys.argv[1]))
    bindings=p.get('bindings',[])
    assert isinstance(bindings,list)
    assert not any(sys.argv[2] in b.get('members',[]) for b in bindings)
except Exception:
    sys.exit(2)
PY
then
 echo 'BLOCKED: Existing binding for business identity on this service account; inspect first.';exit 2
fi
echo 'PASS: No existing direct service-account IAM grant for business user.'
echo 'PLAN: One SA-level conditional Token Creator grant expiring after 30 minutes at most.'
echo 'PLAN: After exact temporary grant, wait 600 seconds for IAM propagation.'
echo 'PLAN: One synthetic CREATE (exists:false), one UPDATE (updateTime), three GETs, no DELETE.'
echo 'PLAN: Exact separate database/collection; retained synthetic revision-2 fixture, never customer data.'
echo 'PLAN: Exact scoped grant revoked immediately at process end and independently checked.'
echo 'STOP: No production writes, deletes, broad IAM, secrets on disk or Cloud Run.'
if [[ "$MODE" == '--plan' ]];then
 echo 'PLAN ONLY: No Cloud changes or API calls to Firestore.'
 exit 0
fi
if [[ "$(printenv LSZH_TEMPORARY_IMPERSONATION_APPROVAL 2>/dev/null || true)" != "$APPROVAL" ]];then
 echo 'STOP: Explicit separate timed IAM approval marker missing.';exit 2
fi
STATE_DIR="$HOME/.local/state/lszh-automations"
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
# No automatic retry, even after ambiguous interrupted grant.
if ! (umask 077; set -C; printf 'attempted\n' > "$STATE_DIR/quarantine-cas-write-once-20261017.once") 2>/dev/null;then
 echo 'STOP: One-time local guard already exists; do not rerun this privilege grant.';exit 2
fi
EXPIRES="$(date -u -d '+30 minutes' '+%Y-%m-%dT%H:%M:%SZ')"
python3 - "$CONDITION_FILE" "$TITLE" "$EXPIRES" <<'PY'
import json,sys
path,title,expires=sys.argv[1:]
condition={
 'title':title,
 'description':'LSZH approved one synthetic quarantine CAS write test; 30 minute maximum',
 'expression':'request.time < timestamp("'+expires+'")'
}
with open(path,'w') as output:
 json.dump(condition,output)
PY
chmod 600 "$CONDITION_FILE"
echo 'APPROVED: Applying one SA-resource-only IAM lease for up to 30 minutes.'
GRANT_ATTEMPTED=1
if ! gcloud iam service-accounts add-iam-policy-binding "$SA" \
 --project="$PROJECT" --member="$MEMBER" --role="$ROLE" \
 --condition-from-file="$CONDITION_FILE" --quiet \
 >"$WORK/grant.out" 2>"$WORK/grant.err";then
 echo 'UNVERIFIED: Timed binding change failed or timed out. Cleanup will still be attempted.'
 exit 2
fi
if ! gcloud iam service-accounts get-iam-policy "$SA" --project="$PROJECT" \
 --format=json >"$WORK/lease-policy.json" 2>/dev/null;then
 echo 'BLOCKED: Could not independently verify timed binding. Cleanup will run.';exit 2
fi
if ! python3 - "$WORK/lease-policy.json" "$CONDITION_FILE" "$MEMBER" "$ROLE" <<'PY'
import json,sys
try:
    p=json.load(open(sys.argv[1]))
    condition=json.load(open(sys.argv[2]))
    member,role=sys.argv[3:]
    bindings=p.get('bindings',[])
    assert isinstance(bindings,list)
    matches=[b for b in bindings if member in b.get('members',[])]
    assert len(matches)==1
    assert matches[0]['role']==role
    assert matches[0]['members']==[member]
    assert matches[0].get('condition')==condition
except Exception:
    sys.exit(2)
PY
then
 echo 'BLOCKED: Effective time-limited IAM binding metadata mismatch; cleanup will run.';exit 2
fi
echo 'PASS: Exact 30-minute-limited SA-scoped IAM condition confirmed.'
echo 'WAIT: 600 seconds for IAM propagation before impersonation.'
sleep 600 || { echo 'BLOCKED: Propagation wait interrupted; IAM cleanup will run.';exit 2; }
echo 'PASS: Propagation wait completed; starting one gated synthetic CAS run.'
node --check workers/onboarding-notifications/staging-quarantine-cas-write-once.js
LSZH_SYNTHETIC_QUARANTINE_CAS_WRITE_ONCE=true \
LSZH_OUTBOX_STAGE_ENABLED=false \
node workers/onboarding-notifications/staging-quarantine-cas-write-once.js
