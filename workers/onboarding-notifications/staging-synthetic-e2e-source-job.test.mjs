import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const PATH=fileURLToPath(new URL('./staging-synthetic-e2e-source-job.sh',import.meta.url));
const script=readFileSync(PATH,'utf8');
test('guarded source-only E2E build/job shell syntax valid',()=>{
 const x=spawnSync('bash',['-n',PATH],{encoding:'utf8'});
 assert.equal(x.status,0,x.stderr);
});
test('no codepath ever calls Cloud Run execute, broad IAM change or customer mail',()=>{
 assert.match(script,/MODE=--plan/);
 assert.match(script,/--build-only/);
 assert.match(script,/--create-only/);
 assert.match(script,/--verify-only/);
 assert.doesNotMatch(script,/gcloud run jobs execute|gcloud run services deploy|gcloud run services update|sendmail|mailgun|gmail send/i);
 assert.doesNotMatch(script,/gcloud secrets versions access/);
 assert.match(script,/--verify-review-only/);
});
test('only 19 source allowlisted files copied into build context, no fixture file',()=>{
 assert.match(script,/found.*==.*count/);
 assert.match(script,/count.*== 19/);
 assert.match(script,/cp -- "\$f" "\$TMP\/context\/\$f"/);
 assert.match(script,/cloudbuild\.quarantine-source-e2e\.yaml/);
 assert.match(script,/staging-synthetic-source-e2e-once\.js/);
 assert.doesNotMatch(script,/cp -r \.|tar czf \./);
});
test('new job is immutable, 512Mi, one task, zero retries and 3 Secret v1 refs only',()=>{
 assert.match(script,/--tasks=1 --parallelism=1 --max-retries=0 --task-timeout=120s/);
 assert.match(script,/--cpu=1 --memory=512Mi/);
 assert.match(script,/--image="\$IMAGE" --service-account="\$SOURCE"/);
 assert.match(script,/--set-secrets="LSZH_SYNTHETIC_FIXTURE_JSON=\$FIXTURE:1,AIRTABLE_ONBOARDING_READ_TOKEN=\$AIRT:1,LSZH_QUARANTINE_HMAC_B64=\$HMAC:1"/);
 assert.match(script,/assert len\(env\)==13/);
 assert.match(script,/assert int\(top\['taskCount'\]\)==1 and int\(t\['maxRetries'\]\)==0/);
 assert.match(script,/ZERO executions/);
 assert.match(script,/Do not run or recreate/);
});
test('custom source code hash survives documentation-only commits',()=>{
 assert.match(script,/BUILD_KEY="\$\(while IFS= read -r f;do sha256sum "\$f";done/);
 assert.match(script,/SOURCE CONTENT FINGERPRINT/);
 assert.match(script,/SHA256/);
});
