'use strict';
// STAGING-ONLY, pure domain model. Not imported by CRM production routes.
// Hashes, archive IDs and approval claims MUST be verified independently by
// trusted services before this model is used in a production write/dispatch.
const {createHash,timingSafeEqual}=require('node:crypto');
const FORMAT_VERSION=1;
const KINDS=['offer','terms','avv'];
const STATES=Object.freeze([
  'prepared','sending','sent','delivery_review',
  'customer_response_recorded','awaiting_lszh_confirmation',
  'confirmed','declined','cancelled'
]);
function invalid(reason){
  return Object.assign(new Error('Vertragspaket ungueltig: '+reason),{
    code:'INVALID_OFFER_PACKAGE',status:400
  });
}
function object(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value)&&
    (Object.getPrototypeOf(value)===Object.prototype||
      Object.getPrototypeOf(value)===null);
}
function exactKeys(value,allowed,context){
  if(!object(value))throw invalid(context+' muss ein Objekt sein');
  const unexpected=Object.keys(value).filter(key=>!allowed.includes(key));
  if(unexpected.length)throw invalid(context+' enthaelt nicht erlaubte Felder');
}
function text(value,pattern,context){
  if(typeof value!=='string'||!pattern.test(value))throw invalid(context);
  return value;
}
function digest(bytes){return createHash('sha256').update(bytes).digest('hex');}
function sha(value,context){
  return text(value,/^[a-f0-9]{64}$/,context+' erwartet SHA-256 (hex)');
}
function document(raw){
  exactKeys(raw,['kind','version','archiveFileId','sha256','filename','bytes'],'Dokument');
  const kind=text(raw.kind,/^(offer|terms|avv)$/,'Dokumenttyp');
  const version=text(raw.version,/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/,'Dokumentversion');
  const archiveFileId=text(raw.archiveFileId,/^[A-Za-z0-9_-]{10,180}$/,'Archivdatei-ID');
  const filename=text(raw.filename,/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}\.pdf$/i,'PDF-Dateiname');
  const hash=sha(raw.sha256,'Dokument');
  if(!Number.isSafeInteger(raw.bytes)||raw.bytes<10||raw.bytes>5_000_000)
    throw invalid('PDF-Groesse ausserhalb des Staging-Rahmens');
  return Object.freeze({kind,version,archiveFileId,sha256:hash,filename,bytes:raw.bytes});
}
function prepareOfferPackage(input){
  exactKeys(input,[
    'offerId','offerNumber','revision','offerSnapshotSha256',
    'avvRequired','avvAnnexesConfirmed','documents'
  ],'Paket-Eingabe');
  const offerId=text(input.offerId,/^[A-Za-z0-9_-]{1,100}$/,'Offerten-ID');
  const offerNumber=text(input.offerNumber,/^[0-9]{1,10}$/,'Offertennummer');
  const revision=input.revision;
  if(!Number.isSafeInteger(revision)||revision<1||revision>1000000)
    throw invalid('Paketrevision');
  const offerSnapshotSha256=sha(input.offerSnapshotSha256,'Offerten-Snapshot');
  if(!['yes','no','review'].includes(input.avvRequired))throw invalid('AVV-Einstufung fehlt');
  if(input.avvRequired==='review')throw invalid('AVV-Einstufung ungeklaert (fail closed)');
  if(typeof input.avvAnnexesConfirmed!=='boolean')throw invalid('AVV-Anlagen bestaetigt (bool)');
  if(input.avvAnnexesConfirmed!==(input.avvRequired==='yes'))
    throw invalid('AVV-Anlagen bestaetigt nur bei AVV=yes');
  if(!Array.isArray(input.documents)||input.documents.length!==(input.avvRequired==='yes'?3:2))
    throw invalid('Falsche Dokumentanzahl');
  const docs=input.documents.map(document);
  const required=input.avvRequired==='yes'?KINDS:KINDS.slice(0,2);
  if(new Set(docs.map(d=>d.kind)).size!==required.length||
     required.some(kind=>!docs.some(doc=>doc.kind===kind)))
    throw invalid('Dokumentarten fehlen, sind doppelt oder unzulaessig');
  if(new Set(docs.map(d=>d.archiveFileId)).size!==docs.length||
     new Set(docs.map(d=>d.sha256)).size!==docs.length)
    throw invalid('Dokument-IDs und SHA-256 muessen eindeutig sein');
  const ordered=Object.freeze(required.map(kind=>docs.find(doc=>doc.kind===kind)));
  const metadata={
    schemaVersion:FORMAT_VERSION,
    packageId:'pkg_'+offerId+'_r'+revision,
    sendEventId:'contract_send_pkg_'+offerId+'_r'+revision,
    offerId,offerNumber,revision,offerSnapshotSha256,
    avvRequired:input.avvRequired,
    avvAnnexesConfirmed:input.avvAnnexesConfirmed,
    documents:ordered
  };
  const packageSha256=digest(Buffer.from(JSON.stringify(metadata),'utf8'));
  return Object.freeze({...metadata,packageSha256,status:'prepared'});
}
function verifyOfferPackage(pkg){
  exactKeys(pkg,[
    'schemaVersion','packageId','sendEventId','offerId','offerNumber','revision',
    'offerSnapshotSha256','avvRequired','avvAnnexesConfirmed',
    'documents','packageSha256','status'
  ],'Paket');
  if(pkg.schemaVersion!==FORMAT_VERSION)throw invalid('Schema-Version');
  if(!STATES.includes(pkg.status))throw invalid('Paketstatus');
  const expected=prepareOfferPackage({
    offerId:pkg.offerId,offerNumber:pkg.offerNumber,revision:pkg.revision,
    offerSnapshotSha256:pkg.offerSnapshotSha256,avvRequired:pkg.avvRequired,
    avvAnnexesConfirmed:pkg.avvAnnexesConfirmed,documents:pkg.documents
  });
  if(pkg.packageId!==expected.packageId||pkg.sendEventId!==expected.sendEventId||
     pkg.packageSha256!==expected.packageSha256)
    throw invalid('Paket-ID / Snapshot-Pruefsumme stimmt nicht');
  // The package hash is fixed even when its status changes. Archived bytes,
  // authorisation and receipt evidence are outside this pure model.
  return expected;
}
function verifyDocumentBytes(doc,bytes){
  const clean=document(doc);
  if(!Buffer.isBuffer(bytes)||bytes.length!==clean.bytes||
     bytes.subarray(0,5).toString('ascii')!=='%PDF-')
    throw invalid('PDF-Inhalt oder Groesse stimmt nicht');
  const actual=Buffer.from(digest(bytes),'hex');
  const expected=Buffer.from(clean.sha256,'hex');
  if(!timingSafeEqual(actual,expected))throw invalid('PDF-SHA-256 stimmt nicht');
  return true;
}
function requireEvidence(evidence){
  if(!object(evidence))throw invalid('Nachweis fehlt');
  return evidence;
}
function customerProof(pkg,evidence){
  const p=requireEvidence(evidence);
  // These flags are server-side assertions, NEVER trust them from browser JSON.
  if(p.portalTokenVerified!==true||p.representativeVerified!==true||
     p.explicitTermsConsent!==true||
     (pkg.avvRequired==='yes'&&p.explicitAvvConsent!==true))
    throw invalid('Kundenidentitaet oder Dokumentzustimmung nicht nachgewiesen');
  text(p.responseId,/^[A-Za-z0-9_-]{8,128}$/,'Antwortnachweis-ID');
  if(!object(p.documentHashes)||
     Object.keys(p.documentHashes).length!==pkg.documents.length)
    throw invalid('Kundenantwort ohne kompletten Dokumentbezug');
  if(pkg.avvRequired==='no'&&p.explicitAvvConsent===true)
    throw invalid('AVV-Zustimmung ohne erforderliche AVV');
  for(const doc of pkg.documents){
    if(p.documentHashes[doc.kind]!==doc.sha256)
      throw invalid('Kundenantwort bezieht sich nicht auf Versandversion');
  }
}
function nextOfferPackageState(pkg,event,evidence={}){
  verifyOfferPackage(pkg);
  text(event,/^[a-z_]{3,40}$/,'Ereignis');
  const from=pkg.status;
  let next='';
  if(event==='reserve_manual_send'&&from==='prepared'){
    if(requireEvidence(evidence).operatorApproved!==true)
      throw invalid('Explizite interne Versandfreigabe fehlt');
    next='sending';
  }else if(event==='gmail_receipt_confirmed'&&from==='sending'){
    const p=requireEvidence(evidence);
    if(p.providerReceiptVerified!==true||
       p.eventId!==pkg.sendEventId||
       !/^[A-Za-z0-9_-]{3,200}$/.test(p.messageId||''))
      throw invalid('Bestaetigter Gmail-Receipt fehlt');
    next='sent';
  }else if(event==='delivery_uncertain'&&from==='sending'){
    next='delivery_review';
  }else if(event==='manual_delivery_verified'&&from==='delivery_review'){
    if(requireEvidence(evidence).operatorReviewed!==true)
      throw invalid('Manuelle Mailboxpruefung fehlt');
    next='sent';
  }else if(event==='manual_not_sent_verified'&&from==='delivery_review'){
    if(requireEvidence(evidence).operatorReviewed!==true)
      throw invalid('Manuelle Mailboxpruefung fehlt');
    next='prepared';
  }else if(event==='record_customer_response'&&from==='sent'){
    customerProof(pkg,evidence);
    next='customer_response_recorded';
  }else if(event==='approve_internal_review'&&from==='customer_response_recorded'){
    if(requireEvidence(evidence).operatorApproved!==true)
      throw invalid('Interne Pruefung fehlt');
    next='awaiting_lszh_confirmation';
  }else if(event==='record_written_confirmation'&&from==='awaiting_lszh_confirmation'){
    const p=requireEvidence(evidence);
    if(p.confirmationSentVerified!==true||
       !/^[A-Za-z0-9_-]{3,200}$/.test(p.messageId||'')||
       !/^[a-f0-9]{64}$/.test(p.confirmationSha256||''))
      throw invalid('Schriftliche LSZH-Auftragsbestaetigung fehlt');
    next='confirmed';
  }else if(event==='customer_declined'&&from==='sent'){
    if(requireEvidence(evidence).representativeVerified!==true)
      throw invalid('Ablehnung muss einer berechtigten Person zugeordnet sein');
    next='declined';
  }else if(event==='cancel_before_send'&&from==='prepared'){
    if(requireEvidence(evidence).operatorApproved!==true)
      throw invalid('Interne Stornofreigabe fehlt');
    next='cancelled';
  }else{
    throw invalid('Ungueltiger Statusuebergang '+from+' / '+event);
  }
  return Object.freeze({...pkg,status:next});
}
module.exports={
  FORMAT_VERSION,KINDS,STATES,digest,
  prepareOfferPackage,verifyOfferPackage,verifyDocumentBytes,nextOfferPackageState
};
