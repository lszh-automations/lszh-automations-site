'use strict';
// Phase B.2: Make-shaped contract payload + mock-only receipt verifier.
// No network, Make webhook, Gmail, Firestore or production route is invoked.
// A transport must be an explicit, injected test function.
const {digest}=require('./offer-contract-package');
const {
  simulateStagingDelivery,PREVIEW_KIND,PREVIEW_MODE,TEST_ADDRESS
}=require('./offer-contract-package-preview');
const KIND='contract_package_staging_mock';
const MODE='staging_mock_only';
const MAX_PAYLOAD=12_000_000;
function denied(reason){
  return Object.assign(new Error('Make-Vertragspaket-Mock abgelehnt: '+reason),{
    code:'STAGING_MAKE_CONTRACT_DENIED',status:400
  });
}
function exactKeys(input,keys){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw denied('Objekt erforderlich');
  if(Object.keys(input).some(key=>!keys.includes(key)))
    throw denied('Unerwartete Payload-Felder');
}
function base64Pdf(value,expectedSha){
  if(typeof value!=='string'||value.length>7_000_000||value.length===0)
    throw denied('PDF-Daten fehlen');
  const data=Buffer.from(value,'base64');
  if(data.toString('base64')!==value||
     data.subarray(0,5).toString('ascii')!=='%PDF-'||
     digest(data)!==expectedSha)
    throw denied('PDF-Daten oder SHA-256 manipuliert');
  return data.length;
}
function buildMakeContractMockEnvelope(preview){
  const summary=simulateStagingDelivery(preview);
  if(preview.kind!==PREVIEW_KIND||preview.sendMode!==PREVIEW_MODE)
    throw denied('Unbekannter Preview-Typ');
  const attachments=preview.attachments.map((item,i)=>Object.freeze({
    kind:item.kind,
    filename:item.filename,
    mimeType:item.mimeType,
    contentBase64:item.base64,
    sha256:preview.documentHashes[i].sha256,
    bytes:preview.documentHashes[i].bytes
  }));
  const message=Object.freeze({
    kind:KIND,sendMode:MODE,neverSend:true,
    to:TEST_ADDRESS,eventId:preview.eventId,
    packageId:preview.packageId,packageSha256:preview.packageSha256,
    subject:preview.subject,html:preview.html,
    attachmentCount:summary.attachments,
    attachments:Object.freeze(attachments)
  });
  inspectMakeContractMockEnvelope(message);
  return message;
}
function inspectMakeContractMockEnvelope(message){
  exactKeys(message,[
    'kind','sendMode','neverSend','to','eventId','packageId',
    'packageSha256','subject','html','attachmentCount','attachments'
  ]);
  if(message.kind!==KIND||message.sendMode!==MODE||
     message.neverSend!==true||message.to!==TEST_ADDRESS)
    throw denied('Versand- oder Empfaenger-Modus nicht erlaubt');
  if(typeof message.eventId!=='string'||
     !/^contract_send_pkg_[A-Za-z0-9_-]{1,100}_r[1-9][0-9]{0,6}$/.test(message.eventId)||
     typeof message.packageId!=='string'||
     message.eventId!=='contract_send_'+message.packageId||
     typeof message.packageSha256!=='string'||!/^[a-f0-9]{64}$/.test(message.packageSha256))
    throw denied('Paketidentitaet fehlt');
  if(!Array.isArray(message.attachments)||![2,3].includes(message.attachments.length)||
     message.attachmentCount!==message.attachments.length)
    throw denied('Anhanganzahl nicht 2 oder 3');
  if(typeof message.subject!=='string'||!message.subject.startsWith('[TEST_ONLY – KEIN VERSAND]')||
     typeof message.html!=='string'||!message.html.includes('KEIN VERTRAG')||
     Buffer.byteLength(message.html,'utf8')>60_000)
    throw denied('Unmarkierte Testmail');
  const required=message.attachmentCount===2?['offer','terms']:['offer','terms','avv'];
  let total=0;
  for(let i=0;i<required.length;i++){
    const att=message.attachments[i];
    exactKeys(att,['kind','filename','mimeType','contentBase64','sha256','bytes']);
    if(att.kind!==required[i]||att.mimeType!=='application/pdf'||
       typeof att.filename!=='string'||!/^TEST_ONLY_[A-Za-z0-9_.-]+\.pdf$/.test(att.filename)||
       !/^[a-f0-9]{64}$/.test(att.sha256||'')||
       !Number.isSafeInteger(att.bytes)||att.bytes<10||att.bytes>5_000_000)
      throw denied('Anhang-Metadaten nicht konform');
    const length=base64Pdf(att.contentBase64,att.sha256);
    if(length!==att.bytes)throw denied('Anhang-Groesse falsch');
    total+=length;
    if(total>8_000_000)throw denied('Dokumente zu gross');
  }
  if(Buffer.byteLength(JSON.stringify(message),'utf8')>MAX_PAYLOAD)
    throw denied('Payload zu gross');
  return Object.freeze({eventId:message.eventId,packageSha256:message.packageSha256,count:required.length,totalBytes:total});
}
function verifyMockMakeReceipt(envelope,receipt){
  const {eventId,packageSha256,count}=inspectMakeContractMockEnvelope(envelope);
  exactKeys(receipt,[
    'ok','eventId','packageSha256','attachmentCount',
    'simulated','transmitted','provider','messageId'
  ]);
  if(receipt.ok!==true||receipt.eventId!==eventId||
     receipt.packageSha256!==packageSha256||receipt.attachmentCount!==count||
     receipt.simulated!==true||receipt.transmitted!==false||
     receipt.provider!=='NONE'||receipt.messageId!==null)
    throw denied('Mock-Quittung nicht exakt verifiziert');
  return Object.freeze({
    status:'mock_gateway_confirmed_no_delivery',
    eventId,packageSha256,attachments:count,
    transmitted:false,provider:'NONE',messageId:null
  });
}
function createMockMakeContractClient(mockGateway){
  if(typeof mockGateway!=='function')throw denied('Injizierter Test-Gateway fehlt');
  const attempted=new Set();
  return Object.freeze({
    async simulate(preview){
      const envelope=buildMakeContractMockEnvelope(preview);
      if(attempted.has(envelope.eventId))
        throw denied('Doppelversuch gesperrt; keine Wiederholung');
      // Reserve BEFORE invoking a simulated provider; ambiguous results stay blocked.
      attempted.add(envelope.eventId);
      const receipt=await mockGateway(envelope);
      return verifyMockMakeReceipt(envelope,receipt);
    }
  });
}
module.exports={
  KIND,MODE,
  buildMakeContractMockEnvelope,inspectMakeContractMockEnvelope,
  verifyMockMakeReceipt,createMockMakeContractClient
};
