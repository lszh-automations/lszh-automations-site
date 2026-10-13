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
  'Online-Annahme Bedingungen-SHA256':K
}};
function make(handler){
  const api=create({send:(res,status,body)=>{res.code=status;res.body=JSON.parse(body);},
    readJson:async req=>req.body,sameOrigin:()=>true,rateLimited:()=>false,clientIp:()=> '192.0.2.1'});
  const res={setHeader(){}};
  return handler(api,{body:{},headers:{'user-agent':'UnitTest/1.0'}},res);
}
function initEnv() {
  process.env.OFFER_ACCEPTANCE_ENABLED='true';
  process.env.OFFER_TERMS_APPROVED_VERSION='v1.0';
  process.env.OFFER_AIRTABLE_PAT='fake-test-token';
  process.env.OFFER_PROOF_SALT='fake-test-salt';
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
  assert.deepEqual(order,['read','write','confirmation']);
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
