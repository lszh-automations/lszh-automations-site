// Pure staging-only plan for ONE Drive files.create multipart upload.
// No Drive API calls, network clients, credentials, PDF generation or writes.
// The caller must separately authorise and implement a guarded future uploader.
import {createHash} from 'node:crypto';
import {inspectSyntheticReceiptRecovery} from './receiptRecoveryReview.mjs';

const DRIVE_ID=/^[A-Za-z0-9_-]{20,100}$/;
const MAX_MULTIPART_BYTES=5*1024*1024;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

function reject(){throw Error('synthetic_receipt_upload_plan_unavailable');}

/**
 * Build an immutable *description* of a future atomic media+metadata upload.
 * Google Drive files.create(uploadType=multipart) is needed: a later metadata
 * PATCH cannot prevent the crash window after an untagged PDF was uploaded.
 *
 * Public-to-authorised-apps "properties", rather than OAuth-client-private
 * "appProperties", let a future Make/Cloud Run verifier observe the same
 * non-sensitive correlation. They are NOT secrecy or uniqueness controls.
 */
export function buildSyntheticReceiptUploadPlan(acceptedOffer,{
  folderId,pdfBytes
}={}){
  if(inspectSyntheticReceiptRecovery(acceptedOffer).status!=='REVIEW_ONLY' ||
     typeof folderId!=='string'||!DRIVE_ID.test(folderId) ||
     !Buffer.isBuffer(pdfBytes) || pdfBytes.length<20 ||
     pdfBytes.length>MAX_MULTIPART_BYTES ||
     pdfBytes.subarray(0,5).toString('ascii')!=='%PDF-' ||
     !pdfBytes.subarray(Math.max(0,pdfBytes.length-1024))
       .toString('latin1').includes('%%EOF'))reject();

  const key=acceptedOffer.receiptReview.idempotencyKey;
  const byteSha256=sha(pdfBytes);
  const metadata={
    name:'LSZH_TEST_ONLY_'+key+'_NO_CONTRACT.pdf',
    mimeType:'application/pdf',
    parents:[folderId],
    properties:{
      lszhSyntheticOnly:'TRUE',
      lszhReceiptReviewKey:key,
      lszhSourceRecordId:acceptedOffer.source.recordId,
      lszhReceiptPdfSha256:byteSha256
    }
  };
  return {
    purpose:'SYNTHETIC_RECEIPT_UPLOAD_PLAN_ONLY',
    action:'DO_NOT_UPLOAD',
    method:'POST',
    endpoint:'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    uploadType:'multipart',
    mediaMimeType:'application/pdf',
    byteLength:pdfBytes.length,
    byteSha256,
    metadata,
    requiresManualApproval:true,
    requiresVerifiedSingleWriter:true,
    canUpload:false,
    canCreateReceipt:false,
    canWriteFirestore:false,
    canWriteAirtable:false,
    canSendEmail:false
  };
}
