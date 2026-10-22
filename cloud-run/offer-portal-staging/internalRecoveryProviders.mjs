// Business-provider adapters for the existing internal TEST_ONLY recovery route.
// No credentials, scheduler, auto-start, document generation or production route.
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const BASE='appzJiskpAdaR1HEv',TABLE='tbljeIUoD7wwKuSmS';
const EMAIL='lars.schulthess@outlook.com',BUSINESS='lars@lszh-automations.ch';
const FOLDER='10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko';
const RULES={recR70ZSPynGqA1LS:{number:'TEST_INTERNAL_LARS_20261019_NO_CONTRACT',avv:false,person:'Lars Schulthess',email:EMAIL},
 recktLXj5wUxLmHFQ:{number:'TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT',avv:true,person:'Synthetischer Cloud-Testkunde',email:'fake-lszh-e2e@example.invalid'}};
const SHA=/^[a-f0-9]{64}$/;
const FILE=/^[A-Za-z0-9_-]{20,100}$/;
const fail=reason=>{throw Error(reason);};
async function request(fetcher,url,token,options={}){
 if(typeof token!=='string'||token.length<12||/[\r\n]/.test(token))fail('provider_credential_unavailable');
 let response;
 try{response=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000),
  headers:{Authorization:'Bearer '+token,...options.headers}});}catch{fail('provider_request_unavailable');}
 if(!response?.ok)fail('provider_request_rejected');
 return response;
}
export function createInternalAirtableReader({fetcher,accessToken}){
 if(typeof fetcher!=='function')fail('airtable_fetcher_required');
 return async recordId=>{
  if(!RULES[recordId])fail('unapproved_internal_record');
  const response=await request(fetcher,`https://api.airtable.com/v0/${BASE}/${TABLE}/${recordId}`,accessToken);
  const row=await response.json();
  if(row?.id!==recordId||!row.fields||Array.isArray(row.fields))fail('airtable_identity_invalid');
  return row;
 };
}
export function createInternalDriveReader({fetcher,getReadToken}){
 if(typeof fetcher!=='function'||typeof getReadToken!=='function')fail('drive_reader_dependencies_required');
 return async(id)=>{
  if(!FILE.test(id||''))fail('invalid_existing_pdf_id');
  const token=await getReadToken();
  const url='https://www.googleapis.com/drive/v3/files/'+id;
  const r=await request(fetcher,url+'?fields=id,mimeType,size,sha256Checksum,parents,contentRestrictions',token);
  const meta=await r.json();
  if(meta.id!==id||meta.mimeType!=='application/pdf'||!SHA.test(meta.sha256Checksum||'')||
   !Array.isArray(meta.parents)||meta.parents.length!==1||meta.parents[0]!==FOLDER||
   !meta.contentRestrictions?.some(x=>x.readOnly===true)||
   !Number.isSafeInteger(Number(meta.size))||Number(meta.size)<12||Number(meta.size)>10*1024*1024)
   fail('existing_pdf_metadata_invalid');
  const media=await request(fetcher,url+'?alt=media',token);
  const chunks=[];let size=0;
  if(!media.body||typeof media.body[Symbol.asyncIterator]!=='function')fail('pdf_stream_unavailable');
  for await(const chunk of media.body){
   const data=Buffer.from(chunk);size+=data.length;
   if(size>10*1024*1024){try{await media.body.cancel?.();}catch{}fail('pdf_stream_too_large');}
   chunks.push(data);
  }
  const bytes=Buffer.concat(chunks);
  if(size!==Number(meta.size)||hash(bytes)!==meta.sha256Checksum)fail('pdf_content_hash_changed');
  return{id,bytes,sha256:meta.sha256Checksum,mimeType:meta.mimeType,parents:meta.parents,readOnly:true};
 };
}
export function createInternalFirestoreReaders(db,{enabled=false}={}){
 if(enabled!==true||db?.projectId!=='lszh-automations'||db?.databaseId!=='lszh-offers-staging'||
  typeof db.doc!=='function')fail('internal_firestore_reader_disabled');
 const approved=recordId=>{if(!RULES[recordId])fail('unapproved_internal_record');};
 return{
  async readAcceptedOffer(recordId){
   approved(recordId);
   const indexId=hash(['LSZH_SYNTHETIC_LOCAL_SOURCE_INDEX_V1',BASE,TABLE,recordId].join('\0'));
   const snapshot=await db.doc('lszh_staging_source_index_v1/'+indexId).get();
   const index=snapshot.exists?snapshot.data():null;
   if(index?.sourceRecordId!==recordId||index.sourceBaseId!==BASE||index.sourceTableId!==TABLE||
    !SHA.test(index.tokenHash||''))fail('source_index_identity_invalid');
   const offer=await db.doc('lszh_staging_offers_v1/'+index.tokenHash).get();
   if(!offer.exists)fail('accepted_offer_missing');return offer.data();
  },
  async readReceiptPin(recordId){
   approved(recordId);
   const pin=await db.doc('lszh_internal_receipt_pins_v1/'+recordId).get();
   if(!pin.exists)fail('independent_receipt_pin_missing');return pin.data();
  }
 };
}
export function createInternalRecoveryLoader({recordId,readRow,readAcceptedOffer,readReceiptPin,readDocument}){
 const rule=RULES[recordId];
 if(!rule||[readRow,readAcceptedOffer,readReceiptPin,readDocument].some(f=>typeof f!=='function'))
  fail('internal_loader_dependencies_invalid');
 return async()=>{
  const row=await readRow(recordId),f=row.fields;
  if(row.id!==recordId||f.Offertennummer!==rule.number||f.Status!=='Angenommen'||
   f['Vertragsunterlagen akzeptiert']!==true||f['AVV erforderlich']!==(rule.avv?'Ja':'Nein')||
   f['Online-Annahme Person']!==rule.person||f['Online-Annahme E-Mail']!==rule.email||
   ['Online-Annahme rechtlich freigegeben','Echtbetrieb – kein Test','Versand freigegeben'].some(k=>f[k]===true)||
   !Number.isFinite(Date.parse(f['Online-Annahme Zeitstempel'])))fail('internal_source_identity_or_release_changed');
  const input={recordId,offerNumber:rule.number,baseId:BASE,tableId:TABLE,testOnly:true,status:'accepted',
   acceptedAt:f['Online-Annahme Zeitstempel'],productionApproved:false,legalApproved:false,dispatchApproved:false,
   inProgress:f['Online-Annahme Bestätigung in Bearbeitung']===true,
   sentAt:f['Online-Annahme Bestätigung gesendet am']||null};
  // Completed source records require no PDF, credential or Firestore access.
  if(input.sentAt||input.inProgress)return input;
  const s=await readAcceptedOffer(recordId),e=s?.evidence;
  if(s?.source?.recordId!==recordId||s.source.baseId!==BASE||s.source.tableId!==TABLE||
   s.source.kind!=='LSZH_SYNTHETIC_ONLY'||s.status!=='accepted'||s.offerNumber!==rule.number||
   s.recipientEmail!==rule.email||s.acceptedAt!==input.acceptedAt||e?.name!==rule.person||
   e?.email!==rule.email||e?.accepted_at_utc!==input.acceptedAt||e?.offer_number!==rule.number||
   e?.authorized_confirmed!==true||e?.quote_confirmed!==true||e?.terms_confirmed!==true||
   e?.avv_required!==rule.avv||e?.avv_confirmed!==rule.avv||s.bundle?.avv_required!==(rule.avv?'Ja':'Nein')||
   s.termsVersion!=='TEST_v1.0_RC1'||f['Online-Annahme Vertragsversion']!==s.termsVersion)
   fail('fresh_firestore_airtable_acceptance_mismatch');
  const pin=await readReceiptPin(recordId);
  if(pin?.recordId!==recordId||pin.receiptId!==f['Online-Annahme Beleg Drive ID']||
   !FILE.test(pin.receiptId||'')||!SHA.test(pin.sha256||''))fail('independent_receipt_pin_missing_or_changed');
  const acceptedHashes={};const documents=[];
  for(const [kind,label]of [['quote','Offerten'],['terms','Bedingungen'],...(rule.avv?[['avv','AVV']]:[])]){
   const expected=s.bundle[kind],eh=e[kind+'_pdf_sha256'];
   if(!expected||!FILE.test(expected.id||'')||!SHA.test(expected.sha256||'')||expected.sha256!==eh||
    f['Online-Annahme '+label+' Drive ID']!==expected.id||f['Online-Annahme '+label+'-SHA256']!==eh)
    fail('accepted_document_reference_changed');
   acceptedHashes[kind]=eh;documents.push({kind,...await readDocument(expected.id)});
  }
  if(rule.avv&&(f['Online-Annahme AVV ausdrücklich akzeptiert']!==true||
   f['Online-Annahme AVV-Version']!==e.avv_version||s.details?.avvVersion!==e.avv_version))
   fail('explicit_avv_evidence_changed');
  documents.push({kind:'receipt',...await readDocument(pin.receiptId)});
  return{...input,documents,acceptedHashes,expectedReceiptSha256:pin.sha256,avvRequired:rule.avv,
   avvConfirmed:rule.avv,quoteConfirmed:true,termsConfirmed:true,authorizedConfirmed:true};
 };
}
export function createInternalGmailSender({enabled=false,fetcher,getSendToken}={}){
 if(enabled!==true)return undefined;
 if(typeof fetcher!=='function'||typeof getSendToken!=='function')fail('gmail_dependencies_required');
 return async mail=>{
  if(JSON.stringify(mail.to)!==JSON.stringify([EMAIL])||mail.cc?.length||mail.bcc?.length||
   mail.subject!=='TEST_ONLY – vorhandener Annahmebeleg – kein Vertrag'||!SHA.test(mail.correlationKey||'')||
   !Array.isArray(mail.attachments)||![3,4].includes(mail.attachments.length))fail('gmail_test_envelope_invalid');
  let total=0;const names=new Set();
  for(const a of mail.attachments){
   if(!/^TEST_ONLY_(quote|terms|avv|receipt)\.pdf$/.test(a.filename||'')||names.has(a.filename)||
    !Buffer.isBuffer(a.data)||!a.data.subarray(0,5).equals(Buffer.from('%PDF-')))fail('gmail_test_attachment_invalid');
   names.add(a.filename);total+=a.data.length;
  }
  if(!['quote','terms','receipt'].every(k=>names.has('TEST_ONLY_'+k+'.pdf'))||total>20*1024*1024)
   fail('gmail_attachment_set_or_size_invalid');
  const token=await getSendToken();
  const profile=await(await request(fetcher,'https://gmail.googleapis.com/gmail/v1/users/me/profile',token)).json();
  if(profile.emailAddress!==BUSINESS)fail('wrong_business_gmail_account');
  const boundary='lszh_internal_'+mail.correlationKey;
  const b64=data=>Buffer.from(data).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
  const lines=['From: LSZH Automations <'+BUSINESS+'>','To: '+EMAIL,
   'Subject: =?UTF-8?B?'+Buffer.from(mail.subject).toString('base64')+'?=',
   'Message-ID: <'+mail.correlationKey+'@lszh-automations.ch>',
   'X-LSZH-Recovery-Key: '+mail.correlationKey,'MIME-Version: 1.0',
   'Content-Type: multipart/mixed; boundary="'+boundary+'"','',
   '--'+boundary,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
   b64('Autorisierter interner Funktionstest. Kein Vertrag, keine Zahlungspflicht, kein Kunden-Onboarding.')];
  for(const a of mail.attachments)lines.push('--'+boundary,'Content-Type: application/pdf',
   'Content-Disposition: attachment; filename="'+a.filename+'"','Content-Transfer-Encoding: base64','',b64(a.data));
  lines.push('--'+boundary+'--','');
  const response=await request(fetcher,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',token,
   {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({raw:Buffer.from(lines.join('\r\n')).toString('base64url')})});
  const result=await response.json();
  if(typeof result.id!=='string'||!result.id)fail('gmail_provider_receipt_missing');
  return{id:result.id};
 };
}
