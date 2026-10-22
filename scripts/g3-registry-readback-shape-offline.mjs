// G3 Artifact Registry response *shape* checker (offline only).
// Input is deliberately untrusted JSON. This is NOT authenticated registry
// readback, proof of bytes, signed provenance or deployment authorization.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const REPO='lszh-automations',REGION='europe-west6',AR_REPO='lszh-g3-review-staging',IMAGE='receiver';
const BASE='europe-west6-docker.pkg.dev/'+REPO+'/'+AR_REPO+'/'+IMAGE;
const RESOURCE='projects/'+REPO+'/locations/'+REGION+'/repositories/'+AR_REPO+'/dockerImages/'+IMAGE;
const OCI_MEDIA='application/vnd.oci.image.manifest.v1+json';
const SHA=/^sha256:[a-f0-9]{64}$/;
const FLAG={releaseStatus:'NO_GO',canDeploy:false,canPublish:false,
  registryReadbackAuthenticated:false,signedProvenanceVerified:false,
  operatorApprovalVerified:false};
const stop=(reason)=>({status:'BLOCKED_REGISTRY_RESPONSE_SHAPE',reason,...FLAG});
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
export function evaluate({expectedManifestDigest,registryRaw,ociReportRaw,provenanceRaw}={}){
  try{
    if(typeof expectedManifestDigest!=='string'||!SHA.test(expectedManifestDigest))
      return stop('invalid_expected_digest');
    if([registryRaw,ociReportRaw,provenanceRaw].some(x=>
      typeof x!=='string'||x.length<2||x.length>2_000_000))
      return stop('invalid_inputs');
    const response=JSON.parse(registryRaw);
    const oci=JSON.parse(ociReportRaw),claim=JSON.parse(provenanceRaw);
    if(oci.status!=='CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED'||
       oci.releaseStatus!=='NO_GO'||
       oci.candidate?.ociManifestDigest!==expectedManifestDigest||
       !SHA.test(oci.candidate?.ociConfigDigest||''))
      return stop('candidate_digest_mismatch');
    if(claim.status!=='UNSIGNED_CI_CORRELATION_VERIFIED'||
       claim.releaseStatus!=='NO_GO'||claim.signedProvenance!==false||
       claim.canPublish!==false||claim.canDeploy!==false||
       claim.candidateOCIManifestDigest!==expectedManifestDigest||
       claim.candidateOCIConfigDigest!==oci.candidate.ociConfigDigest||
       claim.artifactRegistryDigest!=='NOT_CREATED')
      return stop('unsigned_claim_mismatch');
    const exactUri=BASE+'@'+expectedManifestDigest;
    const exactResource=RESOURCE+'@'+expectedManifestDigest;
    // Accept ONLY Google's documented direct DockerImage resource format.
    // Do not silently normalize tags, aliases, nested metadata or other regions.
    if(response===null||Array.isArray(response)||typeof response!=='object'||
       response.uri!==exactUri||response.name!==exactResource)
      return stop('registry_identity_mismatch');
    if(response.mediaType!==OCI_MEDIA)
      return stop('manifest_media_type_mismatch');
    if(typeof response.imageSizeBytes!=='string'||
       !/^[1-9][0-9]*$/.test(response.imageSizeBytes)||
       !Number.isSafeInteger(Number(response.imageSizeBytes)))
      return stop('invalid_image_size');
    if(response.tags!==undefined&&(!Array.isArray(response.tags)||
       response.tags.some(x=>typeof x!=='string')))
      return stop('invalid_tags');
    // The JSON itself is not a trusted response from Google. Only a future
    // independently authenticated, read-only API call can promote this claim.
    return {status:'UNTRUSTED_REGISTRY_SHAPE_MATCH_NOT_READBACK',...FLAG,
      expectedImageUri:exactUri,expectedResourceName:exactResource,
      expectedManifestDigest,responseJsonSha256:hash(Buffer.from(registryRaw)),
      observedMediaType:response.mediaType,
      bytesReported:response.imageSizeBytes,
      limitations:['TEST_DATA_OR_UNAUTHENTICATED_JSON',
        'NO_GCP_API_CALL','NO_VERIFIED_REGISTRY_BYTES',
        'NO_SIGNED_PROVENANCE','NO_OPERATOR_APPROVAL']};
  }catch{return stop('invalid_json_or_unknown')}
}
export function main(args=process.argv.slice(2)){
  if(args.length!==4)return stop('expected_four_inputs');
  const [digest,registryFile,ociFile,provenanceFile]=args;
  return evaluate({expectedManifestDigest:digest,
    registryRaw:fs.readFileSync(registryFile,'utf8'),
    ociReportRaw:fs.readFileSync(ociFile,'utf8'),
    provenanceRaw:fs.readFileSync(provenanceFile,'utf8')});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try{result=main()}catch{result=stop('cannot_read_input')}
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='UNTRUSTED_REGISTRY_SHAPE_MATCH_NOT_READBACK')
    process.exitCode=2;
}
