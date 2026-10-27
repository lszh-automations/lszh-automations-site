'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {createCrmContractActions,draftKey}=require('../contract-crm-actions'),{digest}=require('../offer-contract-package');
const bytes=fs.readFileSync(path.join(__dirname,'fixtures/acceptance/TEST_ONLY_offer.pdf'));
const document={kind:'offer',version:'r1',archiveFileId:'TEST_ONLY_ARCHIVED_PDF_0001',filename:'Offerte_1007.pdf',bytes:bytes.length,sha256:digest(bytes)};
function actions({doc=document,offerId='o',archived=bytes,missing=false}={}){const rows={['crmOffer:o']:{id:'o',number:1007},[draftKey('o')]:missing?null:{package:{offerId,documents:[doc]}}};return createCrmContractActions({transaction:fn=>fn({get:async key=>rows[key]||null}),portalOrigin:'https://qa.invalid',readArchivedPdf:async()=>archived});}
test('existing offer PDF returns exact archived bytes, validates integrity and binding, and does not recreate a contract',async()=>{
 assert.deepEqual(await actions().offerPdf('o'),bytes);
 await assert.rejects(()=>actions({offerId:'other'}).offerPdf('o'));
 await assert.rejects(()=>actions({archived:Buffer.from('%PDF-corrupt')}).offerPdf('o'));
 assert.equal(await actions({missing:true}).offerPdf('o'),null);
});
test('private PDF GET routes enforce auth and preserve invoice status while viewing paid originals',async()=>{
 const data={offerten:{o:{id:'o',number:1007,contractPackageId:'pkg'}},rechnungen:{paid:{id:'paid',status:'Bezahlt',number:'RE-1005'},draft:{id:'draft',status:'Entwurf',number:'RE-1006'}}},calls=[];
 const mocks={'node:http':http,'node:fs':fs,'node:path':path,'node:crypto':require('node:crypto'),'google-auth-library':{OAuth2Client:class{async verifyIdToken(){return {getPayload:()=>({email:'operator@lszh-automations.ch',email_verified:true,hd:'lszh-automations.ch'})};}}},'@google-cloud/firestore':{Firestore:class{}},'./lead-ingest':{},'./mail-dispatcher':{makeDispatcher:()=>({stats:()=>({enabled:false})})},'./cloud-records':{buildStore:()=>({get:async(t,id)=>data[t]?.[id]||null})},'./offer-preview':{},'./invoice-preview':{},'./offer-send':{createOfferSender:()=>({stats:()=>({enabled:false})})},'./contract-crm-runtime':{createContractCrmRuntime:()=>({offerPdf:async id=>{calls.push(id);return bytes;}})},'./invoice-pdf':{makeInvoicePdf:async invoice=>{calls.push(invoice.status);return bytes;}}};
 const module={exports:{}};new Function('require','module','exports','process','__dirname',fs.readFileSync(path.join(__dirname,'../server.js'),'utf8'))(n=>{if(!(n in mocks))throw Error(n);return mocks[n];},module,module.exports,{env:{GOOGLE_OAUTH_CLIENT_ID:'TEST_ONLY_CLIENT_LONG',CRM_ALLOWED_EMAILS:'operator@lszh-automations.ch',CRM_CONTRACT_ACTIONS_ENABLED:'true',CRM_INVOICE_QR_ENABLED:'true',CRM_INVOICE_IBAN:'TEST_ONLY',CRM_RECORD_PREFIX:'lszh_crm_v2_staging_'}},path.join(__dirname,'..'));
 const app=module.exports.createApp();await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port,headers={Authorization:'Bearer test-token'};
 try{for(const url of ['/api/pdf/offerte/o','/api/pdf/rechnung/paid?view=1'])assert.equal((await fetch(origin+url)).status,401);
 const offer=await fetch(origin+'/api/pdf/offerte/o',{headers});assert.equal(offer.status,200);assert.equal(offer.headers.get('content-type'),'application/pdf');assert.deepEqual(Buffer.from(await offer.arrayBuffer()),bytes);
 const paid=await fetch(origin+'/api/pdf/rechnung/paid?view=1',{headers});assert.equal(paid.status,200);assert.equal(calls.at(-1),'Offen');assert.equal(data.rechnungen.paid.status,'Bezahlt');
 assert.equal((await fetch(origin+'/api/pdf/rechnung/draft?view=1',{headers})).status,404);assert.equal((await fetch(origin+'/api/pdf/offerte/missing',{headers})).status,404);
 }finally{await new Promise(r=>app.close(r));}
});
