'use strict';
// Only fake Airtable fetch + synthetic acceptance data. No Cloud or network.
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const sha=v=>createHash('sha256').update(v).digest('hex');
const folder='appzJiskpAdaR1HEv',table='tbljeIUoD7wwKuSmS';
const rec='rec12345678901234',at='2026-10-18T12:00:00.000Z';
const env={K_SERVICE:'lszh-offer-portal-staging',
  LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED:'true',
  LSZH_AIRTABLE_ACCESS_TOKEN:'SYNTHETIC_FAKE_BUSINESS_TOKEN'};
const config={enabled:true};

async function offer(){
 const {buildSyntheticReceiptReview}=await import(
   '../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
 const s={
   tokenHash:sha('never-sent-synthetic-token'),
   source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:folder,tableId:table,recordId:rec},
   status:'accepted',revision:2,approved:true,acceptedAt:at,
   offerNumber:'TEST_RUNTIME_AIRTABLE_20261018_NO_CONTRACT',
   termsVersion:'TEST_v1.0_RC1',recipientEmail:'synthetic@example.invalid',
   details:{company:'Test Only GmbH'},
   bundle:{avv_required:'Nein',
     quote:{id:'1SyntheticQuoteFile0000000000000000000001',sha256:'a'.repeat(64)},
     terms:{id:'1SyntheticTermsFile0000000000000000000001',sha256:'b'.repeat(64)}},
   downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}
 };
 s.evidence={
   method:'lszh_b2b_staging_v1',offer_number:s.offerNumber,
   accepted_at_utc:at,authorized_confirmed:true,quote_confirmed:true,
   terms_confirmed:true,avv_confirmed:false,avv_required:false,
   quote_pdf_sha256:s.bundle.quote.sha256,
   terms_pdf_sha256:s.bundle.terms.sha256,avv_pdf_sha256:null,avv_version:null,
   name:'Synthetische Testperson',email:s.recipientEmail
 };
 s.receiptReview=buildSyntheticReceiptReview(s,s.evidence,at);
 return s;
}

test('business Airtable connector remains off by default and requires valid staging config',async()=>{
 const {createStagingAirtableCallback}=await import(
   '../cloud-run/offer-portal-staging/stagingAirtableRuntime.mjs');
 assert.equal(createStagingAirtableCallback({config,env:{},fetcher:()=>{throw Error('not called')}}),undefined);
 assert.equal(createStagingAirtableCallback({
   config,env:{...env,LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED:'false'},
   fetcher:()=>{throw Error('not called')}
 }),undefined);
 for(const args of [
   {config:{enabled:false},env,fetcher:()=>{}},
   {config,env:{...env,K_SERVICE:'another-service'},fetcher:()=>{}},
   {config,env:{...env,LSZH_AIRTABLE_ACCESS_TOKEN:undefined},fetcher:()=>{}},
   {config,env,fetcher:null}
 ])assert.throws(()=>createStagingAirtableCallback(args),
   /staging_airtable_runtime_invalid|synthetic_airtable_writeback_client_required/);
});

test('Cloud staging opt-in callback executes one fake Airtable GET/PATCH after acceptance',async()=>{
 const {createStagingAirtableCallback}=await import(
   '../cloud-run/offer-portal-staging/stagingAirtableRuntime.mjs');
 const s=await offer();
 const row={id:rec,fields:{
   Offertennummer:s.offerNumber,Status:'Entwurf',
   'Online-Annahme Token-Hash':s.tokenHash,'AVV erforderlich':'Nein',
   'Online-Annahme rechtlich freigegeben':false,
   'CRM untouched':'unchanged'
 }};
 const methods=[];
 const fetcher=async(url,options)=>{
   const u=new URL(url);
   assert.equal(u.origin,'https://api.airtable.com');
   assert.equal(u.pathname,'/v0/'+folder+'/'+table+'/'+rec);
   assert.equal(options.headers.Authorization,
     'Bearer SYNTHETIC_FAKE_BUSINESS_TOKEN');
   methods.push(options.method);
   if(options.method==='PATCH'){
     const body=JSON.parse(options.body);
     assert.equal('Online-Annahme rechtlich freigegeben' in body.fields,false);
     Object.assign(row.fields,body.fields);
   }else assert.equal(options.method,'GET');
   return Response.json(row);
 };
 const callback=createStagingAirtableCallback({config,env,fetcher});
 assert.equal(typeof callback,'function');
 assert.deepEqual(methods,[]);
 const result=await callback(s);
 assert.equal(result.result,'synthetic_fields_patched');
 assert.equal(row.fields.Status,'Angenommen');
 assert.equal(row.fields['Online-Annahme E-Mail'],'synthetic@example.invalid');
 assert.equal(row.fields['Online-Annahme Zeitstempel'],at);
 assert.equal(row.fields['CRM untouched'],'unchanged');
 assert.equal(row.fields['Online-Annahme rechtlich freigegeben'],false);
 assert.deepEqual(methods,['GET','PATCH']);
 const again=await callback(s);
 assert.equal(again.result,'already_identical');
 assert.deepEqual(methods,['GET','PATCH','GET']);
});
