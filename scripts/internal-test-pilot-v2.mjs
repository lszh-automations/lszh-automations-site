// Explicit local TEST_ONLY browser pilot. No deployment, scheduler or email sender.
import {createServer} from 'node:http';
import {createHmac,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {INTERNAL_TEST_PILOT_V2 as P} from '../cloud-run/offer-portal-staging/internalTestPilot.mjs';
import {createOfferPortal} from '../cloud-run/offer-portal-staging/portalCore.mjs';
import {createFirestoreOfferStore} from '../cloud-run/offer-portal-staging/firestoreOfferStore.mjs';
import {windowsVault,createTokenProvider,verifyAccount,SCOPES} from '../cloud-run/offer-portal-staging/internalRecoveryOAuth.mjs';
export const V2=Object.freeze({project:'lszh-automations',database:'lszh-offers-staging',
  base:'appzJiskpAdaR1HEv',table:'tbljeIUoD7wwKuSmS',folder:'10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko',
  quote:Object.freeze({id:'1wv1KNPopuFlfztNTxm8i_dl7h7lmDDPR',sha256:'318d8dda86272ef95528ac29db2a151c4cd4d7b0eeda18cbb4c7b345930d4c07'}),
  terms:Object.freeze({id:'1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO',sha256:'baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279'})});
const sha=x=>createHash('sha256').update(x).digest('hex');
class PilotError extends Error {}
const fail=s=>{throw new PilotError(s);};
const plain=v=>v&&typeof v==='object'?v.name:v;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export function assertRow(row){
 const f=row?.fields;
 if(row?.id!==P.recordId||!f||f.Offertennummer!==P.number||
  !['Entwurf','Angenommen'].includes(plain(f.Status))||plain(f['AVV erforderlich'])!=='Nein'||
  f['Projektbedingungen Version']!=='TEST_v1.0_RC1'||f['Einmalig CHF']!==1500||f['Monatlich CHF']!==99||
  f['Zahlungsziel Tage']!==30||f['Gültig bis']!=='2026-11-20'||
  !String(f['Interne Notiz']||'').includes(P.purpose)||f.Übernommen!==true||
  ['Lead','Kunde','Auftrag'].some(k=>f[k]?.length)||
  ['Echtbetrieb – kein Test','Online-Annahme rechtlich freigegeben','Versand freigegeben','Vertragsunterlagen versendet','Online-Annahme Bestätigung in Bearbeitung'].some(k=>f[k]===true)||
  ['Online-Annahme Bestätigung gesendet am','Online-Annahme Beleg Drive ID'].some(k=>f[k])||
  [['Online-Annahme Offerten Drive ID',V2.quote.id],['Online-Annahme Bedingungen Drive ID',V2.terms.id],
   ['Online-Annahme Offerten-SHA256',V2.quote.sha256],['Online-Annahme Bedingungen-SHA256',V2.terms.sha256]]
    .some(([k,v])=>f[k]&&f[k]!==v))
  fail('pilot_v2_source_changed');
 return f;
}
export function makeOffer(tokenHash){
 return {tokenHash,status:'sent',approved:true,revision:1,termsVersion:'TEST_v1.0_RC1',
  expiresAt:'2026-11-20T23:00:00.000Z',recipientEmail:P.email,offerNumber:P.number,
  details:{company:P.company,service:'Automatisierte Offertenannahme mit PDF-Ablage und Bestätigungsmail',
   onceCHF:1500,monthlyCHF:99,paymentModel:'Erfundene Testwerte, exkl. MWST; 30 Tage; Betreuung monatlich kündbar'},
  bundle:{avv_required:'Nein',quote:V2.quote,terms:V2.terms},
  source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:V2.base,tableId:V2.table,recordId:P.recordId,internalPilot:P.purpose},
  downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}};
}
export function acceptanceFields(s){
 const e=s?.evidence;
 if(s?.status!=='accepted'||s.source?.recordId!==P.recordId||s.offerNumber!==P.number||s.recipientEmail!==P.email||
  e?.name!=='Lars Schulthess'||e.email!==P.email||e.accepted_at_utc!==s.acceptedAt||
  e.method!=='lszh_b2b_staging_v1'||e.offer_number!==P.number||!Number.isFinite(Date.parse(s.acceptedAt))||
  e.authorized_confirmed!==true||e.quote_confirmed!==true||e.terms_confirmed!==true||
  e.avv_required!==false||e.avv_confirmed!==false||e.avv_version!==null||e.avv_pdf_sha256!==null||s.bundle?.avv_required!=='Nein'||
  e.quote_pdf_sha256!==V2.quote.sha256||e.terms_pdf_sha256!==V2.terms.sha256)
  fail('pilot_v2_evidence_changed');
 return {'Status':'Angenommen','Vertragsunterlagen akzeptiert':true,
  'Online-Annahme Zeitstempel':s.acceptedAt,'Online-Annahme Person':e.name,'Online-Annahme E-Mail':e.email,
  'Online-Annahme Vertragsversion':'TEST_v1.0_RC1','Online-Annahme Offerten Drive ID':V2.quote.id,
  'Online-Annahme Bedingungen Drive ID':V2.terms.id,'Online-Annahme Offerten-SHA256':V2.quote.sha256,
  'Online-Annahme Bedingungen-SHA256':V2.terms.sha256,
  'Online-Annahme Nachweis':JSON.stringify(canonical({purpose:P.purpose,test_only:true,no_contract:true,evidence:e}))};
}
export function assertOffer(s,tokenHash){
 const expected=makeOffer(tokenHash);
 if(!s||!['sent','accepted'].includes(s.status)||s.revision!==(s.status==='sent'?1:2)||s.tokenHash!==tokenHash||s.approved!==true||
  s.termsVersion!==expected.termsVersion||s.expiresAt!==expected.expiresAt||s.offerNumber!==P.number||s.recipientEmail!==P.email||
  ['details','bundle','source','downstream'].some(k=>JSON.stringify(canonical(s[k]))!==JSON.stringify(canonical(expected[k]))))
  fail('pilot_v2_offer_changed');
 if(s.status==='accepted')acceptanceFields(s);
 return s;
}
export async function previewPayload(portal,code){
 return {ok:true,offer:await portal.preview(code)};
}
async function main(){
 if(process.argv.slice(2).join(' ')!=='--start'||process.platform!=='win32'||process.env.K_SERVICE||
  process.env.FIRESTORE_EMULATOR_HOST||process.env.GOOGLE_APPLICATION_CREDENTIALS)fail('explicit_clean_local_windows_start_required');
 const c=windowsVault('load');
 if(c.account!==P.email||c.project!==V2.project||!SCOPES.every(s=>c.scopes?.includes(s)))fail('runtime_identity_mismatch');
 const getToken=createTokenProvider(c);await verifyAccount(await getToken());
 console.log('AUTH: Gespeicherte lokale Geschäftsanmeldung bestätigt.');
 async function request(url,method='GET',body,token){
  const r=await fetch(url,{method,headers:{Authorization:'Bearer '+(token||await getToken()),'Content-Type':'application/json'},
   ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!r.ok)fail('pilot_v2_provider_http_'+r.status);return r;
 }
 const secret=await(await request('https://secretmanager.googleapis.com/v1/projects/'+V2.project+'/secrets/lszh-offer-cloud-e2e-airtable/versions/1:access')).json();
 const pat=Buffer.from(secret.payload?.data||'','base64').toString('utf8');
 if(pat.length<20)fail('pilot_v2_secret_unavailable');
 const rowUrl=`https://api.airtable.com/v0/${V2.base}/${V2.table}/${P.recordId}`;
 const readRow=async()=>{const r=await(await request(rowUrl,'GET',undefined,pat)).json();assertRow(r);return r;};
 const patch=async fields=>(await request(rowUrl,'PATCH',{fields},pat)).json();
 const initial=await readRow();
 const require=createRequire(new URL('../cloud-run/offer-portal-staging/package.json',import.meta.url));
 const {Firestore}=require('@google-cloud/firestore');
 const {GoogleAuth,OAuth2Client}=require('google-auth-library');
 const authClient=new OAuth2Client(c.clientId,c.clientSecret);authClient.setCredentials({refresh_token:c.refreshToken});
 const db=new Firestore({projectId:V2.project,databaseId:V2.database,preferRest:true,auth:new GoogleAuth({authClient})});
 let handedToServer=false;
 try {
 const code=createHmac('sha256',c.refreshToken).update(P.purpose+'\0'+P.recordId).digest('base64url');
 const tokenHash=sha(code),store=createFirestoreOfferStore(db),ref=db.collection('lszh_staging_offers_v1').doc(tokenHash);
 const binding=db.collection('lszh_internal_pilot_v2_bindings').doc(P.recordId);
 async function pdf(which){
  const part=V2[which];if(!part)fail('pilot_v2_document_unavailable');
  const url='https://www.googleapis.com/drive/v3/files/'+part.id;
  const m=await(await request(url+'?fields=id,mimeType,size,sha256Checksum,parents,contentRestrictions')).json();
  if(m.id!==part.id||m.mimeType!=='application/pdf'||m.sha256Checksum!==part.sha256||
   m.parents?.length!==1||m.parents[0]!==V2.folder||!m.contentRestrictions?.some(x=>x.readOnly===true)||
   Number(m.size)<8||Number(m.size)>10*1024*1024)fail('pilot_v2_archive_changed');
  const r=await request(url+'?alt=media');
  const parts=[];let size=0;
  for await(const chunk of r.body){size+=chunk.length;if(size>10*1024*1024)fail('pilot_v2_pdf_too_large');parts.push(chunk);}
  const bytes=Buffer.concat(parts);if(sha(bytes)!==part.sha256||size!==Number(m.size))fail('pilot_v2_pdf_changed');
  return bytes;
 }
 await pdf('quote');await pdf('terms');
 console.log('ARCHIVE: Beide Test-PDFs, Hashes und Schreibschutz bestätigt.');
 if(initial.fields['Online-Annahme Token-Hash']&&initial.fields['Online-Annahme Token-Hash']!==tokenHash)fail('pilot_v2_invitation_mismatch');
 // Fixed record binding prevents a new credential/token creating a second invitation.
 await db.runTransaction(async tx=>{
  const [b,s]=await Promise.all([tx.get(binding),tx.get(ref)]);
  if(b.exists){const previous=b.data();if(previous.tokenHash!==tokenHash||previous.recordId!==P.recordId||previous.purpose!==P.purpose||previous.testOnly!==true||!s.exists)fail('pilot_v2_binding_changed');return;}
  if(s.exists||plain(initial.fields.Status)!=='Entwurf'||initial.fields['Online-Annahme Token-Hash'])fail('pilot_v2_seed_conflict');
  tx.create(ref,makeOffer(tokenHash));tx.create(binding,{purpose:P.purpose,recordId:P.recordId,tokenHash,testOnly:true});
 });
 const fresh=await readRow();
 if(fresh.fields['Online-Annahme Token-Hash']&&fresh.fields['Online-Annahme Token-Hash']!==tokenHash)fail('pilot_v2_invitation_mismatch');
 if(!fresh.fields['Online-Annahme Token-Hash']){
  if(plain(fresh.fields.Status)!=='Entwurf')fail('pilot_v2_seed_conflict');
  await patch({'Online-Annahme Token-Hash':tokenHash,'Online-Annahme Offerten Drive ID':V2.quote.id,
   'Online-Annahme Bedingungen Drive ID':V2.terms.id,'Online-Annahme Offerten-SHA256':V2.quote.sha256,
   'Online-Annahme Bedingungen-SHA256':V2.terms.sha256});
 }
 async function writeback(s){
  const fields=acceptanceFields(s),row=await readRow();
  if(row.fields['Online-Annahme Token-Hash']!==tokenHash)fail('pilot_v2_invitation_mismatch');
  if(plain(row.fields.Status)==='Angenommen'){
   if(!Object.entries(fields).every(([k,v])=>row.fields[k]===v))fail('pilot_v2_writeback_conflict');
   return {result:'already_identical'};
  }
  await patch(fields);
  const checked=await readRow();if(!Object.entries(fields).every(([k,v])=>checked.fields[k]===v))fail('pilot_v2_writeback_readback_failed');
  return {result:'synthetic_fields_patched'};
 }
 const accepted=assertOffer(await store.get(tokenHash),tokenHash);
 if(accepted?.status==='accepted'){
  await writeback(accepted);await db.terminate();
  console.log(JSON.stringify({result:'PILOT_V2_ALREADY_ACCEPTED_VERIFIED',recordId:P.recordId,acceptedAt:accepted.acceptedAt,mailSent:false}));return;
 }
 const portal=createOfferPortal({store,verifyBundle:async()=>{assertOffer(await store.get(tokenHash),tokenHash);await readRow();await pdf('quote');await pdf('terms');return true;},
  readPdf:async(_,which)=>pdf(which),approvedVersion:'TEST_v1.0_RC1',proofSalt:createHmac('sha256',c.refreshToken).update(P.purpose+'proof').digest('hex'),
  syntheticOnly:true,syntheticAcceptRecordId:P.recordId,internalPilotRecordId:P.recordId,onAccepted:writeback});
 const origin='http://127.0.0.1:8082';let active=false;
 const html=readFileSync(new URL('../offerte-annehmen/index.html',import.meta.url),'utf8')
  .replace("const code=params.get('code')||'';","const code='"+'I'.repeat(48)+"';");
 const server=createServer(async(req,res)=>{
  const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   if(req.headers.host!=='127.0.0.1:8082')return json(403,{error:'unavailable'});
   if(req.method==='GET'&&req.url==='/offerte-annehmen/'){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});res.end(html);return;
   }
   if(req.method!=='POST'||req.headers.origin!==origin||!['/api/offer/preview','/api/offer/document','/api/offer/accept'].includes(req.url))return json(403,{error:'unavailable'});
   let input='';for await(const chunk of req){input+=chunk.toString('utf8');if(Buffer.byteLength(input)>12288)throw Error('invalid_request');}
   const b=JSON.parse(input);
   if(req.url==='/api/offer/preview')return json(200,await previewPayload(portal,code));
   if(req.url==='/api/offer/document'){
    const d=await portal.document(code,b.which);res.writeHead(200,{'Content-Type':'application/pdf','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(d.bytes);return;
   }
   if(active)return json(409,{error:'already_processing'});
   if(b.name?.trim()!=='Lars Schulthess'||b.email?.trim().toLowerCase()!==P.email)return json(400,{error:'invalid_identity'});
   active=true;
   try{
    const result=await portal.accept(code,b);
    if(result.airtable_sync_status!=='synced'){
     console.log('STOP: pilot_v2_acceptance_committed_writeback_needs_review');return json(503,{error:'temporarily_unavailable'});
    }
    const s=await store.get(tokenHash);await writeback(s);
    console.log(JSON.stringify({result:'PILOT_V2_ACCEPTANCE_VERIFIED',recordId:P.recordId,acceptedAt:s.acceptedAt,quoteHash:V2.quote.sha256,termsHash:V2.terms.sha256,mailSent:false}));
    json(200,result);
   }finally{active=false;}
  }catch(e){const safe=['unavailable','already_accepted','invalid_identity','consent_required','document_changed','archive_changed'].includes(e.code)?e.code:'temporarily_unavailable';json(400,{error:safe});}
 });
 const timer=setTimeout(()=>server.close(),15*60*1000);timer.unref();
 server.on('close',()=>{clearTimeout(timer);db.terminate().catch(()=>{});});
 server.on('error',()=>{clearTimeout(timer);db.terminate().catch(()=>{});console.error('STOP: pilot_v2_loopback_listener_unavailable');process.exitCode=1;});
 server.listen(8082,'127.0.0.1',()=>console.log('READY: '+origin+'/offerte-annehmen/\nTEST_ONLY: kein Vertrag, keine Rechnung. Dokumente zuerst prüfen. Ctrl+C beendet den lokalen Pilot.'));
 handedToServer=true;
 } finally {if(!handedToServer)await db.terminate();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('STOP: '+(e instanceof PilotError?e.message:'pilot_v2_runtime_failed_no_secret_output'));process.exitCode=1;});
