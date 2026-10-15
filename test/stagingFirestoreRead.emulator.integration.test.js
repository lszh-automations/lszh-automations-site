'use strict';
// Integration: a real Firestore emulator GET of a guaranteed-missing document.
// No live cloud credentials, IAM impersonation, writes, transactions or mails.
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createStagingFirestoreConnection,validateSettings}=require('../stagingFirestoreConnection');
let enabled=false;
try{
 validateSettings(process.env,'emulator');
 enabled=process.env.LSZH_RUN_EMULATOR_TRANSACTION_TEST==='I_UNDERSTAND_LOCAL_ONLY';
}catch{enabled=false;}
test('real local Firebase demo-project emulator permits scoped read-only GET, no document writes',
 {skip:!enabled},async()=>{
 const {Firestore}=require('@google-cloud/firestore');
 const {readFixture,settings,connected}=
  createStagingFirestoreConnection({Firestore,env:process.env,mode:'emulator'});
 const id='LSZH-STAGING-READ-PROBE-'+crypto.randomBytes(12).toString('hex');
 const result=await readFixture(id);
 assert.equal(result.exists,false);
 assert.equal(result.data,null);
 assert.equal(settings.projectId,'demo-lszh-offers');
 assert.equal(settings.databaseId,'lszh-offers-staging');
 assert.equal(settings.writeAuthorized,false);
 assert.equal(connected,false);
});
