'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/acceptance-fixture');
const {createEmulatorAcceptanceStore,createDemoMemoryAcceptanceStore}=require('../contract-acceptance-store-staging');
const {tokenHash}=require('../contract-acceptance-staging');
const {createContractAcceptance}=require('../contract-acceptance-staging');

for(const avv of ['yes','no'])test('acceptance '+avv+' AVV: exact archived PDFs, explicit consent and internal review only',async()=>{
  const f=fixture({avv}),invite=await f.issue(),page=await f.service.preview(invite.token,{});
  assert.equal(page.documents.length,avv==='yes'?3:2);
  for(const doc of page.documents){const download=await f.service.download(invite.token,doc.kind,{});
    assert.equal(download.filename,doc.filename);assert.equal(download.bytes.length,doc.bytes);}
  const receipt=await f.service.accept(invite.token,f.body(page),{},page.csrf);
  assert.equal(receipt.state,'customer_response_recorded');assert.equal(receipt.nextAction,'internal_review');
  assert.equal(receipt.writtenLszhConfirmationRequired,true);
  const proof=f.snapshot().find(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE');
  assert.equal(proof.recipient,f.recipient);assert.equal(proof.documents.length,page.documents.length);
  assert.equal(proof.explicitAvvConsent,avv==='yes');assert.equal(proof.textVersion,page.textVersion);
  assert.equal(Object.hasOwn(proof.declarations,'avv'),avv==='yes');
  assert.equal(Object.keys(proof.documentHashes).length,page.documents.length);
  assert.equal(JSON.stringify(f.snapshot()).includes(invite.token),false);
  assert.equal(f.snapshot().find(r=>r.package)?.package.status,'customer_response_recorded');
});
test('GET preview and PDF downloads do not consume a link',async()=>{
  const f=fixture(),i=await f.issue();
  await f.service.preview(i.token,{});await f.service.preview(i.token,{});
  await f.service.download(i.token,'offer',{});
  assert.equal(f.snapshot().some(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE'),false);
  assert.equal((await f.store.resolve(tokenHash(i.token),f.now())).invitation.used,false);
});
test('parallel submissions create exactly one immutable response',async()=>{
  const f=fixture(),i=await f.issue(),p=await f.service.preview(i.token,{});
  const r=await Promise.allSettled([f.service.accept(i.token,f.body(p),{},p.csrf),f.service.accept(i.token,f.body(p),{},p.csrf)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(r.filter(x=>x.status==='rejected')[0].reason.code,'LINK_ALREADY_USED');
  assert.equal(f.snapshot().filter(x=>x.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE').length,1);
});
test('multiple invitation links and new revisions cannot duplicate an accepted offer',async()=>{
  const f=fixture(),a=await f.issue(),b=await f.issue(),p=await f.service.preview(a.token,{});
  await f.service.accept(a.token,f.body(p),{},p.csrf);
  await assert.rejects(f.service.preview(b.token,{}),{code:'LINK_ALREADY_USED'});
  await assert.rejects(f.issue(f.packageForRevision(2)),{code:'LINK_ALREADY_USED'});
});
test('an updated package invalidates every old revision link',async()=>{
  const f=fixture(),a=await f.issue(),p=await f.service.preview(a.token,{});
  const b=await f.issue(f.packageForRevision(2));
  await assert.rejects(f.service.accept(a.token,f.body(p),{},p.csrf),{code:'DOCUMENT_VERSION_CHANGED'});
  assert.equal((await f.service.preview(b.token,{})).revision,2);
  await assert.rejects(f.issue(),{code:'DOCUMENT_VERSION_CHANGED'});
});
test('expiry and unknown, malformed or modified tokens are blocked',async()=>{
  const f=fixture(),a=await f.issue();f.advance(60000);
  await assert.rejects(f.service.preview(a.token,{}),{code:'LINK_EXPIRED'});
  for(const token of ['x','../token','A'.repeat(43)])await assert.rejects(f.service.preview(token,{}));
});
test('tampered archived PDF cannot be displayed, downloaded or accepted',async()=>{
  const f=fixture(),i=await f.issue(),p=await f.service.preview(i.token,{});
  f.archives.set(f.pkg.documents[2].archiveFileId,Buffer.from('%PDF-1.4 changed'));
  for(const action of [()=>f.service.preview(i.token,{}),()=>f.service.download(i.token,'avv',{}),
    ()=>f.service.accept(i.token,f.body(p),{},p.csrf)])await assert.rejects(action(),{code:'DOCUMENT_INTEGRITY_FAILED'});
  assert.equal(f.snapshot().some(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE'),false);
});
test('separate terms, AVV and representation declarations cannot be omitted',async()=>{
  const f=fixture(),i=await f.issue(),p=await f.service.preview(i.token,{});
  for(const key of ['termsConsent','avvConsent','representativeDeclaration'])
    await assert.rejects(f.service.accept(i.token,{...f.body(p),[key]:false},{},p.csrf),{code:'EXPLICIT_CONSENT_REQUIRED'});
  const no=fixture({avv:'no'}),j=await no.issue(),q=await no.service.preview(j.token,{});
  await assert.rejects(no.service.accept(j.token,{...no.body(q),avvConsent:true},{},q.csrf),{code:'EXPLICIT_CONSENT_REQUIRED'});
  await assert.rejects(no.service.download(j.token,'avv',{}),{code:'DOCUMENT_NOT_FOUND'});
});
test('browser cannot spoof identity, representative authorisation or acceptance hash',async()=>{
  const f=fixture(),i=await f.issue(),p=await f.service.preview(i.token,{});
  await assert.rejects(f.service.accept(i.token,{...f.body(p),representativeVerified:true},{},p.csrf),{code:'INVALID_REQUEST'});
  await assert.rejects(f.service.accept(i.token,{...f.body(p),packageSha256:'0'.repeat(64)},{},p.csrf),{code:'DOCUMENT_VERSION_CHANGED'});
  f.setIdentity('wrong@example.com');await assert.rejects(f.service.preview(i.token,{}),{code:'IDENTITY_REQUIRED'});
  f.setIdentity(f.recipient);f.setRepresentative(false);
  await assert.rejects(f.service.accept(i.token,f.body(p),{},p.csrf),{code:'REPRESENTATIVE_NOT_VERIFIED'});
});
test('missing or non-ASCII CSRF is rejected without consuming the invitation',async()=>{
  const f=fixture(),i=await f.issue(),p=await f.service.preview(i.token,{});
  for(const csrf of [undefined,'bad','é'.repeat(43),'A'.repeat(43)])
    await assert.rejects(f.service.accept(i.token,f.body(p),{},csrf),{code:'CSRF_REJECTED'});
  assert.equal(f.snapshot().some(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE'),false);
});
test('unapproved issue, missing independent SENT evidence and unsent packages cannot create links',async()=>{
  const f=fixture();f.setIssueAllowed(false);await assert.rejects(f.issue(),{code:'ISSUE_NOT_AUTHORISED'});
  f.setIssueAllowed(true);f.setProof(false);await assert.rejects(f.issue(),{code:'SENT_EVIDENCE_REQUIRED'});
  f.setProof(true);await assert.rejects(f.issue({...f.pkg,status:'prepared'}),{code:'PACKAGE_NOT_ELIGIBLE'});
  assert.equal(f.snapshot().length,0);
});
test('Firestore adapter has no production fallback',()=>{
  assert.throws(()=>createEmulatorAcceptanceStore({projectId:'lszh-automations'}),{code:'DEMO_EMULATOR_REQUIRED'});
});
test('lost HTTP acknowledgement after commit cannot create a second receipt',async()=>{
  const f=fixture(),i=await f.issue(),p=await f.service.preview(i.token,{});
  const uncertain=createContractAcceptance({...f.config,store:{...f.store,
    consume:async(...args)=>{await f.store.consume(...args);throw Error('simulated lost acknowledgement');}}});
  await assert.rejects(uncertain.accept(i.token,f.body(p),{},p.csrf));
  await assert.rejects(f.service.accept(i.token,f.body(p),{},p.csrf),{code:'LINK_ALREADY_USED'});
  assert.equal(f.snapshot().filter(x=>x.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE').length,1);
});
test('unverified or stale identity sessions cannot read a package',async()=>{
  const f=fixture(),i=await f.issue();
  for(const identity of [
    {email:f.recipient,emailVerified:false,subject:'test_1101',verifiedAt:f.now(),method:'verified_session'},
    {email:f.recipient,emailVerified:true,subject:'test_1101',verifiedAt:f.now()-16*60000,method:'verified_session'}]){
    const service=createContractAcceptance({...f.config,resolveIdentity:async()=>identity});
    await assert.rejects(service.preview(i.token,{}),{code:'IDENTITY_REQUIRED'});
  }
});
test('invalid transaction clock cannot bypass an expired link',async()=>{
  const memory=createDemoMemoryAcceptanceStore({now:()=>NaN});
  const f=fixture({store:memory.store}),i=await f.issue(),p=await f.service.preview(i.token,{});
  await assert.rejects(f.service.accept(i.token,f.body(p),{},p.csrf),{code:'INVALID_CLOCK'});
  assert.equal(memory.snapshot().some(r=>r.kind==='TEST_ONLY_CUSTOMER_ACCEPTANCE'),false);
});
