#!/usr/bin/env bash
# LSZH STAGING Airtable REST read verification: plan by default.
# --probe: explicit ONE authenticated GET via existing verification code,
# fresh synthetic code only, supplied read-only PAT through private stdin.
# No secrets in command-line arguments, source, env, files, or logs.
set -euo pipefail
set +x
PROJECT='lszh-automations'
ACCOUNT='lars@lszh-automations.ch'
BRANCH='feature/onboarding-notification-outbox-20261016'
MODE="${1:---plan}"
if [[ "$#" -gt 1 || ! "$MODE" =~ ^(--plan|--probe)$ ]]; then
  echo 'STOP: Allowed: --plan (default) or --probe.'
  exit 2
fi
for bin in git node gcloud; do
  command -v "$bin" >/dev/null || { echo "STOP: Missing $bin"; exit 2; }
done
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[[ -n "$ROOT" ]] || { echo 'STOP: Not inside a Git checkout'; exit 2; }
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BRANCH" ]] ||
   [[ -n "$(git status --porcelain --untracked-files=normal)" ]] ||
   [[ "$(git rev-parse HEAD)" != "$(git rev-parse "refs/remotes/origin/$BRANCH")" ]]; then
  echo 'STOP: Wrong branch, dirty checkout or branch differs from origin.'
  exit 2
fi
account="$(gcloud auth list --filter='status:ACTIVE' --format='value(account)' | head -n 1)"
project="$(gcloud config get-value project 2>/dev/null)"
if [[ "$account" != "$ACCOUNT" || "$project" != "$PROJECT" ]]; then
  echo 'STOP: Wrong Google business account or project.'
  exit 2
fi
echo 'PASS: Checked business identity, source branch and clean reviewed checkout.'
echo 'Target: one Airtable REST GET for a fresh unpredictable synthetic code only.'
echo 'Existing Cloud Run HTTP service, Make scenarios and customer records remain untouched.'
if [[ "$MODE" == '--plan' ]]; then
  echo 'PLAN ONLY: no Airtable token requested, no external API calls or cloud changes.'
  exit 0
fi
if [[ ! -t 0 ]]; then
  echo 'STOP: Interactive Cloud Shell required for private token entry.'
  exit 2
fi
echo 'Enter an Airtable PERSONAL ACCESS TOKEN limited to data.records:read on LSZH Website CRM.'
echo 'Token is needed only for this one GET, not stored, printed or added to Cloud Run.'
token=''
trap 'unset token' EXIT
IFS= read -r -s -p 'Airtable read-only PAT (input hidden): ' token
printf '\n'
if [[ "${#token}" -lt 20 || "${#token}" -gt 512 ]]; then
  echo 'STOP: Invalid token length. No request sent.'
  exit 2
fi
# The token goes through an ephemeral pipe, NOT a process argument, exported
# environment variable, file or Cloud secret.
printf '%s' "$token" | LSZH_AIRTABLE_REST_PROBE_ONLY=true \
  node workers/onboarding-notifications/staging-airtable-rest-read.js
unset token
echo 'PASS: Isolated Airtable REST verifier finished; no customer record was changed.'
