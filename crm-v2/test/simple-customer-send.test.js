'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createInvitationDelivery,createInvitationTransport,createInvitationSentVerifier,invitationKey}=require('../simple-customer-send');
const {pubKey}=require('../contract-package-publisher');
const {createCrmContractActions,draftKey}=require('../contract-crm-actions');
function fixture(){
 const id='offer_1201',pkg={packageId:'pkg_offer_1201_r1',offerId:id,offerNumber:'1201',packageSha256:'a'.repeat(64),avvRequired:'no'},rows=new Map([[pubKey(pkg.packageId),{state:'sent',recipient:'client@example.com',package:pkg}]]);let queue=Promise.resolve(),sends=0,issues=0,lose=false;
 const transaction=async fn=>{let unlock;const prev=queue;queue=new Promise(r=>unlock=r);await prev;const writes=[];try{const result=await fn({get:async k=>structuredClone(rows.get(k)||null),set:(k,v)=>writes.push([k,v]),create:(k,v)=>{if(rows.has(k))throw Error('duplicate');writes.push([k,v]);}});for(const[k,v]of writes)rows.set(k,structuredClone(v));return result;}finally{unlock();}};
 const publisher={issueLink:async()=>{issues++;return {token:'t'.repeat(43),expiresAt:'2026-10-26T22:00:00Z'};}};
 const options={transaction,publisher,portalOrigin:'https://portal.example',sendOnce:async()=>{sends++;if(lose)throw Error('lost response');return {messageId:'gmail_message_123'};},verifySent:async input=>({verified:true,messageId:input.messageId})};
 return {id,pkg,rows,transaction,publisher,options,service:createInvitationDelivery(options),sends:()=>sends,issues:()=>issues,lose:()=>lose=true};
}
test('parallel invitation requests generate one link and send one verified invitation',async()=>{const f=fixture();await Promise.all([f.service.deliver(f.pkg.packageId,{}),createInvitationDelivery(f.options).deliver(f.pkg.packageId,{})]);assert.equal(f.sends(),1);assert.equal(f.issues(),1);assert.equal(f.rows.get(invitationKey(f.pkg.packageId)).state,'sent');assert.equal(JSON.stringify(f.rows.get(invitationKey(f.pkg.packageId))).includes('t'.repeat(43)),false);});
test('lost invitation receipt retains its claim across service replacement and never resends',async()=>{const f=fixture();f.lose();assert.equal((await f.service.deliver(f.pkg.packageId,{})).state,'delivery_review');await createInvitationDelivery(f.options).deliver(f.pkg.packageId,{});assert.equal(f.sends(),1);assert.equal(f.issues(),1);});
test('invitation is blocked before independent PDF SENT proof',async()=>{const f=fixture();f.rows.get(pubKey(f.pkg.packageId)).state='delivery_review';await assert.rejects(f.service.deliver(f.pkg.packageId,{}),{code:'SENT_EVIDENCE_REQUIRED'});assert.equal(f.sends(),0);assert.equal(f.issues(),0);});
test('central action executes draft, verification, dispatch and invitation in order',async()=>{
 const f=fixture(),order=[],snapshot='b'.repeat(64);f.rows.delete(pubKey(f.pkg.packageId));f.rows.set('crmOffer:'+f.id,{status:'Bereit'});
 const actions=createCrmContractActions({transaction:f.transaction,portalOrigin:'https://portal.example',preparation:{preview:async()=>({offerSnapshotSha256:snapshot}),prepare:async()=>{order.push('archive');f.rows.set(draftKey(f.id),{package:f.pkg,recipient:'client@example.com'});}},publisher:{prepare:async()=>order.push('verify'),dispatch:async()=>{order.push('dispatch');return {state:'sent'};}},invitations:{deliver:async()=>{order.push('invite');return {state:'sent'};}}});
 const result=await actions.act(f.id,'send',{avvRequired:'no',documentsReviewed:true,retentionApproved:true,offerSnapshotSha256:snapshot},{});assert.deepEqual(order,['archive','verify','dispatch','invite']);assert.equal(result.invitationState,'sent');
});
test('changed preview or missing review prevents every write and send',async()=>{const f=fixture();f.rows.set('crmOffer:'+f.id,{status:'Bereit'});let writes=0;const actions=createCrmContractActions({transaction:f.transaction,portalOrigin:'https://portal.example',preparation:{preview:async()=>({offerSnapshotSha256:'b'.repeat(64)}),prepare:async()=>writes++},invitations:{deliver:async()=>writes++},publisher:{dispatch:async()=>writes++}});await assert.rejects(actions.act(f.id,'send',{avvRequired:'no',documentsReviewed:true,retentionApproved:true,offerSnapshotSha256:'c'.repeat(64)},{}),{code:'PREVIEW_CHANGED'});assert.equal(writes,0);await assert.rejects(actions.act(f.id,'send',{},{}),{code:'PACKAGE_REVIEW_REQUIRED'});assert.equal(writes,0);});
test('invitation transport rejects substituted origins, header injection and mismatched acknowledgements',async()=>{
 let calls=0;const send=createInvitationTransport({webhookUrl:'https://hook.eu1.make.com/synthetic',portalOrigin:'https://portal.example',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>({ok:true,eventId:'wrong',messageId:'gmail_123'})};}}),body={kind:'customer_acceptance_invitation',recipient:'client@example.com',url:'https://portal.example/#'+'t'.repeat(43),offerNumber:'1201',eventId:'invitation_pkg_offer_1201_r1',packageSha256:'a'.repeat(64)};
 for(const patch of [{url:'https://other.example/#'+'t'.repeat(43)},{recipient:'client@example.com\r\nBcc:x@example.com'},{offerNumber:'<script>'}])await assert.rejects(send({...body,...patch}));assert.equal(calls,0);await assert.rejects(send(body),{code:'INVITATION_UNCONFIRMED'});assert.equal(calls,1);
});
test('invitation verification binds exact recipient, package, event, SENT folder and link',async()=>{
 const url='https://portal.example/#'+'t'.repeat(43),input={messageId:'gmail_123',recipient:'client@example.com',eventId:'invitation_pkg_offer_1201_r1',packageSha256:'a'.repeat(64),url};
 const raw={id:input.messageId,labelIds:['SENT'],payload:{mimeType:'text/html',headers:[{name:'From',value:'"LSZH Automations" <info@lszh-automations.ch>'},{name:'To',value:input.recipient},{name:'X-LSZH-Invitation-Event',value:input.eventId},{name:'X-LSZH-Package-SHA256',value:input.packageSha256}],body:{data:Buffer.from('<a href="'+url+'">Prüfen</a>').toString('base64url')}}};
 let current=raw;const verify=createInvitationSentVerifier({read:{getMessage:async()=>current}});assert.equal((await verify(input)).verified,true);
 for(const change of [r=>r.labelIds=[],r=>r.payload.headers[1].value='other@example.com',r=>r.payload.body.data=Buffer.from('<a href="https://other.example">X</a>').toString('base64url'),r=>r.payload.parts=[{filename:'unexpected.pdf'}]]){current=structuredClone(raw);change(current);await assert.rejects(verify(input),{code:'INVITATION_UNCONFIRMED'});}
});

test('uncertain PDF dispatch cannot issue or mail an invitation',async()=>{
 const f=fixture(),snapshot='b'.repeat(64);f.rows.delete(pubKey(f.pkg.packageId));f.rows.set('crmOffer:'+f.id,{status:'Bereit'});f.rows.set(draftKey(f.id),{package:f.pkg,recipient:'client@example.com'});let invitations=0;
 const actions=createCrmContractActions({transaction:f.transaction,portalOrigin:'https://portal.example',preparation:{preview:async()=>({offerSnapshotSha256:snapshot})},publisher:{prepare:async()=>{},dispatch:async()=>({state:'delivery_review',mayAutoRetry:false})},invitations:{deliver:async()=>invitations++}});
 const result=await actions.act(f.id,'send',{avvRequired:'no',documentsReviewed:true,retentionApproved:true,offerSnapshotSha256:snapshot},{});assert.equal(result.state,'delivery_review');assert.equal(invitations,0);
});
