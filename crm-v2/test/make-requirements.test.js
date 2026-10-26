'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {MAKE_REQUIREMENTS_VERSION,makeRequirements,makeRequirementsMetadata}=require('../make-requirements');
const {makePdf}=require('../offer-pdf');
const {renderOfferPreview}=require('../offer-preview');
const {captureOfferSnapshot}=require('../offer-dispatch-snapshot');
const {prepareOfferPackage,verifyOfferPackage,digest}=require('../offer-contract-package');
const {fixture}=require('./helpers/acceptance-fixture');
const offer={id:'test_make_1000',number:'1000',title:'TEST_ONLY Automatisierung',status:'Bereit',createdAt:'2026-10-26T08:00:00Z',validUntil:'2026-11-26',items:[{title:'Einrichtung',qty:1,unitPriceCHF:500,mode:'einmalig'}]};
const person={email:'synthetic@example.com',company:'TEST_ONLY Beispiel AG',name:'Testperson'};
test('only explicitly versioned PDFs add the Make prerequisite; legacy PDF bytes stay deterministic',()=>{
 const old=makePdf(offer,person),current=makePdf(offer,person,{makeRequirementsVersion:MAKE_REQUIREMENTS_VERSION});
 // Captured from production-2026-10-26 for this exact synthetic offer and recipient.
 assert.equal(digest(old),'3ab7bf25d8e4e8aced5e946725f8c7d06e89f0a679e92c1ad600c843230ef47a');
 assert.notEqual(digest(old),digest(current));
 assert.doesNotMatch(old.toString('latin1'),/IHR MAKE-KONTO/);
 for(const text of ['IHR MAKE-KONTO','Make-Organisation','Make-Abonnements','Offertenpreis','Auftragsbest','Make-Hinweis - Version 1 vom 26.10.2026'])assert.ok(current.toString('latin1').includes(text),text);
 assert.deepEqual(makePdf(offer,person,{makeRequirementsVersion:undefined}),old);
 assert.throws(()=>makePdf(offer,person,{makeRequirementsVersion:'unknown'}));
});
test('preview shows prerequisites before acceptance and does not add them to sent or legacy prepared offers',()=>{
 const html=renderOfferPreview(offer,person);
 assert.match(html,/Ihr Make-Konto und die Einrichtung/);assert.match(html,/eigenes Make-Konto/);
 assert.match(html,/erforderlichen Berechtigungen/);assert.match(html,/nicht enthalten/);
 assert.doesNotMatch(renderOfferPreview({...offer,status:'Versendet'},person),/Ihr Make-Konto und die Einrichtung/);
 assert.match(renderOfferPreview({...offer,status:'Versendet'},person,null,{makeRequirementsVersion:MAKE_REQUIREMENTS_VERSION}),/Ihr Make-Konto und die Einrichtung/);
 assert.doesNotMatch(renderOfferPreview(offer,person,null,{makeRequirementsVersion:null}),/Ihr Make-Konto und die Einrichtung/);
});
test('package and snapshot hashes bind the exact Make text version; legacy packages still verify',()=>{
 const f=fixture(),input={offerId:f.pkg.offerId,offerNumber:f.pkg.offerNumber,revision:1,offerSnapshotSha256:f.pkg.offerSnapshotSha256,avvRequired:f.pkg.avvRequired,avvAnnexesConfirmed:f.pkg.avvAnnexesConfirmed,documents:f.pkg.documents};
 const legacy=prepareOfferPackage(input),next=prepareOfferPackage({...input,...makeRequirementsMetadata(MAKE_REQUIREMENTS_VERSION)});
 assert.equal(legacy.packageSha256,f.pkg.packageSha256);verifyOfferPackage(legacy);verifyOfferPackage(next);
 assert.notEqual(next.packageSha256,legacy.packageSha256);
 assert.throws(()=>verifyOfferPackage({...next,makeRequirementsSha256:'0'.repeat(64)}));
 assert.throws(()=>verifyOfferPackage({...next,makeRequirementsVersion:'unknown'}));
 assert.throws(()=>prepareOfferPackage({...input,makeRequirementsVersion:MAKE_REQUIREMENTS_VERSION}));
 const claim={id:offer.id,offer,recipient:person,to:person.email,attemptId:'synthetic'},pdf=makePdf(offer,person);
 const old=captureOfferSnapshot(claim,pdf),current=captureOfferSnapshot({...claim,makeRequirementsVersion:MAKE_REQUIREMENTS_VERSION},pdf);
 assert.notEqual(old.offerSnapshotSha256,current.offerSnapshotSha256);
 assert.equal(current.snapshot.makeRequirementsSha256,makeRequirements(MAKE_REQUIREMENTS_VERSION).sha256);
});
test('new acceptance preview and durable evidence use the package-bound Make text; legacy responses do not',async()=>{
 for(const version of [undefined,MAKE_REQUIREMENTS_VERSION]){
  const f=fixture(),p=f.pkg;
  const pkg={...prepareOfferPackage({offerId:p.offerId,offerNumber:p.offerNumber,revision:p.revision,offerSnapshotSha256:p.offerSnapshotSha256,avvRequired:p.avvRequired,avvAnnexesConfirmed:p.avvAnnexesConfirmed,documents:p.documents,...makeRequirementsMetadata(version)}),status:'sent'};
  const link=await f.issue(pkg),preview=await f.service.preview(link.token,{});
  assert.deepEqual(preview.makeRequirements,makeRequirements(version)||undefined);
  await f.service.accept(link.token,f.body(pkg),{},preview.csrf);
  const evidence=f.snapshot().find(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE');
  // The response retains the exact notice and package hash, not mutable browser text.
  assert.equal(evidence.packageSha256,pkg.packageSha256);
  assert.deepEqual(evidence.makeRequirements,makeRequirements(version)||undefined);
 }
});
test('notice container precedes the consent form and frontend uses package data rather than current global text',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../acceptance-public/contract-acceptance.html'),'utf8');
 assert.ok(html.indexOf('id="make-requirements"')<html.indexOf('id="accept-form"'));
 const script=fs.readFileSync(path.join(__dirname,'../acceptance-public/contract-acceptance.js'),'utf8');
 assert.match(script,/hidden=!pkg.makeRequirements/);assert.match(script,/pkg.makeRequirements.paragraphs/);
 assert.doesNotMatch(script,/MAKE_CUSTOMER_ORGANISATION_v1/);
});
