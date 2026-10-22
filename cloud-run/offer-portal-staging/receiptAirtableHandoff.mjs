// Firestore accepted offer -> existing Airtable Offerten fields, OFFLINE ONLY.
// This pure data projection never patches Airtable, contacts Make or sends mail.
import {inspectSyntheticReceiptRecovery} from './receiptRecoveryReview.mjs';

const BASE='appzJiskpAdaR1HEv';
const TABLE='tbljeIUoD7wwKuSmS';
const SHA=/^[a-f0-9]{64}$/;
function unavailable(){throw Error('synthetic_airtable_handoff_unavailable');}
export function prepareSyntheticAirtableAcceptanceHandoff(acceptedOffer){
  if(inspectSyntheticReceiptRecovery(acceptedOffer).status!=='REVIEW_ONLY')
    unavailable();
  const s=acceptedOffer,ev=s.evidence;
  const avv=s.bundle.avv_required==='Ja';
  if(s.source.baseId!==BASE||s.source.tableId!==TABLE||
     ev.method!=='lszh_b2b_staging_v1' ||
     ev.accepted_at_utc!==s.acceptedAt ||
     ev.offer_number!==s.offerNumber ||
     ev.email!==s.recipientEmail||
     typeof ev.name!=='string'||ev.name.trim().length<4||
     ev.authorized_confirmed!==true||ev.quote_confirmed!==true||
     ev.terms_confirmed!==true||ev.avv_confirmed!==avv||
     ev.avv_required!==avv ||
     !SHA.test(ev.quote_pdf_sha256||'')||
     !SHA.test(ev.terms_pdf_sha256||'')||
     ev.quote_pdf_sha256!==s.bundle.quote.sha256||
     ev.terms_pdf_sha256!==s.bundle.terms.sha256 ||
     (avv?(ev.avv_version!==s.details?.avvVersion||
       !SHA.test(ev.avv_pdf_sha256||'')||
       ev.avv_pdf_sha256!==s.bundle.avv?.sha256):(
       ev.avv_version!==null||ev.avv_pdf_sha256!==null)))
    unavailable();

  const fields={
    'Status':'Angenommen',
    'Vertragsunterlagen akzeptiert':true,
    'Online-Annahme Zeitstempel':s.acceptedAt,
    'Online-Annahme Person':ev.name,
    'Online-Annahme E-Mail':ev.email,
    'Online-Annahme Vertragsversion':s.termsVersion,
    'Online-Annahme Offerten Drive ID':s.bundle.quote.id,
    'Online-Annahme Bedingungen Drive ID':s.bundle.terms.id,
    'Online-Annahme Offerten-SHA256':ev.quote_pdf_sha256,
    'Online-Annahme Bedingungen-SHA256':ev.terms_pdf_sha256,
    'AVV erforderlich':s.bundle.avv_required,
    'Online-Annahme AVV ausdrücklich akzeptiert':avv,
    ...(avv?{
      'Online-Annahme AVV Drive ID':s.bundle.avv.id,
      'Online-Annahme AVV-SHA256':ev.avv_pdf_sha256,
      'Online-Annahme AVV-Version':ev.avv_version
    }:{})
  };
  // No legal approval, archive VERIFIED flag, receipt ID, email flag, or
  // Make claim is asserted by a test acceptance.
  return {
    schemaVersion:1,
    purpose:'LSZH_SYNTHETIC_AIRTABLE_HANDOFF_PLAN_V1',
    action:'DO_NOT_PATCH',
    baseId:BASE,tableId:TABLE,recordId:s.source.recordId,
    receiptReviewKey:s.receiptReview.idempotencyKey,
    fields,
    canWriteAirtable:false,canCreateReceipt:false,canSendEmail:false
  };
}
