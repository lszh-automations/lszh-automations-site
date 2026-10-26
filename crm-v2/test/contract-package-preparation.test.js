'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCustomerPackagePreparation}=require('../contract-package-preparation');
const {draftKey}=require('../contract-crm-actions');
const {releaseKey,createLivePublicationPolicy}=require('../contract-live-package-bridge');
const {digest}=require('../offer-contract-package');
const catalog=require('../contract-document-catalog.json');
const {MAKE_REQUIREMENTS_VERSION,makeRequirements}=require('../make-requirements');
const terms=Buffer.from('%PDF-1.4 SYNTHETIC terms only %%EOF');
catalog.terms={kind:'terms',version:'v1',archiveFileId:'synthetic_terms_12345',filename:'Terms.pdf',bytes:terms.length,sha256:digest(terms)};
function fixture(){
 const rows=new Map(),files=new Map([[catalog.terms.archiveFileId,terms]]);let uploads=0,lose=false,mutate;
 const id='offer_1101',offer={id,number:'1101',title:'Synthetic quote',status:'Bereit',customerId:'customer_1101',createdAt:'2026-10-25',validUntil:'2026-11-25',items:[{title:'Setup',mode:'einmalig',qty:1,unitPriceCHF:100}]};
 rows.set('crmOffer:'+id,offer);rows.set('crmCustomer:customer_1101',{email:'first@example.com',company:'Synthetic AG'});
 const transaction=async work=>{const writes=[];const result=await work({get:async k=>structuredClone(rows.get(k)||null),create:(k,v)=>{if(rows.has(k))throw Error('duplicate');writes.push([k,v]);},set:(k,v)=>writes.push([k,v])});for(const[k,v]of writes)rows.set(k,structuredClone(v));return result;};
 const now=()=>Date.parse('2026-10-25T22:00:00Z'),authorizeOperator=async u=>u?.email==='staff@example.com'?{verified:true,email:u.email}:null;
 const preparation=createCustomerPackagePreparation({transaction,authorizeOperator,now,readArchivedPdf:async id=>files.get(id),archivePdf:async({bytes})=>{uploads++;if(mutate)mutate();if(lose)throw Error('lost response');files.set('synthetic_offer_12345',bytes);return 'synthetic_offer_12345';}});
 const input={avvRequired:'no',documentsReviewed:true,retentionApproved:true},user={email:'staff@example.com'};
 return {id,rows,files,transaction,now,authorizeOperator,preparation,input,user,uploads:()=>uploads,lose:()=>lose=true,mutate:f=>mutate=f,run:()=>preparation.prepare(id,input,user)};
}
test('preparation binds generated archived PDF, stored customer and release without dispatch',async()=>{
 const f=fixture(),result=await f.run(),draft=f.rows.get(draftKey(f.id));assert.equal(result.recipient,'first@example.com');assert.equal(f.uploads(),1);assert.equal(f.rows.get('crmOffer:'+f.id).status,'Bereit');
 assert.equal(draft.package.documents[0].sha256,digest(f.files.get('synthetic_offer_12345')));
 const policy=createLivePublicationPolicy(f);assert.equal(await policy.verifyRelease({package:draft.package,recipient:'first@example.com'}),true);assert.equal(await policy.verifyRelease({package:draft.package,recipient:'other@example.com'}),false);
 assert.equal(Date.parse(f.rows.get(releaseKey(draft.package.packageId)).expiresAt)-f.now(),48*3600000);
 await assert.rejects(f.run(),{code:'PACKAGE_ALREADY_PREPARED'});assert.equal(f.uploads(),1);
});

test('new package notice is in the archived PDF, preview and publisher snapshot before any send',async()=>{
 const f=fixture(),page=await f.preparation.preview(f.id);
 assert.deepEqual(page.makeRequirements,makeRequirements(MAKE_REQUIREMENTS_VERSION));
 await f.run();const draft=f.rows.get(draftKey(f.id));
 assert.equal(draft.package.makeRequirementsVersion,MAKE_REQUIREMENTS_VERSION);
 assert.match(f.files.get('synthetic_offer_12345').toString('latin1'),/IHR MAKE-KONTO/);
 const publisher=require('../contract-package-publisher').createContractPackagePublisher({transaction:f.transaction,
  authorizeOperator:f.authorizeOperator,readArchivedPdf:async id=>f.files.get(id),verifyRelease:async()=>true,
  sendOnce:async()=>{throw Error('No send allowed in this test');},verifySentPackage:async()=>null,issueAcceptance:async()=>null,
  enabled:true,now:f.now});
 const prepared=await publisher.prepare(draft.package,'first@example.com',f.user);
 assert.equal(prepared.state,'prepared');assert.equal(f.uploads(),1);
});

test('already prepared legacy package retains a preview without newly introduced requirements',async()=>{
 const f=fixture();f.rows.set(draftKey(f.id),{package:{documents:[],makeRequirementsVersion:undefined}});
 const page=await f.preparation.preview(f.id);assert.equal(page.makeRequirements,null);
 await assert.rejects(f.run(),{code:'PACKAGE_ALREADY_PREPARED'});assert.equal(f.uploads(),0);
});
test('staff authorisation, explicit reviews and completed AVV are required before upload',async()=>{
 for(const patch of [{avvRequired:'review'},{documentsReviewed:false},{retentionApproved:false},{avvRequired:'yes'}]){const f=fixture();Object.assign(f.input,patch);await assert.rejects(f.run());assert.equal(f.uploads(),0);}
 const f=fixture();await assert.rejects(f.preparation.prepare(f.id,f.input,{email:'customer@example.com'}),{code:'OPERATOR_REQUIRED'});assert.equal(f.uploads(),0);
});
test('lost archive reply retains durable claim and does not upload again',async()=>{
 const f=fixture();f.lose();await assert.rejects(f.run());await assert.rejects(f.run(),{code:'PUBLICATION_CONFLICT'});assert.equal(f.uploads(),1);assert.equal(f.rows.has(draftKey(f.id)),false);
});
test('changed customer or quote during archival cannot receive a package release',async()=>{
 for(const change of ['customer','quote']){const f=fixture();f.mutate(()=>{if(change==='customer')f.rows.get('crmCustomer:customer_1101').email='other@example.com';else f.rows.get('crmOffer:'+f.id).title='Changed';});await assert.rejects(f.run(),{code:'PUBLICATION_CONFLICT'});assert.equal(f.rows.has(draftKey(f.id)),false);}
});
test('accepted and expired offers cannot start preparation',async()=>{
 for(const patch of [{status:'Angenommen'},{validUntil:'2026-10-01'}]){const f=fixture();Object.assign(f.rows.get('crmOffer:'+f.id),patch);await assert.rejects(f.run());assert.equal(f.uploads(),0);}
});

test('quote deadline respects Swiss summer and winter time and rejects invalid dates',()=>{
 const {zurichDeadline}=require('../contract-package-preparation');
 assert.equal(new Date(zurichDeadline('2026-10-25')).toISOString(),'2026-10-25T22:59:59.000Z');
 assert.equal(new Date(zurichDeadline('2026-07-25')).toISOString(),'2026-07-25T21:59:59.000Z');
 assert.equal(new Date(zurichDeadline('2026-03-29')).toISOString(),'2026-03-29T21:59:59.000Z');
 for(const date of ['2026-02-30','2026-13-01','2026-1-1','',null])assert.ok(Number.isNaN(zurichDeadline(date)));
});

test('document preview reads the fixed terms and refuses an AVV assigned to another customer',async()=>{
 const f=fixture();const result=await f.preparation.previewDocument(f.id,'terms');assert.equal(result.filename,catalog.terms.filename);assert.equal(digest(Buffer.from(result.data,'base64')),catalog.terms.sha256);
 f.rows.set('customerAvv_'+digest(Buffer.from(f.id)),{offerId:f.id,recipient:'other@example.com',document:catalog.terms});await assert.rejects(f.preparation.previewDocument(f.id,'avv'),{code:'CUSTOMER_AVV_ANNEXES_REQUIRED'});
});
