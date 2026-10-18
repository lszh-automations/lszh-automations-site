// REVIEW-ONLY synthetic acceptance evidence marker. Not an outbox worker.
// No provider requests, mail, PDF creation, external archive writes or tokens.
import {createHash} from 'node:crypto';

const SHA=/^[a-f0-9]{64}$/;
const SYNTHETIC_NO_CONTRACT=/^TEST[-_][A-Z0-9_-]{8,90}[-_]NO[-_]CONTRACT$/;
const SYNTHETIC_EMAIL=/^[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)*example\.invalid$/;
const SOURCE_BASE='appzJiskpAdaR1HEv';
const SOURCE_TABLE='tbljeIUoD7wwKuSmS';
const DISABLED={airtable:'disabled',proofPdf:'disabled',email:'disabled'};
const sha=s=>createHash('sha256').update(s).digest('hex');
function canonical(v){
  if(Array.isArray(v))return v.map(canonical);
  if(v && typeof v==='object' && Object.getPrototypeOf(v)===Object.prototype)
    return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  return v;
}

function fail(){throw Error('synthetic_receipt_review_invalid');}
function isDisabled(d){
  return d && typeof d==='object' && !Array.isArray(d) &&
    Object.keys(d).sort().join(',')==='airtable,email,proofPdf' &&
    Object.entries(DISABLED).every(([k,v])=>d[k]===v);
}
function validateSyntheticOffer(offer,evidence,acceptedAt){
  if(!offer || offer.source?.kind!=='LSZH_SYNTHETIC_ONLY')fail();
  if(offer.source.baseId!==SOURCE_BASE || offer.source.tableId!==SOURCE_TABLE ||
    !/^rec[A-Za-z0-9]{14}$/.test(offer.source.recordId||'') ||
    !SHA.test(offer.tokenHash||'') || !isDisabled(offer.downstream) ||
    offer.approved!==true || !SYNTHETIC_NO_CONTRACT.test(offer.offerNumber||'') ||
    !SYNTHETIC_EMAIL.test(offer.recipientEmail||'') ||
    offer.termsVersion!=='TEST_v1.0_RC1' ||
    !evidence || typeof evidence!=='object' ||
    evidence.accepted_at_utc!==acceptedAt ||
    evidence.authorized_confirmed!==true || evidence.terms_confirmed!==true ||
    !SHA.test(evidence.quote_pdf_sha256||'') ||
    !SHA.test(evidence.terms_pdf_sha256||'') ||
    !['Ja','Nein'].includes(offer.bundle?.avv_required) ||
    evidence.quote_pdf_sha256!==offer.bundle.quote?.sha256 ||
    evidence.terms_pdf_sha256!==offer.bundle.terms?.sha256 ||
    evidence.avv_required!==(offer.bundle.avv_required==='Ja') ||
    evidence.avv_confirmed!==evidence.avv_required ||
    (evidence.avv_required ?
      !SHA.test(evidence.avv_pdf_sha256||'') ||
        evidence.avv_pdf_sha256!==offer.bundle.avv?.sha256 :
      evidence.avv_pdf_sha256!==null) ||
    Number.isNaN(Date.parse(acceptedAt)) ||
    !/^\d{4}-\d{2}-\d{2}T/.test(acceptedAt))fail();
}
export function buildSyntheticReceiptReview(offer,evidence,acceptedAt){
  // Existing non-synthetic offline fixtures keep their historic shape.
  // An explicitly synthetic offer with malformed provenance always fails closed.
  if(offer?.source?.kind!=='LSZH_SYNTHETIC_ONLY')return null;
  validateSyntheticOffer(offer,evidence,acceptedAt);
  const idempotencyKey=sha([
    'LSZH_SYNTHETIC_RECEIPT_REVIEW_V1',offer.tokenHash,
    offer.source.recordId,offer.offerNumber,acceptedAt,
    evidence.quote_pdf_sha256,evidence.terms_pdf_sha256,
    evidence.avv_pdf_sha256||'-'
  ].join('\u0000'));
  return {
    schemaVersion:1,
    purpose:'LSZH_SYNTHETIC_REVIEW_ONLY_NO_CONTRACT',
    state:'AWAITING_MANUAL_RECONCILIATION',
    idempotencyKey,
    archiveResult:'NOT_ATTEMPTED',
    receiptDriveId:null,
    emailProviderMessageId:null,
    downstream:{...DISABLED}
  };
}
export function inspectSyntheticReceiptRecovery(acceptedOffer){
  // Never automatically create a replacement proof or resend on ambiguity.
  if(acceptedOffer?.status!=='accepted' ||
     acceptedOffer?.source?.kind!=='LSZH_SYNTHETIC_ONLY' ||
     !acceptedOffer?.evidence || !acceptedOffer?.acceptedAt)
    return {status:'NO_GO',reason:'no_valid_synthetic_acceptance'};
  try{
    const expected=buildSyntheticReceiptReview(
      acceptedOffer,acceptedOffer.evidence,acceptedOffer.acceptedAt);
    const actual=acceptedOffer.receiptReview;
    if(!actual || JSON.stringify(canonical(actual))!==JSON.stringify(canonical(expected)))
      return {status:'NO_GO',reason:'receipt_review_mismatch'};
    return {status:'REVIEW_ONLY',idempotencyKey:expected.idempotencyKey,
      next:'MANUAL_RECONCILIATION_REQUIRED',
      canGenerateProof:false,canSendEmail:false,canWriteAirtable:false};
  }catch{
    return {status:'NO_GO',reason:'invalid_provenance_or_evidence'};
  }
}
