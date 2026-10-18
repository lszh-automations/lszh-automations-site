'use strict';
// Pure local deny tests: never request GitHub signing certificates or OAuth.
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const script=path.resolve(__dirname,'../scripts/g3-signed-artifact-verify-readonly.sh');
const goodSha='a'.repeat(64),commit='b'.repeat(40),manifest='sha256:'+'c'.repeat(64);
function invoke(args){
  const r=spawnSync('bash',[script,...args],{
    cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:10000,
    env:{PATH:process.env.PATH||'/usr/bin:/bin'}});
  assert.equal(r.status,2,JSON.stringify({args,stdout:r.stdout,stderr:r.stderr}));
  const out=JSON.parse(r.stdout.trim());
  assert.equal(out.status,'BLOCKED_SIGNED_ATTESTATION_VERIFICATION');
  assert.equal(out.releaseStatus,'NO_GO');
  assert.equal(out.canPublish,false);assert.equal(out.canDeploy,false);
}
test('a known shell approval phrase or unsigned OCI reference is never sufficient',()=>{
  invoke([]);
  invoke(['/tmp/absent.oci.tar',goodSha,commit,commit,manifest]);
  invoke(['ghcr.io/lszh/example@sha256:'+goodSha,goodSha,commit,commit,manifest]);
  invoke(['/tmp/absent.oci.tar','NOT_SHA',commit,commit,manifest]);
  invoke(['/tmp/absent.oci.tar',goodSha,'bad',commit,manifest]);
  invoke(['/tmp/absent.oci.tar',goodSha,commit,'bad',manifest]);
  invoke(['/tmp/absent.oci.tar',goodSha,commit,commit,'sha256:wrong']);
});
test('signed verifier is read-only, scoped to protected main and never prints GO',()=>{
  const fs=require('node:fs');
  const s=fs.readFileSync(script,'utf8');
  assert.match(s,/gh attestation verify "\$artifact"/);
  assert.match(s,/--source-ref "refs\/heads\/main"/);
  assert.match(s,/--source-digest "\$source_sha"/);
  assert.match(s,/--signer-workflow "lszh-automations\/lszh-automations-site\/\.github\/workflows\/g3-canary-release-attest\.yml"/);
  assert.match(s,/--signer-digest "\$signer_sha"/);
  for(const word of ['gh auth login','gcloud ','docker push','attestation sign',
    'gh attestation download','git push','gh api -X POST','--source-ref "refs/pull/5/merge"']){
    assert.ok(!s.includes(word),word);
  }
  assert.match(s,/registryReadback":"NOT_VERIFIED"/);
  assert.match(s,/operatorApproval":"NOT_VERIFIED"/);
});
