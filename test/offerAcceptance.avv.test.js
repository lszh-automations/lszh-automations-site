'use strict';
const {test, after} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const envKeys = [
  'OFFER_ACCEPTANCE_ENABLED','OFFER_TERMS_APPROVED_VERSION','OFFER_AIRTABLE_PAT',
  'OFFER_PROOF_SALT','OFFER_DRIVE_SA_B64','OFFER_DRIVE_ARCHIVE_FOLDER_ID'
];
const savedEnv = Object.fromEntries(envKeys.map(k => [k, process.env[k]]));
const savedFetch = global.fetch;
after(() => {
  for (const k of envKeys) savedEnv[k] === undefined ? delete process.env[k] : process.env[k] = savedEnv[k];
  global.fetch = savedFetch;
});
Object.assign(process.env, {
  OFFER_ACCEPTANCE_ENABLED:'true', OFFER_TERMS_APPROVED_VERSION:'v1.0',
  OFFER_AIRTABLE_PAT:'TEST_ONLY_NOT_A_SECRET', OFFER_PROOF_SALT:'TEST_ONLY_SALT',
  OFFER_DRIVE_SA_B64:'TEST_ONLY_STUBBED_VERIFIER',
  OFFER_DRIVE_ARCHIVE_FOLDER_ID:'1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in'
});
const handler = require('../offerAcceptance');
const code = 'A'.repeat(40);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const q = 'a'.repeat(64), t = 'b'.repeat(64), a = 'c'.repeat(64);
function fakeFields(avv='Ja') {
  return {
    'AVV erforderlich':avv,
    'Online-Annahme rechtlich freigegeben':true, Status:'Versendet',
    'Vertragsunterlagen versendet':true,
    'Vertragsunterlagen akzeptiert':false,
    'Projektbedingungen Version':'v1.0',
    'Gültig bis':'2099-01-01',
    'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
    'Online-Annahme Offerten-Archivprüfung am':'2099-01-01T00:00:00Z',
    'Online-Annahme Offerten-SHA256':q,
    'Online-Annahme Bedingungen-SHA256':t,
    'Online-Annahme Offerten Drive ID':'1OfferArchiveValid123456789',
    'Online-Annahme Bedingungen Drive ID':'1TermsArchiveValid123456789',
    'Online-Annahme Link gesendet am':'2099-01-01T00:00:00Z',
    'Offertennummer':'TEST-ONLY-OFFER', 'Lead E-Mail':['test@example.invalid'],
    'AVV erforderlich':avv,
    ...(avv === 'Ja' ? {
      'Online-Annahme AVV-SHA256':a,
      'Online-Annahme AVV Drive ID':'1AVVArchiveValid12345678901',
      'Online-Annahme AVV-Version':'TEST_ONLY_AVV_v1'
    } : {})
  };
}
function setup(fields) {
  const changes = [];
  global.fetch = async(url,options={})=>{
    if(options.method==='PATCH'){
      changes.push(JSON.parse(options.body));
      return {ok:true, json:async()=>({id:'recTESTONLY000001'})};
    }
    assert.match(String(url), /filterByFormula=/);
    return {ok:true, json:async()=>({records:[{id:'recTESTONLY000001',fields}]})};
  };
  const archiveVerifier = {
    verify:async()=>true,
    pdf:async(_fields,kind)=>Buffer.from('%PDF-1.4\\nTEST_ONLY_'+kind)
  };
  const api=handler({
    send(res,status,data){res.status=status;res.json=JSON.parse(data);},
    readJson:async(req)=>req.body, sameOrigin:()=>true, rateLimited:()=>false,
    clientIp:()=> '127.0.0.1', archiveVerifier
  });
  const res=()=>({setHeader(){},writeHead(status,headers){this.status=status;this.headers=headers;},end(data){this.bytes=data;}});
  return {api,res,changes};
}
const payload={code,name:'Fiktive Testperson',email:'test@example.invalid',authorized:true,accept_quote:true,accept_terms:true,quote_sha256:q,terms_sha256:t};

test('AVV Ja preview declares third PDF and exact hash',async()=>{
  const h=setup(fakeFields('Ja'));const r=h.res();
  await h.api.preview({body:{code}},r);
  assert.equal(r.status,200);assert.equal(r.json.offer.avv_required,true);
  assert.equal(r.json.offer.avv_sha256,a);assert.equal(r.json.offer.avv_version,'TEST_ONLY_AVV_v1');
});
test('AVV Ja requires separate affirmative consent',async()=>{
  const h=setup(fakeFields('Ja'));const r=h.res();
  await h.api.accept({body:{...payload,avv_sha256:a,avv_version:'TEST_ONLY_AVV_v1'}},r);
  assert.equal(r.status,400);assert.equal(r.json.error,'avv_consent_required');assert.equal(h.changes.length,0);
});
test('AVV Ja rejects a mismatched hash before Airtable write',async()=>{
  const h=setup(fakeFields('Ja'));const r=h.res();
  await h.api.accept({body:{...payload,accept_avv:true,avv_sha256:'0'.repeat(64),avv_version:'TEST_ONLY_AVV_v1'}},r);
  assert.equal(r.status,409);assert.equal(r.json.error,'avv_document_changed');assert.equal(h.changes.length,0);
});
test('AVV Ja stores explicitly accepted, versioned AVV evidence',async()=>{
  const h=setup(fakeFields('Ja'));const r=h.res();
  await h.api.accept({body:{...payload,accept_avv:true,avv_sha256:a,avv_version:'TEST_ONLY_AVV_v1'},headers:{}},r);
  assert.equal(r.status,200);assert.equal(h.changes.length,1);
  assert.equal(h.changes[0].fields['Online-Annahme AVV ausdrücklich akzeptiert'],true);
  const ev=JSON.parse(h.changes[0].fields['Online-Annahme Nachweis']);
  assert.equal(ev.avv_pdf_sha256,a);assert.equal(ev.avv_explicitly_confirmed,true);
  assert.equal(ev.quote_confirmed,true);assert.equal(ev.terms_confirmed,true);
});
test('AVV Nein rejects unexpected AVV consent',async()=>{
  const h=setup(fakeFields('Nein'));const r=h.res();
  await h.api.accept({body:{...payload,accept_avv:true}},r);
  assert.equal(r.status,400);assert.equal(r.json.error,'unexpected_avv_consent');assert.equal(h.changes.length,0);
});
test('AVV Nein accepts only two PDFs and records no AVV consent',async()=>{
  const h=setup(fakeFields('Nein'));const r=h.res();
  await h.api.accept({body:{...payload},headers:{}},r);
  assert.equal(r.status,200);assert.equal(h.changes[0].fields['Online-Annahme AVV ausdrücklich akzeptiert'],false);
});
test('AVV Prüfen blocks preview by default',async()=>{
  const h=setup(fakeFields('Prüfen'));const r=h.res();
  await h.api.preview({body:{code}},r);
  assert.equal(r.status,404);assert.equal(h.changes.length,0);
});
test('AVV PDF can be downloaded only when required',async()=>{
  let h=setup(fakeFields('Nein')), r=h.res();
  await h.api.document({body:{code,which:'avv'}},r);
  assert.equal(r.status,404);
  h=setup(fakeFields('Ja'));r=h.res();
  await h.api.document({body:{code,which:'avv'}},r);
  assert.equal(r.status,200);assert.match(String(r.headers['Content-Disposition']),/LSZH_AVV_TEST_ONLY_AVV_v1/);
  assert.equal(r.bytes.subarray(0,5).toString(),'%PDF-');
});
