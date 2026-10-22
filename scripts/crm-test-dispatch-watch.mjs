// Temporary fixed-record pilot bridge; never a general customer worker.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,createHmac} from 'node:crypto';
import {windowsVault,createTokenProvider,verifyAccount} from '../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs';
import {CRM_TEST as P,assertCrmTestOffer,crmSourceFingerprint,makeCrmPreviewSnapshot} from '../cloud-run/offer-portal-production/crmDispatchTestCore.mjs';
import {PREVIEW} from '../cloud-run/public-test-preview/preview.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex'),sleep=ms=>new Promise(r=>setTimeout(r,ms)),fail=s=>{throw Error(s);};
let patch;
try{
 if(process.argv.slice(2).join(' ')!=='--watch'||process.platform!=='win32'||process.env.K_SERVICE)fail('explicit_windows_watch_required');
 const c=windowsVault('load'),getToken=createTokenProvider(c);await verifyAccount(await getToken());
 const api=async(url,method='GET',body,token)=>{const r=await fetch(url,{method,headers:{Authorization:'Bearer '+(token||await getToken()),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail('provider_http_'+r.status);return r.json();};
 const secret=await api('https://secretmanager.googleapis.com/v1/projects/lszh-automations/secrets/lszh-offer-cloud-e2e-airtable/versions/1:access');
 const pat=Buffer.from(secret.payload.data,'base64').toString('utf8');
 const rowUrl='https://api.airtable.com/v0/appzJiskpAdaR1HEv/tbljeIUoD7wwKuSmS/'+P.recordId;
 const read=()=>api(rowUrl,'GET',undefined,pat);patch=fields=>api(rowUrl,'PATCH',{fields},pat);
 console.log('CRM_WATCH_READY: Nur feste Testofferte; bitte Schnellaktion Für Versand freigeben wählen.');
 let initial;
 for(let i=0;i<90;i++){
  const row=await read(),f=row.fields;
  if(f.Schnellaktion==='Für Versand freigeben'){
   if(f.Versandprüfung!=='BEREIT'){await patch({Versandstatus:'Blockiert',Versandfehler:f.Versandprüfung||'Pflichtfelder fehlen','Versand freigegeben':false,Schnellaktion:null});console.log('CRM_ACTION_BLOCKED_MISSING_FIELDS');}
   else{assertCrmTestOffer(row);initial=f;break;}
  }await sleep(10000);
 }
 if(!initial)fail('watch_window_expired');const fingerprint=crmSourceFingerprint(initial);
 await patch({'Versand freigegeben':true,Versandstatus:'PDF angefordert',Versandfehler:''});console.log('CRM_ACTION_ACCEPTED_PDF_REQUESTED');
 let archived;
 for(let i=0;i<90;i++){const row=await read();assertCrmTestOffer(row);if(crmSourceFingerprint(row.fields)!==fingerprint)fail('crm_source_changed_during_processing');if(row.fields['Online-Annahme Offerten-Archivstatus']==='VERIFIZIERT'&&row.fields['Online-Annahme Offerten Drive ID']){archived=row.fields;break;}await sleep(5000);}
 if(!archived)fail('pdf_archive_timeout');
 async function pdf(id,expected,folder){const u='https://www.googleapis.com/drive/v3/files/'+id;const m=await api(u+'?fields=id,mimeType,size,sha256Checksum,parents,contentRestrictions');if(m.mimeType!=='application/pdf'||m.sha256Checksum!==expected||m.parents?.length!==1||m.parents[0]!==folder||!m.contentRestrictions?.some(x=>x.readOnly===true)||Number(m.size)>250000)fail('archive_metadata_mismatch');const r=await fetch(u+'?alt=media',{headers:{Authorization:'Bearer '+await getToken()},signal:AbortSignal.timeout(30000)});const bytes=Buffer.from(await r.arrayBuffer());if(!r.ok||sha(bytes)!==expected||bytes.length!==Number(m.size))fail('archive_bytes_mismatch');return{id,sha256:expected,bytes};}
 const quote=await pdf(archived['Online-Annahme Offerten Drive ID'],archived['Online-Annahme Offerten-SHA256'],'1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in');
 const terms=await pdf('1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO','baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279','10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko');
 const code=createHmac('sha256',c.refreshToken).update(P.purpose+'\0'+P.recordId).digest('base64url'),tokenHash=sha(code),expiresAt=new Date(Date.now()+30*60000).toISOString();
 const db='https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging/documents';
 await api(db+'/lszh_crm_dispatch_attempts?documentId='+P.recordId,'POST',{fields:{purpose:{stringValue:P.purpose},sourceFingerprint:{stringValue:fingerprint},status:{stringValue:'PREVIEW_PREPARING'},tokenHash:{stringValue:tokenHash}}});
 const snapshot=makeCrmPreviewSnapshot(initial,{tokenHash,expiresAt,quote,terms});
 await api(db+'/lszh_crm_dispatch_previews?documentId='+tokenHash,'POST',{fields:{snapshotJSON:{stringValue:JSON.stringify(snapshot)}}});
 const state=JSON.parse(readFileSync(new URL('../.public-preview-state.json',import.meta.url),'utf8'));
 if(!state.imageDigest?.includes('lszh-offer-link-preview@sha256:'))fail('preview_image_missing');
 const serviceUrl='https://run.googleapis.com/v2/projects/lszh-automations/locations/europe-west6/services/lszh-offer-link-preview';
 const exists=await fetch(serviceUrl,{headers:{Authorization:'Bearer '+await getToken()}});if(exists.status!==404)fail('preview_service_exists');
 const env={LSZH_PUBLIC_TEST_PREVIEW_ENABLED:'true',GOOGLE_CLOUD_PROJECT:'lszh-automations',LSZH_PUBLIC_TEST_ORIGIN:PREVIEW.origin,LSZH_PUBLIC_TEST_TOKEN_HASH:tokenHash,LSZH_PUBLIC_TEST_EXPIRES_AT:expiresAt,LSZH_PUBLIC_TEST_SOURCE:'CRM_FIRESTORE',LSZH_PUBLIC_TEST_RECORD_ID:P.recordId};
 let op=await api(serviceUrl.replace('/lszh-offer-link-preview','')+'?serviceId=lszh-offer-link-preview','POST',{labels:{'lszh-purpose':'public-test-preview','lszh-temporary':'true'},ingress:'INGRESS_TRAFFIC_ALL',invokerIamDisabled:true,template:{serviceAccount:'lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com',scaling:{minInstanceCount:0,maxInstanceCount:1},maxInstanceRequestConcurrency:20,timeout:'15s',containers:[{image:state.imageDigest,ports:[{containerPort:8080}],resources:{limits:{cpu:'1',memory:'256Mi'},cpuIdle:true},env:Object.entries(env).map(([name,value])=>({name,value}))}]}});
 for(let i=0;!op.done&&i<60;i++){await sleep(3000);op=await api('https://run.googleapis.com/v2/'+op.name);}if(!op.done||op.error||op.response?.uri!==PREVIEW.origin)fail('preview_deploy_unconfirmed');
 const previewPost=body=>fetch(PREVIEW.origin+'/api/offer/preview',{method:'POST',headers:{Origin:PREVIEW.origin,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const pr=await previewPost({code});if(pr.status!==200)fail('public_crm_preview_failed');const data=await pr.json();if(data.offer?.number!==P.number||data.offer.quote_sha256!==quote.sha256||data.offer.terms_sha256!==terms.sha256||data.offer.test_accept_enabled!==false)fail('public_crm_preview_mismatch');
 const fresh=await read();assertCrmTestOffer(fresh);if(crmSourceFingerprint(fresh.fields)!==fingerprint)fail('crm_source_changed_before_send');
 await patch({'Online-Annahme Token-Hash':tokenHash,'Online-Annahme Bedingungen Drive ID':terms.id,'Online-Annahme Bedingungen-SHA256':terms.sha256,Versandstatus:'Mail reserviert'});
 await api(db+'/lszh_crm_dispatch_attempts/'+P.recordId+'?updateMask.fieldPaths=status','PATCH',{fields:{status:{stringValue:'MAIL_ATTEMPT_RESERVED'}}});
 const link=PREVIEW.origin+'/offerte-annehmen/#'+new URLSearchParams({code}),boundary='lszh_'+P.recordId,b64=b=>Buffer.from(b).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 const lines=['From: LSZH Automations <'+P.email+'>','To: '+P.email,'Subject: =?UTF-8?B?'+Buffer.from('TEST_ONLY – CRM Offerte '+P.number).toString('base64')+'?=','Message-ID: <CRM_DISPATCH_'+P.recordId+'@lszh-automations.ch>','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','','--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',b64('<h2>TEST_ONLY – aus der CRM-Versandaktion</h2><p>Kein Vertrag, keine Rechnung. CHF 120 einmalig, CHF 0 monatlich.</p><p><a href="'+link+'">Genau diese Offerte und TEST-Bedingungen prüfen</a></p><p>Annahme deaktiviert; Link kurzzeitig gültig.</p>')];
 for(const [kind,d]of [['Offerte',quote],['Bedingungen',terms]])lines.push('--'+boundary,'Content-Type: application/pdf','Content-Disposition: attachment; filename="TEST_ONLY_'+kind+'.pdf"','Content-Transfer-Encoding: base64','',b64(d.bytes));lines.push('--'+boundary+'--','');
 const sent=await api('https://gmail.googleapis.com/gmail/v1/users/me/messages/send','POST',{raw:Buffer.from(lines.join('\r\n')).toString('base64url')});if(!/^[a-f0-9]+$/.test(sent.id||''))fail('gmail_receipt_missing_no_retry');
 const sentAt=new Date().toISOString();await api(db+'/lszh_crm_dispatch_attempts/'+P.recordId+'?updateMask.fieldPaths=status&updateMask.fieldPaths=gmailId&updateMask.fieldPaths=sentAt','PATCH',{fields:{status:{stringValue:'PROVIDER_CONFIRMED'},gmailId:{stringValue:sent.id},sentAt:{timestampValue:sentAt}}});
 await patch({Status:'Versendet','Versendet am':sentAt.slice(0,10),'Vertragsunterlagen versendet':true,'Online-Annahme Link gesendet am':sentAt,'Versand freigegeben':false,Schnellaktion:null,Versandstatus:'Versandt',Versandfehler:'','Nächster Schritt':'TEST_ONLY CRM-Versand bestätigt; keine Annahme oder Auftragsanlage.'});
 const final=await read();if(final.fields.Status!=='Versendet'||final.fields.Versandstatus!=='Versandt'||final.fields['Online-Annahme Link gesendet am']!==sentAt)fail('crm_final_readback_failed');
 const evidence={result:'CRM_ACTION_TO_ARCHIVE_PREVIEW_MAIL_PASS',recordId:P.recordId,sourceFingerprint:fingerprint,gmailId:sent.id,sentAt,expiresAt,quoteId:quote.id,quoteHash:quote.sha256,termsId:terms.id,termsHash:terms.sha256,acceptanceEnabled:false};writeFileSync(new URL('../docs/evidence/crm-dispatch-live-20261021.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}catch(e){const reason=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'crm_dispatch_failed_no_secret_output';if(patch)await patch({Versandstatus:'Manuelle Prüfung',Versandfehler:reason,'Versand freigegeben':false}).catch(()=>{});console.error('STOP: '+reason);process.exitCode=1;}
