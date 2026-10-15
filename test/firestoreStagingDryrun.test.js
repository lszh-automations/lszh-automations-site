'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {checkedManifest}=require('../scripts/prepare-firestore-staging');

function fixture() {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-firestore-test-'));
 const documents={};
 for(const kind of ['offer','terms','avv']){
  const filename='LSZH_TEST_'+kind.toUpperCase()+'.pdf';
  const bytes=Buffer.from('%PDF-1.7\n'+kind.repeat(700)+'\n%%EOF\n');
  fs.writeFileSync(path.join(root,filename),bytes);
  documents[kind]={filename,mime_type:'application/pdf',bytes:bytes.length,pages:1,
   sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
   version:'TEST_ONLY_'+kind.toUpperCase(),drive_file_id:null,
   drive_sha256_verified:false,read_only_verified:false};
 }
 return {root,record:{
  fixture_schema:'LSZH_OFFER_STAGING_PREPARATION_V1',fixture_id:'LSZH-STAGING-20261015-001',
  environment:{target_project:'lszh-automations',target_database:'lszh-offers-staging',target_region:'europe-west6',write_executed:false},
  source:{system:'SYNTHETIC_LOCAL_FIXTURE',airtable_record_id:null},
  offer:{status:'TEST_DRAFT_NOT_SENT',email:'lars@lszh-automations.ch',avv_required:'Ja',
   offer_number:'DEMO-OFF-20261015-001',contract_version:'TEST_ONLY_TERMS',avv_version:'TEST_ONLY_AVV',
   company:'Demo Hydraulik AG',contact_name:'Alex Muster',valid_until:'2026-11-15',
   amount_setup_chf:'2500.00',amount_care_chf_monthly:'499.00'},
  token:{raw_token_in_manifest:false,token_issued_to_customer:false,token_hash:'0'.repeat(64)},
  security:{test_only:true,legally_approved:false,acceptance_enabled:false,external_delivery_enabled:false,manual_review_required:true},
  import_gate:{ready:false},documents
 }};
}
function run(callback) {
 const {root,record}=fixture();
 try{return callback(record,root);}finally{fs.rmSync(root,{recursive:true,force:true});}
}
function rejected(mutation,expected){
 run((record,root)=>{mutation(record,root);assert.throws(()=>checkedManifest(record,root),expected);});
}
test('synthetic record mapping keeps all live and write switches closed',()=>run((record,root)=>{
 const out=checkedManifest(record,root);
 assert.equal(out.target.projectId,'lszh-automations');
 assert.equal(out.target.databaseId,'lszh-offers-staging');
 assert.equal(out.proposedDocument.status,'TEST_DRAFT_NOT_SENT');
 assert.equal(out.proposedDocument.tokenHash,null);
 assert.equal(out.proposedDocument.acceptanceEnabled,false);
 assert.equal(out.cloudWritePerformed,false);
}));
test('wrong project or database blocked',()=>{
 rejected(r=>{r.environment.target_project='lszh-offers-staging';},/Wrong project/);
 rejected(r=>{r.environment.target_database='(default)';},/Wrong project/);
});
test('unsafe live, legal, acceptance and send flags blocked',()=>{
 for(const key of ['test_only','legally_approved','acceptance_enabled','external_delivery_enabled','manual_review_required']){
  rejected(r=>{r.security[key]=!r.security[key];},/Unsafe live status/);
 }
 rejected(r=>{r.import_gate.ready=true;},/Import gate/);
});
test('external recipient or sent offer blocked',()=>{
 rejected(r=>{r.offer.email='customer@example.com';},/Unsafe recipient/);
 rejected(r=>{r.offer.status='Versendet';},/Unsafe recipient/);
});
test('required AVV and unique PDFs enforced',()=>{
 rejected(r=>{delete r.documents.avv;},/three documents/);
 rejected(r=>{r.documents.avv.filename=r.documents.offer.filename;},/Duplicate PDF/);
});
test('tampered PDF rejected',()=>rejected((r,root)=>{
 fs.appendFileSync(path.join(root,r.documents.offer.filename),'tampered');
},/PDF integrity/));
test('false Drive verification rejected',()=>{
 rejected(r=>{r.documents.offer.drive_sha256_verified=true;},/Unverified remote Drive/);
 rejected(r=>{r.documents.offer.drive_file_id='fake';},/Unverified remote Drive/);
});
test('real CRM input and issued token metadata rejected',()=>{
 rejected(r=>{r.source.airtable_record_id='rec123';},/Real CRM record/);
 rejected(r=>{r.token.raw_token_in_manifest=true;},/Unsafe token/);
 rejected(r=>{r.token.token_issued_to_customer=true;},/Unsafe token/);
});