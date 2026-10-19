import {INTERNAL_TEST_PILOT} from './internalTestPilot.mjs';
// Airtable -> isolated Firestore offer seed, STRICTLY synthetic.
// An explicit LOCAL emulator gate prevents this module writing to Google Cloud.
// No Airtable access, mail sending, PDF generation or production Go-Live.
import {registerSyntheticSourceLocalEmulator} from './syntheticSourceIndex.mjs';

// Pinned to the audited Airtable "Offerten" schema on 15.10.2026.
// Do not infer potentially ambiguous human-readable keys.
export const SOURCE={
  base:'appzJiskpAdaR1HEv',table:'tbljeIUoD7wwKuSmS',
  number:'fldNluaFeT1mWGMJY',status:'fld2XdyW6ZE4XlSz3',
  terms:'fldkvLOuDmQoSCjuI',avvRequired:'fldOZcNcm2PQwP7Rt',
  validUntil:'fldl0MMMOh95Y7N1q',email:'flduZx5dzgpMfyXDu',
  tokenHash:'fldBWHnMXuL46y5L9',
  quoteId:'fldjQ5EmGioSEA2dw',quoteSha:'fldcUBIpCMmKbmq0Q',
  termsId:'fldGolGjsXMtaHdfY',termsSha:'fldLSUNx2D7uwEjCY',
  avvId:'fldojDAkMfvjJycme',avvSha:'fldbhBi71Jmr6g9Uk',
  avvVersion:'fld4cMFAPuSfLjz2B',
  prod:'fldOe2lL8inXnOWwi',legal:'fldkiRZao205kv63x',
  released:'fldM2gGMhQKonLACU',accepted:'fldgvIfuHuJ3JHOC0',
  avvAccepted:'fld8gm2LLGAeHeBSA',internalNote:'fldA4WCPe6jXCGkid',
  once:'fldvtGMbHGeQGBrnl',monthly:'fldYboIZUI70VNUlw',
  service:'fldnx2HPMJlyOaPyN',paymentModel:'fld5YaoIeYLE1MZFW'
};
const SHA=/^[a-f0-9]{64}$/;
const FILE=/^[a-zA-Z0-9_-]{20,100}$/;
const REC=/^rec[A-Za-z0-9]{14}$/;
const NUMBER=/^TEST[-_][A-Z0-9_-]{8,90}[-_]NO[-_]CONTRACT$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
function reject(code){const e=new Error(code);e.code=code;throw e;}
function choice(v){return v && typeof v==='object' && typeof v.name==='string'?v.name:v;}
function lookupOne(v){
  if(!v||typeof v!=='object'||Array.isArray(v)||
     !Array.isArray(v.linkedRecordIds)||v.linkedRecordIds.length!==1||
     !v.valuesByLinkedRecordId || Object.keys(v.valuesByLinkedRecordId).length!==1)
    reject('synthetic_recipient_missing');
  const values=v.valuesByLinkedRecordId[v.linkedRecordIds[0]];
  if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string')
    reject('synthetic_recipient_missing');
  return values[0];
}
function pdf(id,hash){
  if(typeof id!=='string'||!FILE.test(id)||typeof hash!=='string'||!SHA.test(hash))
    reject('synthetic_archive_incomplete');
  return {id,sha256:hash};
}
function label(v){
  const text=choice(v);
  if(text===undefined||text===null)return '';
  if(typeof text!=='string'||text.length>160)reject('synthetic_display_field_invalid');
  return text;
}
function chf(v){
  if(v===undefined||v===null)return 0;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>100000||
     Math.abs(Math.round(v*100)-v*100)>0.0000001)reject('synthetic_price_invalid');
  return v;
}
// This function is PURE: data-read and dry-run, no writes of any sort.
export function mapSyntheticAirtableOffer(record,{baseId=SOURCE.base,tableId=SOURCE.table,internalPilotRecordId}={}){
  if(baseId!==SOURCE.base||tableId!==SOURCE.table)reject('source_mismatch');
  if(!record||!REC.test(record.id||'')||!record.cellValuesByFieldId||
     typeof record.cellValuesByFieldId!=='object')reject('source_invalid');
  const f=record.cellValuesByFieldId;
  // No real customer, approved contract, or accepted offer can be imported.
  for(const key of ['prod','legal','released','accepted','avvAccepted'])
    if(f[SOURCE[key]]===true)reject('production_or_approved_record');
  if(choice(f[SOURCE.status])!=='Entwurf')reject('only_unreleased_drafts');
  const number=f[SOURCE.number];
  if(typeof number!=='string'||!NUMBER.test(number))reject('synthetic_marker_missing');
  const note=f[SOURCE.internalNote];
  if(typeof note!=='string'||!/TEST[ _-]*ONLY/i.test(note)||
     !/NO[ _-]*CONTRACT/i.test(note))reject('synthetic_attestation_missing');
  const email=lookupOne(f[SOURCE.email]);
  const internal=internalPilotRecordId!==undefined;
  if(internal && (!REC.test(internalPilotRecordId)||record.id!==internalPilotRecordId||
    number!==INTERNAL_TEST_PILOT.number||email!==INTERNAL_TEST_PILOT.email||
    choice(f[SOURCE.avvRequired])!=='Nein'||!note.includes(INTERNAL_TEST_PILOT.purpose)))
    reject('internal_test_pilot_mismatch');
  if(!internal && (!/^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*example\.invalid$/.test(email)||
      email!==email.toLowerCase()))reject('real_recipient_forbidden');
  if(f[SOURCE.terms]!=='TEST_v1.0_RC1')reject('synthetic_terms_version_missing');
  const day=f[SOURCE.validUntil];
  if(typeof day!=='string'||!DAY.test(day)||!Number.isFinite(Date.parse(day))||
    new Date(day).toISOString().slice(0,10)!==day)
    reject('synthetic_expiry_missing');
  // Conservative test expiration: beginning of day (UTC); never extrapolate
  // a customer's contractual Swiss-local deadline.
  const expiresAt=day+'T00:00:00.000Z';
  const tokenHash=f[SOURCE.tokenHash];
  if(typeof tokenHash!=='string'||!SHA.test(tokenHash))reject('synthetic_token_hash_missing');
  const mode=choice(f[SOURCE.avvRequired]);
  if(mode!=='Ja'&&mode!=='Nein')reject('synthetic_avv_mode_missing');
  const quote=pdf(f[SOURCE.quoteId],f[SOURCE.quoteSha]);
  const terms=pdf(f[SOURCE.termsId],f[SOURCE.termsSha]);
  let avv;
  if(mode==='Ja'){
    avv=pdf(f[SOURCE.avvId],f[SOURCE.avvSha]);
    if(typeof f[SOURCE.avvVersion]!=='string'||
       !/^TEST_ONLY_[A-Za-z0-9._-]{6,80}$/.test(f[SOURCE.avvVersion]))
      reject('synthetic_avv_version_missing');
  }else if(f[SOURCE.avvId]||f[SOURCE.avvSha]||f[SOURCE.avvVersion]){
    reject('unexpected_avv_documents');
  }
  const ids=[quote.id,terms.id,...(avv?[avv.id]:[])];
  if(new Set(ids).size!==ids.length)reject('duplicate_archive_ids');
  const item={
    tokenHash,status:'sent',approved:true,revision:1,
    termsVersion:'TEST_v1.0_RC1',expiresAt,recipientEmail:email,
    offerNumber:number,
    details:{company:internal?INTERNAL_TEST_PILOT.company:'LSZH Synthetic Offer (not a contract)',
      service:label(f[SOURCE.service]),paymentModel:label(f[SOURCE.paymentModel]),
      onceCHF:chf(f[SOURCE.once]),monthlyCHF:chf(f[SOURCE.monthly]),
      ...(avv?{avvVersion:f[SOURCE.avvVersion]}:{})},
    bundle:{avv_required:mode,quote,terms,...(avv?{avv}:{})},
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId,tableId,recordId:record.id,
      ...(internal?{internalPilot:INTERNAL_TEST_PILOT.purpose}:{})},
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
  return item;
}
// This NEVER writes to cloud. Local emulator is hard-pinned; clients cannot
// override project, database, collection or other records through input.
export async function seedOnlyLocalEmulator(db,record){
  // Environment must be read from the REAL process, never injected by callers.
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8088'||
     process.env.GCLOUD_PROJECT!=='demo-lszh-automations'||
     process.env.K_SERVICE||process.env.GOOGLE_APPLICATION_CREDENTIALS||
     !db||typeof db.collection!=='function'||
     db.databaseId!=='lszh-offers-staging'||db.projectId!=='demo-lszh-automations')
    reject('local_emulator_required');
  const item=mapSyntheticAirtableOffer(record);
  // Both records are inserted atomically. A second token for the same
  // Airtable source record is a hard conflict, never a new offer.
  return registerSyntheticSourceLocalEmulator(db,item);
}
