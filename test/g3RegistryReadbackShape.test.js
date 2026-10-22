'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process'),fs=require('node:fs');
const os=require('node:os'),path=require('node:path');
const load=()=>import('../scripts/g3-registry-readback-shape-offline.mjs');
const SHA='sha256:'+'a'.repeat(64),CONFIG='sha256:'+'b'.repeat(64);
const URI='europe-west6-docker.pkg.dev/lszh-automations/lszh-g3-review-staging/receiver@'+SHA;
const NAME='projects/lszh-automations/locations/europe-west6/repositories/lszh-g3-review-staging/dockerImages/receiver@'+SHA;
const MEDIA='application/vnd.oci.image.manifest.v1+json';
function sample(){
 const registry={uri:URI,name:NAME,mediaType:MEDIA,imageSizeBytes:'21345',tags:[]};
 const oci={status:'CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED',releaseStatus:'NO_GO',
   candidate:{ociManifestDigest:SHA,ociConfigDigest:CONFIG}};
 const provenance={status:'UNSIGNED_CI_CORRELATION_VERIFIED',releaseStatus:'NO_GO',
   canPublish:false,canDeploy:false,signedProvenance:false,
   candidateOCIManifestDigest:SHA,candidateOCIConfigDigest:CONFIG,
   artifactRegistryDigest:'NOT_CREATED'};
 return {expectedManifestDigest:SHA,registryRaw:JSON.stringify(registry),
   ociReportRaw:JSON.stringify(oci),provenanceRaw:JSON.stringify(provenance)};
}
const mutate=(data,field,fn)=>{
 const v=JSON.parse(data[field]);fn(v);data[field]=JSON.stringify(v);
};
test('exact synthetic response shape produces ONLY unauthenticated NO_GO',async()=>{
 const {evaluate}=await load();
 const x=evaluate(sample());
 assert.equal(x.status,'UNTRUSTED_REGISTRY_SHAPE_MATCH_NOT_READBACK');
 assert.equal(x.expectedImageUri,URI);
 assert.equal(x.releaseStatus,'NO_GO');
 assert.equal(x.canDeploy,false);assert.equal(x.canPublish,false);
 assert.equal(x.registryReadbackAuthenticated,false);
 assert.equal(x.signedProvenanceVerified,false);
 assert.equal(x.operatorApprovalVerified,false);
 assert.match(x.responseJsonSha256,/^[a-f0-9]{64}$/);
});
test('altered tag, location, project, repo, digest, type, size and fake approval all block',async()=>{
 const {evaluate}=await load();
 const corruptions=[
   ['registryRaw',x=>{x.uri=x.uri.replace('europe-west6','europe-west1')}],
   ['registryRaw',x=>{x.name=x.name.replace('lszh-automations','another-company')}],
   ['registryRaw',x=>{x.uri=x.uri.replace('receiver@','receiver:latest@')}],
   ['registryRaw',x=>{x.uri=x.uri.replace('sha256:','sha256:000')}],
   ['registryRaw',x=>{x.mediaType='application/vnd.oci.image.index.v1+json'}],
   ['registryRaw',x=>{x.imageSizeBytes='0'}],
   ['registryRaw',x=>{x.imageSizeBytes=12}],
   ['registryRaw',x=>{x.tags='latest'}],
   ['registryRaw',x=>{x.name='fake'}],
   ['ociReportRaw',x=>{x.candidate.ociManifestDigest='sha256:'+'d'.repeat(64)}],
   ['ociReportRaw',x=>{x.status='SKIPPED'}],
   ['provenanceRaw',x=>{x.signedProvenance=true}],
   ['provenanceRaw',x=>{x.canDeploy=true}],
   ['provenanceRaw',x=>{x.artifactRegistryDigest=SHA}],
   ['provenanceRaw',x=>{x.candidateOCIConfigDigest='sha256:'+'c'.repeat(64)}]
 ];
 for(const [field,fn] of corruptions){
   const data=sample();mutate(data,field,fn);
   const result=evaluate(data);
   assert.equal(result.status,'BLOCKED_REGISTRY_RESPONSE_SHAPE',field);
   assert.equal(result.canDeploy,false);
 }
 assert.equal(evaluate({...sample(),expectedManifestDigest:'bad'}).status,
   'BLOCKED_REGISTRY_RESPONSE_SHAPE');
});
test('no file or generated local fixture ever authorizes registry or deployment',async()=>{
 const root=path.resolve(__dirname,'..');
 const script=path.join(root,'scripts/g3-registry-readback-shape-offline.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g3-registry-fake-'));
 try{
   const x=sample();
   const files=['registryRaw','ociReportRaw','provenanceRaw'].map((k,i)=>{
     const filename=path.join(dir,String(i)+'.json');
     fs.writeFileSync(filename,x[k]);return filename;
   });
   const r=spawnSync(process.execPath,[script,SHA,...files],{
     cwd:root,encoding:'utf8',timeout:10000,env:{PATH:'/nonexistent'}});
   assert.equal(r.status,0);
   const report=JSON.parse(r.stdout);
   assert.equal(report.status,'UNTRUSTED_REGISTRY_SHAPE_MATCH_NOT_READBACK');
   assert.equal(report.registryReadbackAuthenticated,false);
   assert.equal(report.canPublish,false);assert.equal(report.canDeploy,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
