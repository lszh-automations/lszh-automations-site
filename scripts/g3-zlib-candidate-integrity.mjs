// Offline byte-integrity only, NOT Alpine publisher authentication or install.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const lockPath=path.join(root,'cloud-run/g3-review-staging/zlib-patch.candidate.json');
const constants={
  url:'https://dl-cdn.alpinelinux.org/alpine/v3.24/main/x86_64/zlib-1.3.2-r1.apk',
  package:'zlib',version:'1.3.2-r1',branch:'v3.24',arch:'x86_64'
};
const safe={releaseStatus:'NO_GO',canDeploy:false,canPublish:false,
  canModifyImage:false,publisherSignatureVerified:false};
const fail=(reason)=>({status:'BLOCKED_ZLIB_PACKAGE_CANDIDATE',reason,...safe});
const sha=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
export function check({lockRaw,bytes}={}){
  try{
    if(typeof lockRaw!=='string'||lockRaw.length>5000||
       !Buffer.isBuffer(bytes)||bytes.length<10000||bytes.length>200000)
      return fail('invalid_evidence');
    const lock=JSON.parse(lockRaw);
    if(lock.schemaVersion!==1||
       lock.kind!=='LSZH_G3_ALPINE_ZLIB_PATCH_CANDIDATE_V1'||
       lock.originUrl!==constants.url||lock.package!==constants.package||
       lock.version!==constants.version||lock.alpineBranch!==constants.branch||
       lock.architecture!==constants.arch||
       lock.publisherSignatureVerified!==false||lock.installedInImage!==false||
       lock.humanSecurityReview!=='PENDING'||lock.releaseStatus!=='NO_GO'||
       lock.canPublish!==false||lock.canDeploy!==false||
       !/^[a-f0-9]{64}$/.test(lock.sha256))
      return fail('lock_scope_or_status');
    const actualSha=sha(bytes);
    if(actualSha!==lock.sha256)return fail('package_sha256_mismatch');
    return {status:'CANDIDATE_BYTES_MATCH_NOT_PUBLISHER_VERIFIED',
      sha256:actualSha,byteCount:bytes.length,expectedUrl:lock.originUrl,
      ...safe};
  }catch{return fail('malformed_package_or_lock')}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let result;
  try{
    if(process.argv.length!==3)throw Error('single_candidate_file_required');
    result=check({lockRaw:fs.readFileSync(lockPath,'utf8'),
      bytes:fs.readFileSync(process.argv[2])});
  }catch{result=fail('read_failed')}
  console.log(JSON.stringify(result,null,2));
  if(result.status!=='CANDIDATE_BYTES_MATCH_NOT_PUBLISHER_VERIFIED')
    process.exitCode=2;
}
