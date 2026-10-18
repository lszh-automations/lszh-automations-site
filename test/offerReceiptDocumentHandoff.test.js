'use strict';
// The Make document handoff is tested without Google, Make, Airtable or email.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=value=>createHash('sha256').update(value).digest('hex');
const FOLDER='1LSZHBusinessSyntheticArchive000000000001';
const HASH={quote:'a'.repeat(64),terms:'b'.repeat(64),avv:'c'.repeat(64)};
const at='2026-10-18T12:00:00.000Z';

async function accepted(mode='Ja'){
  const {buildSyntheticReceiptReview}=await import(
    '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
  const s={
    tokenHash:sha('SYNTHETIC_NEVER_ISSUED'),
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',
      tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901234'},
    status:'accepted',approved:true,revision:2,acceptedAt:at,
    recipientEmail:'synthetic@example.invalid',
    offerNumber:'TEST_RECEIPT_DOCUMENT_20261018_NO_CONTRACT',
    termsVersion:'TEST_v1.0_RC1',
    details:{
      company:'Synthetic GmbH <img src=x onerror=alert(1)>',
      ...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV_v1.0'}:{})
    },
    bundle:{
      avv_required:mode,
      quote:{sha256:HASH.quote},terms:{sha256:HASH.terms},
      ...(mode==='Ja'?{avv:{sha256:HASH.avv}}:{})
    },
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
  s.evidence={
    method:'lszh_b2b_staging_v1',accepted_at_utc:at,
    authorized_confirmed:true,quote_confirmed:true,terms_confirmed:true,
    name:'Synthetischer Testkunde',email:s.recipientEmail,
    quote_pdf_sha256:HASH.quote,terms_pdf_sha256:HASH.terms,
    avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
    avv_pdf_sha256:mode==='Ja'?HASH.avv:null,
    avv_version:mode==='Ja'?'TEST_ONLY_AVV_v1.0':null
  };
  s.receiptReview=buildSyntheticReceiptReview(s,s.evidence,at);
  return s;
}

test('AVV yes/no: complete, escaped handoff for existing Make Google Docs module',async()=>{
  const {prepareSyntheticReceiptDocument}=await import(
    '../cloud-run/offer-portal-staging/receiptDocumentHandoff.mjs');
  for(const mode of ['Ja','Nein']){
    const s=await accepted(mode);
    const p=prepareSyntheticReceiptDocument(s,{folderId:FOLDER});
    assert.equal(p.action,'DO_NOT_CREATE');
    assert.equal(p.module,'google-docs:createADocument');
    assert.deepEqual(Object.keys(p.mapper).sort(),
      ['content','destination','folderId','footer','header','name'].sort());
    assert.equal(p.mapper.folderId,FOLDER);
    assert.equal(p.mapper.destination,'drive');
    assert.equal(p.mapper.header,false);
    assert.equal(p.mapper.footer,false);
    assert.match(p.mapper.name,/^LSZH_TEST_ONLY_TEST_/);
    assert.ok(p.mapper.content.includes('TESTDATEN'));
    assert.ok(p.mapper.content.includes('Synthetischer Testkunde'));
    assert.ok(p.mapper.content.includes(HASH.quote));
    assert.ok(p.mapper.content.includes(HASH.terms));
    assert.ok(p.mapper.content.includes('TEST_v1.0_RC1'));
    assert.ok(!p.mapper.content.includes('<img src=x'));
    assert.ok(p.mapper.content.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.equal(p.mapper.content.includes('AVV-Version:'),mode==='Ja');
    assert.equal(p.mapper.content.includes(HASH.avv),mode==='Ja');
    assert.equal(p.mapper.content.includes('AVV: separat'),mode==='Ja');
    for(const flag of ['canCreateDocument','canExportPdf','canUpload',
      'canWriteAirtable','canSendEmail'])
      assert.equal(p[flag],false);
    const serialized=JSON.stringify(p);
    assert.ok(!serialized.includes(s.tokenHash));
    assert.ok(!serialized.includes(s.source.recordId));
    assert.deepEqual(p,prepareSyntheticReceiptDocument(structuredClone(s),{folderId:FOLDER}));
  }
});

test('no document for missing/altered acceptance, AVV version or customer data',async()=>{
  const {prepareSyntheticReceiptDocument}=await import(
    '../cloud-run/offer-portal-staging/receiptDocumentHandoff.mjs');
  for(const mode of ['Ja','Nein']){
    const s=await accepted(mode);
    const mutations=[
      o=>{o.status='sent';},
      o=>{o.source.kind='REAL_CUSTOMER';},
      o=>{o.evidence.quote_pdf_sha256='f'.repeat(64);},
      o=>{o.evidence.quote_confirmed=false;},
      o=>{o.evidence.method='other';},
      o=>{o.evidence.email='another@example.invalid';},
      o=>{o.details.company='';},
      o=>{o.receiptReview.idempotencyKey='f'.repeat(64);},
      o=>{o.evidence.accepted_at_utc='2026-10-18T13:00:00.000Z';}
    ];
    if(mode==='Ja')mutations.push(
      o=>{o.evidence.avv_version=null;},
      o=>{o.evidence.avv_version='OTHER';},
      o=>{o.evidence.avv_pdf_sha256='d'.repeat(64);}
    );
    else mutations.push(
      o=>{o.evidence.avv_version='NOT_EXPECTED';},
      o=>{o.evidence.avv_pdf_sha256='c'.repeat(64);}
    );
    for(const change of mutations){
      const altered=structuredClone(s);change(altered);
      assert.throws(()=>prepareSyntheticReceiptDocument(altered,{folderId:FOLDER}),
        /synthetic_receipt_document_unavailable/);
    }
    assert.throws(()=>prepareSyntheticReceiptDocument(s,{folderId:'invalid'}),
      /synthetic_receipt_document_unavailable/);
  }
});
