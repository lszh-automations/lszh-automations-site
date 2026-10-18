'use strict';
// Local/offline security tests only: no Docker, registry, GCP or Make calls.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const dig='a'.repeat(64);
const good='docker.io/library/node:22-alpine@sha256:'+dig;
const load=()=>import('../scripts/g3-canary-image-plan.mjs');

test('review build source permits only exact npm removal and nonroot single-file runtime',async()=>{
  const {main,auditDockerfile}=await load();
  const r=main([]);
  assert.equal(r.status,'SOURCE_ONLY_VALID');
  assert.equal(r.releaseStatus,'NO_GO');
  assert.equal(r.canDeploy,false);
  assert.equal(r.canPublish,false);
  assert.match(r.inputs.dockerfileSha256,/^[a-f0-9]{64}$/);
  assert.match(r.inputs.receiverSha256,/^[a-f0-9]{64}$/);
  const source=fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/Dockerfile'),'utf8');
  for(const line of ['RUN apk add curl','COPY . /srv','USER root','FROM node:22-alpine',
    'ENV GOOGLE_APPLICATION_CREDENTIALS=/tmp/key',
    'RUN rm -rf /srv', 'RUN curl https://example.invalid']){
    assert.equal(auditDockerfile(source+'\n'+line),false,line);
  }
});
test('only digest-pinned official base image from fixed tag and platform is valid',async()=>{
  const {auditBaseImage,auditSource}=await load();
  assert.equal(auditBaseImage(good),true);
  for(const x of ['node:22-alpine','docker.io/library/node:22-alpine',
    'docker.io/library/node:22-alpine@sha256:bad',
    'ghcr.io/library/node:22-alpine@sha256:'+dig,
    'docker.io/library/node:23-alpine@sha256:'+dig,
    'docker.io/other/node:22-alpine@sha256:'+dig,
    'docker.io/library/node:22-alpine@sha256:'+dig.toUpperCase()]){
    assert.equal(auditBaseImage(x),false,x);
  }
  const df=fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/Dockerfile'),'utf8');
  const receiver=fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/index.mjs'),'utf8');
  assert.equal(auditSource({dockerfile:df,receiver,baseImage:good}).status,'CANDIDATE_INPUTS_VALID');
  assert.equal(auditSource({dockerfile:df,receiver,baseImage:'node:latest'}).status,'BLOCKED_BASE_IMAGE');
  assert.equal(auditSource({dockerfile:df,receiver:receiver+'\nimport x from "evil";'}).status,'BLOCKED_RECEIVER_POLICY');
});
test('image audit CLI rejects accidental other arguments and floating image',()=>{
  for(const args of [['--build'],['--apply'],['--base-image=node:latest']]){
    const r=spawnSync(process.execPath,['scripts/g3-canary-image-plan.mjs',...args],{
      cwd:root,encoding:'utf8',timeout:15000});
    assert.equal(r.status,2,args.join(' '));
    const j=JSON.parse(r.stdout);
    assert.equal(j.releaseStatus,'NO_GO');
  }
});
test('OCI verifier fails closed on missing, corrupt or unsupported archives',()=>{
  const py=spawnSync('python3',['scripts/g3-canary-oci-verify.py','/nonexistent/a.tar','/nonexistent/b.tar'],{
    cwd:root,encoding:'utf8',timeout:15000});
  if(py.error&&py.error.code==='ENOENT')return; // Windows dev may lack Python.
  assert.equal(py.status,2);
  assert.equal(JSON.parse(py.stdout).status,'BLOCKED_INVALID_OR_DIFFERING_OCI');
});
