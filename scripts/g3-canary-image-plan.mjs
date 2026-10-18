// G3 review canary image source/build-input audit. NO GCP or Docker calls.
// A candidate base digest is NOT approval for deployment or publication.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const location=path.join(root,'cloud-run/g3-review-staging');
const expected=[
  'ARG BASE_IMAGE',
  'FROM ${BASE_IMAGE}',
  'WORKDIR /srv',
  // This single network-free remove-only command is the ONLY permitted RUN.
  'RUN test -d /usr/local/lib/node_modules/npm && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack',
  'COPY --chown=node:node index.mjs /srv/index.mjs',
  'ENV NODE_ENV=production',
  'USER node',
  'EXPOSE 8080',
  'CMD ["node","/srv/index.mjs"]'
];
const BASE=/^docker\.io\/library\/node:22-alpine@sha256:[a-f0-9]{64}$/;
const sha256=x=>crypto.createHash('sha256').update(x).digest('hex');

export function auditDockerfile(source) {
  if(typeof source!=='string')return false;
  const instructions=source.split(/\r?\n/)
    .map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
  return JSON.stringify(instructions)===JSON.stringify(expected);
}
export function auditBaseImage(ref) {
  return typeof ref==='string'&&BASE.test(ref);
}
export function auditSource({dockerfile,receiver,baseImage}={}){
  if(!auditDockerfile(dockerfile))return {status:'BLOCKED_DOCKERFILE_POLICY',releaseStatus:'NO_GO'};
  if(typeof receiver!=='string'||!receiver.includes("LSZH_G3_CANARY_NO_CONTRACT_20261018")||
     !receiver.includes("syntheticOnly:true")&& !receiver.includes("parsed.syntheticOnly===true")||
     !receiver.includes("res.writeHead(503")||
     /(?:^|\n)\s*import\s+.*?from\s+['"](?!node:)/m.test(receiver)||
     /\b(?:fetch|child_process|execSync|eval)\s*\(/.test(receiver))
    return {status:'BLOCKED_RECEIVER_POLICY',releaseStatus:'NO_GO'};
  if(baseImage!==undefined&&!auditBaseImage(baseImage))
    return {status:'BLOCKED_BASE_IMAGE',releaseStatus:'NO_GO'};
  const inputs={
    dockerfileSha256:sha256(Buffer.from(dockerfile)),
    receiverSha256:sha256(Buffer.from(receiver)),
    candidateBaseImage:baseImage||'NOT_SELECTED',
    platform:'linux/amd64'
  };
  return {status:baseImage?'CANDIDATE_INPUTS_VALID':'SOURCE_ONLY_VALID',
    releaseStatus:'NO_GO',canPublish:false,canDeploy:false,
    requiresIndependentBaseReview:true,requiresRegistryDigestVerification:true,
    inputs,inputsSha256:sha256(Buffer.from(JSON.stringify(inputs)))};
}
export function main(argv=process.argv.slice(2)){
  const args=argv.filter(x=>x.startsWith('--base-image='));
  if(argv.some(x=>!x.startsWith('--base-image='))||args.length>1){
    return {status:'BLOCKED_CLI',releaseStatus:'NO_GO'};
  }
  const dockerfile=fs.readFileSync(path.join(location,'Dockerfile'),'utf8');
  const receiver=fs.readFileSync(path.join(location,'index.mjs'),'utf8');
  return auditSource({dockerfile,receiver,baseImage:args[0]?.slice('--base-image='.length)});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const report=main();
    console.log(JSON.stringify(report,null,2));
    if(report.status.startsWith('BLOCKED'))process.exitCode=2;
  }catch{
    console.log(JSON.stringify({status:'BLOCKED_SOURCE_READ',releaseStatus:'NO_GO'}));
    process.exitCode=2;
  }
}
