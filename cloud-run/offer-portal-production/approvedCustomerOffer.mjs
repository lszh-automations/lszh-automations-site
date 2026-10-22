// Pure, side-effect-free preparation of ONE explicitly released customer offer.
// No email, token issuance, Firestore write, Cloud IAM action or automatic deployment.
import {createHash} from 'node:crypto';

export const AIRTABLE_CUSTOMER_SOURCE=Object.freeze({
  baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',
  recordNumber:'fldNluaFeT1mWGMJY',status:'fld2XdyW6ZE4XlSz3',
  termsVersion:'fldkvLOuDmQoSCjuI',avvRequired:'fldOZcNcm2PQwP7Rt',
  validUntil:'fldl0MMMOh95Y7N1q',leadEmail:'flduZx5dzgpMfyXDu',
  leadCompany:'fldZDij0YpvnqFgPO',
  tokenHash:'fldBWHnMXuL46y5L9',quoteId:'fldjQ5EmGioSEA2dw',
  quoteSha:'fldcUBIpCMmKbmq0Q',termsId:'fldGolGjsXMtaHdfY',
  termsSha:'fldLSUNx2D7uwEjCY',avvId:'fldojDAkMfvjJycme',
  avvSha:'fldbhBi71Jmr6g9Uk',avvVersion:'fld4cMFAPuSfLjz2B',
  legalApproved:'fldkiRZao205kv63x',liveApproved:'fldOe2lL8inXnOWwi',
  released:'fldM2gGMhQKonLACU',contractsSent:'fld0lzVTwul6ibTle',
  accepted:'fldgvIfuHuJ3JHOC0',acceptedAt:'fldht6O6aUFWnIkWT',
  avvAccepted:'fld8gm2LLGAeHeBSA',sentAt:'fld9Fqb8gq2kjt4em',
  once:'fldvtGMbHGeQGBrnl',monthly:'fldYboIZUI70VNUlw',
  service:'fldnx2HPMJlyOaPyN',paymentModel:'fld5YaoIeYLE1MZFW'
});
const SHA=/^[a-f0-9]{64}$/;
const FILE=/^[A-Za-z0-9_-]{20,100}$/;
const REC=/^rec[A-Za-z0-9]{14}$/;
const MAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function fail(reason){const error=Error('customer_offer_'+reason);error.code=reason;throw error;}
function choice(value){return value && typeof value==='object' && !Array.isArray(value)?value.name:value;}
function singleLookup(value){
  // Airtable REST returns a single lookup as an array. The Airtable
  // connector can instead return linkedRecordIds + valuesByLinkedRecordId.
  if(Array.isArray(value)){
    if(value.length!==1||typeof value[0]!=='string')fail('ambiguous_lookup');
    return value[0].trim();
  }
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    !Array.isArray(value.linkedRecordIds)||value.linkedRecordIds.length!==1 ||
    !value.valuesByLinkedRecordId)fail('ambiguous_lookup');
  const id=value.linkedRecordIds[0];
  const entries=value.valuesByLinkedRecordId[id];
  if(!Array.isArray(entries)||entries.length!==1||typeof entries[0]!=='string')
    fail('ambiguous_lookup');
  return entries[0].trim();
}
function documentRef(id,sha){
  if(typeof id!=='string'||!FILE.test(id)||typeof sha!=='string'||!SHA.test(sha))
    fail('document_incomplete');
  return {id,sha256:sha};
}
function money(value){
  if(value===undefined||value===null)return 0;
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1000000)
    fail('amount_invalid');
  return value;
}
function endOfSwissDay(day){
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||
     Number.isNaN(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)
    fail('date_invalid');
  // Determine the applicable Swiss UTC offset on that date, including DST.
  const name=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Europe/Zurich',timeZoneName:'shortOffset'
  }).formatToParts(new Date(day+'T12:00:00Z')).find(p=>p.type==='timeZoneName')?.value;
  const match=/^GMT([+-])(\d{1,2})$/.exec(name||'');
  if(!match)fail('timezone_invalid');
  const offset=match[1]+match[2].padStart(2,'0')+':00';
  return new Date(day+'T23:59:59'+offset).toISOString();
}
export function mapApprovedCustomerOffer(record,{
  baseId=AIRTABLE_CUSTOMER_SOURCE.baseId,
  tableId=AIRTABLE_CUSTOMER_SOURCE.tableId,termsVersion,now=new Date()
}={}){
  const K=AIRTABLE_CUSTOMER_SOURCE;
  if(baseId!==K.baseId||tableId!==K.tableId)fail('wrong_source');
  if(!record||!REC.test(record.id||'')||
     !record.cellValuesByFieldId||Array.isArray(record.cellValuesByFieldId))
    fail('record_invalid');
  const f=record.cellValuesByFieldId;
  if(f[K.legalApproved]!==true||f[K.liveApproved]!==true||
     f[K.released]!==true||f[K.contractsSent]!==true)fail('not_released');
  if(choice(f[K.status])!=='Versendet'||f[K.accepted]===true||
     f[K.avvAccepted]===true||f[K.acceptedAt])fail('not_eligible');
  if(typeof termsVersion!=='string'||!termsVersion||
     /test|rc|draft|entwurf/i.test(termsVersion)||
     ![termsVersion,'v'+termsVersion].includes(f[K.termsVersion]))fail('terms_not_final');
  if(!(now instanceof Date)||Number.isNaN(now.valueOf()))fail('clock_invalid');
  const expiresAt=endOfSwissDay(f[K.validUntil]);
  if(Date.parse(expiresAt)<now.getTime())fail('offer_expired');
  const number=f[K.recordNumber];
  if(typeof number!=='string'||number.length<4||number.length>100||
     /^(TEST[-_]|DEMO[-_])/i.test(number))fail('test_offer_forbidden');
  const email=singleLookup(f[K.leadEmail]);
  if(!MAIL.test(email)||email!==email.toLowerCase()||
     /(?:\.invalid|\.test)$/i.test(email)||email.length>254)
    fail('recipient_invalid');
  const company=singleLookup(f[K.leadCompany]);
  if(!company||company.length>160)fail('company_invalid');
  const tokenHash=f[K.tokenHash];
  if(typeof tokenHash!=='string'||!SHA.test(tokenHash))fail('token_missing');
  const mode=choice(f[K.avvRequired]);
  if(!['Ja','Nein'].includes(mode))fail('avv_undecided');
  const quote=documentRef(f[K.quoteId],f[K.quoteSha]);
  const terms=documentRef(f[K.termsId],f[K.termsSha]);
  let avv;
  if(mode==='Ja'){
    avv=documentRef(f[K.avvId],f[K.avvSha]);
    if(typeof f[K.avvVersion]!=='string'||f[K.avvVersion].length<4||
       /test|draft|entwurf/i.test(f[K.avvVersion]))fail('avv_not_final');
  }else if(f[K.avvId]||f[K.avvSha]||f[K.avvVersion])fail('unexpected_avv');
  if(new Set([quote.id,terms.id,...(avv?[avv.id]:[])]).size!==(avv?3:2))
    fail('duplicate_documents');
  const label=v=>String(choice(v)||'').slice(0,160);
  return {
    tokenHash,status:'sent',approved:true,revision:1,
    termsVersion,expiresAt,recipientEmail:email,offerNumber:number,
    details:{company,service:label(f[K.service]),
      paymentModel:label(f[K.paymentModel]),
      onceCHF:money(f[K.once]),monthlyCHF:money(f[K.monthly]),
      ...(avv?{avvVersion:f[K.avvVersion]}:{})},
    bundle:{avv_required:mode,quote,terms,...(avv?{avv}:{})},
    source:{kind:'LSZH_CUSTOMER_APPROVED_V1',baseId,tableId,recordId:record.id,
      legalApproved:true,liveApproved:true},
    downstream:{airtable:'pending',proofPdf:'pending',email:'pending'}
  };
}
// Avoid token plaintext in the exported record; the caller manages issuance.
export function tokenFingerprint(rawToken){
  if(typeof rawToken!=='string'||!/^[A-Za-z0-9_-]{40,80}$/.test(rawToken))
    fail('token_invalid');
  return createHash('sha256').update(rawToken).digest('hex');
}
