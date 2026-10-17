import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('./staging-synthetic-e2e-fixture-secret.sh',import.meta.url));
const content=readFileSync(script,'utf8');
test('one-time private fixture secret staging shell passes bash syntax',()=>{
 const x=spawnSync('bash',['-n',script],{encoding:'utf8'});
 assert.equal(x.status,0,x.stderr);
});
test('default is read-only, only explicit single-use staging write',()=>{
 assert.match(content,/MODE=--plan/);
 assert.match(content,/--stage-once/);
 assert.match(content,/if \[\[ "\$MODE" == --plan \]\]/);
 assert.match(content,/secrets create "\$FIXTURE_SECRET"/);
 assert.doesNotMatch(content,/gcloud run jobs execute|gcloud run jobs update|gcloud run services update|secrets versions access/);
});
test('synthetic project code remains local private and HMAC fixed digest verified',()=>{
 assert.match(content,/synthetic-source-fixture-local\.js --fingerprint/);
 assert.match(content,/7e8e90c6bac9e76e11bbbd072f62098a12b6aa68bbdf8a697e9af96459dc9a91/);
 assert.match(content,/--data-file="\$FILE"/);
 assert.match(content,/--replication-policy=user-managed --locations="\$REGION"/);
 assert.match(content,/--role='roles\/secretmanager\.secretAccessor'/);
 assert.match(content,/assert b\[0\]\.get\('members'\)==\['serviceAccount:'\+sys\.argv\[4\]\]/);
 assert.doesNotMatch(content,/printf[^;\n]*projectCode|echo[^;\n]*projectCode/);
});
test('fails closed on previously existing fixture secret or ambiguous creation',()=>{
 assert.match(content,/if \[\[ "\$FOUND" == PRESENT \]\]/);
 assert.match(content,/NEVER retry/);
 assert.match(content,/len\(versions\)==1/);
 assert.match(content,/versions\[0\]\['name'\]\.rsplit/);
});
