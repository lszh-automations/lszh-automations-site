// Build and install the reviewed portal image with BOTH customer gates off.
// No customer records, IAM, secrets, invitations or mail are changed here.
import {readFileSync,writeFileSync} from 'node:fs';
import {windowsVault,createTokenProvider,verifyAccount} from '../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs';
import {CUSTOMER_RUNTIME as I} from '../cloud-run/offer-portal-production/productionConfig.mjs';
const ROOT='projects/'+I.projectId+'/locations/europe-west6',SERVICE_URL='https://run.googleapis.com/v2/'+ROOT+'/services/'+I.service,FILE=new URL('../.customer-dispatch-portal-state.json',import.meta.url);
let state={};try{state=JSON.parse(readFileSync(FILE,'utf8'));}catch{}
const save=()=>writeFileSync(FILE,JSON.stringify(state,null,2)+'\n'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),fail=s=>{throw Error(s);};
try{
 const mode=process.argv[2],revision=process.argv[3];if(process.platform!=='win32'||process.env.K_SERVICE||!['--build','--deploy-disabled','--readback'].includes(mode))fail('disabled_operator_required');
 const token=createTokenProvider(windowsVault('load'));await verifyAccount(await token());
 const api=async(url,method='GET',body)=>{const r=await fetch(url,{method,headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail('provider_http_'+r.status);return r.json();};
 if(mode==='--build'){
  if(!/^[a-f0-9]{40}$/.test(revision||''))fail('immutable_commit_required');const image='europe-west6-docker.pkg.dev/'+I.projectId+'/cloud-run-source-deploy/'+I.service+':customer-dispatch-'+revision;
  const op=await api('https://cloudbuild.googleapis.com/v1/'+ROOT+'/builds','POST',{source:{gitSource:{url:'https://github.com/lszh-automations/lszh-automations-site.git',revision}},steps:[{name:'gcr.io/cloud-builders/docker',args:['build','-f','cloud-run/Dockerfile.offer-portal-production','-t',image,'.']}],images:[image],timeout:'600s',options:{logging:'CLOUD_LOGGING_ONLY'}});state={revision,buildId:op.metadata?.build?.id};save();if(!state.buildId)fail('build_reference_missing');console.log('BUILD_STARTED '+state.buildId);
  for(let n=0;n<180;n++){const b=await api('https://cloudbuild.googleapis.com/v1/'+ROOT+'/builds/'+state.buildId);if(b.status==='SUCCESS'){const digest=b.results?.images?.[0]?.digest;if(!/^sha256:[a-f0-9]{64}$/.test(digest||''))fail('digest_missing');state.imageDigest=image.split(':')[0]+'@'+digest;save();console.log('BUILD_SUCCESS '+state.buildId);break;}if(['FAILURE','TIMEOUT','CANCELLED','EXPIRED','INTERNAL_ERROR'].includes(b.status))fail('build_failed');if(n===179)fail('build_pending');await sleep(3000);}
 }
 if(mode==='--deploy-disabled'){
  if(state.revision!==revision||!state.imageDigest?.includes('/'+I.service+'@sha256:'))fail('pinned_build_required');const s=await api(SERVICE_URL),container=s.template?.containers?.[0],env=container?.env||[],value=k=>env.find(e=>e.name===k)?.value;
  if(s.name!==ROOT+'/services/'+I.service||s.template.serviceAccount!==I.serviceEmail||s.template.containers.length!==1||value('LSZH_PORTAL_PRODUCTION_ENABLED')!=='false'||value('LSZH_PORTAL_PREVIEW_ENABLED')==='true')fail('existing_disabled_service_required');
  state.previousRevision=s.latestReadyRevision;state.previousTraffic=s.traffic;state.previousImage=container.image;save();
  const next=structuredClone(container);next.image=state.imageDigest;next.env=env.filter(e=>!['LSZH_PORTAL_PRODUCTION_ENABLED','LSZH_PORTAL_PREVIEW_ENABLED'].includes(e.name));next.env.push({name:'LSZH_PORTAL_PRODUCTION_ENABLED',value:'false'},{name:'LSZH_PORTAL_PREVIEW_ENABLED',value:'false'});
  let op=await api(SERVICE_URL+'?updateMask=template.containers','PATCH',{name:s.name,etag:s.etag,template:{containers:[next]}});
  for(let n=0;!op.done&&n<100;n++){await sleep(3000);op=await api('https://run.googleapis.com/v2/'+op.name);}if(!op.done||op.error)fail('disabled_deploy_unconfirmed');state.readyRevision=op.response?.latestReadyRevision;save();console.log(JSON.stringify({result:'CUSTOMER_PORTAL_IMAGE_INSTALLED_DISABLED',revision:state.readyRevision,previewEnabled:false,acceptanceEnabled:false}));
 }
 if(mode==='--readback'){
  const s=await api(SERVICE_URL),env=s.template?.containers?.[0]?.env||[],flag=k=>env.find(e=>e.name===k)?.value;
  if(s.template?.serviceAccount!==I.serviceEmail||flag('LSZH_PORTAL_PRODUCTION_ENABLED')!=='false'||flag('LSZH_PORTAL_PREVIEW_ENABLED')!=='false'||s.template.containers[0].image!==state.imageDigest)fail('disabled_readback_failed');
  const r=await fetch(I.origin+'/offerte-annehmen/',{redirect:'error',signal:AbortSignal.timeout(30000)});if(r.status!==503)fail('public_customer_gate_changed');
  const evidence={result:'CUSTOMER_PORTAL_DISABLED_IMAGE_VERIFIED',sourceRevision:state.revision,imageDigest:state.imageDigest,buildId:state.buildId,readyRevision:s.latestReadyRevision,previousRevision:state.previousRevision,traffic:s.traffic,previewEnabled:false,acceptanceEnabled:false,publicStatus:r.status,serviceIdentityUnchanged:true};writeFileSync(new URL('../docs/evidence/customer-dispatch-portal-disabled-20261021.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
 }
}catch(e){console.error('STOP: '+(/^[a-z0-9_]+$/.test(e.message)?e.message:'disabled_portal_operator_failed_no_secret_output'));process.exitCode=1;}

