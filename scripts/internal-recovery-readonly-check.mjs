// Real-data negative check only. No PDF access, state write, Make call or mail.
import {execFileSync} from 'node:child_process';
import {createInternalAirtableReader,createInternalRecoveryLoader} from '../cloud-run/offer-portal-staging/internalRecoveryProviders.mjs';
import {inspectInternalMailRecovery} from '../cloud-run/offer-portal-staging/internalReceiptMailRecovery.mjs';
function cloud(args){
 const encodedArgs=Buffer.from(JSON.stringify(args)).toString('base64');
 const ps="$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); "+
 "$env:PYTHONIOENCODING='utf-8'; $a=@(ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+encodedArgs+"')))); "+
 "& ($env:LOCALAPPDATA+'\\Google\\Cloud SDK\\google-cloud-sdk\\bin\\gcloud.cmd') @a; if($LASTEXITCODE -ne 0){exit 1}";
 try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],
 {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000}).trim();}catch{throw Error('local_cloud_read_failed_no_secret_output');}
}
try{
 if(process.argv.length!==2)throw Error('no_arguments_or_send_mode_supported');
 if(cloud(['config','get-value','account'])!=='lars@lszh-automations.ch'||
 cloud(['config','get-value','project'])!=='lszh-automations')throw Error('unexpected_account_or_project');
 const token=cloud(['secrets','versions','access','1','--secret=lszh-offer-cloud-e2e-airtable','--project=lszh-automations']);
 const readRow=createInternalAirtableReader({fetcher:fetch,accessToken:token});
 const forbidden=async()=>{throw Error('completed_record_must_not_access_other_providers');};
 const records=[];
 for(const recordId of ['recR70ZSPynGqA1LS','recktLXj5wUxLmHFQ']){
  const load=createInternalRecoveryLoader({recordId,readRow,readAcceptedOffer:forbidden,readReceiptPin:forbidden,readDocument:forbidden});
  const input=await load(),result=inspectInternalMailRecovery(input);
  if(result.status!=='ALREADY_SENT')throw Error('expected_completed_record_not_confirmed');
  records.push({recordId,status:result.status,sentAt:input.sentAt});
 }
 console.log(JSON.stringify({result:'LIVE_READONLY_NO_RESEND_PASS',records,changesMade:false,
  firestoreWrites:0,pdfReads:0,mailProviderCalls:0},null,2));
}catch(e){console.error('STOP: '+(/^[a-z0-9_]+$/.test(e.message)?e.message:'readonly_check_failed_no_secret_output'));process.exitCode=1;}
