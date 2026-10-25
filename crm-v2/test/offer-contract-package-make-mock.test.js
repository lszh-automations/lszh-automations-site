'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {buildStagingContractPreview}=require('../offer-contract-package-preview');
const {
  KIND,MODE,buildMakeContractMockEnvelope,inspectMakeContractMockEnvelope,
  verifyMockMakeReceipt,createMockMakeContractClient
}=require('../offer-contract-package-make-mock');
function fixture(avv='no'){
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const documents=kinds.map(kind=>{
    const binary=makePdf({
      number:'1010',title:'TEST_ONLY '+kind+' KEIN VERTRAG',
      status:'Bereit',validUntil:'2026-12-10',
      items:[{title:'TEST_ONLY '+kind,qty:1,unitPriceCHF:18,mode:'einmalig'}]
    },{
      company:'TEST_ONLY GmbH',name:'Test Muster',email:'preview@example.invalid',
      street:'Testweg 12',postalCode:'5610',city:'Wohlen',country:'Schweiz'
    });
    return {kind,binary,meta:{
      kind,version:'v1_TEST_ONLY',archiveFileId:'test_archive_'+kind+'_20261025',
      filename:'TEST_ONLY_'+kind+'.pdf',sha256:digest(binary),bytes:binary.length
    }};
  });
  const pkg=prepareOfferPackage({
    offerId:'test_off_1010',offerNumber:'1010',revision:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY saved quote')),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',
    documents:documents.map(d=>d.meta)
  });
  return {pkg,documents,preview:()=>buildStagingContractPreview(
    pkg,async(id)=>documents.find(x=>x.meta.archiveFileId===id).binary
  )};
}
function acknowledgement(env){
  return {
    ok:true,eventId:env.eventId,packageSha256:env.packageSha256,
    attachmentCount:env.attachmentCount,
    simulated:true,transmitted:false,provider:'NONE',messageId:null
  };
}
test('Make mock envelope maps two real PDF bytes with immutable event identity',async()=>{
  const f=fixture();
  const preview=await f.preview();
  const env=buildMakeContractMockEnvelope(preview);
  assert.equal(env.kind,KIND);
  assert.equal(env.sendMode,MODE);
  assert.equal(env.to,'preview@example.invalid');
  assert.equal(env.neverSend,true);
  assert.equal(env.eventId,f.pkg.sendEventId);
  assert.equal(env.packageSha256,f.pkg.packageSha256);
  assert.equal(env.attachmentCount,2);
  assert.deepEqual(env.attachments.map(a=>a.kind),['offer','terms']);
  assert.deepEqual(env.attachments.map(a=>a.filename),['TEST_ONLY_offer.pdf','TEST_ONLY_terms.pdf']);
  assert.deepEqual(env.attachments.map(a=>a.mimeType),['application/pdf','application/pdf']);
  const report=inspectMakeContractMockEnvelope(env);
  assert.equal(report.count,2);
  for(const [i,att] of env.attachments.entries()){
    assert.deepEqual(Buffer.from(att.contentBase64,'base64'),f.documents[i].binary);
    assert.equal(digest(f.documents[i].binary),att.sha256);
  }
});
test('Make mock envelope supports third AVV attachment without dropping existing PDFs',async()=>{
  const f=fixture('yes'),preview=await f.preview();
  const env=buildMakeContractMockEnvelope(preview);
  assert.equal(env.attachmentCount,3);
  assert.deepEqual(env.attachments.map(a=>a.kind),['offer','terms','avv']);
  assert.equal(inspectMakeContractMockEnvelope(env).count,3);
});
test('mock transport can explicitly acknowledge without an email provider or message ID',async()=>{
  const preview=await fixture().preview();
  const client=createMockMakeContractClient(async env=>acknowledgement(env));
  const receipt=await client.simulate(preview);
  assert.equal(receipt.status,'mock_gateway_confirmed_no_delivery');
  assert.equal(receipt.provider,'NONE');
  assert.equal(receipt.transmitted,false);
  assert.equal(receipt.messageId,null);
  assert.equal(receipt.attachments,2);
});
test('duplicate mock send attempts fail before invoking gateway again',async()=>{
  const preview=await fixture().preview();
  let count=0;
  const client=createMockMakeContractClient(async env=>{count++;return acknowledgement(env);});
  await client.simulate(preview);
  await assert.rejects(client.simulate(preview),/Doppelversuch/);
  assert.equal(count,1);
});
test('lost or unverified gateway response fails closed and does not auto retry',async()=>{
  const preview=await fixture('yes').preview();
  let count=0;
  const client=createMockMakeContractClient(async()=>{count++;throw Error('mock timeout');});
  await assert.rejects(client.simulate(preview),/mock timeout/);
  await assert.rejects(client.simulate(preview),/Doppelversuch/);
  assert.equal(count,1);
});
test('wrong mock receipt event, package hash, attachment count or fake Gmail proof fails closed',async()=>{
  const env=buildMakeContractMockEnvelope(await fixture('yes').preview());
  const cases=[
    {...acknowledgement(env),eventId:'wrong_event'},
    {...acknowledgement(env),packageSha256:'0'.repeat(64)},
    {...acknowledgement(env),attachmentCount:2},
    {...acknowledgement(env),transmitted:true},
    {...acknowledgement(env),provider:'Gmail'},
    {...acknowledgement(env),messageId:'gmail_fake_id'},
    {...acknowledgement(env),simulated:false},
    {...acknowledgement(env),ok:false},
    {...acknowledgement(env),other:'untrusted'}
  ];
  for(const item of cases)
    assert.throws(()=>verifyMockMakeReceipt(env,item),/Make-Vertragspaket-Mock/);
});
test('Make mock payload does not accept live type, live recipient or production mode',async()=>{
  const env=buildMakeContractMockEnvelope(await fixture().preview());
  const cases=[
    {...env,kind:'offer_send'},
    {...env,sendMode:'production'},
    {...env,to:'real@example.com'},
    {...env,neverSend:false},
    {...env,other:'open_url'}
  ];
  for(const item of cases)
    assert.throws(()=>inspectMakeContractMockEnvelope(item),/Make-Vertragspaket-Mock/);
});
test('PDF tampering, order swaps, noncanonical base64 and mismatched file count fail',async()=>{
  const env=buildMakeContractMockEnvelope(await fixture('yes').preview());
  const bad=[
    {...env,attachmentCount:2},
    {...env,attachments:[env.attachments[0],env.attachments[2],env.attachments[1]]},
    {...env,attachments:env.attachments.map((x,i)=>i?x:{...x,contentBase64:x.contentBase64.slice(0,-4)+'AAAA'})},
    {...env,attachments:env.attachments.map((x,i)=>i?x:{...x,contentBase64:x.contentBase64+'AA'})},
    {...env,attachments:env.attachments.map((x,i)=>i?x:{...x,sha256:'f'.repeat(64)})}
  ];
  for(const item of bad)
    assert.throws(()=>inspectMakeContractMockEnvelope(item),/Make-Vertragspaket-Mock/);
});
test('mail body is marked TEST_ONLY and oversized HTML is rejected',async()=>{
  const env=buildMakeContractMockEnvelope(await fixture().preview());
  assert.match(env.subject,/TEST_ONLY.*KEIN VERSAND/);
  assert.match(env.html,/KEIN VERTRAG/);
  assert.throws(()=>inspectMakeContractMockEnvelope({...env,html:'<html>real mail</html>'}),/Testmail/);
  assert.throws(()=>inspectMakeContractMockEnvelope({...env,html:env.html+'a'.repeat(70_000)}),/Testmail/);
});
test('no network or live CRM wiring exists in Make mock sender',()=>{
  const module=fs.readFileSync(path.join(__dirname,'../offer-contract-package-make-mock.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const offerSender=fs.readFileSync(path.join(__dirname,'../offer-send.js'),'utf8');
  assert.doesNotMatch(module,/require\s*\(\s*['"](?:https?|node:http|node:https|googleapis|@google-cloud)/);
  assert.doesNotMatch(module,/\b(?:fetch\(|https\.request|gmail\.send|hook\.eu1\.make\.com)\b/);
  for(const source of [server,offerSender])
    assert.doesNotMatch(source,/require\s*\(\s*['"]\.\/offer-contract-package-make-mock['"]\s*\)/);
});
