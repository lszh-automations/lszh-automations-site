'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {blockedFixture,TARGET,COLLECTION,SCHEMA_VERSION,documentPath,isStagingPath}=require('../stagingOfferSchema');
const {claimOfferOnce,ClaimRejected}=require('../firestoreAcceptanceState');
const {checkedManifest}=require('../scripts/prepare-firestore-staging');
test('single naming contract for project, database, collection and version',()=>{
  assert.equal(TARGET.projectId,'lszh-automations');
  assert.equal(TARGET.databaseId,'lszh-offers-staging');
  assert.equal(TARGET.region,'europe-west6');
  assert.equal(COLLECTION,'stagingOfferFixtures');
  assert.equal(SCHEMA_VERSION,1);
  assert.equal(documentPath('LSZH-STAGING-20261015-001'),'stagingOfferFixtures/LSZH-STAGING-20261015-001');
  assert.equal(isStagingPath('stagingOfferFixtures/LSZH-STAGING-20261015-001'),true);
  assert.equal(isStagingPath('offers/LSZH-STAGING-20261015-001'),false);
  assert.throws(()=>documentPath('../../unsafe'));
});
const fakeOffer={offer_number:'DEMO-OFF-20261015-001',company:'Demo Hydraulik AG',
  contact_name:'Alex Muster',valid_until:'2026-11-15',contract_version:'TEST_ONLY_TERMS',
  avv_required:'Ja',avv_version:'TEST_ONLY_AVV',
  amount_setup_chf:'2500.00',amount_care_chf_monthly:'499.00'};
test('blocked fixture contract cannot be accepted by transaction candidate',async()=>{
  const docs={offer:{sha256:'2'.repeat(64)},terms:{sha256:'3'.repeat(64)},avv:{sha256:'4'.repeat(64)}};
  const blocked=blockedFixture({fixtureId:'LSZH-STAGING-20261015-001',offer:fakeOffer,documents:docs});
  assert.equal(blocked.schemaVersion,SCHEMA_VERSION);
  assert.equal(blocked.status,'TEST_DRAFT_NOT_SENT');
  assert.equal(blocked.expiresAt,null);
  assert.equal(blocked.termsVersion,'TEST_ONLY_TERMS');
  assert.equal(blocked.avvVersion,'TEST_ONLY_AVV');
  assert.equal(blocked.avvRequired,true);
  for(const k of ['acceptanceEnabled','legallyApproved','deliveryConfirmed','archiveVerified'])
    assert.equal(blocked[k],false);
  for(const k of ['tokenHash','acceptedAt','acceptanceEvidence'])assert.equal(blocked[k],null);
  const db={doc:()=>({}),runTransaction:async fn=>fn({get:async()=>({exists:true,data:()=>blocked}),update:()=>{throw Error('SHOULD_NOT_WRITE')}})};
  await assert.rejects(claimOfferOnce({db,documentPath:documentPath(blocked.fixtureId),
    expected:{tokenHash:'1'.repeat(64),quoteSha256:'2'.repeat(64),termsSha256:'3'.repeat(64),
      avvSha256:'4'.repeat(64),termsVersion:'TEST_ONLY_TERMS',avvVersion:'TEST_ONLY_AVV',offerNumber:blocked.offerNumber},
    actor:{name:'Alex Muster',email:blocked.recipientEmail,authorized:true,acceptTerms:true,acceptAvv:true},
    now:new Date('2026-10-15T12:00:00Z')}),ClaimRejected);
});
test('offline PDF manifest maps to shared blocked acceptance contract',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-manifest-'));
  try{
    const docs={};
    for(const [kind,txt] of [['offer','quote'],['terms','terms'],['avv','privacy']]){
      const filename='LSZH_TEST_'+kind.toUpperCase()+'.pdf';
      const data=Buffer.from('%PDF-1.7\n'+txt.repeat(900)+'\n%%EOF');
      fs.writeFileSync(path.join(dir,filename),data);
      docs[kind]={filename,mime_type:'application/pdf',bytes:data.length,
        sha256:crypto.createHash('sha256').update(data).digest('hex'),
        version:'TEST_ONLY_'+kind.toUpperCase(),drive_file_id:null,
        drive_sha256_verified:false,read_only_verified:false};
    }
    const m={fixture_schema:'LSZH_OFFER_STAGING_PREPARATION_V1',fixture_id:'LSZH-STAGING-20261015-001',
      environment:{target_project:'lszh-automations',target_database:'lszh-offers-staging',
        target_region:'europe-west6',write_executed:false},
      source:{system:'SYNTHETIC_LOCAL_FIXTURE',airtable_record_id:null},
      offer:{status:'TEST_DRAFT_NOT_SENT',email:'lars@lszh-automations.ch',
        ...fakeOffer,offer_number:'DEMO-OFF-20261015-001'},
      token:{raw_token_in_manifest:false,token_issued_to_customer:false,token_hash:'0'.repeat(64)},
      security:{test_only:true,legally_approved:false,acceptance_enabled:false,
        external_delivery_enabled:false,manual_review_required:true},
      import_gate:{ready:false},documents:docs};
    const result=checkedManifest(m,dir);
    assert.equal(result.proposedDocumentPath,'stagingOfferFixtures/LSZH-STAGING-20261015-001');
    assert.equal(result.proposedDocument.schemaVersion,SCHEMA_VERSION);
    assert.equal(result.proposedDocument.expiresAt,null);
    assert.equal(result.proposedDocument.avvRequired,true);
    assert.equal(result.proposedDocument.tokenHash,null);
    assert.equal(result.proposedDocument.documents.avv.archiveVerified,false);
    assert.equal(result.proposedDocument.deliveryConfirmed,false);
    assert.equal(result.cloudWritePerformed,false);
  }finally{fs.rmSync(dir,{force:true,recursive:true});}
});
