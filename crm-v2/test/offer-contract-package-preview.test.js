'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {
  buildStagingContractPreview,simulateStagingDelivery,
  PREVIEW_KIND,PREVIEW_MODE,TEST_ADDRESS
}=require('../offer-contract-package-preview');
const recipient={
  company:'TEST_ONLY Beispiel AG',name:'Test Muster',
  email:'preview@example.invalid',street:'Teststrasse 12',
  postalCode:'5610',city:'Wohlen',country:'Schweiz'
};
function realPdf(kind){
  return makePdf({
    number:'1000',title:'TEST_ONLY '+kind+' – KEIN VERTRAG',
    validUntil:'2026-12-01',status:'Bereit',
    items:[{
      title:'TEST_ONLY '+kind+' Musterleistung',
      qty:1,unitPriceCHF:123,mode:'einmalig'
    }]
  },recipient);
}
function setup(avvRequired='no',replacement=null){
  const required=avvRequired==='yes'?['offer','terms','avv']:['offer','terms'];
  const source=Object.fromEntries(required.map(kind=>[kind,realPdf(kind)]));
  if(replacement)Object.assign(source,replacement);
  const documents=required.map(kind=>({
    kind,version:'RC1_TEST_ONLY',archiveFileId:'test_archive_'+kind+'_20261025',
    filename:'TEST_ONLY_'+kind+'.pdf',sha256:digest(source[kind]),
    bytes:source[kind].length
  }));
  const pkg=prepareOfferPackage({
    offerId:'test_quote_900',offerNumber:'1000',revision:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY snapshot content')),
    avvRequired,avvAnnexesConfirmed:avvRequired==='yes',documents
  });
  const calls=[];
  const archiveRead=async(id)=>{
    calls.push(id);
    const kind=required.find(k=>'test_archive_'+k+'_20261025'===id);
    return source[kind];
  };
  return {pkg,source,calls,archiveRead};
}
test('offline 2-PDF contract preview carries ordered real PDF bytes, matching SHA-256 and no delivery',async()=>{
  const f=setup();
  const preview=await buildStagingContractPreview(f.pkg,f.archiveRead);
  assert.equal(preview.kind,PREVIEW_KIND);
  assert.equal(preview.sendMode,PREVIEW_MODE);
  assert.equal(preview.to,TEST_ADDRESS);
  assert.equal(preview.neverSend,true);
  assert.equal(preview.packageId,f.pkg.packageId);
  assert.equal(preview.eventId,f.pkg.sendEventId);
  assert.deepEqual(preview.attachments.map(a=>a.kind),['offer','terms']);
  assert.deepEqual(f.calls,['test_archive_offer_20261025','test_archive_terms_20261025']);
  for(const a of preview.attachments){
    assert.ok(a.filename.startsWith('TEST_ONLY_'));
    assert.equal(a.mimeType,'application/pdf');
    const data=Buffer.from(a.base64,'base64');
    assert.ok(data.subarray(0,8).toString().startsWith('%PDF-'));
    assert.deepEqual(data,f.source[a.kind]);
    assert.equal(digest(data),preview.documentHashes.find(d=>d.kind===a.kind).sha256);
  }
  assert.match(preview.subject,/TEST_ONLY.*KEIN VERSAND/);
  assert.match(preview.html,/LSZH Automations/);
  assert.match(preview.html,/KEIN VERTRAG/);
  const simulation=simulateStagingDelivery(preview);
  assert.deepEqual({
    status:simulation.status,transmitted:simulation.transmitted,provider:simulation.provider,
    messageId:simulation.messageId,attachments:simulation.attachments
  },{status:'mock_preview_validated',transmitted:false,provider:'NONE',messageId:null,attachments:2});
  assert.ok(Object.isFrozen(preview));
  assert.ok(Object.isFrozen(preview.attachments));
});
test('optional AVV yes produces exactly three PDFs and includes explicitly named AVV',async()=>{
  const f=setup('yes');
  const preview=await buildStagingContractPreview(f.pkg,f.archiveRead);
  assert.deepEqual(preview.attachments.map(a=>a.kind),['offer','terms','avv']);
  assert.match(preview.html,/TEST_ONLY_avv.pdf/);
  assert.equal(simulateStagingDelivery(preview).attachments,3);
});
test('staging preview fails before reading any PDF on malformed package or non-prepared status',async()=>{
  const f=setup();
  await assert.rejects(buildStagingContractPreview({...f.pkg,packageSha256:'0'.repeat(64)},f.archiveRead),/Snapshot-Pruefsumme/);
  await assert.rejects(buildStagingContractPreview({...f.pkg,status:'sent'},f.archiveRead),/vorbereitete Pakete/);
  assert.deepEqual(f.calls,[]);
});
test('preview refuses archive bytes that differ from frozen metadata',async()=>{
  const f=setup('yes');
  const mutated=Buffer.from(f.source.terms);
  mutated[mutated.length-17]^=1;
  await assert.rejects(buildStagingContractPreview(f.pkg,async(id,doc)=>{
    if(doc.kind==='terms')return mutated;
    return f.archiveRead(id);
  }),/SHA-256/);
});
test('preview refuses missing, non-Buffer and bad-PDF archive content',async()=>{
  const f=setup();
  await assert.rejects(buildStagingContractPreview(f.pkg,async()=>null),/Buffer/);
  await assert.rejects(buildStagingContractPreview(f.pkg,async()=>f.source.offer.toString('base64')),/Buffer/);
  const copied=Buffer.from(f.source.offer);
  copied.write('NOPDF',0,'ascii');
  await assert.rejects(buildStagingContractPreview(f.pkg,async()=>copied),/PDF-Inhalt|Groesse/);
});
test('real customer documents or contracts without TEST_ONLY flags never enter staging mail preview',async()=>{
  const f=setup('yes');
  const badCases=[
    {...f.pkg,documents:f.pkg.documents.map(d=>d.kind==='offer'?{...d,filename:'LiveOffer.pdf'}:d)},
    {...f.pkg,documents:f.pkg.documents.map(d=>d.kind==='terms'?{...d,version:'v1_final'}:d)},
    {...f.pkg,documents:f.pkg.documents.map(d=>d.kind==='avv'?{...d,archiveFileId:'driveProdAVV_10000'}:d)}
  ];
  for(const invalid of badCases){
    // Recompute package SHA after intentionally changing metadata, so rejection
    // must come from the explicit TEST_ONLY block rather than hash mismatch.
    const repacked=prepareOfferPackage({
      offerId:invalid.offerId,offerNumber:invalid.offerNumber,revision:invalid.revision,
      offerSnapshotSha256:invalid.offerSnapshotSha256,
      avvRequired:invalid.avvRequired,avvAnnexesConfirmed:invalid.avvAnnexesConfirmed,
      documents:invalid.documents
    });
    await assert.rejects(buildStagingContractPreview(repacked,f.archiveRead),/echten Kunden- oder Vertrags-PDFs/);
  }
});
test('safe preview has fixed undeliverable recipient and no arbitrary options',async()=>{
  const f=setup();
  await assert.rejects(buildStagingContractPreview(f.pkg,f.archiveRead,{
    to:'real-customer@example.ch'
  }),/Unbekannte Vorschauoption/);
  await assert.rejects(buildStagingContractPreview(f.pkg,f.archiveRead,{
    label:'<script>alert(1)</script>'
  }),/Anzeigename/);
  const valid=await buildStagingContractPreview(f.pkg,f.archiveRead,{label:'TEST_ONLY Firmenkontakt'});
  assert.equal(valid.to,'preview@example.invalid');
});
test('tampering with preview recipient, mode, kind, bytes or SHA breaks the offline simulation',async()=>{
  const f=setup('yes');
  const preview=await buildStagingContractPreview(f.pkg,f.archiveRead);
  const forged=[
    {...preview,to:'client@example.ch'},
    {...preview,kind:'offer_send'},
    {...preview,sendMode:'production'},
    {...preview,neverSend:false},
    {...preview,simulated:false},
    {...preview,eventId:'stolen'},
    {...preview,attachments:preview.attachments.slice(0,2)},
    {...preview,attachments:preview.attachments.map((a,i)=>i? a : {...a,base64:'UEZG'} )},
    {...preview,documentHashes:preview.documentHashes.map((d,i)=>i?d:{...d,sha256:'f'.repeat(64)})}
  ];
  for(const p of forged)assert.throws(()=>simulateStagingDelivery(p),/Staging-Vertragspaket/);
});
test('oversized combined test PDFs fail closed before constructing any outbound payload',async()=>{
  const f=setup('no');
  const huge=Buffer.concat([Buffer.from('%PDF-1.4\nTEST_ONLY\n'),Buffer.alloc(4_200_000,65)]);
  const docs=f.pkg.documents.map((d,i)=>({
    ...d,bytes:huge.length,sha256:digest(i?Buffer.concat([huge,Buffer.from('B')]):huge)
  }));
  // Both PDFs are valid individual files according to Phase A. Total >8 MB.
  const hugeTwo=Buffer.concat([huge,Buffer.from('B')]);
  const pkg=prepareOfferPackage({
    offerId:f.pkg.offerId,offerNumber:f.pkg.offerNumber,revision:1,
    offerSnapshotSha256:f.pkg.offerSnapshotSha256,
    avvRequired:'no',avvAnnexesConfirmed:false,
    documents:docs.map((d,i)=>({...d,bytes:i?hugeTwo.length:huge.length}))
  });
  await assert.rejects(buildStagingContractPreview(pkg,async(id)=>id.includes('offer')?huge:hugeTwo),/Gesamt-Paket zu gross/);
});
test('integration guard: no live CRM import, no webhook, Gmail or global fetch in preview module',()=>{
  const server=fs.readFileSync(path.join(__dirname,'../server.js'),'utf8');
  const sender=fs.readFileSync(path.join(__dirname,'../offer-send.js'),'utf8');
  const packagePreview=fs.readFileSync(path.join(__dirname,'../offer-contract-package-preview.js'),'utf8');
  for(const source of [server,sender]){
    assert.doesNotMatch(source,/require\s*\(\s*['"]\.\/offer-contract-package-preview['"]\s*\)/);
  }
  assert.doesNotMatch(packagePreview,/\b(?:globalThis\.fetch|fetch\(|https?\.request|axios|gmail\.send|make\.com|hook\.eu1)\b/);
  assert.doesNotMatch(packagePreview,/require\s*\(\s*['"](?:@google-cloud|googleapis|node:fs|node:https)/);
});
