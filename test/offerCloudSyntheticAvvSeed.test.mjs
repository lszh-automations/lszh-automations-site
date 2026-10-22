import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBusinessDraft,toAirtableAppRecord,fieldsTyped} from '../scripts/offer-cloud-synthetic-avv-seed-once.mjs';
import {mapSyntheticAirtableOffer} from '../cloud-run/offer-portal-staging/airtableSyntheticImport.mjs';
import {stagingConfig} from '../cloud-run/offer-portal-staging/stagingConfig.mjs';
const f={
 Offertennummer:'TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT',Status:'Entwurf',
 'Projektbedingungen Version':'TEST_v1.0_RC1','AVV erforderlich':'Ja','Gültig bis':'2099-12-31',
 'Online-Annahme Token-Hash':'a'.repeat(64),
 'Online-Annahme Offerten Drive ID':'1-GQyj0cKC4aAJD_9wrxanckCJisEy0nB',
 'Online-Annahme Offerten-SHA256':'2dd5c5377461c969b9a436f36999150dc53cf159f02e4985e2f2536b683b004c',
 'Online-Annahme Bedingungen Drive ID':'1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO',
 'Online-Annahme Bedingungen-SHA256':'baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279',
 'Online-Annahme AVV Drive ID':'1p2ZRrPuSuaICH9W4N0afK5xt8xeOeKZI',
 'Online-Annahme AVV-SHA256':'53f9deda2000e219f79e0496b33f1e74df8ac00eac09f221b2436c3fd848d060',
 'Online-Annahme AVV-Version':'TEST_ONLY_AVV_v1.0_RC1',
 Lead:['recv49NbSCmc5nEu3'],'Lead E-Mail':['fake-lszh-e2e@example.invalid'],
 'Interne Notiz':'TEST ONLY / NO CONTRACT'
};
test('AVV draft maps all three documents, explicit version and source to Firestore',()=>{
 const item=mapSyntheticAirtableOffer(toAirtableAppRecord(checkBusinessDraft(f)));
 assert.equal(item.bundle.avv_required,'Ja');
 assert.equal(item.source.recordId,'recktLXj5wUxLmHFQ');
 assert.equal(item.details.avvVersion,f['Online-Annahme AVV-Version']);
 assert.equal(fieldsTyped(item).bundle.mapValue.fields.avv.mapValue.fields.id.stringValue,f['Online-Annahme AVV Drive ID']);
});
test('modified PDF, accepted offer, real recipient and existing receipt stop seed',()=>{
 for(const change of [
 {'Online-Annahme AVV-SHA256':'b'.repeat(64)},
 {'Online-Annahme AVV ausdrücklich akzeptiert':true},
 {Status:'Angenommen'},{'Lead E-Mail':['real@example.com']},
 {'Online-Annahme Beleg Drive ID':'existing'}
 ])assert.throws(()=>checkBusinessDraft({...f,...change}));
});
const env={
 LSZH_PORTAL_STAGING_ENABLED:'true',LSZH_PORTAL_BROWSER_PILOT_ENABLED:'true',
 K_SERVICE:'lszh-offer-browser-staging',K_REVISION:'lszh-offer-browser-staging-00009-avv',
 GOOGLE_CLOUD_PROJECT:'lszh-automations',LSZH_PORTAL_DATABASE:'lszh-offers-staging',
 LSZH_PORTAL_ARCHIVE_FOLDER:'10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko',
 LSZH_PORTAL_TERMS_VERSION:'TEST_v1.0_RC1',
 LSZH_PORTAL_ORIGIN:'https://cloud-e2e---lszh-offer-browser-staging-ozx7mp2bka-oa.a.run.app',
 LSZH_PORTAL_PROOF_SALT:'0123456789abcdef'.repeat(4),
 LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED:'true',
 LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED:'true'
};
test('each browser revision selects one pinned record; arbitrary records remain rejected',()=>{
 for(const record of ['recensIiczNGsoPeR','recktLXj5wUxLmHFQ'])
   assert.equal(stagingConfig({...env,LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID:record}).sourceRecordId,record);
 assert.throws(()=>stagingConfig({...env,LSZH_PORTAL_SYNTHETIC_SOURCE_RECORD_ID:'recAAAAAAAAAAAAAA'}));
});
