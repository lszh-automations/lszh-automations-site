'use strict';
// Offline-only failure simulation: synthetic Drive observations are inert data.
// Never creates an archive file, updates Firestore, invokes Make or sends mail.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=value=>createHash('sha256').update(value).digest('hex');
const FOLDER='1LSZHBusinessSyntheticArchive000000000001';
const A='1LSZHBusinessSyntheticReceipt00000000001';
const B='1LSZHBusinessSyntheticReceipt00000000002';
const HASH=sha(Buffer.from('%PDF-1.4\nSYNTHETIC_NO_CONTRACT\n%%EOF'));
const SOURCE='LSZH_SYNTHETIC_ARCHIVE_SCAN_OFFLINE_ONLY';
const DISABLED={airtable:'disabled',proofPdf:'disabled',email:'disabled'};

async function subject(mode='Ja'){
  const {buildSyntheticReceiptReview}=await import(
    '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
  const acceptedAt='2026-10-18T11:59:59.000Z';
  const docSha={quote:'a'.repeat(64),terms:'b'.repeat(64),avv:'c'.repeat(64)};
  const offer={
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
    tokenHash:sha('SYNTHETIC-NOT-A-REAL-ISSUED-TOKEN'),
    recipientEmail:'synthetic@example.invalid',
    status:'accepted',approved:true,revision:2,
    acceptedAt,termsVersion:'TEST_v1.0_RC1',
    offerNumber:'TEST_RECEIPT_RECOVERY_20261018_NO_CONTRACT',
    bundle:{avv_required:mode,
      quote:{id:'1LSZHQuoteSyntheticOnly000000000000000',sha256:docSha.quote},
      terms:{id:'1LSZHTermsSyntheticOnly000000000000000',sha256:docSha.terms},
      ...(mode==='Ja'?{avv:{id:'1LSZHAvvSyntheticOnly000000000000000',sha256:docSha.avv}}:{})
    },
    downstream:{...DISABLED}
  };
  const evidence={accepted_at_utc:acceptedAt,
    authorized_confirmed:true,terms_confirmed:true,
    quote_pdf_sha256:docSha.quote,terms_pdf_sha256:docSha.terms,
    avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
    avv_pdf_sha256:mode==='Ja'?docSha.avv:null};
  offer.evidence=evidence;
  offer.receiptReview=buildSyntheticReceiptReview(offer,evidence,acceptedAt);
  return offer;
}
function candidate(offer,id=A){
  return {
    id,name:'LSZH_TEST_ONLY_'+offer.receiptReview.idempotencyKey+'_NO_CONTRACT.pdf',
    mimeType:'application/pdf',parents:[FOLDER],size:36,
    sha256Checksum:HASH,independentlyReadByteSha256:HASH,
    pdfHeaderVerified:true,trashed:false,
    contentRestrictions:[{readOnly:true}],
    properties:{lszhSyntheticOnly:'TRUE',
      lszhReceiptReviewKey:offer.receiptReview.idempotencyKey,
      lszhSourceRecordId:offer.source.recordId,
      lszhReceiptPdfSha256:HASH}
  };
}
function scan(items=[],other={}){
  return {source:SOURCE,complete:true,folderId:FOLDER,items,...other};
}
const evaluate=async(offer,observation)=>{
  const {reconcileSyntheticReceiptArchive}=await import(
    '../cloud-run/offer-portal-staging/receiptArchiveReconciliation.mjs');
  return reconcileSyntheticReceiptArchive(offer,observation);
};
function inert(result){
  assert.equal(result.manualReviewRequired,true);
  for(const field of ['canCreateReceipt','canWriteFirestore',
    'canWriteAirtable','canSendEmail'])
    assert.equal(result[field],false,field+' must remain blocked');
}
test('simulated crash after Drive upload but before Firestore ID save: one lead, never replay',async()=>{
  for(const mode of ['Ja','Nein']){
    const offer=await subject(mode);
    const obs=scan([candidate(offer)]);
    const one=await evaluate(offer,obs);
    const twice=await evaluate(offer,structuredClone(obs));
    assert.deepEqual(one,twice);
    assert.equal(one.status,'REVIEW_ONLY');
    assert.equal(one.reason,'one_correlated_candidate_requires_operator_review');
    assert.equal(one.candidateCount,1);
    assert.equal(one.candidateId,A);
    assert.equal(one.candidateSha256,HASH);
    assert.equal(one.idempotencyKey,offer.receiptReview.idempotencyKey);
    assert.equal(offer.receiptReview.receiptDriveId,null);
    assert.equal(offer.receiptReview.emailProviderMessageId,null);
    assert.deepEqual(offer.downstream,DISABLED);
    inert(one);
  }
});
test('no matching file is NOT proof that it was never uploaded',async()=>{
  const offer=await subject();
  for(const observation of [
    scan([]),
    scan([{...candidate(offer),id:B,
      properties:{...candidate(offer).properties,
        lszhReceiptReviewKey:'f'.repeat(64)}}])
  ]){
    const result=await evaluate(offer,observation);
    assert.equal(result.status,'REVIEW_ONLY');
    assert.equal(result.reason,'no_correlated_receipt_not_proof_of_absence');
    assert.equal(result.candidateCount,0);inert(result);
  }
});
test('two correlated receipts and repeated Drive IDs fail-closed',async()=>{
  const offer=await subject();
  const dup=await evaluate(offer,scan([candidate(offer,A),candidate(offer,B)]));
  assert.equal(dup.status,'NO_GO');
  assert.equal(dup.reason,'ambiguous_multiple_correlated_receipts');
  inert(dup);
  const repeated=await evaluate(offer,scan([candidate(offer,A),candidate(offer,A)]));
  assert.equal(repeated.reason,'archive_inventory_invalid_entry');
  inert(repeated);
});
test('correlated candidate must match business folder, PDF bytes and strict synthetic markers',async()=>{
  const offer=await subject();
  const changes=[
    c=>{c.parents=['1LSZHWrongFolder0000000000000000000'];},
    c=>{c.parents=[];},
    c=>{c.trashed=true;},
    c=>{c.mimeType='image/png';},
    c=>{c.contentRestrictions=[{readOnly:false}];},
    c=>{c.sha256Checksum='f'.repeat(64);},
    c=>{c.independentlyReadByteSha256='e'.repeat(64);},
    c=>{c.pdfHeaderVerified=false;},
    c=>{c.properties.lszhSourceRecordId='rec00000000000000';},
    c=>{c.properties.lszhSyntheticOnly='FALSE';},
    c=>{c.name='Real_Invoice.pdf';},
    c=>{c.name='LSZH_TEST_ONLY_OTHER_NO_CONTRACT.pdf';},
    c=>{c.properties.lszhReceiptPdfSha256='d'.repeat(64);}
  ];
  for(const change of changes){
    const c=candidate(offer);change(c);
    const result=await evaluate(offer,scan([c]));
    assert.equal(result.status,'NO_GO');
    assert.equal(result.reason,'correlated_receipt_integrity_or_ownership_mismatch');
    inert(result);
  }
});
test('incomplete, malformed or oversized inventories never imply safe resumption',async()=>{
  const offer=await subject();
  const cases=[
    null,{},scan([],{complete:false}),scan([],{source:'GOOGLE_DRIVE_REAL'}),
    scan([],{folderId:'bad'}),
    scan([null]),
    scan([{...candidate(offer),size:-1}]),
    scan([{...candidate(offer),unknown:'surprise'}]),
    scan([candidate(offer)],{extra:'unexpected'}),
    scan(Array.from({length:101},(_,i)=>({...candidate(offer),
      id:'1LSZHFakeReceipt'+String(i).padStart(25,'0')})))
  ];
  for(const obs of cases){
    const result=await evaluate(offer,obs);
    assert.equal(result.status,'NO_GO');
    inert(result);
  }
});
test('wrong, stale or mutated acceptance cannot be reconciled',async()=>{
  const offer=await subject();
  const changes=[
    o=>{o.status='sent';},
    o=>{o.source.kind='REAL_CUSTOMER';},
    o=>{o.receiptReview.idempotencyKey='0'.repeat(64);},
    o=>{o.receiptReview.archiveResult='UPLOADED';},
    o=>{o.receiptReview.receiptDriveId=A;},
    o=>{o.receiptReview.downstream.email='ready';},
    o=>{o.evidence.quote_pdf_sha256='f'.repeat(64);}
  ];
  for(const change of changes){
    const copy=structuredClone(offer);change(copy);
    const result=await evaluate(copy,scan([candidate(offer)]));
    assert.equal(result.status,'NO_GO');inert(result);
  }
});
