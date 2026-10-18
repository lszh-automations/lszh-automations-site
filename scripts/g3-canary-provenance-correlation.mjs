// G3 canary source-to-image correlation; local proof check, NEVER a signed attestation.
// No external network, Cloud IAM, registry, Make, mail, or user data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hash=/^[a-f0-9]{64}$/;
const digest=/^sha256:[a-f0-9]{64}$/;
const ref=/^docker\.io\/library\/node:22-alpine@sha256:[a-f0-9]{64}$/;
const status={releaseStatus:'NO_GO',canPublish:false,canDeploy:false,
  signedProvenance:false,artifactRegistryDigest:'NOT_CREATED'};
const blocked=reason=>({status:'BLOCKED_EVIDENCE_CORRELATION',reason,...status});
const get=(raw)=>JSON.parse(raw);

export function correlate({inputRaw,ociRaw,securityRaw,scanRaw,sbomRaw,
  dockerfileRaw,receiverRaw,lockRaw,identity}={}){
  try {
    const i=get(inputRaw),o=get(ociRaw),s=get(securityRaw),lock=get(lockRaw);
    if(i.status!=='CANDIDATE_INPUTS_VALID'||i.releaseStatus!=='NO_GO'||
      o.status!=='CANDIDATE_OCI_DOUBLE_BUILD_VERIFIED'||o.releaseStatus!=='NO_GO'||
      s.status!=='SCAN_AND_SBOM_RECORDED_NO_HIGH_CRITICAL'||
      s.releaseStatus!=='NO_GO'||s.canDeploy!==false||s.canPublish!==false||
      s.signature!=='NOT_SIGNED'||s.registryImageDigest!=='NOT_CREATED')
      return blocked('unsafe_evidence_status');
    if(!ref.test(lock.image)||lock.releaseStatus!=='NO_GO'||
      lock.reviewStatus!=='UNREVIEWED'||lock.canDeploy!==false||lock.canPublish!==false||
      lock.platform!=='linux/amd64')
      return blocked('base_lock_mismatch');
    const inputs=i.inputs;
    if(!inputs||inputs.candidateBaseImage!==lock.image||
      inputs.platform!=='linux/amd64'||!hash.test(i.inputsSha256)||
      sha(Buffer.from(JSON.stringify(inputs)))!==i.inputsSha256||
      sha(Buffer.from(dockerfileRaw))!==inputs.dockerfileSha256||
      sha(Buffer.from(receiverRaw))!==inputs.receiverSha256)
      return blocked('source_inputs_mismatch');
    if(!digest.test(o.candidate?.ociManifestDigest)||
      !digest.test(o.candidate?.ociConfigDigest)||
      !Number.isInteger(o.candidate?.verifiedBlobs)||o.candidate.verifiedBlobs<1||
      s.candidateManifestDigest!==o.candidate.ociManifestDigest||
      s.baseImage!==lock.image||s.inputDigest!==i.inputsSha256||
      s.scanSha256!==sha(Buffer.from(scanRaw))||
      s.sbomSha256!==sha(Buffer.from(sbomRaw)))
      return blocked('oci_or_scan_binding_mismatch');
    const counts=s.counts;
    if(!counts||counts.CRITICAL!==0||counts.HIGH!==0||
      counts.UNKNOWN!==0||counts.LOW!==0||
      !Number.isInteger(counts.MEDIUM)||counts.MEDIUM<0||counts.MEDIUM>1||
      !Array.isArray(s.mediumFindings)||
      s.mediumFindings.length!==counts.MEDIUM)
      return blocked('unexpected_scan_risk');
    if(counts.MEDIUM===1){
      const v=s.mediumFindings[0];
      if(v.id!=='CVE-2026-85091'||v.package!=='zlib'||
        v.installedVersion!=='1.3.2-r0'||v.fixedVersion!=='1.3.2-r1')
        return blocked('unreviewed_medium_risk');
    }
    const id=identity||{};
    if(id.repository!=='lszh-automations/lszh-automations-site'||
      id.workflow!=='G3 canary candidate image (build-only, NO deployment)'||
      id.eventName!=='pull_request'||id.ref!=='refs/pull/5/merge'||
      id.headRef!=='feature/optional-avv-acceptance-staging-20261014'||
      id.baseRef!=='feature/secure-offer-acceptance-20261013'||
      !/^[a-f0-9]{40}$/.test(id.githubSha||'')||
      id.checkedOutSha!==id.githubSha||
      !/^\d{6,20}$/.test(id.runId||'')||
      s.sourceCommit!==id.githubSha||s.runId!==id.runId)
      return blocked('ci_source_identity_mismatch');
    return {status:'UNSIGNED_CI_CORRELATION_VERIFIED',...status,
      sourceCommitType:'GITHUB_PR_MERGE_COMMIT_NOT_BRANCH_HEAD',
      sourceCommit:id.githubSha,runId:id.runId,
      candidateOCIManifestDigest:o.candidate.ociManifestDigest,
      candidateOCIConfigDigest:o.candidate.ociConfigDigest,
      sourceInputSha256:i.inputsSha256,baseImage:lock.image,
      securityReportSha256:sha(Buffer.from(securityRaw)),
      scannerReportSha256:s.scanSha256,sbomSha256:s.sbomSha256,
      evidenceClaimSha256:sha(Buffer.from(JSON.stringify({
        sourceCommit:id.githubSha,runId:id.runId,manifest:o.candidate.ociManifestDigest,
        config:o.candidate.ociConfigDigest,inputs:i.inputsSha256,
        scan:s.scanSha256,sbom:s.sbomSha256}))),
      limits:['UNSIGNED_CI_SELF_REPORTED','NOT_AN_INDEPENDENT_SIGNATURE',
        'NO_VERIFIED_ARTIFACT_REGISTRY_REFERENCE','NOT_A_RELEASE_APPROVAL']};
  } catch {
    return blocked('invalid_or_missing_evidence');
  }
}
export function main(args=process.argv.slice(2),env=process.env){
  if(args.length!==5)return blocked('expected_five_report_paths');
  const [inputRaw,ociRaw,securityRaw,scanRaw,sbomRaw]=
    args.map(a=>fs.readFileSync(a,'utf8'));
  const checkedOutSha=execFileSync('git',['rev-parse','HEAD'],{
    cwd:root,encoding:'utf8',timeout:10000,stdio:['ignore','pipe','ignore']}).trim();
  return correlate({inputRaw,ociRaw,securityRaw,scanRaw,sbomRaw,
    dockerfileRaw:fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/Dockerfile'),'utf8'),
    receiverRaw:fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/index.mjs'),'utf8'),
    lockRaw:fs.readFileSync(path.join(root,'cloud-run/g3-review-staging/base-image.candidate.json'),'utf8'),
    identity:{repository:env.GITHUB_REPOSITORY,workflow:env.GITHUB_WORKFLOW,
      eventName:env.GITHUB_EVENT_NAME,ref:env.GITHUB_REF,
      headRef:env.GITHUB_HEAD_REF,baseRef:env.GITHUB_BASE_REF,
      githubSha:env.GITHUB_SHA,checkedOutSha,runId:env.GITHUB_RUN_ID}});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let report;
  try{report=main();}
  catch{report=blocked('read_failure');}
  console.log(JSON.stringify(report,null,2));
  if(report.status!=='UNSIGNED_CI_CORRELATION_VERIFIED')process.exitCode=2;
}
