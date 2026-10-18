// Pure OFFLINE synthetic archive-observation reconciler for an uncertain
// "Drive PDF uploaded, Firestore receiptDriveId still null" failure.
// Not connected to Google Drive, Firestore writes, Make, Airtable or Gmail.
// Its output NEVER authorizes an archive creation or delivery.
import {inspectSyntheticReceiptRecovery} from './receiptRecoveryReview.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const MAX_BYTES=12*1024*1024;
const MAX_ITEMS=100;
const SOURCE='LSZH_SYNTHETIC_ARCHIVE_SCAN_OFFLINE_ONLY';

const deny=(reason)=>({
  status:'NO_GO',reason,manualReviewRequired:true,
  canCreateReceipt:false,canWriteFirestore:false,
  canWriteAirtable:false,canSendEmail:false
});
const review=(reason,additional={})=>({
  status:'REVIEW_ONLY',reason,...additional,manualReviewRequired:true,
  canCreateReceipt:false,canWriteFirestore:false,
  canWriteAirtable:false,canSendEmail:false
});

const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const plain=o=>o!==null && typeof o==='object' && !Array.isArray(o) &&
  Object.getPrototypeOf(o)===Object.prototype;
const allowedKeys=(value,names)=>
  plain(value)&&Object.keys(value).sort().join('|')===names.slice().sort().join('|');

/**
 * The caller must supply a complete synthetic observation fixture.
 * complete is NOT a provider guarantee; this function cannot prove absence.
 * There is no access-token, fetcher, mutation callback, or client.
 * Even one matching candidate is only a human investigation lead.
 */
export function reconcileSyntheticReceiptArchive(acceptedOffer,scan){
  const initial=inspectSyntheticReceiptRecovery(acceptedOffer);
  if(initial.status!=='REVIEW_ONLY')
    return deny('acceptance_marker_not_valid');
  if(!allowedKeys(scan,['source','complete','folderId','items']) ||
     scan.source!==SOURCE || scan.complete!==true ||
     !ID.test(scan.folderId||'') ||
     !Array.isArray(scan.items) || scan.items.length>MAX_ITEMS)
    return deny('archive_inventory_not_trustworthy');

  const marker=acceptedOffer.receiptReview;
  if(marker.receiptDriveId!==null || marker.emailProviderMessageId!==null)
    return deny('already_has_external_reference');

  const observedIds=new Set();
  const correlated=[];
  for(const file of scan.items){
    // Reject malformed entire inventories. Ignoring damaged entries could
    // incorrectly suggest no receipt was uploaded.
    if(!allowedKeys(file,[
      'id','name','mimeType','parents','size','sha256Checksum',
      'contentRestrictions','trashed','appProperties',
      'independentlyReadByteSha256','pdfHeaderVerified'
    ]) || !ID.test(file.id||'') || observedIds.has(file.id) ||
       typeof file.name!=='string' || file.name.length<1 ||
       file.name.length>200 || typeof file.mimeType!=='string' ||
       !Array.isArray(file.parents) || file.parents.length>4 ||
       file.parents.some(p=>!ID.test(p)) ||
       !Number.isSafeInteger(file.size) || file.size<8 ||
       file.size>MAX_BYTES ||
       !SHA.test(file.sha256Checksum||'') ||
       !SHA.test(file.independentlyReadByteSha256||'') ||
       typeof file.trashed!=='boolean' ||
       !Array.isArray(file.contentRestrictions) ||
       !file.contentRestrictions.every(r=>allowedKeys(r,['readOnly']) &&
         typeof r.readOnly==='boolean') ||
       typeof file.pdfHeaderVerified!=='boolean' ||
       !allowedKeys(file.appProperties,[
         'lszhSyntheticOnly','lszhReceiptReviewKey','lszhSourceRecordId'
       ]) || typeof file.appProperties.lszhSyntheticOnly!=='string' ||
       typeof file.appProperties.lszhReceiptReviewKey!=='string' ||
       typeof file.appProperties.lszhSourceRecordId!=='string')
      return deny('archive_inventory_invalid_entry');
    observedIds.add(file.id);
    if(file.appProperties.lszhReceiptReviewKey!==marker.idempotencyKey)continue;
    correlated.push(file);
  }

  if(correlated.length>1)
    return deny('ambiguous_multiple_correlated_receipts');
  if(correlated.length===0)
    // Even a complete API listing can be stale or insufficient.
    return review('no_correlated_receipt_not_proof_of_absence',{candidateCount:0});

  const candidate=correlated[0];
  const syntheticBinding=
    candidate.appProperties.lszhSyntheticOnly==='TRUE' &&
    candidate.appProperties.lszhSourceRecordId===acceptedOffer.source.recordId &&
    candidate.parents.length===1 && candidate.parents[0]===scan.folderId &&
    candidate.trashed===false &&
    candidate.mimeType==='application/pdf' &&
    candidate.contentRestrictions.some(x=>x.readOnly===true) &&
    candidate.sha256Checksum===candidate.independentlyReadByteSha256 &&
    candidate.pdfHeaderVerified===true &&
    candidate.name.startsWith('LSZH_TEST_ONLY_') &&
    candidate.name.endsWith('_NO_CONTRACT.pdf');
  if(!syntheticBinding)
    return deny('correlated_receipt_integrity_or_ownership_mismatch');

  // This synthetic fixture is not independently proved to exist in Drive.
  return review('one_correlated_candidate_requires_operator_review',{
    candidateCount:1,candidateId:candidate.id,
    candidateSha256:candidate.sha256Checksum,
    idempotencyKey:marker.idempotencyKey
  });
}
