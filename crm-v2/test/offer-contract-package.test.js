'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  digest,FORMAT_VERSION,prepareOfferPackage,verifyOfferPackage,
  verifyDocumentBytes,nextOfferPackageState
}=require('../offer-contract-package');
function pdfBytes(label){
  return Buffer.from('%PDF-1.4\n'+label+'\n'+'FAKE TEST PDF DATA.'.repeat(25),'utf8');
}
function doc(kind){
  const bytes=pdfBytes(kind);
  return {
    kind,version:'RC1_TEST_ONLY',archiveFileId:'test_archive_'+kind+'_20261025',
    sha256:digest(bytes),filename:'TEST_ONLY_'+kind+'.pdf',bytes:bytes.length
  };
}
function payload(avvRequired='no'){
  return {
    offerId:'offer_test_1',offerNumber:'1000',revision:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY_OFFER_SNAPSHOT')),
    avvRequired,avvAnnexesConfirmed:avvRequired==='yes',
    documents:avvRequired==='yes'?[doc('offer'),doc('terms'),doc('avv')]:[doc('offer'),doc('terms')]
  };
}
function expectedDocHashes(p){
  return Object.fromEntries(p.documents.map(x=>[x.kind,x.sha256]));
}
function customerEvidence(p){
  return {
    portalTokenVerified:true,representativeVerified:true,
    explicitTermsConsent:true,explicitAvvConsent:p.avvRequired==='yes',
    responseId:'test_customer_response_01',
    documentHashes:expectedDocHashes(p)
  };
}
function move(p,event,evidence={}){return nextOfferPackageState(p,event,evidence);}
function sent(p){
  const sending=move(p,'reserve_manual_send',{operatorApproved:true});
  return move(sending,'gmail_receipt_confirmed',{
    providerReceiptVerified:true,eventId:p.sendEventId,messageId:'gmail_test_1000'
  });
}
test('a two-PDF no-AVV package is deterministic, ordered, hash-bound, and read only',()=>{
  const original=payload('no');
  const one=prepareOfferPackage(original);
  assert.equal(one.schemaVersion,FORMAT_VERSION);
  assert.equal(one.packageId,'pkg_offer_test_1_r1');
  assert.equal(one.sendEventId,'contract_send_pkg_offer_test_1_r1');
  assert.equal(one.status,'prepared');
  assert.deepEqual(one.documents.map(x=>x.kind),['offer','terms']);
  assert.equal(one.packageSha256.length,64);
  assert.equal(one.packageSha256,prepareOfferPackage(original).packageSha256);
  assert.equal(verifyOfferPackage(one).packageSha256,one.packageSha256);
  assert.ok(Object.isFrozen(one));
  assert.ok(Object.isFrozen(one.documents));
  assert.ok(Object.isFrozen(one.documents[0]));
  assert.equal(original.documents.length,2);
});
test('a customer-specific AVV path requires exactly three distinct PDF documents',()=>{
  const input=payload('yes');
  const p=prepareOfferPackage(input);
  assert.deepEqual(p.documents.map(x=>x.kind),['offer','terms','avv']);
  assert.equal(p.avvAnnexesConfirmed,true);
  const shuffled=prepareOfferPackage({...input,documents:[input.documents[2],input.documents[1],input.documents[0]]});
  assert.equal(shuffled.packageSha256,p.packageSha256);
  assert.throws(()=>prepareOfferPackage({...input,avvAnnexesConfirmed:false}),/AVV-Anlagen/);
  assert.throws(()=>prepareOfferPackage({...input,documents:input.documents.slice(0,2)}),/Dokumentanzahl/);
});
test('AVV review, missing classification and contradictory no-AVV material fail closed',()=>{
  assert.throws(()=>prepareOfferPackage({...payload('no'),avvRequired:'review'}),/AVV-Einstufung/);
  assert.throws(()=>prepareOfferPackage({...payload('no'),avvRequired:''}),/AVV-Einstufung/);
  assert.throws(()=>prepareOfferPackage({...payload('no'),avvAnnexesConfirmed:true}),/AVV-Anlagen/);
  assert.throws(()=>prepareOfferPackage({...payload('no'),documents:[...payload('no').documents,doc('avv')]}),/Dokumentanzahl/);
});
test('duplicate document kinds, archive IDs or content hashes are rejected',()=>{
  const base=payload('yes');
  assert.throws(()=>prepareOfferPackage({
    ...base,documents:[base.documents[0],base.documents[1],{...base.documents[2],kind:'offer'}]
  }),/Dokumentarten/);
  assert.throws(()=>prepareOfferPackage({
    ...base,documents:[base.documents[0],base.documents[1],{...base.documents[2],archiveFileId:base.documents[0].archiveFileId}]
  }),/eindeutig/);
  assert.throws(()=>prepareOfferPackage({
    ...base,documents:[base.documents[0],base.documents[1],{...base.documents[2],sha256:base.documents[0].sha256}]
  }),/eindeutig/);
});
test('invalid filenames, SHA-256, revision, offer IDs and injection fields are rejected',()=>{
  const base=payload();
  const invalidDocument=[
    {...doc('offer'),filename:'../contract.pdf'},
    {...doc('offer'),filename:'file.txt'},
    {...doc('offer'),sha256:'not_sha'},
    {...doc('offer'),archiveFileId:'bad'},
    {...doc('offer'),bytes:-1},
    {...doc('offer'),secretToken:'do-not-accept'}
  ];
  for(const invalid of invalidDocument){
    assert.throws(()=>prepareOfferPackage({
      ...base,documents:[invalid,doc('terms')]
    }),/Vertragspaket ungueltig/);
  }
  assert.throws(()=>prepareOfferPackage({...base,offerId:'../../../data'}),/Offerten-ID/);
  assert.throws(()=>prepareOfferPackage({...base,revision:0}),/Paketrevision/);
  assert.throws(()=>prepareOfferPackage({...base,customerEmail:'secret@example.com'}),/nicht erlaubte Felder/);
});
test('archived PDF bytes must match metadata size, magic and content SHA exactly',()=>{
  const d=doc('offer');
  assert.equal(verifyDocumentBytes(d,pdfBytes('offer')),true);
  assert.throws(()=>verifyDocumentBytes(d,pdfBytes('terms')),/PDF-Inhalt oder Groesse|SHA-256/);
  assert.throws(()=>verifyDocumentBytes(d,Buffer.alloc(d.bytes,0x41)),/PDF-Inhalt/);
  assert.throws(()=>verifyDocumentBytes({...d,sha256:digest(Buffer.from('bad'))},pdfBytes('offer')),/SHA-256/);
});
test('signed package metadata rejects tampering and future schema mismatch',()=>{
  const p=prepareOfferPackage(payload('yes'));
  assert.throws(()=>verifyOfferPackage({...p,offerNumber:'1001'}),/Snapshot-Pruefsumme/);
  assert.throws(()=>verifyOfferPackage({...p,documents:p.documents.slice(0,2)}),/Dokumentanzahl/);
  assert.throws(()=>verifyOfferPackage({...p,packageSha256:'0'.repeat(64)}),/Snapshot-Pruefsumme/);
  assert.throws(()=>verifyOfferPackage({...p,sendEventId:'wrong'}),/Snapshot-Pruefsumme/);
  assert.throws(()=>verifyOfferPackage({...p,schemaVersion:2}),/Schema-Version/);
  assert.throws(()=>verifyOfferPackage({...p,status:'Angenommen'}),/Paketstatus/);
});
test('manual send needs operator approval and valid package',()=>{
  const p=prepareOfferPackage(payload());
  assert.throws(()=>move(p,'reserve_manual_send'),/Versandfreigabe/);
  const sending=move(p,'reserve_manual_send',{operatorApproved:true});
  assert.equal(sending.status,'sending');
  assert.equal(p.status,'prepared');
  assert.equal(sending.packageSha256,p.packageSha256);
  assert.throws(()=>move(sending,'reserve_manual_send',{operatorApproved:true}),/Statusuebergang/);
});
test('send receipt must match immutable package event ID, otherwise manual review',()=>{
  const p=prepareOfferPackage(payload());
  const sending=move(p,'reserve_manual_send',{operatorApproved:true});
  assert.throws(()=>move(sending,'gmail_receipt_confirmed',{
    providerReceiptVerified:true,eventId:'contract_send_other',messageId:'gmail_test_001'
  }),/Gmail-Receipt/);
  assert.throws(()=>move(sending,'gmail_receipt_confirmed',{
    providerReceiptVerified:false,eventId:p.sendEventId,messageId:'gmail_test_001'
  }),/Gmail-Receipt/);
  const review=move(sending,'delivery_uncertain');
  assert.equal(review.status,'delivery_review');
  assert.throws(()=>move(review,'reserve_manual_send',{operatorApproved:true}),/Statusuebergang/);
  assert.throws(()=>move(review,'manual_delivery_verified'),/Mailboxpruefung/);
  assert.equal(move(review,'manual_delivery_verified',{operatorReviewed:true}).status,'sent');
  assert.equal(move(review,'manual_not_sent_verified',{operatorReviewed:true}).status,'prepared');
});
test('customer response cannot become an automatic binding agreement',()=>{
  const p=prepareOfferPackage(payload('no'));
  const s=sent(p);
  assert.equal(s.status,'sent');
  const response=move(s,'record_customer_response',customerEvidence(p));
  assert.equal(response.status,'customer_response_recorded');
  assert.throws(()=>move(response,'record_written_confirmation',{
    confirmationSentVerified:true,messageId:'gmail_test_002',confirmationSha256:digest('test')
  }),/Statusuebergang/);
  assert.throws(()=>move(response,'approve_internal_review'),/Interne Pruefung/);
  const approved=move(response,'approve_internal_review',{operatorApproved:true});
  assert.equal(approved.status,'awaiting_lszh_confirmation');
  assert.throws(()=>move(approved,'record_written_confirmation',{
    confirmationSentVerified:false,messageId:'gmail_test_002',confirmationSha256:digest('test')
  }),/Auftragsbestaetigung/);
  assert.equal(move(approved,'record_written_confirmation',{
    confirmationSentVerified:true,messageId:'gmail_test_002',confirmationSha256:digest('test')
  }).status,'confirmed');
});
test('no incomplete, mismatched or unverified customer consent can be recorded',()=>{
  const p=prepareOfferPackage(payload('yes'));
  const s=sent(p);
  const good=customerEvidence(p);
  const invalid=[
    {...good,portalTokenVerified:false},
    {...good,representativeVerified:false},
    {...good,explicitTermsConsent:false},
    {...good,explicitAvvConsent:false},
    {...good,documentHashes:{offer:good.documentHashes.offer,terms:good.documentHashes.terms}},
    {...good,documentHashes:{...good.documentHashes,avv:'0'.repeat(64)}},
    {...good,responseId:'x'}
  ];
  for(const proof of invalid)
    assert.throws(()=>move(s,'record_customer_response',proof),/Vertragspaket ungueltig/);
  const no=prepareOfferPackage(payload('no'));
  assert.throws(()=>move(sent(no),'record_customer_response',{
    ...customerEvidence(no),explicitAvvConsent:true
  }),/AVV-Zustimmung/);
});
test('withdrawal, customer rejection and confirmed contracts are terminal in Phase A',()=>{
  const p=prepareOfferPackage(payload());
  assert.equal(move(p,'cancel_before_send',{operatorApproved:true}).status,'cancelled');
  assert.throws(()=>move(p,'cancel_before_send'),/Stornofreigabe/);
  const rejected=move(sent(p),'customer_declined',{representativeVerified:true});
  assert.equal(rejected.status,'declined');
  assert.throws(()=>move(rejected,'reserve_manual_send',{operatorApproved:true}),/Statusuebergang/);
  assert.throws(()=>move(p,'record_customer_response',customerEvidence(p)),/Statusuebergang/);
});

test('staging contract module is not wired into the productive API or send path',()=>{
  const fs=require('node:fs');
  const path=require('node:path');
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const sender=fs.readFileSync(path.join(__dirname,'../offer-send.js'),'utf8');
  const cloudRecords=fs.readFileSync(path.join(__dirname,'../cloud-records.js'),'utf8');
  const pattern=/require\s*\(\s*['"]\.\/offer-contract-package['"]\s*\)/;
  assert.doesNotMatch(server,pattern);
  assert.doesNotMatch(sender,pattern);
  assert.doesNotMatch(cloudRecords,pattern);
});
