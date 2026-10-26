'use strict';
const {test,after}=require('node:test'),assert=require('node:assert/strict');
const {Firestore}=require('@google-cloud/firestore');const {randomUUID}=require('node:crypto');
const {createDurableAcceptance}=require('../contract-acceptance-durable');
const {createContractAcceptance}=require('../contract-acceptance-staging');
const {fixture}=require('../test/helpers/acceptance-fixture');
const projectId='demo-lszha-c2-20261025',prefix='lszh_crm_v2_staging_';
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788'||process.env.GOOGLE_CLOUD_PROJECT!==projectId)throw Error('Demo emulator required');
const clients=[];after(async()=>{await Promise.all(clients.map(x=>x.terminate()));});
function persistence(){const db=new Firestore({projectId});clients.push(db);return {db,p:createDurableAcceptance({db,projectId,prefix,emulator:true,now:()=>Date.parse('2026-10-25T19:00:00.000Z')})};}
async function setup(){
  const {db,p}=persistence(),f=fixture({store:p.store,offerId:'test_durable_'+randomUUID().replace(/-/g,'')});
  const offer=db.collection(prefix+'offerten').doc(f.pkg.offerId);
  await offer.set({title:'Synthetic offer',status:'Versendet',updatedAt:'2026-10-25'});
  const link=await f.issue(),page=await f.service.preview(link.token,{});
  return {db,p,f,offer,link,page};
}
test('durable response and CRM pending review commit together; archive retries reuse provider ID',async()=>{
  const {p,f,offer,link,page}=await setup();
  const receipt=await f.service.accept(link.token,f.body(page),{},page.csrf);
  const saved=(await offer.get()).data();assert.equal(saved.status,'Versendet');
  assert.equal(saved.onlineAcceptance.responseId,receipt.responseId);assert.equal(saved.onlineAcceptance.archiveState,'pending');
  const second=persistence().p;let calls=0;const ids=[];
  const archive={reserveId:async()=>{calls++;return 'synthetic_archive_123456';},putVerified:async id=>{ids.push(id);throw Error('timeout after upload');}};
  await assert.rejects(p.archiveResponse(receipt.responseId,archive));
  archive.putVerified=async id=>{ids.push(id);};
  assert.equal(await second.archiveResponse(receipt.responseId,archive),'synthetic_archive_123456');
  assert.equal(calls,1);assert.deepEqual(ids,['synthetic_archive_123456','synthetic_archive_123456']);
  assert.equal((await offer.get()).data().onlineAcceptance.archiveState,'complete');
  await second.archiveResponse(receipt.responseId,archive);assert.equal(ids.length,2);
});
test('CRM edited after package publication prevents partial acceptance records',async()=>{
  const {f,offer,link,page}=await setup();await offer.update({title:'Changed'});
  await assert.rejects(f.service.accept(link.token,f.body(page),{},page.csrf),{code:'CRM_BINDING_INVALID'});
  assert.equal((await offer.get()).data().onlineAcceptance,undefined);
  assert.equal((await f.service.preview(link.token,{})).packageId,page.packageId);
});

test('versioned Make prerequisites survive backend replacement in the actual persisted acceptance evidence',async()=>{
 const {db,p}=persistence(),id='test_make_'+randomUUID().replace(/-/g,'');
 const f=fixture({store:p.store,offerId:id}),old=f.pkg;
 const {MAKE_REQUIREMENTS_VERSION,makeRequirements,makeRequirementsMetadata}=require('../make-requirements');
 const {prepareOfferPackage}=require('../offer-contract-package');
 const {key}=require('../contract-acceptance-store-staging');
 const pkg={...prepareOfferPackage({offerId:id,offerNumber:old.offerNumber,revision:old.revision,
  offerSnapshotSha256:old.offerSnapshotSha256,avvRequired:old.avvRequired,avvAnnexesConfirmed:old.avvAnnexesConfirmed,
  documents:old.documents,...makeRequirementsMetadata(MAKE_REQUIREMENTS_VERSION)}),status:'sent'};
 await db.collection(prefix+'offerten').doc(id).set({title:'TEST_ONLY Make prerequisites',status:'Versendet'});
 const link=await f.issue(pkg),page=await f.service.preview(link.token,{});
 assert.deepEqual(page.makeRequirements,makeRequirements(MAKE_REQUIREMENTS_VERSION));
 await f.service.accept(link.token,f.body(page),{},page.csrf);
 const fresh=persistence().p,evidence=await fresh.transaction(tx=>tx.get(key('response',pkg.packageId)));
 assert.equal(evidence.packageSha256,pkg.packageSha256);
 assert.deepEqual(evidence.makeRequirements,makeRequirements(MAKE_REQUIREMENTS_VERSION));
});
test('customer mode rejects simulated identity',async()=>{
  const {f}=await setup();const customer=createContractAcceptance({...f.config,mode:'customer'});
  await assert.rejects(customer.issue(f.pkg,f.recipient),{code:'PACKAGE_NOT_ELIGIBLE'});
});

test('complete customer HTTP login survives backend replacement and records durable CRM response',async t=>{
  const http=require('node:http');
  const {createCustomerAcceptanceApplication}=require('../customer-acceptance-application');
  const {prepareOfferPackage}=require('../offer-contract-package');
  const f=fixture(),{db}=persistence(),offerId='offer_'+randomUUID().replace(/-/g,'');
  const pkg={...prepareOfferPackage({offerId,offerNumber:f.pkg.offerNumber,revision:1,offerSnapshotSha256:f.pkg.offerSnapshotSha256,avvRequired:'yes',avvAnnexesConfirmed:true,documents:f.pkg.documents.map(d=>({...d,filename:d.kind+'.pdf',version:'v1'}))}),status:'sent'};
  await db.collection(prefix+'offerten').doc(offerId).set({title:'Synthetic customer integration',status:'Versendet'});
  let handler,mail;
  const server=http.createServer((req,res)=>handler(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>{server.closeAllConnections();return new Promise(r=>server.close(r));});
  const origin='http://127.0.0.1:'+server.address().port;
  const config={db,projectId,prefix,origin,emulator:true,now:f.now,
    csrfSecret:Buffer.alloc(32,3),loginSecret:Buffer.alloc(32,4),
    archive:{readArchivedPdf:f.config.readArchivedPdf},sendCode:async value=>{mail=value;},
    authorizeIssue:async()=>true,verifySentPackage:f.config.verifySentPackage,verifyRepresentative:async()=>true};
  const app=createCustomerAcceptanceApplication(config);handler=app.handler;
  const link=await app.service.issue(pkg,f.recipient),headers={Authorization:'Bearer '+link.token,Origin:origin,'Content-Type':'application/json'};
  assert.equal((await fetch(origin+'/api/acceptance',{headers})).status,401);
  const challenge=await(await fetch(origin+'/api/login/request',{method:'POST',headers,body:'{}'})).json();
  assert.equal(mail.recipient,f.recipient);
  const verified=await fetch(origin+'/api/login/verify',{method:'POST',headers,body:JSON.stringify({challengeId:challenge.challengeId,code:mail.code})});
  assert.equal(verified.status,200);headers.Cookie=verified.headers.get('set-cookie').split(';')[0];
  // Replace the application and Firestore client: no in-memory login state survives.
  const db2=persistence().db;handler=createCustomerAcceptanceApplication({...config,db:db2}).handler;
  const preview=await fetch(origin+'/api/acceptance',{headers});assert.equal(preview.status,200);
  const page=await preview.json();assert.equal(page.testOnly,false);
  const response=await fetch(origin+'/api/acceptance',{method:'POST',headers:{...headers,'X-CSRF-Token':page.csrf},body:JSON.stringify(f.body(page))});
  assert.equal(response.status,200);assert.equal((await response.json()).testOnly,false);
  assert.equal((await db.collection(prefix+'offerten').doc(offerId).get()).data().onlineAcceptance.reviewRequired,true);
  assert.equal((await fetch(origin+'/api/acceptance',{headers})).status,409);
});

test('portal record guard blocks login before code delivery for a different pilot package',async()=>{
 const {createCustomerAcceptanceApplication}=require('../customer-acceptance-application');
 const http=require('node:http');
 const {db,f,link}=await setup();let sends=0,guardCalls=0,handler;
 const server=http.createServer((req,res)=>handler(req,res));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{
  const app=createCustomerAcceptanceApplication({db,projectId,prefix,origin,emulator:true,mode:'test',now:()=>Date.parse('2026-10-25T19:00:00.000Z'),
   csrfSecret:Buffer.alloc(32,1),loginSecret:Buffer.alloc(32,2),archive:{readArchivedPdf:async()=>{throw Error('not reached');}},
   sendCode:async()=>{sends++;},verifySentPackage:async()=>({verified:true}),authorizeIssue:async()=>false,verifyRepresentative:async()=>false,
   acceptanceRecordGuard:async record=>{guardCalls++;assert.equal(record.record.package.offerId,f.pkg.offerId);return false;}});
  handler=app.handler;
  const response=await fetch(origin+'/api/login/request',{method:'POST',headers:{Authorization:'Bearer '+link.token,Origin:origin,'Content-Type':'application/json'},body:'{}'});
  assert.equal(response.status,403);assert.equal((await response.json()).error,'PILOT_BINDING_REJECTED');assert.equal(guardCalls,1);assert.equal(sends,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
