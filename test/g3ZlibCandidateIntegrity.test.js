'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),
 crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const load=()=>import('../scripts/g3-zlib-candidate-integrity.mjs');
const root=path.resolve(__dirname,'..');
const lockText=fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/zlib-patch.candidate.json'),'utf8');
const bytes=Buffer.alloc(54000,42);
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
const changed=lock=>JSON.stringify({...lock,sha256:sha});
test('a SHA-matching patched package still cannot be installed or released',async()=>{
 const {check}=await load();
 const x=check({lockRaw:changed(JSON.parse(lockText)),bytes});
 assert.equal(x.status,'CANDIDATE_BYTES_MATCH_NOT_PUBLISHER_VERIFIED');
 assert.equal(x.canModifyImage,false);assert.equal(x.publisherSignatureVerified,false);
 assert.equal(x.canPublish,false);assert.equal(x.canDeploy,false);
 assert.equal(x.releaseStatus,'NO_GO');
});
test('pin, source, unsafe approvals and byte tampering always fail',async()=>{
 const {check}=await load();
 const locked=JSON.parse(lockText);
 for(const key of [
  ['originUrl','https://example.invalid/malicious.apk'],
  ['version','1.3.2-r0'],
  ['architecture','aarch64'],
  ['alpineBranch','edge'],
  ['publisherSignatureVerified',true],
  ['installedInImage',true],
  ['humanSecurityReview','APPROVED'],
  ['releaseStatus','GO'],
  ['canDeploy',true],
  ['sha256','bad']
 ]){
  const altered={...locked,sha256:sha,[key[0]]:key[1]};
  assert.equal(check({lockRaw:JSON.stringify(altered),bytes}).status,
   'BLOCKED_ZLIB_PACKAGE_CANDIDATE',key[0]);
 }
 const good=changed(locked);
 assert.equal(check({lockRaw:good,bytes:Buffer.alloc(54000,44)}).status,
  'BLOCKED_ZLIB_PACKAGE_CANDIDATE');
 assert.equal(check({lockRaw:good,bytes:Buffer.alloc(2)}).status,
  'BLOCKED_ZLIB_PACKAGE_CANDIDATE');
 assert.equal(check({lockRaw:'{}',bytes}).status,'BLOCKED_ZLIB_PACKAGE_CANDIDATE');
});
test('committed candidate hash is well-formed and never preapproved',()=>{
 const x=JSON.parse(lockText);
 assert.match(x.sha256,/^[a-f0-9]{64}$/);
 assert.equal(x.publisherSignatureVerified,false);
 assert.equal(x.installedInImage,false);
 assert.equal(x.releaseStatus,'NO_GO');
 assert.equal(x.canDeploy,false);
});
