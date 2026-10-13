'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const create=require('../offerAcceptance');
const token='A'.repeat(43);
const H='a'.repeat(64), K='b'.repeat(64);
const baseRecord={id:'recABCDEFGHIJKLMN',fields:{
  Status:'Versendet',
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
  'Online-Annahme Offerten Drive ID':'1ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  'Online-Annahme Bedingungen Drive ID':'1BCDEFGHIJKLMNOPQRSTUVWXYZ1234567890abcdef',
  'Online-Annahme Link gesendet am':'2026-10-13T17:00:00.000Z',
  'Online-Annahme Offerten-Archivstatus':'VERIFIZIERT',
  'Online-Annahme Offerten-Archivprüfung am':'2026-10-13T17:00:00.000Z'
}};
function make(handler,verifier={verify:async()=>true,pdf:async()=>Buffer.from('%PDF-1.4\nunit-test')}){
  const api=create({send:(res,status,body)=>{res.code=status;res.body=JSON.parse(body);},
    readJson:async req=>req.body,sameOrigin:()=>true,rateLimited:()=>false,clientIp:()=> '192.0.2.1',
    archiveVerifier:verifier});
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
  });
  assert.equal(res.code,400);
});
test('reject if client confirms a different document hash',async()=>{
  initEnv();
  global.fetch=async()=>Response.json({records:[baseRecord]});
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,quote_sha256:'c'.repeat(64),terms_sha256:K};
    await api.accept(req,r);return r;
  });
  assert.equal(res.code,409);
});
test('store audit fields before dispatching confirmation webhook',async()=>{
  initEnv();
  const order=[],updates=[];
  global.fetch=async(url,options={})=>{
    const u=String(url);
    if(u.includes('api.airtable.com') && !options.method){
      order.push('read');return Response.json({records:[baseRecord]});
    }
    if(u.includes('api.airtable.com') && options.method==='PATCH'){
      order.push('write');
      updates.push(JSON.parse(options.body));
      return Response.json({id:baseRecord.id,fields:updates[0].fields});
    }
    if(u==='https://example.net/make-hook'){
      order.push('confirmation');return Response.json({ok:true});
    }
    throw Error('unexpected '+u);
  };
  const res=await make(async(api,req,r)=>{
    req.body={code:token,name:'Test Person',email:'test@example.com',
      authorized:true,accept_terms:true,quote_sha256:H,terms_sha256:K};
    await api.accept(req,r);return r;
  });
  assert.equal(res.code,200);
  assert.deepEqual(order,['read','write']);
  assert.equal(res.body.confirmation_email_pending,true);
  assert.equal(updates[0].fields.Status,'Angenommen');
  assert.equal(updates[0].fields['Vertragsunterlagen akzeptiert'],true);
  assert.equal(updates[0].fields['Online-Annahme Person'],'Test Person');
  const evidence=JSON.parse(updates[0].fields['Online-Annahme Nachweis']);
  assert.equal(evidence.terms_pdf_sha256,K);
  assert.equal(evidence.ip_pseudonym.length,64);
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
  },{verify:async()=>false});
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
