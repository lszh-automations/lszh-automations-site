import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('./staging-outbox-secret-access-job.sh',import.meta.url));
const source=readFileSync(script,'utf8');
test('separate source-SA probe shell syntax is valid',()=>{
 const p=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
});
test('probe defaults to metadata-only plan and cannot execute jobs',()=>{
 assert.match(source,/MODE=--plan/);
 assert.match(source,/--create-only/);
 assert.doesNotMatch(source,/gcloud run jobs execute|gcloud run jobs update|secrets versions access/);
 assert.match(source,/gcloud run jobs list/);
 assert.match(source,/gcloud run jobs executions list/);
});
test('probe must run one task, zero retries, source-SA and isolated job name',()=>{
 assert.match(source,/JOB=lszh-outbox-secret-access-probe-stg/);
 assert.match(source,/SOURCE=lszh-onboarding-outbox-staging@/);
 assert.match(source,/--tasks=1 --parallelism=1 --max-retries=0/);
 assert.match(source,/--command=\/bin\/sh/);
 assert.match(source,/--args="-c,\$PROBE"/);
 assert.match(source,/--set-secrets="LSZH_PROBE_SECRET=\$SECRET:1"/);
 assert.match(source,/gcloud run jobs describe/);
});
test('probe uses immutable approved image and never prints the secret',()=>{
 assert.match(source,/sha256:c8e0b3de0519c8c562df743bb3d7f99fc6b23a2cc94e015f32f9f10d91ca1fac/);
 assert.match(source,/PASS_SOURCE_SECRET_ACCESS/);
 assert.match(source,/\[ -n "\$LSZH_PROBE_SECRET" \]/);
 assert.doesNotMatch(source,/echo[ ]+"?\$LSZH_PROBE_SECRET|printf[ ]+[^\n]*\$LSZH_PROBE_SECRET/);
 assert.doesNotMatch(source,/curl[ ]|wget[ ]|Airtable GET/);
});
