'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../scripts/g3-canary-security-review.mjs');
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const sample={
  scan:{SchemaVersion:2,ArtifactType:'container_image',ArtifactName:'lszh-g3-canary:offline-review',
    Results:[{Target:'alpine',Class:'os-pkgs',Type:'alpine',Vulnerabilities:[
      {VulnerabilityID:'CVE-TEST-1',PkgName:'pkg1',Severity:'HIGH',FixedVersion:'1.1'},
      {VulnerabilityID:'CVE-TEST-2',PkgName:'pkg2',Severity:'CRITICAL'}]}]},
  sbom:{bomFormat:'CycloneDX',specVersion:'1.6',components:[{name:'node',version:'22'}]},
  oci:{status:'CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED',releaseStatus:'NO_GO',
    candidate:{ociManifestDigest:'sha256:'+a,ociConfigDigest:'sha256:'+b,verifiedBlobs:8}},
  inputs:{status:'CANDIDATE_INPUTS_VALID',releaseStatus:'NO_GO',inputsSha256:c,
    inputs:{receiverSha256:a,dockerfileSha256:b,platform:'linux/amd64',
      candidateBaseImage:'docker.io/library/node:22-alpine@sha256:'+a}}
};
function run(review,obj){
  return review({scanText:JSON.stringify(obj.scan),sbomText:JSON.stringify(obj.sbom),
    ociText:JSON.stringify(obj.oci),inputsText:JSON.stringify(obj.inputs),
    sourceCommit:'d'.repeat(40),runId:'39146520972'});
}
test('high/critical scanner findings are explicitly review blockers, never authorization',async()=>{
  const {review}=await load();
  const result=run(review,sample);
  assert.equal(result.status,'VULNERABILITIES_REQUIRE_REVIEW');
  assert.equal(result.releaseStatus,'NO_GO');
  assert.equal(result.canDeploy,false);assert.equal(result.canPublish,false);
  assert.equal(result.counts.HIGH,1);assert.equal(result.counts.CRITICAL,1);
  assert.equal(result.fixedHighCritical,1);assert.equal(result.unfixedHighCritical,1);
  assert.equal(result.sbomComponentCount,1);assert.equal(result.signature,'NOT_SIGNED');
});
test('zero findings still strictly NO_GO and unsigned, not an approval',async()=>{
  const {review}=await load();
  const data=structuredClone(sample);
  data.scan.Results[0].Vulnerabilities=[];
  const result=run(review,data);
  assert.equal(result.status,'SCAN_AND_SBOM_RECORDED_NO_HIGH_CRITICAL');
  assert.equal(result.releaseStatus,'NO_GO');
  assert.equal(result.canDeploy,false);assert.equal(result.canPublish,false);
});
test('missing or falsified independent inputs are always blocked',async()=>{
  const {review}=await load();
  const mutations=[
    d=>{d.scan.Results=[]},
    d=>{d.scan.Results[0].Vulnerabilities[0].Severity='MADE_UP'},
    d=>{d.scan.Results[0].Vulnerabilities[0].VulnerabilityID=null},
    d=>{d.scan.Results[0].Class=null},
    d=>{d.scan.ArtifactType='filesystem'},
    d=>{d.sbom.components=[]},
    d=>{d.sbom.bomFormat='not_cyclonedx'},
    d=>{d.oci.candidate.ociManifestDigest='sha256:bad'},
    d=>{d.oci.status='SKIPPED'},
    d=>{d.inputs.status='SKIPPED'},
    d=>{d.inputs.inputsSha256='not-a-sha'},
    d=>{d.inputs.inputs.candidateBaseImage='node:latest'},
    d=>{d.inputs.inputs.platform='linux/arm64'}
  ];
  for(const change of mutations){
    const d=structuredClone(sample);change(d);
    assert.equal(run(review,d).status,'BLOCKED_UNVERIFIED_SECURITY_EVIDENCE');
  }
  const r=review({scanText:'{}',sbomText:'{}',ociText:'{}',inputsText:'{}',sourceCommit:'d'.repeat(40),runId:'123'});
  assert.equal(r.status,'BLOCKED_UNVERIFIED_SECURITY_EVIDENCE');
});
