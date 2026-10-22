// Offline-only handoff for existing Make Google Docs -> PDF confirmation flow.
// No provider calls, Firestore writes, email, PDF export, or activation.
import {inspectSyntheticReceiptRecovery} from './receiptRecoveryReview.mjs';

const DRIVE_ID=/^[A-Za-z0-9_-]{20,100}$/;
const SHA=/^[a-f0-9]{64}$/;
const html=value=>String(value).replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[char]);
const isText=(value,max)=>typeof value==='string'&&
  value.trim().length>=2&&value.length<=max;
function reject(){throw Error('synthetic_receipt_document_unavailable');}
const field=(title,value)=>'<p><strong>'+html(title)+'</strong> '+html(value)+'</p>';

export function prepareSyntheticReceiptDocument(offer,{folderId}={}){
  if(inspectSyntheticReceiptRecovery(offer).status!=='REVIEW_ONLY' ||
    !DRIVE_ID.test(folderId||''))reject();
  const ev=offer.evidence,details=offer.details||{};
  const avv=offer.bundle.avv_required==='Ja';
  if(ev.method!=='lszh_b2b_staging_v1' ||
    ev.authorized_confirmed!==true || ev.quote_confirmed!==true ||
    ev.terms_confirmed!==true || ev.avv_confirmed!==avv ||
    ev.avv_required!==avv ||
    !isText(ev.name,120) || ev.name!==ev.name.trim() ||
    ev.email!==offer.recipientEmail ||
    !isText(details.company,150) ||
    !SHA.test(ev.quote_pdf_sha256||'') ||
    !SHA.test(ev.terms_pdf_sha256||'') ||
    ev.accepted_at_utc!==offer.acceptedAt ||
    !Number.isFinite(Date.parse(offer.acceptedAt)) ||
    new Date(offer.acceptedAt).toISOString()!==offer.acceptedAt ||
    (avv?(
      !isText(ev.avv_version,100) ||
      ev.avv_version!==details.avvVersion ||
      !SHA.test(ev.avv_pdf_sha256||'') ||
      ev.avv_pdf_sha256!==offer.bundle.avv?.sha256
    ):(
      ev.avv_version!==null || ev.avv_pdf_sha256!==null
    )))reject();

  // HTML is the exact input format of existing Make google-docs:createADocument
  // module #5. Values are escaped and come only from the accepted server record.
  const lines=[
    '<div><h1>LSZH Automations</h1>',
    '<p><strong>TESTDATEN – KEIN VERTRAG</strong></p>',
    '<h2>Nachweis einer synthetischen Online-Annahme</h2>',
    field('Offerte:',offer.offerNumber),
    field('Unternehmen:',details.company),
    field('Bestätigende Person:',ev.name),
    field('E-Mail:',ev.email),
    field('Annahmezeit (UTC):',ev.accepted_at_utc),
    field('Projektbedingungen-Version:',offer.termsVersion),
    field('Offerten-PDF SHA-256:',ev.quote_pdf_sha256),
    field('Projektbedingungen-PDF SHA-256:',ev.terms_pdf_sha256),
    '<p>Vertretungsberechtigung, Offerte und Projektbedingungen: ausdrücklich bestätigt.</p>'
  ];
  if(avv){
    lines.push(field('AVV-Version:',ev.avv_version));
    lines.push(field('AVV-PDF SHA-256:',ev.avv_pdf_sha256));
    lines.push('<p>AVV: separat ausdrücklich bestätigt.</p>');
  }else{
    lines.push('<p>AVV: für diese Offerte nicht erforderlich.</p>');
  }
  lines.push('<p>Dies ist ein technischer Testbeleg, kein rechtswirksamer Vertrag und keine qualifizierte elektronische Signatur.</p></div>');
  return {
    purpose:'LSZH_SYNTHETIC_RECEIPT_DOCUMENT_HANDOFF_V1',
    action:'DO_NOT_CREATE',
    module:'google-docs:createADocument',
    mapper:{
      name:'LSZH_TEST_ONLY_'+offer.offerNumber+'_ANNAHMEBELEG',
      content:lines.join('\n'),folderId,destination:'drive',
      header:false,footer:false
    },
    canCreateDocument:false,canExportPdf:false,
    canUpload:false,canWriteAirtable:false,canSendEmail:false
  };
}
