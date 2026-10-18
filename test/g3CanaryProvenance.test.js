'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const load=()=>import('../scripts/g3-canary-provenance-correlation.mjs');
const base='docker.io/library/node:22-alpine@sha256:'+'a'.repeat(64);
const meta={repository:'lszh-automations/lszh-automations-site',
  workflow:'G3 canary candidate image (build-only, NO deployment)',
  eventName:'pull_request',ref:'refs/pull/5/merge',
  headRef:'feature/optional-avv-acceptance-staging-20261014',
  baseRef:'feature/secure-offer-acceptance-20261013',
  githubSha:'f'.repeat(40),checkedOutSha:'f'.repeat(40),runId:'39147871245'};
function good(){
  const dockerfileRaw='ARG BASE_IMAGE\nFROM '+'$'+'{BASE_IMAGE}\nUSER node\n';
  const receiverRaw='const canary=true;\n';
  const scanRaw='{"SchemaVersion":2,"Results":[]}\n';
  const sbomRaw='{"bomFormat":"CycloneDX","components":[]}\n';
  const inputs={dockerfileSha256:sha(dockerfileRaw),receiverSha256:sha(receiverRaw),
    candidateBaseImage:base,platform:'linux/amd64'};
  const i={status:'CANDIDATE_INPUTS_VALID',releaseStatus:'NO_GO',inputs,
    inputsSha256:sha(JSON.stringify(inputs))};
  const o={status:'CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED',releaseStatus:'NO_GO',
    candidate:{ociManifestDigest:'sha256:'+'b'.repeat(64),
      ociConfigDigest:'sha256:'+'c'.repeat(64),verifiedBlobs:8}};
  const s={status:'SCAN_AND_SBOM_RECORDED_NO_HIGH_CRITICAL',releaseStatus:'NO_GO',
    canPublish:false,canDeploy:false,signature:'NOT_SIGNED',
    registryImageDigest:'NOT_CREATED',candidateManifestDigest:o.candidate.ociManifestDigest,
    baseImage:base,inputDigest:i.inputsSha256,scanSha256:sha(scanRaw),sbomSha256:sha(sbomRaw),
    sourceCommit:meta.githubSha,runId:meta.runId,counts:{HIGH:0,CRITICAL:0,
      LOW:0,UNKNOWN:0,MEDIUM:1},mediumFindings:[
      {id:'CVE-2026-85091',package:'zlib',installedVersion:'1.3.2-r0',
        fixedVersion:'1.3.2-r1'}]};
  const lock={image:base,platform:'linux/amd64',reviewStatus:'UNREVIEWED',
    releaseStatus:'NO_GO',canDeploy:false,canPublish:false};
  return {inputRaw:JSON.stringify(i),ociRaw:JSON.stringify(o),
    securityRaw:JSON.stringify(s),scanRaw,sbomRaw,
    dockerfileRaw,receiverRaw,lockRaw:JSON.stringify(lock),
    identity:{...meta}};
}
test('hash-correlated local CI report is NEVER a signed provenance or release',async()=>{
  const {correlate}=await load();
  const result=correlate(good());
  assert.equal(result.status,'UNSIGNED_CI_CORRELATION_VERIFIED');
  assert.equal(result.signedProvenance,false);
  assert.equal(result.releaseStatus,'NO_GO');
  assert.equal(result.canPublish,false);assert.equal(result.canDeploy,false);
  assert.equal(result.artifactRegistryDigest,'NOT_CREATED');
  assert.equal(result.sourceCommitType,'GITHUB_PR_MERGE_COMMIT_NOT_BRANCH_HEAD');
  assert.match(result.evidenceClaimSha256,/^[a-f0-9]{64}$/);
});
test('preflight detects altered bytes, changed digests and unrelated branches',async()=>{
  const {correlate}=await load();
  const changes=[
    x=>{x.dockerfileRaw+='RUN curl example.invalid\n'},
    x=>{x.receiverRaw+='// tamper'},
    x=>{x.scanRaw+=' '},
    x=>{x.sbomRaw+=' '},
    x=>{x.identity.checkedOutSha='e'.repeat(40)},
    x=>{x.identity.headRef='feature/evil'},
    x=>{x.identity.ref='refs/pull/6/merge'},
    x=>{x.identity.repository='another/repo'},
    x=>{x.identity.runId='9999999999'},
    x=>{let d=JSON.parse(x.ociRaw);d.candidate.ociConfigDigest='bad';x.ociRaw=JSON.stringify(d)},
    x=>{let d=JSON.parse(x.securityRaw);d.counts.HIGH=1;x.securityRaw=JSON.stringify(d)},
    x=>{let d=JSON.parse(x.securityRaw);d.mediumFindings[0].id='CVE-UNKNOWN';x.securityRaw=JSON.stringify(d)},
    x=>{let d=JSON.parse(x.inputRaw);d.inputsSha256='0'.repeat(64);x.inputRaw=JSON.stringify(d)},
    x=>{let d=JSON.parse(x.lockRaw);d.reviewStatus='APPROVED';x.lockRaw=JSON.stringify(d)},
    x=>{let d=JSON.parse(x.securityRaw);d.signature='TRUST_ME';x.securityRaw=JSON.stringify(d)}
  ];
  for(const mutation of changes){
    const data=good();mutation(data);
    const result=correlate(data);
    assert.equal(result.status,'BLOCKED_EVIDENCE_CORRELATION',JSON.stringify(result));
    assert.equal(result.canDeploy,false);
  }
});
test('new medium findings require explicit scope review; zero known findings remains NO_GO',async()=>{
  const {correlate}=await load();
  const one=good();
  const bad=JSON.parse(one.securityRaw);
  bad.counts.MEDIUM=2;
  assert.equal(correlate({...one,securityRaw:JSON.stringify(bad)}).status,
    'BLOCKED_EVIDENCE_CORRELATION');
  const zero=JSON.parse(one.securityRaw);
  zero.counts.MEDIUM=0;zero.mediumFindings=[];
  const result=correlate({...one,securityRaw:JSON.stringify(zero)});
  assert.equal(result.status,'UNSIGNED_CI_CORRELATION_VERIFIED');
  assert.equal(result.releaseStatus,'NO_GO');
});
