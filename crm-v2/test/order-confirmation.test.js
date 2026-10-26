'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/acceptance-fixture');
const {key}=require('../contract-acceptance-store-staging');
const {digest}=require('../offer-contract-package');
const {createOrderConfirmation,createConfirmationTransport,confirmationKey}=require('../order-confirmation');
const {createAcceptanceReview}=require('../contract-acceptance-review');
const {createLiveSentVerifier}=require('../contract-gmail-live-verifier');
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function setup(){
 const f=fixture({avv:'no'}),id=f.pkg.offerId,pkg={...f.pkg,status:'awaiting_lszh_confirmation'},responseId='response_'+'1'.repeat(32),at=new Date(f.now()).toISOString();
 const evidence={responseId,packageSha256:pkg.packageSha256,recipient:f.recipient,acceptedAt:at};
 const rows=new Map([['crmOffer:'+id,{status:'Versendet',onlineAcceptance:{state:pkg.status,reviewRequired:false,archiveState:'complete',archiveFileId:'synthetic_evidence_123',packageId:pkg.packageId,packageSha256:pkg.packageSha256,responseId,reviewedAt:at}}],[key('package',pkg.packageId),{package:pkg,recipient:f.recipient}],[key('response',pkg.packageId),evidence],['archive_'+responseId,{state:'complete',archiveFileId:'synthetic_evidence_123',evidenceSha256:digest(Buffer.from(canonical(evidence)))}]]);
 let tail=Promise.resolve(),sends=0,archives=0,raw,failRead=false,failSend=false,failArchive=false;
 const transaction=work=>{const run=tail.then(()=>work({get:async k=>structuredClone(rows.get(k)||null),set:(k,v)=>rows.set(k,structuredClone(v)),create:(k,v)=>{if(rows.has(k))throw Error('duplicate');rows.set(k,structuredClone(v));}}));tail=run.catch(()=>{});return run;};
 const authorizeOperator=async user=>user?.email==='operator@example.com'?{verified:true,email:user.email}:null;
 const sent=createLiveSentVerifier({now:f.now,read:{getMessage:async()=>{if(failRead)throw Error('temporary');return raw;},getAttachment:async()=>{throw Error('not needed');}}});
 const review=createAcceptanceReview({transaction,authorizeOperator,now:f.now,enabled:true,verifyWrittenConfirmation:async({messageId,package:pkg,recipient})=>sent.verify({package:pkg,recipient,messageId,confirmationDocument:rows.get('confirmationDocument_'+digest(Buffer.from(pkg.packageId))).document})});
 const archived=new Map();
 const options={transaction,authorizeOperator,review,now:f.now,enabled:true,
  archivePdf:async({bytes})=>{archives++;if(failArchive)throw Error('archive');archived.set('synthetic_confirmation_pdf',bytes);return 'synthetic_confirmation_pdf';},readArchivedPdf:async id=>archived.get(id),
  sendOnce:async body=>{sends++;if(failSend)throw Error('timeout_after_send');raw={id:'synthetic_gmail_123',labelIds:['SENT'],internalDate:String(f.now()),payload:{headers:[{name:'From',value:'LSZH Automations <info@lszh-automations.ch>'},{name:'To',value:body.to[0]},{name:'Subject',value:body.subject},{name:'X-LSZH-Contract-Event',value:body.eventId},{name:'X-LSZH-Package-SHA256',value:body.packageSha256}],parts:body.attachments.map(a=>({filename:a.filename,mimeType:'application/pdf',body:{size:Buffer.from(a.data,'base64').length,data:Buffer.from(a.data,'base64').toString('base64url')}}))}};return {ok:true,messageId:raw.id,eventId:body.eventId,packageSha256:body.packageSha256};}};
 const service=createOrderConfirmation(options),user={email:'operator@example.com'};
 return {f,id,pkg,rows,options,service,user,counts:()=>({sends,archives}),failRead:v=>{failRead=v;},failSend:()=>{failSend=true;},failArchive:()=>{failArchive=true;}};
}
async function input(x){const p=await x.service.preview(x.id,x.user);return {documentReviewed:true,sha256:p.sha256};}
test('confirmation preview is stable, bound to accepted documents and performs no writes',async()=>{
 const x=setup(),p=await x.service.preview(x.id,x.user),q=await x.service.preview(x.id,x.user);
 assert.equal(p.data,q.data);assert.equal(p.sha256,q.sha256);assert.match(p.text,/TEST_ONLY_terms.pdf/);assert.equal(p.recipient,x.f.recipient);assert.equal(x.rows.size,4);assert.deepEqual(x.counts(),{sends:0,archives:0});
 assert.equal(Buffer.from(p.data,'base64').subarray(0,5).toString(),'%PDF-');
 // Old accepted packages are not retroactively given new contractual terms.
 assert.doesNotMatch(p.text,/eigene Make-Organisation/);
});
test('send archives one PDF, records receipt, independently reads SENT and confirms without a user-supplied Gmail ID',async()=>{
 const x=setup(),result=await x.service.send(x.id,await input(x),x.user);
 assert.equal(result.state,'confirmed');assert.equal(result.crmWinStillManual,true);assert.equal(x.rows.get('crmOffer:'+x.id).status,'Versendet');
 assert.equal(x.rows.get('crmOffer:'+x.id).onlineAcceptance.confirmationMessageId,'synthetic_gmail_123');assert.deepEqual(x.counts(),{sends:1,archives:1});
});
test('concurrent double click and repeat requests cannot send twice',async()=>{
 const x=setup(),body=await input(x);await Promise.allSettled([x.service.send(x.id,body,x.user),x.service.send(x.id,body,x.user)]);
 assert.deepEqual(x.counts(),{sends:1,archives:1});assert.equal((await x.service.check(x.id,x.user)).state,'confirmed');
});
test('temporary Gmail read failure retains receipt and checking recovers without another send',async()=>{
 const x=setup(),body=await input(x);x.failRead(true);await assert.rejects(x.service.send(x.id,body,x.user));
 const row=x.rows.get(confirmationKey(x.pkg.packageId));assert.equal(row.state,'manual_review');assert.equal(row.messageId,'synthetic_gmail_123');
 x.failRead(false);assert.equal((await x.service.check(x.id,x.user)).state,'confirmed');assert.deepEqual(x.counts(),{sends:1,archives:1});
});
for(const failure of ['send','archive'])test('ambiguous '+failure+' failure blocks all automatic resends',async()=>{
 const x=setup(),body=await input(x);failure==='send'?x.failSend():x.failArchive();await assert.rejects(x.service.send(x.id,body,x.user));const first=x.counts();
 assert.equal((await x.service.send(x.id,body,x.user)).resendAllowed,false);assert.deepEqual(x.counts(),first);await assert.rejects(x.service.check(x.id,x.user),{code:'CONFIRMATION_RECEIPT_REQUIRED'});
});
test('authorization, document review and stale preview are enforced before a claim',async()=>{
 const x=setup();await assert.rejects(x.service.preview(x.id,{}),{code:'OPERATOR_REQUIRED'});
 await assert.rejects(createOrderConfirmation({...x.options,enabled:false}).preview(x.id,x.user),{code:'CONFIRMATION_DISABLED'});
 for(const body of [{}, {documentReviewed:true,sha256:'a'.repeat(64)}])await assert.rejects(x.service.send(x.id,body,x.user),{code:'CONFIRMATION_PREVIEW_REQUIRED'});
 assert.deepEqual(x.counts(),{sends:0,archives:0});
});
for(const corrupt of ['pending_archive','review','wrong_hash','wrong_evidence','wrong_recipient'])test('confirmation rejects '+corrupt,async()=>{
 const x=setup(),offer=x.rows.get('crmOffer:'+x.id);
 if(corrupt==='pending_archive')offer.onlineAcceptance.archiveState='pending';
 if(corrupt==='review')offer.onlineAcceptance.reviewRequired=true;
 if(corrupt==='wrong_hash')offer.onlineAcceptance.packageSha256='a'.repeat(64);
 if(corrupt==='wrong_evidence')x.rows.get(key('response',x.pkg.packageId)).acceptedAt='2026-10-24T00:00:00Z';
 if(corrupt==='wrong_recipient')x.rows.get(key('package',x.pkg.packageId)).recipient='wrong@example.com';
 await assert.rejects(x.service.preview(x.id,x.user));assert.deepEqual(x.counts(),{sends:0,archives:0});
});
test('transport rejects extra recipients, BCC, wrong events and malformed PDF without a provider call',async()=>{
 const x=setup(),p=await x.service.preview(x.id,x.user);let calls=0;
 const send=createConfirmationTransport({webhookUrl:'https://hook.eu1.make.com/synthetic123456',fetchImpl:async()=>{calls++;return Response.json({ok:true});}});
 const body={kind:'order_confirmation',sendMode:'customer',from:'info@lszh-automations.ch',to:[p.recipient],cc:[],bcc:[],eventId:'confirmation_'+x.pkg.packageId,packageSha256:x.pkg.packageSha256,attachments:[{filename:p.filename,data:p.data}]};
 for(const change of [{to:[p.recipient,'other@example.com']},{bcc:['other@example.com']},{eventId:x.pkg.sendEventId},{attachments:[{filename:p.filename,data:'YQ=='}]}])await assert.rejects(send({...body,...change}),{code:'CONFIRMATION_PAYLOAD_INVALID'});
 assert.equal(calls,0);await send(body);assert.equal(calls,1);
});
module.exports={setup};

test('confirmation mail uses the existing customer brand and preserves the agreed content and PDF',async()=>{
 const {renderConfirmationEmail}=require('../order-confirmation'),x=setup(),p=await x.service.preview(x.id,x.user),html=renderConfirmationEmail(p);let outbound;
 await createOrderConfirmation({...x.options,sendOnce:async body=>{outbound=body;return x.options.sendOnce(body);}}).send(x.id,{documentReviewed:true,sha256:p.sha256},x.user);
 assert.equal(outbound.html,html);assert.equal(outbound.subject,p.subject);assert.equal(outbound.to[0],p.recipient);assert.equal(outbound.attachments.length,1);assert.equal(outbound.attachments[0].data,p.data);
 for(const color of ['#06101d','#5b8cff','#74d8ff','#8e72ff','#0a1728'])assert.ok(html.includes(color));
 assert.match(html,/Ihr Auftrag ist bestätigt/);assert.match(html,/Auftragsbestaetigung_1101.pdf/);assert.match(html,/CHE-369.474.125/);assert.match(html,/Diese Bestätigung ändert die vereinbarten Unterlagen nicht/);
 assert.doesNotMatch(html,/<(?:script|iframe|img|link)\b|\son\w+=|url\(/i);assert.doesNotMatch(html,/Paketreferenz:|SHA-256:/);assert.match(p.text,/Paketreferenz:/);
});
test('mail renderer escapes inserted content and retains version-bound Make instructions',()=>{
 const {renderConfirmationEmail,confirmationText}=require('../order-confirmation'),{MAKE_REQUIREMENTS_VERSION}=require('../make-requirements'),x=setup();
 const pkg={...x.pkg,makeRequirementsVersion:MAKE_REQUIREMENTS_VERSION},text=confirmationText(pkg,x.f.recipient,'2026-10-26T10:00:00Z').join('\n\n');
 const html=renderConfirmationEmail({text:text+'\n\n<script>alert(1)</script>',recipient:'<unsafe>&example.com',filename:'<unsafe>.pdf'});
 assert.match(html,/Ihr Make-Konto und die Einrichtung/);assert.match(html,/eigene Make-Organisation/);assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.match(html,/&lt;unsafe&gt;&amp;example.com/);assert.doesNotMatch(html,/<script>|<unsafe>/);
 const legacy=renderConfirmationEmail({text:confirmationText(x.pkg,x.f.recipient,'2026-10-26T10:00:00Z').join('\n\n'),recipient:x.f.recipient,filename:'test.pdf'});
 assert.doesNotMatch(legacy,/eigene Make-Organisation|Ihr Make-Konto und die Einrichtung/);
});
