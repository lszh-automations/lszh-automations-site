// Offline interpretation of a READ-ONLY official Docker Hub base-image scan.
// Scouting does not update a lock, approve an image, or create registry objects.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REF=/^docker\.io\/library\/node:22-alpine@sha256:[a-f0-9]{64}$/;
const status={releaseStatus:'NO_GO',canPublish:false,canDeploy:false,
  canChangeBaseLock:false,canGrantIam:false,canSign:false};
export function evaluate({locked,upstream,rawScan}={}){
  if(typeof locked!=='string'||!REF.test(locked)||
     typeof upstream!=='string'||!REF.test(upstream))
    return {status:'BLOCKED_INVALID_BASE_REFERENCE',...status};
  if(upstream===locked)
    return {status:'NO_NEW_UPSTREAM_DIGEST',currentBase:locked,...status};
  try {
    if(typeof rawScan!=='string'||rawScan.length<2||rawScan.length>15*1024*1024)
      throw Error('scan_missing');
    const report=JSON.parse(rawScan);
    if(report.ArtifactType!=='container_image'||report.SchemaVersion!==2||
       !Array.isArray(report.Results)||report.Results.length===0)
      throw Error('incomplete_scan');
    const severity=Object.fromEntries(['UNKNOWN','LOW','MEDIUM','HIGH','CRITICAL'].map(x=>[x,0]));
    const zlib=[];
    for(const r of report.Results){
      if(!Array.isArray(r.Vulnerabilities)&&r.Vulnerabilities!==undefined)
        throw Error('bad_vulnerability_list');
      for(const v of r.Vulnerabilities||[]){
        if(!(v.Severity in severity)||typeof v.VulnerabilityID!=='string'||typeof v.PkgName!=='string')
          throw Error('invalid_finding');
        severity[v.Severity]++;
        if(v.PkgName==='zlib'&&v.VulnerabilityID==='CVE-2026-85091'){
          zlib.push({severity:v.Severity,
            installedVersion:typeof v.InstalledVersion==='string'?v.InstalledVersion:'',
            fixedVersion:typeof v.FixedVersion==='string'?v.FixedVersion:''});
        }
      }
    }
    const hasZlibIssue=zlib.length>0;
    return {status:hasZlibIssue?'UPSTREAM_STILL_REPORTS_ZLIB_CVE':'UPSTREAM_CVE_NOT_REPORTED_REQUIRES_PACKAGE_VERSION_CHECK',
      currentBase:locked,candidateBase:upstream,
      scanCounts:severity,zlibFindings:zlib,
      scanVerdict:'ADVISORY_NOT_PACKAGE_PROOF',
      needsPlatformPackageInventory:true,
      ...status};
  }catch{
    return {status:'BLOCKED_UNVERIFIED_UPSTREAM_SCAN',currentBase:locked,
      candidateBase:upstream,...status};
  }
}
export function main(args=process.argv.slice(2)){
  if(args.length!==3)throw Error('usage: current upstream scan-file');
  const rawScan=fs.existsSync(args[2])?fs.readFileSync(args[2],'utf8'):'';
  return evaluate({locked:args[0],upstream:args[1],rawScan});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const result=main();
    console.log(JSON.stringify(result,null,2));
    if(result.status.startsWith('BLOCKED'))process.exitCode=2;
  }catch{
    console.log(JSON.stringify({status:'BLOCKED_UPSTREAM_PROBE_INPUT',...status}));
    process.exitCode=2;
  }
}
