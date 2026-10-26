'use strict';
// Actual local Standard/native-mode emulator only; no cloud fallback.
const {test,after}=require('node:test');const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');
const {fixture}=require('../test/helpers/acceptance-fixture');
const {createContractAcceptance}=require('../contract-acceptance-staging');
const {createEmulatorAcceptanceStore,DEMO_PROJECT}=require('../contract-acceptance-store-staging');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8788'||process.env.GOOGLE_CLOUD_PROJECT!==DEMO_PROJECT)
  throw Error('REFUSED: actual isolated Firestore demo emulator required');
const clients=[];
function db(){const d=new Firestore({projectId:DEMO_PROJECT});clients.push(d);return d;}
after(async()=>{await Promise.allSettled(clients.map(d=>d.terminate()));});
test('two independent Firestore clients accept one package exactly once',async()=>{
  let f;
  const storeA=createEmulatorAcceptanceStore(db(),{now:()=>f.now()});
  f=fixture({store:storeA,offerId:'test_accept_'+randomUUID().replace(/-/g,'')});
  const other=createContractAcceptance({...f.config,
    store:createEmulatorAcceptanceStore(db(),{now:()=>f.now()})});
  const invite=await f.issue(),a=await f.service.preview(invite.token,{}),b=await other.preview(invite.token,{});
  const r=await Promise.allSettled([f.service.accept(invite.token,f.body(a),{},a.csrf),
    other.accept(invite.token,f.body(b),{},b.csrf)]);
  assert.equal(r.filter(v=>v.status==='fulfilled').length,1);
  assert.equal(r.find(v=>v.status==='rejected').reason.code,'LINK_ALREADY_USED');
  await assert.rejects(other.preview(invite.token,{}),{code:'LINK_ALREADY_USED'});
});
test('new Firestore package revision invalidates old links before any response write',async()=>{
  let f;
  f=fixture({store:createEmulatorAcceptanceStore(db(),{now:()=>f.now()}),
    offerId:'test_accept_'+randomUUID().replace(/-/g,'')});
  const invite=await f.issue(),page=await f.service.preview(invite.token,{});
  await f.issue(f.packageForRevision(2));
  await assert.rejects(f.service.accept(invite.token,f.body(page),{},page.csrf),{code:'DOCUMENT_VERSION_CHANGED'});
});
test('expiry at transaction time blocks a stale earlier request',async()=>{
  let f;
  const underlying=createEmulatorAcceptanceStore(db(),{now:()=>f.now()});
  f=fixture({store:underlying,offerId:'test_accept_'+randomUUID().replace(/-/g,'')});
  const invite=await f.issue(),page=await f.service.preview(invite.token,{});
  const delayed=createContractAcceptance({...f.config,store:{...underlying,
    consume:async(...args)=>{f.advance(60000);return underlying.consume(...args);}}});
  await assert.rejects(delayed.accept(invite.token,f.body(page),{},page.csrf),{code:'LINK_EXPIRED'});
});
