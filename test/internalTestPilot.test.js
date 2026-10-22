const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const token='I'.repeat(48),recordId='rec12345678901234';
const sha=s=>createHash('sha256').update(s).digest('hex');
async function fixture(){
 const {SOURCE:S,mapSyntheticAirtableOffer:map}=await import('../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs');
 const {INTERNAL_TEST_PILOT:p}=await import('../cloud-run/offer-portal-staging/internalTestPilot.mjs');
 const f={number:p.number,status:'Entwurf',terms:'TEST_v1.0_RC1',avvRequired:'Nein',
  validUntil:'2099-12-31',tokenHash:sha(token),
  email:{linkedRecordIds:['lead'],valuesByLinkedRecordId:{lead:[p.email]}},
  quoteId:'q'.repeat(25),quoteSha:'a'.repeat(64),termsId:'t'.repeat(25),termsSha:'b'.repeat(64),
  internalNote:'TEST_ONLY NO_CONTRACT '+p.purpose,prod:false,legal:false,released:false};
 const row={id:recordId,cellValuesByFieldId:Object.fromEntries(Object.entries(f).map(([k,v])=>[S[k],v]))};
 return {S,map,p,row};
}
test('internal pilot importer requires exact operator, marker, new record and no release',async()=>{
 const {S,map,p,row}=await fixture();
 assert.throws(()=>map(row),/real_recipient_forbidden/);
 const item=map(row,{internalPilotRecordId:recordId});
 assert.equal(item.recipientEmail,p.email);
 for(const [k,v] of [[S.email,{linkedRecordIds:['lead'],valuesByLinkedRecordId:{lead:['other@outlook.com']}}],
  [S.number,'TEST_OTHER_20261019_NO_CONTRACT'],[S.avvRequired,'Ja'],[S.internalNote,'TEST_ONLY NO_CONTRACT'],
  [S.prod,true],[S.legal,true],[S.released,true]]){
  const bad=structuredClone(row);bad.cellValuesByFieldId[k]=v;
  assert.throws(()=>map(bad,{internalPilotRecordId:recordId}));
 }
 assert.throws(()=>map(row,{internalPilotRecordId:'rec00000000000000'}));
});
test('internal pilot claim persists review and calls writeback once; defaults reject personal data',async()=>{
 const {map,p,row}=await fixture();
 const {createOfferPortal}=await import('../cloud-run/offer-portal-staging/portalCore.mjs');
 const {createFirestoreOfferStore}=await import('../cloud-run/offer-portal-staging/firestoreOfferStore.mjs');
 const {inspectSyntheticReceiptRecovery}=await import('../cloud-run/offer-portal-staging/receiptRecoveryReview.mjs');
 let doc=map(row,{internalPilotRecordId:recordId}),writes=0,callbacks=0;
 const ref={get:async()=>({exists:true,data:()=>structuredClone(doc)})};
 const db={collection:()=>({doc:()=>ref}),runTransaction:async fn=>fn({get:()=>ref.get(),update:(_,patch)=>{doc={...doc,...patch};writes++;}})};
 const options={store:createFirestoreOfferStore(db),verifyBundle:async()=>true,
  approvedVersion:'TEST_v1.0_RC1',proofSalt:'internal-offline-test-proof-salt',syntheticOnly:true,
  syntheticAcceptRecordId:recordId,onAccepted:async committed=>{
   assert.equal(inspectSyntheticReceiptRecovery(committed).status,'REVIEW_ONLY');callbacks++;
   return {result:'synthetic_fields_patched'};
  }};
 await assert.rejects(createOfferPortal(options).preview(token),/unavailable/);
 const portal=createOfferPortal({...options,internalPilotRecordId:recordId});
 assert.equal((await portal.preview(token)).test_accept_enabled,true);
 const result=await portal.accept(token,{name:'Lars Schulthess',email:p.email,authorized:true,
  accept_quote:true,accept_terms:true,quote_sha256:doc.bundle.quote.sha256,terms_sha256:doc.bundle.terms.sha256});
 assert.equal(result.test_only,true);assert.equal(result.airtable_sync_status,'synced');
 assert.equal(result.confirmation_email_pending,false);
 await assert.rejects(portal.accept(token,{}),/unavailable/);
 assert.equal(writes,1);assert.equal(callbacks,1);
 assert.deepEqual(doc.downstream,{airtable:'disabled',proofPdf:'disabled',email:'disabled'});
 assert.throws(()=>createOfferPortal({...options,productionOnly:true,internalPilotRecordId:recordId}));
});
test('internal runtime flag accepts one new source only on existing isolated browser staging',async()=>{
 const {stagingConfig,BROWSER_PILOT}=await import('../cloud-run/offer-portal-staging/stagingConfig.mjs');
 const env={LSZH_PORTAL_STAGING_ENABLED:'true',K_SERVICE:BROWSER_PILOT.service,
  K_REVISION:BROWSER_PILOT.service+'-00010-pilot',GOOGLE_CLOUD_PROJECT:'lszh-automations',
  LSZH_PORTAL_DATABASE:'lszh-offers-staging',LSZH_PORTAL_ARCHIVE_FOLDER:'10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko',
  LSZH_PORTAL_TERMS_VERSION:'TEST_v1.0_RC1',LSZH_PORTAL_ORIGIN:BROWSER_PILOT.origins[1],
  LSZH_PORTAL_PROOF_SALT:'random-looking-offline-0123456789-ABCDEFGH',LSZH_PORTAL_BROWSER_PILOT_ENABLED:'true',
  LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED:'true',LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED:'true',
  LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID:recordId,LSZH_INTERNAL_TEST_PILOT_ENABLED:'true'};
 assert.equal(stagingConfig(env).internalPilotRecordId,recordId);
 assert.throws(()=>stagingConfig({...env,LSZH_INTERNAL_TEST_PILOT_ENABLED:'false'}));
 assert.throws(()=>stagingConfig({...env,LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID:BROWSER_PILOT.sourceRecordId}));
 assert.throws(()=>stagingConfig({...env,K_SERVICE:'lszh-offer-portal'}));
 assert.throws(()=>stagingConfig({...env,LSZH_PORTAL_DATABASE:'lszh-offers'}));
});
