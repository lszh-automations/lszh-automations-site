'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPilotRecordGuard,validateConfig}=require('../customer-portal-live-runtime.cjs');
const catalog=require('../contract-document-catalog.json');
const pilot={offerId:'pilot_offer',recipient:'lars.schulthess@outlook.com',packageSha256:'a'.repeat(64)};
const record=()=>({invitation:{recipient:pilot.recipient},record:{recipient:pilot.recipient,package:{offerId:pilot.offerId,packageSha256:pilot.packageSha256}}});
test('live portal pilot guard blocks other offers, recipients, hashes and revoked releases before access',async()=>{
 let calls=0;const guard=createPilotRecordGuard(pilot,{verifyRelease:async()=>{calls++;return true;}});
 assert.equal(await guard(record()),true);assert.equal(calls,1);
 for(const change of [r=>r.invitation.recipient='other@example.com',r=>r.record.recipient='other@example.com',r=>r.record.package.offerId='other_offer',r=>r.record.package.packageSha256='b'.repeat(64)]){
  const r=record();change(r);assert.equal(await guard(r),false);
 }
 assert.equal(calls,1);assert.equal(await createPilotRecordGuard(pilot,{verifyRelease:async()=>false})(record()),false);
});
test('live portal configuration pins evidence archive and approved recipient',()=>{
 const c={pilot,csrf:Buffer.alloc(32).toString('base64'),login:Buffer.alloc(32,1).toString('base64'),evidenceFolderId:catalog.sourceFolderId};
 assert.equal(validateConfig(c,'https://portal.example.com'),c);
 for(const other of [{...c,pilot:{...pilot,recipient:'other@example.com'}},{...c,evidenceFolderId:'other_folder'},{...c,csrf:'short'},{...c,pilot:{...pilot,packageSha256:'bad'}}])assert.throws(()=>validateConfig(other,'https://portal.example.com'),{code:'PILOT_CONFIG_INVALID'});
 assert.throws(()=>validateConfig(c,'http://portal.example.com'),{code:'PILOT_CONFIG_INVALID'});
});

test('general customer access admits different released customers while retaining exact invitation binding',async()=>{
 const {createCustomerRecordGuard}=require('../customer-portal-live-runtime.cjs');
 const guard=createCustomerRecordGuard({verifyRelease:async({package:p,recipient})=>p.offerId===recipient.split('@')[0]});
 for(const email of ['customer1@example.com','customer2@example.com']){
  const pkg={offerId:email.split('@')[0],packageId:'pkg_'+email.split('@')[0],packageSha256:'a'.repeat(64)};
  const row={invitation:{recipient:email,packageId:pkg.packageId,packageSha256:pkg.packageSha256},record:{recipient:email,package:pkg}};
  assert.equal(await guard(row),true);
  for(const change of [r=>r.invitation.recipient='other@example.com',r=>r.invitation.packageId='other_package',r=>r.invitation.packageSha256='b'.repeat(64),r=>r.record.package.offerId='other']){
   const r=structuredClone(row);change(r);assert.equal(await guard(r),false);
  }
 }
 assert.equal(await createCustomerRecordGuard({verifyRelease:async()=>false})({invitation:{recipient:'c@example.com',packageId:'p',packageSha256:'x'},record:{recipient:'c@example.com',package:{packageId:'p',packageSha256:'x'}}}),false);
});
test('customer runtime configuration requires explicit customer mode and keeps fixed archive and secrets',()=>{
 const c={accessMode:'customer',csrf:Buffer.alloc(32).toString('base64'),login:Buffer.alloc(32,1).toString('base64'),evidenceFolderId:catalog.sourceFolderId};
 assert.equal(validateConfig(c,'https://portal.example.com'),c);
 assert.throws(()=>validateConfig({...c,accessMode:'anything'},'https://portal.example.com'),{code:'PORTAL_CONFIG_INVALID'});
 assert.throws(()=>validateConfig({...c,accessMode:undefined},'https://portal.example.com'),{code:'PILOT_CONFIG_INVALID'});
});
