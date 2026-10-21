// Deployment operator only: never polls CRM and never sends an offer or email.
import {readFileSync,writeFileSync} from 'node:fs';
import {windowsVault,createTokenProvider,verifyAccount} from '../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs';
import contract from '../cloud-run/crm-offer-links/dispatchContract.cjs';
import {LINK_SERVICE as L} from '../cloud-run/crm-offer-links/links.mjs';
const FILE=new URL('../.crm-cloud-state.json',import.meta.url),ROOT='projects/'+L.project+'/locations/europe-west6',URL_BASE='https://run.googleapis.com/v2/'+ROOT+'/services';
const mode=process.argv[2],revision=process.argv[3];let state={};try{state=JSON.parse(readFileSync(FILE,'utf8'));}catch{}
const save=()=>writeFileSync(FILE,JSON.stringify(state,null,2)+'\n'),fail=s=>{throw Error(s);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 if(process.platform!=='win32'||process.env.K_SERVICE||!['--prepare','--build','--deploy','--readback'].includes(mode))fail('deployment_operator_only');
 const token=createTokenProvider(windowsVault('load'));await verifyAccount(await token());
 const api=async(url,method='GET',body,pat)=>{const r=await fetch(url,{method,headers:{Authorization:'Bearer '+(pat||await token()),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)fail('provider_http_'+r.status);return r.json();};
 if(mode==='--prepare'){
  if(state.recordId||state.leadId)fail('existing_pilot_no_recreation');
  const secret=await api('https://secretmanager.googleapis.com/v1/projects/lszh-automations/secrets/lszh-offer-cloud-e2e-airtable/versions/1:access'),pat=Buffer.from(secret.payload.data,'base64').toString();
  const base='https://api.airtable.com/v0/appzJiskpAdaR1HEv/';
  const existing=await api(base+'tbljeIUoD7wwKuSmS?filterByFormula='+encodeURIComponent("{Offertennummer}='"+contract.PILOT.number+"'"),'GET',undefined,pat);if(existing.records?.length)fail('pilot_already_exists_no_recreation');
  const lead=await api(base+'tbldBCMm9NlSQqcq5','POST',{fields:{Name:'Lars Schulthess',Firma:contract.PILOT.company,'E-Mail':contract.PILOT.email,Strasse:'Rummelmatt 8',PLZ:'5610',Ort:'Wohlen AG',Land:'Schweiz',Status:'Verloren',Quelle:contract.PILOT.purpose,'Interne Notiz':contract.PILOT.purpose+' – interner Test; keine Kunden-/Auftragsanlage.'}},pat);state.leadId=lead.id;save();
  const fields={Offerte:'Interne Offerte – dauerhafter CRM-Versand',Offertennummer:contract.PILOT.number,Status:'Entwurf',Lead:[lead.id],Übernommen:true,Leistung:'Individuelle Leistung',Ausgangssituation:'Anfragen werden manuell erfasst und einzeln weitergeleitet.',Ziel:'Eine interne Anfrage ohne laufenden Betreiberrechner genau einmal weiterleiten.',Leistungsumfang:'Formularfelder festlegen, interne Weiterleitung und kontrollierten Funktionstest einrichten.','Nicht enthalten':'Drittanbietergebühren, Datenmigration und produktive Kundenfreischaltung.','Beteiligte Systeme':'Airtable, Make, Google Workspace','Einmalig CHF':120,'Monatlich CHF':0,Zahlungsmodell:'100% bei Auftrag','Zahlungsziel Tage':30,'Gültig bis':'2026-11-20','Projektbedingungen Version':'TEST_v1.0_RC1','AVV erforderlich':'Nein','Interne Notiz':contract.PILOT.purpose+' – NO_CONTRACT. Nur interne Adresse. Keine Rechnung oder Annahme.',Versandstatus:'Bereit zur manuellen Versandaktion'};
  const row=await api(base+'tbljeIUoD7wwKuSmS','POST',{fields},pat);state.recordId=row.id;save();console.log(JSON.stringify({result:'CLOUD_CRM_PILOT_PREPARED',recordId:row.id,leadId:lead.id,number:contract.PILOT.number,actionNotSet:true}));
 }
 if(mode==='--build'){
  if(!/^[a-f0-9]{40}$/.test(revision||''))fail('immutable_commit_required');
  const image='europe-west6-docker.pkg.dev/'+L.project+'/cloud-run-source-deploy/'+L.service+':'+revision;
  const op=await api('https://cloudbuild.googleapis.com/v1/'+ROOT+'/builds','POST',{source:{gitSource:{url:'https://github.com/lszh-automations/lszh-automations-site.git',revision}},steps:[{name:'gcr.io/cloud-builders/docker',args:['build','-f','cloud-run/Dockerfile.crm-offer-links','-t',image,'.']}],images:[image],timeout:'600s',options:{logging:'CLOUD_LOGGING_ONLY'}});
  state.buildId=op.metadata?.build?.id;state.revision=revision;save();if(!state.buildId)fail('build_reference_missing');console.log('BUILD_STARTED '+state.buildId);
  for(let i=0;i<180;i++){const b=await api('https://cloudbuild.googleapis.com/v1/'+ROOT+'/builds/'+state.buildId);if(b.status==='SUCCESS'){const digest=b.results?.images?.[0]?.digest;if(!/^sha256:[a-f0-9]{64}$/.test(digest||''))fail('image_digest_missing');state.imageDigest=image.split(':')[0]+'@'+digest;save();console.log('BUILD_SUCCESS '+state.buildId);break;}if(['FAILURE','TIMEOUT','CANCELLED','EXPIRED','INTERNAL_ERROR'].includes(b.status))fail('build_failed');if(i===179)fail('build_pending');await sleep(3000);}
 }
 if(mode==='--deploy'){
  if(!state.imageDigest?.includes('/'+L.service+'@sha256:')||state.revision!==revision||!/^rec[A-Za-z0-9]{14}$/.test(state.recordId||''))fail('pinned_build_and_pilot_required');
  const exists=await fetch(URL_BASE+'/'+L.service,{headers:{Authorization:'Bearer '+await token()}});if(exists.status!==404)fail('existing_service_requires_review');
  const env={GOOGLE_CLOUD_PROJECT:L.project,LSZH_CRM_LINKS_ENABLED:'true',LSZH_CRM_LINK_ORIGIN:L.origin,LSZH_CRM_PILOT_RECORD_ID:state.recordId};
  let op=await api(URL_BASE+'?serviceId='+L.service,'POST',{description:'Persistent internal CRM pilot links. Read-only snapshots; no contract acceptance, CRM writes or email.',labels:{'lszh-purpose':'crm-internal-links'},ingress:'INGRESS_TRAFFIC_ALL',invokerIamDisabled:true,template:{serviceAccount:L.identity,scaling:{minInstanceCount:0,maxInstanceCount:1},maxInstanceRequestConcurrency:20,timeout:'15s',containers:[{image:state.imageDigest,ports:[{containerPort:8080}],resources:{limits:{cpu:'1',memory:'256Mi'},cpuIdle:true},env:Object.entries(env).map(([name,value])=>({name,value}))}]}});
  for(let i=0;!op.done&&i<90;i++){await sleep(3000);op=await api('https://run.googleapis.com/v2/'+op.name);}if(!op.done||op.error||op.response?.uri!==L.origin)fail('deploy_unconfirmed');state.uri=op.response.uri;save();console.log(JSON.stringify({result:'PERSISTENT_INTERNAL_LINK_SERVICE_DEPLOYED',uri:state.uri,acceptanceEnabled:false,localOAuthInRuntime:false}));
 }
 if(mode==='--readback'){
  const s=await api(URL_BASE+'/'+L.service);if(s.uri!==L.origin||s.labels?.['lszh-purpose']!=='crm-internal-links'||s.template?.serviceAccount!==L.identity)fail('service_identity_changed');
  const page=await fetch(L.origin+'/offerte-annehmen/');const post=(path,body,origin=L.origin)=>fetch(L.origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(page.status!==200||(await post('/api/offer/preview',{code:'X'.repeat(43)})).status!==404||(await post('/api/offer/accept',{code:'X'.repeat(43)})).status!==503||(await post('/api/offer/preview',{code:'X'.repeat(43)},'https://evil.invalid')).status!==403)fail('public_guard_check_failed');
  console.log(JSON.stringify({result:'PERSISTENT_LINK_SERVICE_GUARDS_PASS',revision:s.latestReadyRevision,wrongCodeBlocked:true,acceptanceBlocked:true,crossOriginBlocked:true}));
 }
}catch(e){console.error('STOP: '+(/^[a-z0-9_]+$/.test(e.message)?e.message:'crm_cloud_operator_failed_no_secret_output'));process.exitCode=1;}
