'use strict';
// LSZH STAGING AUDIT-ONLY: pure, side-effect-free evidence assessment.
// Never issues tokens, changes Drive retention/IAM, accepts offers, invokes
// Firestore, grants access or sends an email. No secrets or network clients.
const crypto=require('node:crypto');
const HEX=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const REV=/^[A-Za-z0-9_-]{10,100}$/;
const REC=/^rec[A-Za-z0-9]{14}$/;
const EXPECTED_KINDS=Object.freeze(['offer','terms','avv']);
const ALLOWED_TEST_ORIGIN='LSZH_SYNTHETIC_STAGING_20261015_NO_MAIL';
const MAX_AGE_MS=60*60*1000;
const POLICY='LSZH_ARCHIVE_AUDIT_READ_ONLY_V1';

function assessSyntheticArchiveReadiness({record,files,folder,identity,observedAt,now}={}){
 const blockers=[],warnings=[];
 const fail=(code)=>{if(!blockers.includes(code))blockers.push(code);};
 if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
    !Number.isFinite(Date.parse(String(observedAt||'')))||
    Date.parse(observedAt)>now.getTime()||
    now.getTime()-Date.parse(observedAt)>MAX_AGE_MS)
    fail('EVIDENCE_STALE_OR_MISSING');
 const r=record||{};
 if(!REC.test(String(r.id||''))||r.testOnly!==true||
    !/^DEMO-OFF-[A-Za-z0-9-]{10,60}$/.test(String(r.offerNumber||''))||
    r.status!=='Entwurf'||r.avvRequired!==true||
    !/^TEST_ONLY_/.test(String(r.termsVersion||''))||
    !/^TEST_ONLY_/.test(String(r.avvVersion||''))||
    !/^fake-[a-z0-9-]+@example\.invalid$/.test(String(r.recipientEmail||''))||
    r.sourceMarker!==ALLOWED_TEST_ORIGIN||
    r.deliveryEnabled!==false||r.acceptanceEnabled!==false||
    r.legallyApproved!==false)
    fail('SYNTHETIC_RECORD_NOT_BLOCKED');
 if(!folder||!ID.test(String(folder.id||''))||folder.shared!==false||
    folder.privateConfirmed!==true)
    fail('ARCHIVE_FOLDER_PRIVACY_UNVERIFIED');
 if(!files||Object.keys(files).sort().join(',')!==
    EXPECTED_KINDS.slice().sort().join(','))
    fail('DOCUMENT_SET_MISMATCH');
 const manifestFiles=r.documents||{};
 if(Object.keys(manifestFiles).sort().join(',')!==
    EXPECTED_KINDS.slice().sort().join(','))
    fail('RECORD_DOCUMENT_REFERENCES_INCOMPLETE');

 for(const kind of EXPECTED_KINDS){
  const file=files?.[kind]||{},e=manifestFiles[kind]||{};
  if(!ID.test(String(file.id||''))||!ID.test(String(e.id||''))||
     file.id!==e.id||file.mimeType!=='application/pdf'||
     file.shared!==false||file.parentId!==folder?.id||
     !Number.isSafeInteger(file.byteLength)||file.byteLength<12||
     String(file.metadataSize)!==String(file.byteLength)||
     !HEX.test(String(file.sha256||''))||
     !HEX.test(String(e.sha256||''))||
     !crypto.timingSafeEqual(Buffer.from(file.sha256||'','hex'),
       Buffer.from(e.sha256||'','hex'))||
     file.pdfBytesVerified!==true)
    fail('PDF_BYTES_OR_METADATA_MISMATCH_'+kind.toUpperCase());
  if(!REV.test(String(file.revisionBefore||''))||
     file.revisionBefore!==file.revisionAfter||
     String(file.revisionSize)!==String(file.byteLength))
    fail('PDF_REVISION_UNSTABLE_'+kind.toUpperCase());
  if(file.keepForever!==true)
    fail('PDF_REVISION_NOT_RETAINED_'+kind.toUpperCase());
 }
 // Source of truth for service identity is a future independent IAM review.
 // These untrusted booleans are NOT authorization; status is informational.
 const i=identity||{};
 if(i.userManagedServiceAccountVerified!==true||
    !/^[a-z][a-z0-9-]{4,29}@lszh-automations\.iam\.gserviceaccount\.com$/.test(
      String(i.serviceAccountEmail||''))||
    i.cloudRunService!=='lszh-offer-acceptance-staging'||
    i.secretlessWorkloadIdentity!==true||
    i.googleDriveArchiveReaderVerified!==true||
    i.firestoreNamedDbReadOnlyVerified!==true||
    i.airtableReadOnlySecretVerified!==true||
    i.exportedPrivateKeyPresent!==false)
    fail('SERVER_IDENTITY_NOT_VERIFIED');
 if(blockers.some(s=>s.startsWith('PDF_REVISION_NOT_RETAINED')))
    warnings.push('Drive keepForever is not a legal WORM/retention guarantee.');
 warnings.push('Bucket Lock is irreversible and requires separate approval; never activate from this report.');
 warnings.push('Airtable and Firestore do not share a transaction; contract freeze and legal RC1/AVV approval remain separate.');
 const status=blockers.length===0?'READY_FOR_HUMAN_REVIEW':'BLOCKED';
 return Object.freeze({policy:POLICY,status,
    blockers:Object.freeze(blockers),
    warnings:Object.freeze(warnings),
    integrityVerifiedForReference:!blockers.some(x=>x.startsWith('PDF_BYTES')||
      x.startsWith('PDF_REVISION_UNSTABLE')||
      x==='DOCUMENT_SET_MISMATCH'||x==='RECORD_DOCUMENT_REFERENCES_INCOMPLETE'),
    permissionToWriteCloudFirestore:false,
    permissionToModifyDriveRetention:false,
    permissionToAcceptContract:false,
    permissionToDeliverEmail:false,
    source:'UNTRUSTED_EVIDENCE_ASSESSMENT_ONLY'});
}
module.exports={assessSyntheticArchiveReadiness,POLICY};
