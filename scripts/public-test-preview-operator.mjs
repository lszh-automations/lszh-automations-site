// Explicit fixed-target operator for the isolated public TEST_ONLY preview.
// Never prints a bearer, raw provider error or complete service environment.
import {createHmac,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {windowsVault,createTokenProvider,verifyAccount} from '../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs';
import {PREVIEW} from '../cloud-run/public-test-preview/preview.mjs';
const PROJECT=PREVIEW.project,REGION='europe-west6',SERVICE=PREVIEW.service;
const ROOT=`projects/${PROJECT}/locations/${REGION}`,SERVICE_URL=`https://run.googleapis.com/v2/${ROOT}/services/${SERVICE}`;
const STATE=new URL('../.public-preview-state.json',import.meta.url);
const mode=process.argv[2],revision=process.argv[3];
const allowed=['--build','--deploy','--check','--open','--cleanup'];
const fail=s=>{throw Error(s);};
if(!allowed.includes(mode)||process.platform!=='win32'||process.env.K_SERVICE)fail('operator_mode_required');
let state;
try{state=JSON.parse(readFileSync(STATE,'utf8'));}catch{state={};}
const save=()=>writeFileSync(STATE,JSON.stringify(state,null,2)+'\n');
const c=windowsVault('load'),getToken=createTokenProvider(c);await verifyAccount(await getToken());
const code=createHmac('sha256',c.refreshToken).update('LSZH_PUBLIC_PREVIEW_20261021_NO_ACCEPTANCE').digest('base64url');
const tokenHash=createHash('sha256').update(code).digest('hex');
async function api(url,method='GET',body){
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+await getToken(),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
 if(!r.ok)fail('provider_http_'+r.status);return r.json();
}
async function waitOperation(op){for(let i=0;i<120;i++){
 if(op.done){if(op.error)fail('cloud_operation_failed_'+(op.error.code||'unknown'));return op.response;}
 await new Promise(r=>setTimeout(r,3000));op=await api('https://run.googleapis.com/v2/'+op.name);
}fail('operation_pending_no_retry');}
async function optionalService(){const r=await fetch(SERVICE_URL,{headers:{Authorization:'Bearer '+await getToken()},signal:AbortSignal.timeout(30000)});if(r.status===404)return null;if(!r.ok)fail('service_read_failed');return r.json();}
try{
 if(mode==='--build'){
  if(!/^[a-f0-9]{40}$/.test(revision||''))fail('immutable_commit_required');
  const image=`europe-west6-docker.pkg.dev/${PROJECT}/cloud-run-source-deploy/${SERVICE}:${revision}`;
  const op=await api(`https://cloudbuild.googleapis.com/v1/${ROOT}/builds`,'POST',{
   source:{gitSource:{url:'https://github.com/lszh-automations/lszh-automations-site.git',revision}},
   steps:[{name:'gcr.io/cloud-builders/docker',args:['build','-f','cloud-run/Dockerfile.public-test-preview','-t',image,'.']}],images:[image],timeout:'600s',options:{logging:'CLOUD_LOGGING_ONLY'}});
  const b=op.metadata?.build;if(!b?.id)fail('build_reference_missing');state={revision,image,buildId:b.id};save();console.log('BUILD_STARTED '+b.id);
  for(let i=0;i<160;i++){
   const b=await api(`https://cloudbuild.googleapis.com/v1/${ROOT}/builds/${state.buildId}`);
   if(b.status==='SUCCESS'){const digest=b.results?.images?.[0]?.digest;if(!/^sha256:[a-f0-9]{64}$/.test(digest||''))fail('image_digest_missing');state.imageDigest=image.split(':')[0]+'@'+digest;save();console.log('BUILD_SUCCESS '+b.id);break;}
   if(['FAILURE','TIMEOUT','CANCELLED','EXPIRED','INTERNAL_ERROR'].includes(b.status))fail('build_'+b.status.toLowerCase());
   if(i===159)fail('build_pending_no_retry');await new Promise(r=>setTimeout(r,3000));
  }
 }
 if(mode==='--deploy'){
  if(!state.imageDigest||state.revision!==revision)fail('successful_pinned_build_required');
  if(await optionalService())fail('existing_preview_requires_review');
  state.expiresAt=new Date(Date.now()+30*60*1000).toISOString();save();
  const env={LSZH_PUBLIC_TEST_PREVIEW_ENABLED:'true',GOOGLE_CLOUD_PROJECT:PROJECT,LSZH_PUBLIC_TEST_ORIGIN:PREVIEW.origin,LSZH_PUBLIC_TEST_TOKEN_HASH:tokenHash,LSZH_PUBLIC_TEST_EXPIRES_AT:state.expiresAt};
  const op=await api(`https://run.googleapis.com/v2/${ROOT}/services?serviceId=${SERVICE}`,'POST',{
   labels:{'lszh-purpose':'public-test-preview','lszh-temporary':'true'},description:'Temporary TEST_ONLY immutable PDF preview; no acceptance or provider clients.',
   ingress:'INGRESS_TRAFFIC_ALL',invokerIamDisabled:true,
   template:{serviceAccount:`lszh-offer-browser-tmp@${PROJECT}.iam.gserviceaccount.com`,scaling:{minInstanceCount:0,maxInstanceCount:1},maxInstanceRequestConcurrency:20,timeout:'15s',
    containers:[{image:state.imageDigest,ports:[{containerPort:8080}],resources:{limits:{cpu:'1',memory:'256Mi'},cpuIdle:true},env:Object.entries(env).map(([name,value])=>({name,value}))}]}});
  const s=await waitOperation(op);state.uri=s.uri;state.serviceCreated=true;save();if(s.uri!==PREVIEW.origin)fail('unexpected_origin_cleanup_required');
  console.log(JSON.stringify({result:'PUBLIC_TEST_PREVIEW_DEPLOYED',service:SERVICE,uri:s.uri,expiresAt:state.expiresAt,acceptanceEnabled:false}));
 }
 if(mode==='--check'){
  const s=await optionalService();if(!s||s.labels?.['lszh-purpose']!=='public-test-preview'||s.uri!==PREVIEW.origin)fail('preview_identity_changed');
  const post=async(path,body,origin=PREVIEW.origin)=>fetch(s.uri+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  const page=await fetch(s.uri+'/offerte-annehmen/',{redirect:'error'});if(page.status!==200||!page.headers.get('cache-control')?.includes('no-store'))fail('public_page_failed');
  const r=await post('/api/offer/preview',{code});if(r.status!==200)fail('preview_failed');const p=await r.json();if(p.offer?.number!==PREVIEW.number||p.offer.test_only!==true||p.offer.test_accept_enabled!==false)fail('preview_mismatch');
  for(const which of ['quote','terms']){const r=await post('/api/offer/document',{code,which});const bytes=Buffer.from(await r.arrayBuffer());if(r.status!==200||createHash('sha256').update(bytes).digest('hex')!==p.offer[which+'_sha256'])fail('pdf_mismatch');}
  if((await post('/api/offer/preview',{code:'X'.repeat(48)})).status!==404||(await post('/api/offer/preview',{code},'https://evil.invalid')).status!==403||(await post('/api/offer/accept',{code})).status!==503||(await post('/api/offer/document',{code,which:'avv'})).status!==404)fail('negative_check_failed');
  state.liveCheck='PASS';save();console.log(JSON.stringify({result:'PUBLIC_PREVIEW_LIVE_PASS',service:SERVICE,verifiedPdfs:2,wrongTokenBlocked:true,crossOriginBlocked:true,acceptanceBlocked:true,noAvv:true,expiresAt:state.expiresAt}));
 }
 if(mode==='--open'){
  if(state.liveCheck!=='PASS'||Date.parse(state.expiresAt)<=Date.now())fail('live_check_and_valid_window_required');
  const s=await optionalService();if(s?.uri!==PREVIEW.origin)fail('origin_changed');
  const url=s.uri+'/offerte-annehmen/#code='+code;
  const ps="Start-Process -WindowStyle Hidden ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(url).toString('base64')+"')))";
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{stdio:'ignore',windowsHide:true});console.log('PUBLIC_TEST_PREVIEW_OPENED_NO_TOKEN_OUTPUT');
 }
 if(mode==='--cleanup'){
  const s=await optionalService();if(!s){console.log('PREVIEW_ALREADY_REMOVED');}else{
   if(s.labels?.['lszh-purpose']!=='public-test-preview'||s.labels?.['lszh-temporary']!=='true'||s.name!==`${ROOT}/services/${SERVICE}`)fail('cleanup_target_changed');
   await waitOperation(await api(SERVICE_URL+'?etag='+encodeURIComponent(s.etag),'DELETE'));state.removed=true;save();console.log('PUBLIC_TEST_PREVIEW_REMOVED');
  }
 }
}catch(e){console.error('STOP: '+(/^[a-z0-9_]+$/.test(e.message)?e.message:'public_preview_operator_failed_no_secret_output'));process.exitCode=1;}
