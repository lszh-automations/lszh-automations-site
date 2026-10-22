// Prepared internal TEST_ONLY recovery route. Not connected to Make or a runtime.
// Reuses existing PDFs. No generation, seeding, production mode or arbitrary recipient.
import {createHash,randomUUID} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const PROJECT='lszh-automations',DATABASE='lszh-offers-staging';
const FOLDER='10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko';
const RECIPIENT='lars.schulthess@outlook.com';
const ALLOWED=new Map([
 ['recR70ZSPynGqA1LS',{number:'TEST_INTERNAL_LARS_20261019_NO_CONTRACT',avv:false}],
 ['recktLXj5wUxLmHFQ',{number:'TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT',avv:true}]
]);
const SHA=/^[a-f0-9]{64}$/;
const FILE=/^[A-Za-z0-9_-]{20,100}$/;
const stop=reason=>({status:'STOP',reason,canSend:false,canCreateReceipt:false});
export function inspectInternalMailRecovery(input){
 const rule=ALLOWED.get(input?.recordId);
 if(!rule||input.offerNumber!==rule.number||input.testOnly!==true||
 input.baseId!=='appzJiskpAdaR1HEv'||input.tableId!=='tbljeIUoD7wwKuSmS'||
 input.status!=='accepted'||typeof input.acceptedAt!=='string'||
 !Number.isFinite(Date.parse(input.acceptedAt))||
 input.productionApproved!==false||input.legalApproved!==false||input.dispatchApproved!==false)
  return stop('unapproved_internal_test_identity');
 // Existing sent evidence always wins, including when attachments are unavailable.
 if(input.sentAt)return {status:'ALREADY_SENT',canSend:false,canCreateReceipt:false};
 if(input.inProgress===true)return stop('previous_attempt_requires_reconciliation');
 if(input.inProgress!==false||!SHA.test(input.expectedReceiptSha256||''))
  return stop('missing_pinned_receipt_or_lock_state');
 if(input.avvRequired!==rule.avv||input.avvConfirmed!==rule.avv||
 input.quoteConfirmed!==true||input.termsConfirmed!==true||input.authorizedConfirmed!==true)
  return stop('acceptance_evidence_mismatch');
 const expected=['quote','terms',...(rule.avv?['avv']:[]),'receipt'];
 if(!Array.isArray(input.documents)||input.documents.length!==expected.length||
 new Set(input.documents.map(d=>d?.kind)).size!==expected.length)
  return stop('document_set_mismatch');
 const hashes=[];
 for(const kind of expected){
  const d=input.documents.find(d=>d?.kind===kind);
  const expectedHash=kind==='receipt'?input.expectedReceiptSha256:input.acceptedHashes?.[kind];
  if(!d||!FILE.test(d.id||'')||d.mimeType!=='application/pdf'||d.readOnly!==true||
   !Array.isArray(d.parents)||d.parents.length!==1||d.parents[0]!==FOLDER||
   !SHA.test(expectedHash||'')||!Buffer.isBuffer(d.bytes)||d.bytes.length<12||
   d.bytes.length>10*1024*1024||!d.bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||
   !d.bytes.subarray(-1024).includes(Buffer.from('%%EOF'))||
   sha(d.bytes)!==expectedHash||d.sha256!==expectedHash)
   return stop('existing_pdf_not_independently_verified');
  hashes.push(kind+':'+expectedHash+':'+d.id);
 }
 // One send reservation per source record. A changed PDF ID/hash or timestamp
 // must never manufacture a new reservation and bypass an earlier attempt.
 const key=sha(['LSZH_INTERNAL_EXISTING_RECEIPT_MAIL_V1',input.baseId,input.tableId,input.recordId].join('\0'));
 const fingerprint=sha([input.acceptedAt,...hashes].join('\0'));
 return {status:'READY_FOR_ATOMIC_CLAIM',key,recipient:RECIPIENT,
  fingerprint,attachmentCount:expected.length,canSend:false,canCreateReceipt:false};
}

export async function sendInternalTestConfirmationOnce({loadFresh,store,sendMail}){
 // Authoritative inputs must be loaded afresh, not taken from an old run payload.
 const input=await loadFresh();
 const plan=inspectInternalMailRecovery(input);
 if(plan.status!=='READY_FOR_ATOMIC_CLAIM')return plan;
 const attemptId=randomUUID();
 const claimed=await store.claim(plan.key,{recordId:input.recordId,attemptId});
 if(!claimed)return stop('attempt_already_reserved_no_automatic_retry');
 // Recheck fresh authoritative source and PDF bytes after reserving. A completed
 // or changed source cannot be dispatched using an earlier snapshot.
 let sendInput;
 try{
  sendInput=await loadFresh();
  const fresh=inspectInternalMailRecovery(sendInput);
  if(fresh.status!=='READY_FOR_ATOMIC_CLAIM'||fresh.key!==plan.key||fresh.fingerprint!==plan.fingerprint)
   throw Error('source_changed_after_claim');
 }catch{
  try{await store.markAmbiguous(plan.key,attemptId);}catch{}
  return stop('source_changed_after_claim_manual_reconciliation');
 }

 // A failure anywhere after this durable reservation must not trigger a retry.
 // Providers may have accepted a request even when their response is lost.
 let message;
 try{
  message=await sendMail({to:[RECIPIENT],cc:[],bcc:[],
   subject:'TEST_ONLY – vorhandener Annahmebeleg – kein Vertrag',
   text:'Autorisierter interner Funktionstest. Kein Vertrag, keine Zahlungspflicht, kein Kunden-Onboarding.',
   attachments:sendInput.documents.map(d=>({filename:'TEST_ONLY_'+d.kind+'.pdf',data:d.bytes})),
   correlationKey:plan.key});
 }catch{
  // The durable claim already blocks a second send, even if this update fails.
  try{await store.markAmbiguous(plan.key,attemptId);}catch{}
  return stop('provider_outcome_unknown_manual_reconciliation');
 }
 if(typeof message?.id!=='string'||!message.id||message.id.length>300){
  try{await store.markAmbiguous(plan.key,attemptId);}catch{}
  return stop('provider_receipt_missing_manual_reconciliation');
 }
 try{await store.markSent(plan.key,attemptId,message.id);}catch{
  return stop('provider_accepted_local_readback_pending_do_not_resend');
 }
 return {status:'PROVIDER_ACCEPTED',key:plan.key,canSend:false,canCreateReceipt:false,
  deliveryConfirmed:false};
}

export function createInternalRecoveryStore(db,{enabled=false,emulatorOnly=false}={}){
 // Explicit demo mode cannot fall through to a real Firestore project.
 const isolatedDemo=emulatorOnly===true&&db?.projectId==='demo-lszh-automations'&&
  process.env.GCLOUD_PROJECT==='demo-lszh-automations'&&
  process.env.FIRESTORE_EMULATOR_HOST==='127.0.0.1:8088'&&
  !process.env.GOOGLE_APPLICATION_CREDENTIALS&&!process.env.K_SERVICE;
 const intendedProject=emulatorOnly===true?isolatedDemo:db?.projectId===PROJECT;
 if(enabled!==true||!intendedProject||db?.databaseId!==DATABASE||
 typeof db.runTransaction!=='function'||typeof db.collection!=='function')
  throw Error('explicit_internal_staging_store_required');
 const ref=key=>{
  if(!SHA.test(key||''))throw Error('invalid_recovery_key');
  return db.collection('lszh_internal_mail_recovery_v1').doc(key);
 };
 async function transition(key,attemptId,state,messageId){
  const doc=ref(key);
  await db.runTransaction(async tx=>{
   const snapshot=await tx.get(doc),data=snapshot.exists?snapshot.data():null;
   if(!data||data.state!=='SENDING'||data.attemptId!==attemptId)
    throw Error('recovery_attempt_mismatch');
   tx.update(doc,{state,...(messageId?{providerMessageId:messageId}:{})});
  });
 }
 return {
  async claim(key,{recordId,attemptId}){
   if(!ALLOWED.has(recordId)||typeof attemptId!=='string'||!attemptId)throw Error('invalid_internal_claim');
   const doc=ref(key);
   return db.runTransaction(async tx=>{
    const existing=await tx.get(doc);
    if(existing.exists)return false;
    tx.create(doc,{purpose:'TEST_ONLY_EXISTING_RECEIPT_MAIL_NO_CONTRACT',
     recordId,attemptId,state:'SENDING'});
    return true;
   });
  },
  markSent:(key,attemptId,id)=>transition(key,attemptId,'PROVIDER_ACCEPTED',id),
  markAmbiguous:(key,attemptId)=>transition(key,attemptId,'MANUAL_RECONCILIATION_REQUIRED')
 };
}
