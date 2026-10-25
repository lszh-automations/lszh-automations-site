'use strict';
// STAGING-ONLY: create a safe 2/3 PDF preview, NEVER transmit it.
// This file is deliberately not imported from server.js or offer-send.js.
// Future delivery requires a separately reviewed and authorised transport.
const {
  digest,verifyOfferPackage,verifyDocumentBytes
}=require('./offer-contract-package');

const MAX_PACKAGE_BYTES=8_000_000;
const MAX_SINGLE_PDF_BYTES=5_000_000;
const PREVIEW_KIND='contract_package_preview_only';
const PREVIEW_MODE='staging_mock_only';
const TEST_ADDRESS='preview@example.invalid';

function fail(reason){
  return Object.assign(new Error('Staging-Vertragspaket: '+reason),{
    code:'STAGING_CONTRACT_PREVIEW_BLOCKED',status:400
  });
}
function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,character=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[character]);
}
function safeDisplay(value,max){
  if(typeof value!=='string'||value.length<1||value.length>max||
     /[<>\r\n\x00-\x1f]/.test(value))
    throw fail('Ungueltiger Anzeigename');
  return value;
}
function assertPreview(preview){
  if(!preview||typeof preview!=='object'||Array.isArray(preview)||
     preview.kind!==PREVIEW_KIND||preview.sendMode!==PREVIEW_MODE||
     preview.to!==TEST_ADDRESS||preview.neverSend!==true||
     preview.simulated!==true)
    throw fail('Nur interne MOCK-Pakete erlaubt');
  if(!/^contract_send_pkg_[A-Za-z0-9_-]{1,100}_r[1-9][0-9]{0,6}$/.test(preview.eventId||'')||
     typeof preview.packageSha256!=='string'||!(/^[0-9a-f]{64}$/).test(preview.packageSha256))
    throw fail('Fehlender Paketevent- oder Paket-Hash');
  if(!Array.isArray(preview.attachments)||
     ![2,3].includes(preview.attachments.length)||
     !Array.isArray(preview.documentHashes)||
     preview.documentHashes.length!==preview.attachments.length)
    throw fail('Dokumentanzahl nicht konsistent');
  const expectedKinds=preview.attachments.length===2?['offer','terms']:['offer','terms','avv'];
  let total=0;
  for(let i=0;i<preview.attachments.length;i++){
    const attachment=preview.attachments[i],doc=preview.documentHashes[i];
    if(!attachment||!doc||attachment.kind!==expectedKinds[i]||doc.kind!==expectedKinds[i]||
       typeof attachment.filename!=='string'||
       !/^TEST_ONLY_[A-Za-z0-9_.-]+\.pdf$/.test(attachment.filename)||
       attachment.mimeType!=='application/pdf'||
       typeof attachment.base64!=='string'||attachment.base64.length>7_000_000||
       !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.base64)||
       !Number.isSafeInteger(doc.bytes)||doc.bytes>MAX_SINGLE_PDF_BYTES||doc.bytes<10||
       !/^[a-f0-9]{64}$/.test(doc.sha256||''))
      throw fail('Anlage ohne sichere TEST_ONLY-Metadaten');
    const data=Buffer.from(attachment.base64,'base64');
    if(data.length!==doc.bytes||digest(data)!==doc.sha256||
       data.subarray(0,5).toString('ascii')!=='%PDF-')
      throw fail('Mock-Anlage veraendert oder ungueltig');
    total+=data.length;
    if(total>MAX_PACKAGE_BYTES)throw fail('Mock-Paket ist zu gross');
  }
  if(!preview.subject?.startsWith('[TEST_ONLY – KEIN VERSAND]')||
     typeof preview.html!=='string'||!preview.html.includes('TEST_ONLY'))
    throw fail('Deutliche Testkennzeichnung fehlt');
  return Object.freeze({attachments:preview.attachments.length,totalBytes:total});
}

async function buildStagingContractPreview(pkg,readArchivedPdf,options={}){
  // readArchivedPdf is a TEST FIXTURE dependency, not a Make/Drive client.
  // This module never performs any network, Firestore or filesystem I/O.
  verifyOfferPackage(pkg);
  if(pkg.status!=='prepared')throw fail('Nur vorbereitete Pakete koennen Vorschau erhalten');
  if(typeof readArchivedPdf!=='function')throw fail('Test-PDF-Quelle fehlt');
  if(options&&Object.keys(options).some(key=>key!=='label'))
    throw fail('Unbekannte Vorschauoption');
  const label=safeDisplay(options?.label||'LSZH TEST_ONLY Musterkunde',100);
  const attachments=[];
  const documentHashes=[];
  let total=0;
  for(const doc of pkg.documents){
    if(!doc.filename.startsWith('TEST_ONLY_')||!doc.version.includes('TEST_ONLY')||
       !doc.archiveFileId.startsWith('test_'))
      throw fail('Keine echten Kunden- oder Vertrags-PDFs im Staging-Mock zulassen');
    const source=await readArchivedPdf(doc.archiveFileId,doc);
    if(!Buffer.isBuffer(source))throw fail('Staging-PDF muss ein Buffer sein');
    verifyDocumentBytes(doc,source);
    if(source.length>MAX_SINGLE_PDF_BYTES)throw fail('Einzel-PDF zu gross');
    total+=source.length;
    if(total>MAX_PACKAGE_BYTES)throw fail('Gesamt-Paket zu gross');
    attachments.push(Object.freeze({
      kind:doc.kind,mimeType:'application/pdf',
      filename:doc.filename,base64:source.toString('base64')
    }));
    documentHashes.push(Object.freeze({
      kind:doc.kind,version:doc.version,
      sha256:doc.sha256,bytes:doc.bytes
    }));
  }
  const preview=Object.freeze({
    kind:PREVIEW_KIND,sendMode:PREVIEW_MODE,neverSend:true,simulated:true,
    to:TEST_ADDRESS,eventId:pkg.sendEventId,packageId:pkg.packageId,
    packageSha256:pkg.packageSha256,
    subject:'[TEST_ONLY – KEIN VERSAND] Vertragsunterlagen Offerte Nr. '+pkg.offerNumber,
    html:'<!doctype html><html lang="de-CH"><body style="font-family:Arial,Helvetica,sans-serif;background:#f4f7fb;color:#06101d;">'+
      '<div style="max-width:600px;margin:24px auto;padding:28px;background:#fff;border-top:8px solid #5b8cff;">'+
      '<strong style="font-size:22px;">LSZH Automations</strong>'+
      '<p style="color:#b42318;font-weight:bold;">TEST_ONLY – KEIN VERSAND – KEIN VERTRAG</p>'+
      '<p>Interne Vorschau fuer '+escapeHtml(label)+': Offerte Nr. '+escapeHtml(pkg.offerNumber)+'.</p>'+
      '<p>Anlagen: '+attachments.map(a=>escapeHtml(a.filename)).join(', ')+'.</p>'+
      '<p>Dies ist ausschliesslich eine technische Simulation. Keine Unterschrift, keine Annahme.</p>'+
      '</div></body></html>',
    attachments:Object.freeze(attachments),documentHashes:Object.freeze(documentHashes)
  });
  assertPreview(preview);
  return preview;
}
function simulateStagingDelivery(preview){
  // Deliberately NO fetch, Gmail, Make, webhook or filesystem calls.
  const summary=assertPreview(preview);
  return Object.freeze({
    status:'mock_preview_validated',
    simulationOnly:true,transmitted:false,provider:'NONE',
    eventId:preview.eventId,packageId:preview.packageId,
    attachments:summary.attachments,totalBytes:summary.totalBytes,
    messageId:null
  });
}
module.exports={
  buildStagingContractPreview,simulateStagingDelivery,
  PREVIEW_KIND,PREVIEW_MODE,TEST_ADDRESS
};
