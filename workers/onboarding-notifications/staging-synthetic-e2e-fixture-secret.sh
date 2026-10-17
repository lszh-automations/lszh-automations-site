#!/usr/bin/env bash
# PRIVATE synthetic SOURCE E2E fixture -> Secret Manager. Never print secret payload.
# Default --plan is read-only. --stage-once creates ONE Zurich-only secret with
# exactly ONE version and source-SA-only access. No Cloud Run, Airtable writes or mail.
set -euo pipefail
set +x
PROJECT=lszh-automations
ACCOUNT=lars@lszh-automations.ch
REGION=europe-west6
BRANCH=feature/onboarding-notification-outbox-20261016
SOURCE=lszh-onboarding-outbox-staging@lszh-automations.iam.gserviceaccount.com
FIXTURE_SECRET=lszh-stg-onboarding-e2e-fixture-20261017
EXPECTED_HASH=7e8e90c6bac9e76e11bbbd072f62098a12b6aa68bbdf8a697e9af96459dc9a91
MODE=--plan
if [[ $# -eq 1 ]];then MODE="$1";fi
[[ $# -le 1 && ( "$MODE" == --plan || "$MODE" == --stage-once ) ]] ||
 { echo 'STOP: Only --plan or --stage-once allowed.';exit 2; }
for tool in git gcloud node python3 mktemp;do
 command -v "$tool" >/dev/null || { echo 'STOP: Required tool unavailable.';exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not in reviewed Git checkout.';exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ||
      -n "$(git status --porcelain --untracked-files=normal)" ||
      "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]];then
 echo 'STOP: Wrong, dirty or outdated reviewed Git branch.';exit 2;fi
if [[ "$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n1)" != "$ACCOUNT" ||
      "$(gcloud config get-value project 2>/dev/null)" != "$PROJECT" ]];then
 echo 'STOP: Wrong company Google identity or project.';exit 2;fi
FILE="$HOME/.local/state/lszh-automations/handoff-source-fixture-20261017/fixture.json"
[[ "$FILE" == /* && -f "$FILE" && ! -L "$FILE" ]] ||
 { echo 'STOP: Private synthetic fixture missing.';exit 2; }
# Local generator verifies 0700/0600, event ID and disabled delivery flags.
if ! node workers/onboarding-notifications/synthetic-source-fixture-local.js --fingerprint |
 grep -Fxq "FINGERPRINT_SHA256: $EXPECTED_HASH";then
 echo 'STOP: Private synthetic fixture failed integrity or fingerprint checks.';exit 2;fi
TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
if ! gcloud iam service-accounts describe "$SOURCE" --project="$PROJECT" \
 --format='value(email)' >"$TMP/source";then
 echo 'STOP: Exact source identity unavailable.';exit 2;fi
[[ "$(cat "$TMP/source")" == "$SOURCE" ]] ||
 { echo 'STOP: Source identity mismatch.';exit 2; }
if ! gcloud secrets list --project="$PROJECT" --format='json(name)' >"$TMP/secrets";then
 echo 'STOP: Cannot inspect existing secrets.';exit 2;fi
if ! python3 - "$TMP/secrets" <<'PY'
import json,sys
try:
 a=json.load(open(sys.argv[1]))
 assert isinstance(a,list)
 assert all(isinstance(x.get('name'),str) for x in a)
except (ValueError,TypeError,AssertionError,OSError):
 sys.exit(1)
PY
then
 echo 'STOP: Secret Manager inventory invalid.';exit 2;fi
FOUND="$(python3 - "$TMP/secrets" "$FIXTURE_SECRET" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1]))
print('PRESENT' if any(x['name'].rsplit('/',1)[-1]==sys.argv[2] for x in rows) else 'ABSENT')
PY
)"
if [[ "$FOUND" == PRESENT ]];then
 echo 'STOP: Dedicated fixture secret already exists. Do not recreate, rotate or regrant blindly.'
 exit 2
fi
echo 'PASS: Correct project, source identity, validated private synthetic fixture and no existing fixture secret.'
echo 'PASS: Project code was never passed on CLI or added to GitHub.'
if [[ "$MODE" == --plan ]];then
 echo 'PLAN ONLY: No Secret Manager, Cloud Run, Firestore, Airtable or customer changes.'
 echo 'NEXT: --stage-once creates one Zurich-only Secret Manager fixture + source-SA-only accessor.'
 exit 0
fi
echo 'STAGE ONCE: New Zurich-only synthetic Secret Manager fixture, sourced directly from private local file.'
if ! gcloud secrets create "$FIXTURE_SECRET" --project="$PROJECT" \
 --replication-policy=user-managed --locations="$REGION" \
 --data-file="$FILE" --quiet >/dev/null;then
 echo 'STOP: Secret create may have partially succeeded. NEVER retry; inspect resource first.'
 exit 2
fi
if ! gcloud secrets add-iam-policy-binding "$FIXTURE_SECRET" --project="$PROJECT" \
 --member="serviceAccount:$SOURCE" --role='roles/secretmanager.secretAccessor' \
 --quiet >/dev/null;then
 echo 'STOP: Secret exists; grant not confirmed. DO NOT rerun create.'
 exit 2
fi
if ! gcloud secrets describe "$FIXTURE_SECRET" --project="$PROJECT" \
 --format=json >"$TMP/metadata" ||
 ! gcloud secrets versions list "$FIXTURE_SECRET" --project="$PROJECT" \
 --format='json(name,state)' >"$TMP/versions" ||
 ! gcloud secrets get-iam-policy "$FIXTURE_SECRET" --project="$PROJECT" \
 --format=json >"$TMP/policy";then
 echo 'STOP: New secret may exist, but verification failed. Do not recreate.'
 exit 2
fi
if ! python3 - "$TMP/metadata" "$TMP/versions" "$TMP/policy" "$SOURCE" "$FIXTURE_SECRET" <<'PY'
import json,sys
try:
 metadata=json.load(open(sys.argv[1]))
 assert metadata['name'].rsplit('/',1)[-1]==sys.argv[5]
 assert [x['location'] for x in metadata['replication']['userManaged']['replicas']]==['europe-west6']
 versions=json.load(open(sys.argv[2]))
 assert len(versions)==1 and versions[0]['state']=='ENABLED'
 assert versions[0]['name'].rsplit('/',1)[-1]=='1'
 p=json.load(open(sys.argv[3]))
 b=p.get('bindings',[])
 assert isinstance(b,list) and len(b)==1
 assert b[0].get('role')=='roles/secretmanager.secretAccessor'
 assert b[0].get('members')==['serviceAccount:'+sys.argv[4]]
 assert not b[0].get('condition')
except (AssertionError,KeyError,ValueError,TypeError,OSError):
 sys.exit(1)
PY
then
 echo 'STOP: New secret exists but replication, version or IAM verification FAILED.'
 exit 2
fi
echo 'PASS: One Zurich-only synthetic fixture Secret Manager version 1, exact source-SA-only accessor.'
echo 'PASS: No plaintext in GitHub, arguments or logs; no Airtable/Firestore writes or Cloud Run executions.'
echo 'STOP HERE: Build and source E2E Job creation are separate controlled steps.'
