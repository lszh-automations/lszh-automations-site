'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../scripts/g3-upstream-base-review.mjs');
const old='docker.io/library/node:22-alpine@sha256:'+'a'.repeat(64);
const next='docker.io/library/node:22-alpine@sha256:'+'b'.repeat(64);
const base={SchemaVersion:2,ArtifactType:'container_image',Results:[
  {Target:'Alpine',Type:'alpine',Class:'os-pkgs',Vulnerabilities:[]}]};
test('same locked digest gives no-upgrade report and hard NO_GO',async()=>{
  const {evaluate}=await load();
  const r=evaluate({locked:old,upstream:old});
  assert.equal(r.status,'NO_NEW_UPSTREAM_DIGEST');
  assert.equal(r.canChangeBaseLock,false);
  assert.equal(r.releaseStatus,'NO_GO');
});
test('new digest with zlib finding must remain blocked for release',async()=>{
  const {evaluate}=await load();
  const scan=structuredClone(base);
  scan.Results[0].Vulnerabilities=[{PkgName:'zlib',VulnerabilityID:'CVE-2026-85091',
    Severity:'MEDIUM',InstalledVersion:'1.3.2-r0',FixedVersion:'1.3.2-r1'}];
  const r=evaluate({locked:old,upstream:next,rawScan:JSON.stringify(scan)});
  assert.equal(r.status,'UPSTREAM_STILL_REPORTS_ZLIB_CVE');
  assert.equal(r.zlibFindings.length,1);assert.equal(r.canPublish,false);
});
test('absent CVE is not evidence of installed fixed zlib or approval',async()=>{
  const {evaluate}=await load();
  const r=evaluate({locked:old,upstream:next,rawScan:JSON.stringify(base)});
  assert.equal(r.status,'UPSTREAM_CVE_NOT_REPORTED_REQUIRES_PACKAGE_VERSION_CHECK');
  assert.equal(r.needsPlatformPackageInventory,true);
  assert.equal(r.scanVerdict,'ADVISORY_NOT_PACKAGE_PROOF');
  assert.equal(r.canChangeBaseLock,false);
});
test('floating refs and fabricated scans fail closed',async()=>{
  const {evaluate}=await load();
  for(const input of [{locked:'node:22-alpine',upstream:next},
    {locked:old,upstream:'node:latest'}]){
    assert.equal(evaluate(input).status,'BLOCKED_INVALID_BASE_REFERENCE');
  }
  for(const rawScan of ['{}','', '{"SchemaVersion":2,"Results":[]}',
    '{"SchemaVersion":2,"ArtifactType":"filesystem","Results":[{}]}']){
    assert.equal(evaluate({locked:old,upstream:next,rawScan}).status,
      'BLOCKED_UNVERIFIED_UPSTREAM_SCAN');
  }
});
