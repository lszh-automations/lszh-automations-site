// Explicit local entry point. No listener, scheduler, deployment or production mode.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createInternalRecoveryLoader,createInternalAirtableReader,createInternalDriveReader,
 createInternalFirestoreReaders,createInternalGmailSender} from './internalRecoveryProviders.mjs';
import {createInternalRecoveryStore,sendInternalTestConfirmationOnce} from './internalReceiptMailRecovery.mjs';
import {authorizeDesktop,windowsVault,createTokenProvider,verifyAccount,SCOPES,LocalOAuthError} from './internalRecoveryOAuth.mjs';
const IDS=['recR70ZSPynGqA1LS','recktLXj5wUxLmHFQ'];
const fail=s=>{throw Error(s);};
export function createLocalRecovery({enabled=false,readRow,loadServices}={}){
 if(enabled!==true)fail('explicit_local_recovery_enable_required');
 if(typeof readRow!=='function'||typeof loadServices!=='function')fail('runtime_dependencies_required');
 return async recordId=>{
  if(!IDS.includes(recordId))fail('unapproved_internal_record');
  let servicesPromise;
  const services=()=>servicesPromise??=(async()=>loadServices())();
  const loadFresh=createInternalRecoveryLoader({recordId,readRow,
   readAcceptedOffer:async id=>(await services()).readAcceptedOffer(id),
   readReceiptPin:async id=>(await services()).readReceiptPin(id),
   readDocument:async id=>(await services()).readDocument(id)});
  // The services (including OAuth and SDK) are not touched on ALREADY_SENT.
  return sendInternalTestConfirmationOnce({loadFresh,store:{
   claim:async(...a)=>(await services()).store.claim(...a),
   markSent:async(...a)=>(await services()).store.markSent(...a),
   markAmbiguous:async(...a)=>(await services()).store.markAmbiguous(...a)},
   sendMail:async mail=>(await services()).sendMail(mail)});
 };
}
function cloud(args){
 const encodedArgs=Buffer.from(JSON.stringify(args)).toString('base64');
 const ps="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); "+
  "$env:PYTHONIOENCODING='utf-8'; $a=@(ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+encodedArgs+"')))); "+
  "& ($env:LOCALAPPDATA+'\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd') @a; if($LASTEXITCODE -ne 0){exit 1}";
 try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,windowsHide:true}).trim();}catch{fail('local_cloud_read_failed_no_secret_output');}
}
function assertLocal(){
 if(process.platform!=='win32'||process.env.FIRESTORE_EMULATOR_HOST||process.env.GOOGLE_APPLICATION_CREDENTIALS||process.env.K_SERVICE)
  fail('clean_local_windows_runtime_required');
 if(cloud(['config','get-value','account'])!=='lars@lszh-automations.ch'||
  cloud(['config','get-value','project'])!=='lszh-automations')fail('unexpected_account_or_project');
}
async function loadRuntimeServices({enableSend=false}={}){
 const c=windowsVault('load');
 if(c.account!=='lars@lszh-automations.ch'||c.project!=='lszh-automations'||
  !Array.isArray(c.scopes)||!SCOPES.every(s=>c.scopes.includes(s)))fail('unexpected_runtime_credential_identity');
 const getToken=createTokenProvider(c);
 await verifyAccount(await getToken());
 const require=createRequire(import.meta.url);
 const {Firestore}=require('@google-cloud/firestore');
 const {GoogleAuth,OAuth2Client}=require('google-auth-library');
 const authClient=new OAuth2Client(c.clientId,c.clientSecret);
 authClient.setCredentials({refresh_token:c.refreshToken});
 const db=new Firestore({projectId:'lszh-automations',databaseId:'lszh-offers-staging',preferRest:true,
  auth:new GoogleAuth({authClient})});
 const readers=createInternalFirestoreReaders(db,{enabled:true});
 return{...readers,db,getToken,
  readDocument:createInternalDriveReader({fetcher:fetch,getReadToken:getToken}),
  store:createInternalRecoveryStore(db,{enabled:true}),
  sendMail:createInternalGmailSender({enabled:enableSend,fetcher:fetch,getSendToken:getToken})};
}
async function checkProviders(){
 // Read-only path: neither a reservation nor a send method is called.
 const s=await loadRuntimeServices();
 try{
  const pins=[];
  for(const id of IDS){
   const p=await s.readReceiptPin(id);
   if(p.recordId!==id||p.testOnly!==true||p.readOnly!==true||!Number.isSafeInteger(p.size)||
    !/^[a-f0-9]{64}$/.test(p.sha256||'')||!/^[A-Za-z0-9_-]{20,100}$/.test(p.receiptId||'')||
    p.folderId!=='10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko')fail('runtime_receipt_pin_invalid');
   const response=await fetch('https://www.googleapis.com/drive/v3/files/'+p.receiptId+
    '?fields=id,mimeType,size,sha256Checksum,parents,contentRestrictions',{
     headers:{Authorization:'Bearer '+await s.getToken()},redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok)fail('runtime_drive_read_rejected');const d=await response.json();
   if(d.id!==p.receiptId||d.mimeType!=='application/pdf'||d.sha256Checksum!==p.sha256||Number(d.size)!==p.size||
    d.parents?.length!==1||d.parents[0]!==p.folderId||!d.contentRestrictions?.some(x=>x.readOnly===true))fail('runtime_receipt_changed');
   pins.push({recordId:id,verified:true});
  }
  return{result:'LOCAL_RUNTIME_READONLY_PASS',pins,firestoreWrites:0,pdfDownloads:0,mailSent:false};
 }finally{await s.db.terminate();}
}
async function main(args){
 if(!((args.length===2&&['--authorize','--run'].includes(args[0]))||(args.length===1&&args[0]==='--check')))
  fail('use_authorize_client_json_or_check_or_run_approved_record');
 if(args[0]==='--run'&&!IDS.includes(args[1]))fail('unapproved_internal_record');
 assertLocal();
 if(args[0]==='--authorize')return authorizeDesktop(args[1]);
 if(args[0]==='--check')return checkProviders();
 const accessToken=cloud(['secrets','versions','access','1','--secret=lszh-offer-cloud-e2e-airtable','--project=lszh-automations']);
 const readRow=createInternalAirtableReader({fetcher:fetch,accessToken});
 let services;
 try{
  const run=createLocalRecovery({enabled:true,readRow,loadServices:async()=>services??=await loadRuntimeServices({enableSend:true})});
  return await run(args[1]);
 }finally{if(services)await services.db.terminate();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main(process.argv.slice(2)).then(x=>{console.log(JSON.stringify(x,null,2));if(x.status==='STOP')process.exitCode=1;}).catch(e=>{
  const reason=e instanceof LocalOAuthError&&/^[a-z0-9_]{1,120}$/.test(e.message)?e.message:'local_runtime_failed_no_secret_output';
  console.error('STOP: '+reason);process.exitCode=1;
 });
}
