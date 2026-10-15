'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const create=require('../offerAcceptance');
const token='A'.repeat(43);
const H='a'.repeat(64), K='b'.repeat(64), A='c'.repeat(64);
const baseRecord={id:'recABCDEFGHIJKLMN',fields:{
  Status:'Versendet',
  'Online-Annahme rechtlich freigegeben':true,
  Offertennummer:'TEST-001',
  'Vertragsunterlagen versendet':true,
  'Vertragsunterlagen akzeptiert':false,
  'Projektbedingungen Version':'v1.0',
  'Gültig bis':'2099-12-31',
  'Lead Firma':['Test GmbH'],
  'Lead E-Mail':['test@example.com'],
  Leistung:'Business Automation',
  'Einmalig CHF':1000,
  'Monatlich CHF':99,
  Zahlungsmodell:'50% Start / 50% Abnahme',
  'Online-Annahme Offerten-PDF':'https://example.com/frozen-offer.pdf',
  'Online-Annahme Bedingungen-PDF':'https://example.com/frozen-terms.pdf',
  'Online-Annahme Offerten-SHA256':H,
  'Online-Annahme Bedingungen-SHA256':K,
  'AVV erforderlich':'Nein',
  'Online-Annahme AVV Drive ID':'1AVVDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  'Online-Annahme AVV-SHA256':A,
  'Online-Annahme AVV-Version':'TEST_ONLY_AVV',
  'Online-Annahme Offerten Drive ID':'1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  'Online-Annahme Bedingungen Drive ID':'1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  'Online-Annahme Link gesendet am':'2026-10-13T17:00:00.000Z',
  'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
  'Online-Annahme Offerten-Archivprüfung am':'2026-10-13T17:00:00.000Z'
}};
function make(handler,verifier={verify:async()=>true,pdf:async()=>Buffer.from('%PDF-1.4\nunit-test')},commitAtomic=null){
  const api=create({send:(res,status,body)=>{res.code=status;res.body=JSON.parse(body);},
    readJson:async req=>req.body,sameOrigin:()=>true,rateLimited:()=>false,clientIp:()=> '192.0.2.1',
    archiveVerifier:verifier,commitAtomic});
  const res={setHeader(){},writeHead(code,headers){this.code=code;this.headers=headers;},end(bytes){this.bytes=bytes;}};
  return handler(api,{body:{},headers:{'user-agent':'UnitTest/1.0'}},res);
}
function initEnv() {
  process.env.OFFER_ACCEPTANCE_ENABLED='true';
  process.env.OFFER_TERMS_APPROVED_VERSION='v1.0';
  process.env.OFFER_AIRTABLE_PAT='fake-test-token';
  process.env.OFFER_PROOF_SALT='fake-test-salt';
  process.env.OFFER_DRIVE_SA_B64='fake-base64-creds';
  process.env.OFFER_CONFIRMATION_WEBHOOK='https://example.net/make-hook';
}
const original=global.fetch;
test('fail closed when not approved',async()=>{
  delete process.env.OFFER_ACCEPTANCE_ENABLED;
  const res=await make(async (api,req,r)=>{req.body={code:token};await api.preview(req,r);return r;});
  assert.equal(res.code,503);
});
test('reject invalid token without Airtable request',async()=>{
  initEnv();
  global.fetch=async()=>{throw Error('unexpected outbound request');};
  const res=await make(async(api,req,r)=>{req.body={code:'bad'};await api.preview(req,r);return r;});
  assert.equal(res.code,404);
});
test('review only released offer and PDFs',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[baseRecord]});
  const res=await make(async(api,req,r)=>{req.body={code:token};await api.preview(req,r);return r;});
  assert.equal(res.code,200);
  assert.equal(res.body.offer.terms_version,'v1.0');
  assert.equal(res.body.offer.company,'Test GmbH');
});
test('cannot accept without explicit checkboxes',async()=>{
  initEnv();
  global.fetch=async()=>{throw Error('unexpected fetch');};
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',authorized:false,accept_terms:true};
    await api.accept(req,r);return r;
  },undefined,async()=>({accepted:true}));
  assert.equal(res.code,400);
});
test('reject if client confirms a different document hash',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[baseRecord]});
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,quote_sha256:'c'.repeat(64),terms_sha256:K};
    await api.accept(req,r);return r;
  },undefined,async()=>({accepted:true}));
  assert.equal(res.code,409);
});
test('no atomic adapter means no acceptance and no Airtable PATCH even if flags are set',async()=>{
  initEnv();
  let reads=0,writes=0;
  global.fetch=async(url,options={})=>{
    if(options.method==='PATCH')writes++;
    else reads++;
    return Response.json({records:[baseRecord]});
  };
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,quote_sha256:H,terms_sha256:K};
    await api.accept(req,r);return r;
  });
  assert.equal(res.code,503);
  assert.equal(writes,0);
  assert.equal(reads,0);
});
test('only an injected atomic callback may commit; never direct Airtable PATCH or send email',async()=>{
  initEnv();
  const order=[],claims=[];
  global.fetch=async(url,options={})=>{
    assert.equal(options.method,undefined,'Only Airtable GET allowed');
    order.push('airtable_read');
    return Response.json({records:[baseRecord]});
  };
  const docs=[];
  const verifier={verify:async()=>true,pdf:async(fields,which)=>{docs.push(which);return Buffer.from('%PDF-1.4\nunit-test');}};
  const commit=async data=>{order.push('atomic_commit');claims.push(data);return {accepted:true};};
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,quote_sha256:H,terms_sha256:K};
    await api.accept(req,r);return r;
  },verifier,commit);
  assert.equal(res.code,200);
  assert.deepEqual(order,['airtable_read','atomic_commit']);
  assert.deepEqual(docs,['quote','terms']);
  assert.equal(claims[0].offerId,baseRecord.id);
  assert.equal(claims[0].evidence.terms_pdf_sha256,K);
  assert.equal(claims[0].evidence.ip_pseudonym.length,64);
  assert.equal(claims[0].actor.acceptAvv,false);
});
test('reject already accepted quote',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[{...baseRecord,fields:{...baseRecord.fields,Status:'Angenommen'}}]});
  const res=await make(async(api,req,r)=>{req.body={code:token};await api.preview(req,r);return r;});
  assert.equal(res.code,404);
  global.fetch=original;
});

test('block preview when archived bytes have changed',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[baseRecord]});
  const res=await make(async(api,req,r)=>{req.body={code:token};await api.preview(req,r);return r;},
    {verify:async()=>false,pdf:async()=>{throw Error('must not download');}});
  assert.equal(res.code,409);
  assert.equal(res.body.error,'archive_changed');
});
test('block acceptance before Airtable PATCH if archived hash does not match',async()=>{
  initEnv();
  let writes=0;
  global.fetch=async(url,options={})=>{
    if(options.method==='PATCH')writes++;
    return Response.json({records:[baseRecord]});
  };
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,quote_sha256:H,terms_sha256:K};
    await api.accept(req,r);return r;
  },{verify:async()=>false},async()=>({accepted:true}));
  assert.equal(res.code,409);
  assert.equal(writes,0);
});
test('download PDF only through valid scoped offer token',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[baseRecord]});
  const res=await make(async(api,req,r)=>{
    req.body={code:token,which:'quote'};
    await api.document(req,r);return r;
  });
  assert.equal(res.code,200);
  assert.equal(res.headers['Content-Type'],'application/pdf');
  assert.ok(res.bytes.subarray(0,5).toString()==='%PDF-');
  assert.match(res.headers['Content-Disposition'],/TEST-001.pdf/);
});
test('reject document requests with invalid kind',async()=>{
  initEnv();
  global.fetch=async()=>{throw Error('unexpected external network');};
  const res=await make(async(api,req,r)=>{
    req.body={code:token,which:'internal'};
    await api.document(req,r);return r;
  });
  assert.equal(res.code,404);
});

test('required AVV preview includes version, digest and mandatory mode',async()=>{
  initEnv();
  const avvRecord={...baseRecord,fields:{...baseRecord.fields,'AVV erforderlich':'Ja'}};
  global.fetch=async()=>Response.json({records:[avvRecord]});
  const res=await make(async(api,req,r)=>{req.body={code:token};await api.preview(req,r);return r;});
  assert.equal(res.code,200);
  assert.equal(res.body.offer.avv_required,true);
  assert.equal(res.body.offer.avv_version,'TEST_ONLY_AVV');
  assert.equal(res.body.offer.avv_sha256,A);
});
test('required AVV lacking ID, digest or version is not eligible',async()=>{
  initEnv();
  for(const field of ['Online-Annahme AVV Drive ID','Online-Annahme AVV-SHA256','Online-Annahme AVV-Version']){
    const f={...baseRecord.fields,'AVV erforderlich':'Ja',[field]:''};
    global.fetch=async()=>Response.json({records:[{...baseRecord,fields:f}]});
    const res=await make(async(api,req,r)=>{req.body={code:token};await api.preview(req,r);return r;});
    assert.equal(res.code,404);
  }
});
test('required AVV cannot be accepted without own checkbox or matching digest',async()=>{
  initEnv();
  const avvRecord={...baseRecord,fields:{...baseRecord.fields,'AVV erforderlich':'Ja'}};
  global.fetch=async()=>Response.json({records:[avvRecord]});
  let committed=0;
  const commit=async()=>{committed++;return {accepted:true};};
  const makeRequest=async body=>make(async(api,req,r)=>{req.body=body;await api.accept(req,r);return r;},
    undefined,commit);
  const basic={code:token,name:'Test Person',email:'test@example.com',
    authorized:true,accept_terms:true,quote_sha256:H,terms_sha256:K,avv_sha256:A};
  const missing=await makeRequest({...basic,accept_avv:false});
  assert.equal(missing.code,400);
  const mismatch=await makeRequest({...basic,accept_avv:true,avv_sha256:'f'.repeat(64)});
  assert.equal(mismatch.code,409);
  assert.equal(committed,0);
});
test('required AVV is checked byte-for-byte and evidence is passed to atomic callback',async()=>{
  initEnv();
  const avvRecord={...baseRecord,fields:{...baseRecord.fields,'AVV erforderlich':'Ja'}};
  global.fetch=async()=>Response.json({records:[avvRecord]});
  let evidence=null;
  const docs=[];
  const verifier={verify:async()=>true,pdf:async(f,which)=>{docs.push(which);return Buffer.from('%PDF-1.4\nsample');}};
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,accept_avv:true,
      quote_sha256:H,terms_sha256:K,avv_sha256:A};
    await api.accept(req,r);return r;
  },verifier,async data=>{evidence=data.evidence;return {accepted:true};});
  assert.equal(res.code,200);
  assert.deepEqual(docs,['quote','terms','avv']);
  assert.equal(evidence.avv_confirmed,true);
  assert.equal(evidence.avv_pdf_sha256,A);
  assert.equal(evidence.avv_version,'TEST_ONLY_AVV');
});
test('AVV PDF downloadable only for AVV-required eligible offers',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[baseRecord]});
  let res=await make(async(api,req,r)=>{
    req.body={code:token,which:'avv'};
    await api.document(req,r);return r;
  });
  assert.equal(res.code,404);
  const avvRecord={...baseRecord,fields:{...baseRecord.fields,'AVV erforderlich':'Ja'}};
  global.fetch=async()=>Response.json({records:[avvRecord]});
  res=await make(async(api,req,r)=>{
    req.body={code:token,which:'avv'};
    await api.document(req,r);return r;
  });
  assert.equal(res.code,200);
  assert.match(res.headers['Content-Disposition'],/LSZH_AVV_TEST-001_TEST_ONLY_AVV.pdf/);
});
