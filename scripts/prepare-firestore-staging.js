#!/usr/bin/env node
'use strict';
// OFFLINE ONLY. Never connects to Firebase, Google Drive, Airtable or Make.
// No secrets, live links, acceptance, deployment or cloud writes.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const TARGET=Object.freeze({projectId:'lszh-automations',databaseId:'lszh-offers-staging',region:'europe-west6'});
const COLLECTION='stagingOfferFixtures'; // PROPOSAL, not verified deployed schema.
const EXPECTED_EMAIL='lars@lszh-automations.ch';
const TYPES=['offer','terms','avv'];
const SHA=/^[0-9a-f]{64}$/;
function ensure(ok,reason){if(!ok)throw Error(reason);}
function isObject(v){return v!==null && typeof v==='object' && !Array.isArray(v);}
function checkedManifest(m,root){
 ensure(isObject(m),'Invalid manifest');
 const e=m.environment||{}, s=m.security||{},o=m.offer||{},g=m.import_gate||{};
 ensure(e.target_project===TARGET.projectId && e.target_database===TARGET.databaseId && e.target_region===TARGET.region,'Wrong project, database or region');
 ensure(e.write_executed===false,'Cloud write flag is unsafe');
 ensure(m.fixture_schema==='LSZH_OFFER_STAGING_PREPARATION_V1' && m.fixture_id==='LSZH-STAGING-20261015-001','Unknown fixture');
 ensure(m.source?.system==='SYNTHETIC_LOCAL_FIXTURE' && m.source?.airtable_record_id===null,'Real CRM record forbidden');
 ensure(s.test_only===true && s.legally_approved===false && s.acceptance_enabled===false &&
        s.external_delivery_enabled===false && s.manual_review_required===true,'Unsafe live status');
 ensure(g.ready===false,'Import gate must remain disabled');
 ensure(o.status==='TEST_DRAFT_NOT_SENT' && o.email===EXPECTED_EMAIL && o.avv_required==='Ja','Unsafe recipient/status/AVV');
 ensure(/^DEMO-OFF-\d{8}-\d{3}$/.test(o.offer_number||''),'Non-test offer number');
 ensure(/^TEST_ONLY_/.test(o.contract_version||'') && /^TEST_ONLY_/.test(o.avv_version||''),'Unapproved contract material');
 ensure(m.token?.raw_token_in_manifest===false && m.token?.token_issued_to_customer===false && SHA.test(m.token?.token_hash||''),'Unsafe token metadata');
 ensure(isObject(m.documents) && Object.keys(m.documents).sort().join(',')===TYPES.slice().sort().join(','),'Exactly three documents required');
 const docs={},seenFiles=new Set(),seenHashes=new Set();
 for (const kind of TYPES){
   const d=m.documents[kind];
   ensure(isObject(d) && /^LSZH_TEST_[A-Z0-9_]+\.pdf$/.test(d.filename||''),'Invalid PDF filename');
   ensure(d.drive_file_id===null && d.drive_sha256_verified===false && d.read_only_verified===false,'Unverified remote Drive claim');
   ensure(d.mime_type==='application/pdf' && SHA.test(d.sha256||'') && Number.isSafeInteger(d.bytes) && d.bytes>1024,'Invalid PDF metadata');
   ensure(!seenFiles.has(d.filename) && !seenHashes.has(d.sha256),'Duplicate PDF document');
   seenFiles.add(d.filename);seenHashes.add(d.sha256);
   const data=fs.readFileSync(path.join(root,d.filename));
   const hash=crypto.createHash('sha256').update(data).digest('hex');
   ensure(data.subarray(0,5).toString()==='%PDF-' && data.length===d.bytes && hash===d.sha256,'PDF integrity mismatch');
   docs[kind]={filename:d.filename,mimeType:'application/pdf',sha256:hash,bytes:data.length,version:d.version,
     driveFileId:null,archiveVerified:false};
 }
 // Merely proposed document. Never send this JSON directly as a Firestore write.
 return {mode:'OFFLINE_DRY_RUN_ONLY',cloudWritePerformed:false,target:TARGET,
  proposedCollection:COLLECTION,proposedDocumentId:m.fixture_id,
  proposedDocument:{fixtureId:m.fixture_id,offerNumber:o.offer_number,status:'TEST_DRAFT_NOT_SENT',
   recipientEmail:EXPECTED_EMAIL,company:o.company,contactName:o.contact_name,validUntil:o.valid_until,
   setupCHF:o.amount_setup_chf,monthlyCareCHF:o.amount_care_chf_monthly,avvRequired:true,
   documents:docs,tokenHash:null,acceptedAt:null,testOnly:true,legallyApproved:false,
   acceptanceEnabled:false,deliveryEnabled:false,archiveVerified:false,requiresManualReview:true},
  blockers:['Drive upload/readback and permissions not verified','Deployed portal schema not confirmed',
    'No test token issued','No separate authorization to write to STAGING']};
}
function prepare(root){
 ensure(typeof root==='string' && root.length>0,'Fixture directory required');
 return checkedManifest(JSON.parse(fs.readFileSync(path.join(root,'fixture_manifest.json'),'utf8')),root);
}
if(require.main===module){
 try{
   ensure(process.argv.length===3,'Usage: node scripts/prepare-firestore-staging.js /path/to/fixture-folder');
   process.stdout.write(JSON.stringify(prepare(path.resolve(process.argv[2])),null,2)+'\n');
 }catch(e){console.error('BLOCKED: '+e.message);process.exitCode=1;}
}
module.exports={prepare,checkedManifest,TARGET,COLLECTION};