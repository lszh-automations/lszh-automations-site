'use strict';
// Entirely synthetic API fixture. No Airtable credentials or external network.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=s=>createHash('sha256').update(s).digest('hex');
const ORIGIN='https://api.airtable.com';
const BASE='appzJiskpAdaR1HEv',TABLE='tbljeIUoD7wwKuSmS';
const REC='rec12345678901234';
const TIME='2026-10-18T12:00:00.000Z';
const HASH={quote:'a'.repeat(64),terms:'b'.repeat(64),avv:'c'.repeat(64)};
const DOC={quote:'1LSZHSyntheticOnlyQuoteFile000000000001',
  terms:'1LSZHSyntheticOnlyTermsFile000000000001',
  avv:'1LSZHSyntheticOnlyAVVFile000000000001'};

async function accepted(mode){
  const {buildSyntheticReceiptReview}=await import(
    '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
  const s={
    tokenHash:sha('NEVER_ISSUED_SYNTHETIC_TOKEN'),
    source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:BASE,tableId:TABLE,recordId:REC},
    status:'accepted',approved:true,revision:2,acceptedAt:TIME,
    termsVersion:'TEST_v1.0_RC1',
    recipientEmail:'test@example.invalid',
    offerNumber:'TEST_WRITEBACK_20261018_NO_CONTRACT',
    details:{company:'Synthetic Company',
      ...(mode==='Ja'?{avvVersion:'TEST_ONLY_AVV_RC1'}:{})},
    bundle:{avv_required:mode,
      quote:{id:DOC.quote,sha256:HASH.quote},
      terms:{id:DOC.terms,sha256:HASH.terms},
      ...(mode==='Ja'?{avv:{id:DOC.avv,sha256:HASH.avv}}:{})},
    downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
  };
  s.evidence={
    method:'lszh_b2b_staging_v1',
    offer_number:s.offerNumber,
    accepted_at_utc:TIME,
    authorized_confirmed:true,quote_confirmed:true,terms_confirmed:true,
    name:'Synthetischer Testkunde',email:s.recipientEmail,
    quote_pdf_sha256:HASH.quote,terms_pdf_sha256:HASH.terms,
    avv_required:mode==='Ja',avv_confirmed:mode==='Ja',
    avv_pdf_sha256:mode==='Ja'?HASH.avv:null,
    avv_version:mode==='Ja'?'TEST_ONLY_AVV_RC1':null
  };
  s.receiptReview=buildSyntheticReceiptReview(s,s.evidence,TIME);
  return s;
}
function fakeApi(offer,{mutateRead,mutatePatch}={}){
  let saved={id:REC,fields:{
    Offertennummer:offer.offerNumber,Status:'Entwurf',
    'Online-Annahme Token-Hash':offer.tokenHash,
    'AVV erforderlich':offer.bundle.avv_required,
    'Online-Annahme rechtlich freigegeben':false,
    'Vertragsunterlagen akzeptiert':false,
    'Internal unrelated CRM data':'KEEP',
    'Online-Annahme Bestätigung gesendet am':undefined
  }};
  if(mutateRead)mutateRead(saved);
  const calls=[];
  async function fetcher(url,opts){
    const u=new URL(url);
    assert.equal(u.origin,ORIGIN);
    assert.equal(u.pathname,'/v0/'+BASE+'/'+TABLE+'/'+REC);
    assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.Authorization,'Bearer SYNTHETIC_FAKE_TOKEN_ONLY');
    assert.equal(opts.headers['Content-Type'],'application/json');
    assert.ok(['GET','PATCH'].includes(opts.method));
    calls.push(opts.method);
    if(opts.method==='PATCH'){
      const body=JSON.parse(opts.body);
      assert.deepEqual(Object.keys(body),['fields']);
      assert.equal('Online-Annahme rechtlich freigegeben' in body.fields,false);
      assert.equal('Online-Annahme Offerten-Archivstatus' in body.fields,false);
      assert.equal('Online-Annahme Beleg Drive ID' in body.fields,false);
      assert.equal('Online-Annahme Bestätigung gesendet am' in body.fields,false);
      saved.fields={...saved.fields,...body.fields};
      if(mutatePatch)mutatePatch(saved);
    } else assert.equal(opts.body,undefined);
    return Response.json(saved);
  }
  return {fetcher,calls,current:()=>structuredClone(saved)};
}
const api=async(fake)=>{
  const {createSyntheticAirtableRestClient}=await import(
    '../cloud-run/offer-portal-staging/receiptAirtableWriteback.mjs');
  return createSyntheticAirtableRestClient({
    fetcher:fake.fetcher,accessToken:'SYNTHETIC_FAKE_TOKEN_ONLY'});
};
const apply=async(subject,client)=>{
  const {executeSyntheticAirtableAcceptanceWriteback}=await import(
    '../cloud-run/offer-portal-staging/receiptAirtableWriteback.mjs');
  return executeSyntheticAirtableAcceptanceWriteback(subject,client);
};

test('synthetic AVV Ja/Nein: GET -> one PATCH -> retry GET with no second PATCH',async()=>{
  for(const mode of ['Ja','Nein']){
    const s=await accepted(mode),fake=fakeApi(s),client=await api(fake);
    const first=await apply(s,client);
    assert.equal(first.result,'synthetic_fields_patched');
    assert.equal(first.patched,true);
    assert.equal(first.sourceRecordId,REC);
    assert.equal(first.receiptReviewKey,s.receiptReview.idempotencyKey);
    assert.deepEqual(fake.calls,['GET','PATCH']);
    const fields=fake.current().fields;
    assert.equal(fields.Status,'Angenommen');
    assert.equal(fields['Vertragsunterlagen akzeptiert'],true);
    assert.equal(fields['Online-Annahme Zeitstempel'],TIME);
    assert.equal(fields['Online-Annahme Vertragsversion'],'TEST_v1.0_RC1');
    assert.equal(fields['Online-Annahme E-Mail'],'test@example.invalid');
    assert.equal(fields['Online-Annahme Person'],'Synthetischer Testkunde');
    assert.equal(fields['Online-Annahme Offerten Drive ID'],DOC.quote);
    assert.equal(fields['Online-Annahme Bedingungen Drive ID'],DOC.terms);
    assert.equal(fields['Online-Annahme AVV ausdrücklich akzeptiert'],mode==='Ja');
    assert.equal(fields['Online-Annahme AVV Drive ID'],mode==='Ja'?DOC.avv:undefined);
    assert.equal(fields['Online-Annahme AVV-Version'],mode==='Ja'?'TEST_ONLY_AVV_RC1':undefined);
    assert.equal(fields['Internal unrelated CRM data'],'KEEP');
    assert.equal(fields['Online-Annahme rechtlich freigegeben'],false);
    assert.equal(fields['Online-Annahme Bestätigung gesendet am'],undefined);
    const second=await apply(s,client);
    assert.deepEqual(second,{result:'already_identical',sourceRecordId:REC,patched:false});
    assert.deepEqual(fake.calls,['GET','PATCH','GET']);
  }
});

test('existing or conflicting Airtable data are never overwritten',async()=>{
  const s=await accepted('Ja');
  const changes=[
    fields=>{fields.Status='Versendet';},
    fields=>{fields.Offertennummer='TEST_OTHER_NO_CONTRACT';},
    fields=>{fields['Online-Annahme Token-Hash']='f'.repeat(64);},
    fields=>{fields['AVV erforderlich']='Nein';},
    fields=>{fields['Online-Annahme rechtlich freigegeben']=true;},
    fields=>{fields['Online-Annahme Bestätigung in Bearbeitung']=true;},
    fields=>{fields['Online-Annahme Beleg Drive ID']='already-exists';},
    fields=>{fields['Online-Annahme Person']='Unexpected existing acceptance';},
    fields=>{fields['Online-Annahme AVV-Version']='WRONG';},
    fields=>{fields['Vertragsunterlagen akzeptiert']=true;}
  ];
  for(const change of changes){
    const fake=fakeApi(s,{mutateRead:r=>change(r.fields)});
    await assert.rejects(()=>apply(s,await api(fake)),
      /synthetic_airtable_writeback_/);
    assert.deepEqual(fake.calls,['GET']);
  }
});

test('accepted-but-incomplete record and wrong provider acknowledgement halt',async()=>{
  const s=await accepted('Nein');
  const acceptedRecord=fakeApi(s,{mutateRead:r=>r.fields.Status='Angenommen'});
  await assert.rejects(()=>apply(s,await api(acceptedRecord)),
    /synthetic_airtable_writeback_already_accepted_mismatch/);
  assert.deepEqual(acceptedRecord.calls,['GET']);

  const corrupted=fakeApi(s,{mutatePatch:r=>r.fields['Online-Annahme Zeitstempel']='WRONG'});
  await assert.rejects(()=>apply(s,await api(corrupted)),
    /synthetic_airtable_writeback_patch_unconfirmed/);
  assert.deepEqual(corrupted.calls,['GET','PATCH']);
});

test('no real customer or malformed acceptance ever reaches provider',async()=>{
  const s=await accepted('Ja');
  const fake=fakeApi(s);
  for(const change of [
    x=>{x.source.kind='REAL_CUSTOMER';},
    x=>{x.recipientEmail='customer@company.com';},
    x=>{x.evidence.avv_version='WRONG';},
    x=>{x.receiptReview.idempotencyKey='f'.repeat(64);},
    x=>{x.evidence.email='different@example.invalid';},
    x=>{x.downstream.email='enabled';}
  ]){
    const x=structuredClone(s);change(x);
    await assert.rejects(()=>apply(x,await api(fake)),/unavailable/);
  }
  assert.deepEqual(fake.calls,[]);
});
