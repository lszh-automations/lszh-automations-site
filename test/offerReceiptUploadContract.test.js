'use strict';
// No network or Google credentials: only a proposed, inert Drive upload contract.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=x=>createHash('sha256').update(x).digest('hex');
const FOLDER='1LSZHBusinessSyntheticArchive000000000001';
const PDF=Buffer.from('%PDF-1.4\n% LSZH SYNTHETIC ONLY - NO CONTRACT\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const base=async(mode='Ja')=>{
  const {buildSyntheticReceiptReview}=await import(
    '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
  const time='2026-10-18T12:00:00.000Z';
  const quote='a'.repeat(64),terms='b'.repeat(64),avv='c'.repeat(64);
  const offer={
    tokenHash:sha('not-a-real-customer-token'),
    status:'accepted',approved:true,revision:2,acceptedAt:time,
    termsVersion:'TEST_v1.0_RC1',recipientEmail:'synthetic@example.invalid',
    offerNumber:'TEST_RECEIPT_UPLOAD_20261018_NO_CONTRACT',
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
    bundle:{avv_required:mode,quote:{sha256:quote},
      terms:{sha256:terms},...(mode==='Ja'?{avv:{sha256:avv}}:{})},
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
  offer.evidence={
    accepted_at_utc:time,authorized_confirmed:true,terms_confirmed:true,
    quote_pdf_sha256:quote,terms_pdf_sha256:terms,
    avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
    avv_pdf_sha256:mode==='Ja'?avv:null
  };
  offer.receiptReview=buildSyntheticReceiptReview(offer,offer.evidence,time);
  return offer;
};
const makePlan=async(offer,pdfBytes=PDF,folderId=FOLDER)=>{
  const {buildSyntheticReceiptUploadPlan}=await import(
    '../cloud-run/offer-portal-staging/receiptUploadContract.mjs');
  return buildSyntheticReceiptUploadPlan(offer,{pdfBytes,folderId});
};
test('both AVV modes yield stable Drive multipart metadata and never an upload',async()=>{
  for(const mode of ['Ja','Nein']){
    const offer=await base(mode);
    const first=await makePlan(offer),second=await makePlan(structuredClone(offer));
    assert.deepEqual(first,second);
    assert.equal(first.action,'DO_NOT_UPLOAD');
    assert.equal(first.method,'POST');
    assert.equal(first.uploadType,'multipart');
    assert.equal(first.endpoint,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    assert.equal(first.byteSha256,sha(PDF));
    assert.equal(first.byteLength,PDF.byteLength);
    assert.equal(first.mediaMimeType,'application/pdf');
    assert.deepEqual(first.metadata,{
      name:'LSZH_TEST_ONLY_'+offer.receiptReview.idempotencyKey+'_NO_CONTRACT.pdf',
      mimeType:'application/pdf',parents:[FOLDER],
      properties:{
        lszhSyntheticOnly:'TRUE',
        lszhReceiptReviewKey:offer.receiptReview.idempotencyKey,
        lszhSourceRecordId:offer.source.recordId,
        lszhReceiptPdfSha256:sha(PDF)
      }
    });
    assert.equal('appProperties' in first.metadata,false);
    assert.equal(first.requiresManualApproval,true);
    assert.equal(first.requiresVerifiedSingleWriter,true);
    for(const flag of ['canUpload','canCreateReceipt','canWriteFirestore',
      'canWriteAirtable','canSendEmail'])
      assert.equal(first[flag],false);
    const raw=JSON.stringify(first);
    assert.ok(!raw.includes(offer.recipientEmail));
    assert.ok(!raw.includes(offer.tokenHash));
    assert.ok(!raw.includes('%PDF-'));
  }
});
test('proposed upload metadata is recognized after simulated upload crash',async()=>{
  const {reconcileSyntheticReceiptArchive}=await import(
    '../cloud-run/offer-portal-staging/receiptArchiveReconciliation.mjs');
  for(const mode of ['Ja','Nein']){
    const offer=await base(mode);
    const plan=await makePlan(offer);
    const candidate={
      id:'1LSZHBusinessSyntheticReceipt00000000001',
      name:plan.metadata.name,mimeType:plan.metadata.mimeType,
      parents:plan.metadata.parents.slice(),size:plan.byteLength,
      sha256Checksum:plan.byteSha256,
      independentlyReadByteSha256:sha(PDF),
      pdfHeaderVerified:true,trashed:false,
      contentRestrictions:[{readOnly:true}],
      properties:{...plan.metadata.properties}
    };
    const observation={source:'LSZH_SYNTHETIC_ARCHIVE_SCAN_OFFLINE_ONLY',
      complete:true,folderId:FOLDER,items:[candidate]};
    const checked=reconcileSyntheticReceiptArchive(offer,observation);
    assert.equal(checked.status,'REVIEW_ONLY');
    assert.equal(checked.reason,'one_correlated_candidate_requires_operator_review');
    assert.equal(checked.canCreateReceipt,false);
    assert.equal(checked.canSendEmail,false);
    assert.equal(checked.candidateId,candidate.id);

    const untagged=structuredClone(candidate);
    delete untagged.properties;
    const rejected=reconcileSyntheticReceiptArchive(offer,
      {...observation,items:[untagged]});
    assert.equal(rejected.status,'NO_GO');
    const duplicate=reconcileSyntheticReceiptArchive(offer,
      {...observation,items:[candidate,{...candidate,
        id:'1LSZHBusinessSyntheticReceipt00000000002'}]});
    assert.equal(duplicate.status,'NO_GO');
  }
});
test('different PDF bytes keep stable correlation but produce conflicting byte hashes',async()=>{
  const offer=await base();
  const first=await makePlan(offer);
  const pdf2=Buffer.from('%PDF-1.4\n% DIFFERENT SYNTHETIC CONTENT\n%%EOF\n');
  const next=await makePlan(offer,pdf2);
  assert.equal(first.metadata.name,next.metadata.name);
  assert.equal(first.metadata.properties.lszhReceiptReviewKey,
    next.metadata.properties.lszhReceiptReviewKey);
  assert.notEqual(first.byteSha256,next.byteSha256);
  assert.notEqual(first.metadata.properties.lszhReceiptPdfSha256,
    next.metadata.properties.lszhReceiptPdfSha256);
  assert.equal(next.canUpload,false);
});
test('broken provenance and already persisted external references forbid a plan',async()=>{
  const offer=await base();
  const mutations=[
    o=>{o.status='sent';},o=>{o.source.kind='REAL';},
    o=>{o.recipientEmail='person@example.com';},
    o=>{o.downstream.email='enabled';},
    o=>{o.receiptReview.receiptDriveId='1LSZHAlreadyStoredReceipt00000000000000';},
    o=>{o.receiptReview.idempotencyKey='f'.repeat(64);},
    o=>{o.evidence.terms_pdf_sha256='e'.repeat(64);}
  ];
  for(const mut of mutations){
    const s=structuredClone(offer);mut(s);
    await assert.rejects(()=>makePlan(s),/synthetic_receipt_upload_plan_unavailable/);
  }
});
test('invalid folder, too large, non PDF, missing EOF and nonbuffer inputs fail closed',async()=>{
  const offer=await base();
  const variants=[
    {folderId:'bad',pdfBytes:PDF},
    {folderId:FOLDER,pdfBytes:Buffer.alloc(5*1024*1024+1,65)},
    {folderId:FOLDER,pdfBytes:Buffer.from('not a PDF at all')},
    {folderId:FOLDER,pdfBytes:Buffer.from('%PDF-1.4\nmissing end marker')},
    {folderId:FOLDER,pdfBytes:'%PDF-1.4\n%%EOF'},
    {folderId:FOLDER,pdfBytes:undefined}
  ];
  const {buildSyntheticReceiptUploadPlan}=await import(
    '../cloud-run/offer-portal-staging/receiptUploadContract.mjs');
  for(const opts of variants)
    assert.throws(()=>buildSyntheticReceiptUploadPlan(offer,opts),
      /synthetic_receipt_upload_plan_unavailable/);
});
