'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createPackageMakeTransport}=require('../contract-package-make-transport');
const {createLiveSentVerifier}=require('../contract-gmail-live-verifier');
const {prepareOfferPackage,digest}=require('../offer-contract-package');
function fixture(){
 const bytes=['offer','terms'].map(k=>Buffer.from('%PDF-1.4 '+k+' %%EOF'));
 const docs=bytes.map((b,i)=>({kind:i===0?'offer':'terms',filename:i===0?'Offer.pdf':'Terms.pdf',version:'v1',archiveFileId:'archive_'+i+'_123456',bytes:b.length,sha256:digest(b)}));
 const pkg={...prepareOfferPackage({offerId:'offer_1101',offerNumber:'1101',revision:1,offerSnapshotSha256:'b'.repeat(64),avvRequired:'no',avvAnnexesConfirmed:false,documents:docs}),status:'sent'};
 const recipient='customer@example.com',messageId='synthetic_message_123',raw={id:messageId,labelIds:['SENT'],internalDate:String(Date.parse('2026-10-25T20:00:00Z')),payload:{headers:[{name:'From',value:'LSZH Automations <info@lszh-automations.ch>'},{name:'To',value:recipient},{name:'Subject',value:'Ihre Offerte'},{name:'X-LSZH-Contract-Event',value:pkg.sendEventId},{name:'X-LSZH-Package-SHA256',value:pkg.packageSha256}],parts:docs.map((d,i)=>({filename:d.filename,mimeType:'application/pdf',body:{size:d.bytes,data:bytes[i].toString('base64url')}}))}};
 return {pkg,recipient,messageId,raw,bytes,now:()=>Date.parse('2026-10-25T21:00:00Z')};
}
test('live Gmail verifier independently validates ordinary PDF names without weakening TEST_ONLY normalizer',async()=>{
 const f=fixture(),v=createLiveSentVerifier({read:{getMessage:async()=>f.raw,getAttachment:async()=>{throw Error('not required');}},now:f.now});
 const proof=await v.verify({package:f.pkg,recipient:f.recipient,messageId:f.messageId});assert.equal(proof.verified,true);assert.equal(proof.sender,'info@lszh-automations.ch');
 for(const mutate of [r=>r.payload.headers.push({name:'To',value:'other@example.com'}),r=>r.payload.headers[1].value='other@example.com, <customer@example.com>',r=>r.payload.headers.push({name:'Bcc',value:'other@example.com'}),r=>r.payload.parts[0].body.data=Buffer.from('changed').toString('base64url'),r=>r.payload.headers[4].value='c'.repeat(64)]){
  const r=structuredClone(f.raw);mutate(r);const bad=createLiveSentVerifier({read:{getMessage:async()=>r,getAttachment:async()=>{}},now:f.now});await assert.rejects(bad.verify({package:f.pkg,recipient:f.recipient,messageId:f.messageId}));
 }
});
test('dedicated Make transport performs one request, includes correlation headers and never accepts queued response as sent',async()=>{
 const f=fixture(),body={kind:'contract_package_send',sendMode:'customer',from:'info@lszh-automations.ch',to:[f.recipient],cc:[],bcc:[],eventId:f.pkg.sendEventId,packageSha256:f.pkg.packageSha256,subject:'Ihre Offerte',html:'<p>Ihre Offerte</p>',attachments:f.pkg.documents.map((d,i)=>({filename:d.filename,data:f.bytes[i].toString('base64')}))};
 let requests=0;
 const t=createPackageMakeTransport({enabled:true,webhookUrl:'https://hook.eu1.make.com/synthetic123456',fetchImpl:async(url,opts)=>{requests++;const payload=JSON.parse(opts.body);assert.equal(payload.emailHeaders[0].value,body.eventId);assert.equal(opts.redirect,'error');return Response.json({ok:true,eventId:body.eventId,packageSha256:body.packageSha256,messageId:f.messageId});}});
 await t.sendOnce(body);assert.equal(requests,1);
 const queued=createPackageMakeTransport({enabled:true,webhookUrl:'https://hook.eu1.make.com/synthetic123456',fetchImpl:async()=>{requests++;return new Response('Accepted');}});
 await assert.rejects(queued.sendOnce(body),{code:'PACKAGE_SEND_UNCONFIRMED'});assert.equal(requests,2);
 await assert.rejects(createPackageMakeTransport({webhookUrl:'https://hook.eu1.make.com/synthetic123456'}).sendOnce(body),{code:'PACKAGE_TRANSPORT_DISABLED'});assert.equal(requests,2);
});

test('written confirmation verifies a separate single PDF and its dedicated event header',async()=>{
 const f=fixture(),doc=f.pkg.documents[0];
 f.raw.payload.parts=f.raw.payload.parts.slice(0,1);f.raw.payload.headers[3].value='confirmation_'+f.pkg.packageId;
 const v=createLiveSentVerifier({read:{getMessage:async()=>f.raw,getAttachment:async()=>{}},now:f.now});
 const proof=await v.verify({package:f.pkg,recipient:f.recipient,messageId:f.messageId,confirmationDocument:doc});
 assert.equal(proof.confirmationSha256,doc.sha256);assert.equal(proof.sentAt,'2026-10-25T20:00:00.000Z');
 f.raw.payload.headers[3].value=f.pkg.sendEventId;
 await assert.rejects(v.verify({package:f.pkg,recipient:f.recipient,messageId:f.messageId,confirmationDocument:doc}),{code:'SENT_EVIDENCE_REQUIRED'});
});
