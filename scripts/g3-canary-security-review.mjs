// G3 candidate vulnerability/SBOM review: analysis only, never a release gate bypass.
// Input: Trivy JSON, CycloneDX SBOM, local OCI digest + source hashes.
// Never contacts Google Cloud, Docker, registries or Make.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const digest=/^sha256:[a-f0-9]{64}$/;
const validSha=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const str=x=>typeof x==='string'&&x.length>0;
function json(raw){
  if(typeof raw!=='string'||raw.length>10*1024*1024)throw Error('invalid_audit_input');
  return JSON.parse(raw);
}
export function review({scanText,sbomText,ociText,inputsText,sourceCommit,runId}={}){
  try{
    const scan=json(scanText),sbom=json(sbomText),oci=json(ociText),inputs=json(inputsText);
    if(scan.SchemaVersion!==2||!Array.isArray(scan.Results)||scan.Results.length===0||
       scan.ArtifactType!=='container_image')throw Error('trivy_scan_missing');
    if(sbom.bomFormat!=='CycloneDX'||!str(sbom.specVersion)||
       !Array.isArray(sbom.components)||sbom.components.length===0)
      throw Error('sbom_missing');
    if(oci.status!=='CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED'||
       oci.releaseStatus!=='NO_GO'||!digest.test(oci.candidate?.ociManifestDigest)||
       !digest.test(oci.candidate?.ociConfigDigest)||
       !Number.isInteger(oci.candidate?.verifiedBlobs)||oci.candidate.verifiedBlobs<1)
      throw Error('oci_not_verified');
    if(inputs.status!=='CANDIDATE_INPUTS_VALID'||inputs.releaseStatus!=='NO_GO'||
       !validSha(inputs.inputs?.receiverSha256)||
       !validSha(inputs.inputs?.dockerfileSha256)||
       !validSha(inputs.inputsSha256)||
       !/^docker\.io\/library\/node:22-alpine@sha256:[a-f0-9]{64}$/.test(inputs.inputs?.candidateBaseImage)||
       inputs.inputs.platform!=='linux/amd64')
      throw Error('source_and_base_not_verified');
    if(!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceCommit)||!/^\d{6,20}$/.test(String(runId)))
      throw Error('missing_ci_build_identity');
    const severities=['UNKNOWN','LOW','MEDIUM','HIGH','CRITICAL'];
    const counts=Object.fromEntries(severities.map(x=>[x,0]));
    let fixedHighCritical=0,unfixedHighCritical=0;
    for(const item of scan.Results){
      if(!str(item.Target)||!str(item.Class)||!str(item.Type)||
         (item.Vulnerabilities!==undefined&&!Array.isArray(item.Vulnerabilities)))
        throw Error('malformed_scan_target');
      for(const vuln of item.Vulnerabilities||[]){
        const level=vuln?.Severity;
        if(!severities.includes(level)||!str(vuln?.VulnerabilityID)||
           !str(vuln?.PkgName))throw Error('malformed_vulnerability');
        counts[level]++;
        if(level==='HIGH'||level==='CRITICAL'){
          if(str(vuln.FixedVersion))fixedHighCritical++;
          else unfixedHighCritical++;
        }
      }
    }
    const highCritical=counts.HIGH+counts.CRITICAL;
    return {
      schemaVersion:1,kind:'LSZH_G3_SYNTHETIC_IMAGE_CANDIDATE_SECURITY_REVIEW_V1',
      status:highCritical?'VULNERABILITIES_REQUIRE_REVIEW':'SCAN_AND_SBOM_RECORDED_NO_HIGH_CRITICAL',
      releaseStatus:'NO_GO',canPublish:false,canDeploy:false,
      reviewStatus:'UNAPPROVED_REVIEW_REQUIRED',
      // A scanner finding of zero is not proof of absolute security.
      candidateManifestDigest:oci.candidate.ociManifestDigest,
      baseImage:inputs.inputs.candidateBaseImage,
      inputDigest:inputs.inputsSha256,sourceCommit,runId:String(runId),
      scanSha256:sha(Buffer.from(scanText)),
      sbomSha256:sha(Buffer.from(sbomText)),
      counts,fixedHighCritical,unfixedHighCritical,
      sbomComponentCount:sbom.components.length,
      registryImageDigest:'NOT_CREATED',signature:'NOT_SIGNED',
      limitations:['scanner_db_snapshot_not_signed_by_this_workflow',
        'provenance_is_local_ci_metadata_not_signed_attestation',
        'effective_iam_not_verified','registry_digest_absent',
        'formal_operator_approval_absent']
    };
  }catch(error){
    // No exception values, data contents, filesystem paths or credentials in CI.
    const permitted=new Set(['invalid_audit_input','trivy_scan_missing',
      'sbom_missing','oci_not_verified','source_and_base_not_verified',
      'missing_ci_build_identity','malformed_scan_target',
      'malformed_vulnerability']);
    return {status:'BLOCKED_UNVERIFIED_SECURITY_EVIDENCE',
      reason:permitted.has(error?.message)?error.message:'invalid_json_or_unknown',
      releaseStatus:'NO_GO',canPublish:false,canDeploy:false};
  }
}
export function main(args=process.argv.slice(2),env=process.env){
  if(args.length!==4)throw Error('four_inputs_expected');
  const [scan,sbom,oci,inputs]=args.map(x=>fs.readFileSync(x,'utf8'));
  return review({scanText:scan,sbomText:sbom,ociText:oci,inputsText:inputs,
    sourceCommit:env.GITHUB_SHA,runId:env.GITHUB_RUN_ID});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const result=main();
    console.log(JSON.stringify(result,null,2));
    if(result.status.startsWith('BLOCKED'))process.exitCode=2;
  }catch{
    console.log(JSON.stringify({status:'BLOCKED_UNVERIFIED_SECURITY_EVIDENCE',releaseStatus:'NO_GO'}));
    process.exitCode=2;
  }
}
