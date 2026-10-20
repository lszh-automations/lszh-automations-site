'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
let createInternalAirtableReader,createInternalDriveReader,createInternalRecoveryLoader,createInternalGmailSender,createInternalFirestoreReaders;
test.before(async()=>{({createInternalAirtableReader,createInternalDriveReader,createInternalRecoveryLoader,createInternalGmailSender,createInternalFirestoreReaders}=await import('../cloud-run/offer-portal-staging/internalRecoveryProviders.mjs'));});
const sha=x=>createHash('sha256').update(x).digest('hex');
const recordId='recR70ZSPynGqA1LS',number='TEST_INTERNAL_LARS_20261019_NO_CONTRACT';
const folder='10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko',email='lars.schulthess@outlook.com';
const pdf=kind=>Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n%%EOF');
function data(){
 const docs=Object.fromEntries(['quote','terms','receipt'].map((k,i)=>[k,{id:String(i+1).repeat(25),sha256:sha(pdf(k))}]));
 const acceptedAt='2026-10-20T15:05:19.544Z';
 const fields={Offertennummer:number,Status:'Angenommen','Vertragsunterlagen akzeptiert':true,
 'AVV erforderlich':'Nein','Online-Annahme Person':'Lars Schulthess','Online-Annahme E-Mail':email,
 'Online-Annahme Zeitstempel':acceptedAt,'Online-Annahme Vertragsversion':'TEST_v1.0_RC1',
 'Online-Annahme Offerten Drive ID':docs.quote.id,'Online-Annahme Bedingungen Drive ID':docs.terms.id,
 'Online-Annahme Offerten-SHA256':docs.quote.sha256,'Online-Annahme Bedingungen-SHA256':docs.terms.sha256,
 'Online-Annahme Beleg Drive ID':docs.receipt.id};
 const offer={source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',recordId},
 status:'accepted',offerNumber:number,recipientEmail:email,acceptedAt,termsVersion:'TEST_v1.0_RC1',
 bundle:{avv_required:'Nein',quote:docs.quote,terms:docs.terms},
 evidence:{name:'Lars Schulthess',email,offer_number:number,accepted_at_utc:acceptedAt,
 authorized_confirmed:true,quote_confirmed:true,terms_confirmed:true,avv_required:false,avv_confirmed:false,
 quote_pdf_sha256:docs.quote.sha256,terms_pdf_sha256:docs.terms.sha256}};
 return{docs,fields,offer,pin:{recordId,receiptId:docs.receipt.id,sha256:docs.receipt.sha256}};
}
function loader(d,id=recordId){
 return createInternalRecoveryLoader({recordId:id,readRow:async()=>({id,fields:d.fields}),
 readAcceptedOffer:async()=>d.offer,readReceiptPin:async()=>d.pin,readDocument:async id=>{
  const [kind,v]=Object.entries(d.docs).find(([,v])=>v.id===id);
  return{...v,bytes:pdf(kind),mimeType:'application/pdf',readOnly:true,parents:[folder]};
 }});
}
test('Airtable reader is fixed to known internal rows and suppresses secret errors',async()=>{
 let calls=0;
 const read=createInternalAirtableReader({accessToken:'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async(url,options)=>{
  calls++;assert.match(url,/appzJiskpAdaR1HEv\/tbljeIUoD7wwKuSmS\/recR70ZSPynGqA1LS$/);
  assert.equal(options.redirect,'error');return{ok:true,json:async()=>({id:recordId,fields:{}})};
 }});
 await read(recordId);await assert.rejects(read('recUNKNOWN00000000'));assert.equal(calls,1);
 const denied=createInternalAirtableReader({accessToken:'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async()=>{throw Error('SECRET_PROVIDER_BODY');}});
 await assert.rejects(denied(recordId),e=>e.message==='provider_request_unavailable');
});
test('fresh loader maps verified existing PDFs and keeps dispatch approvals false',async()=>{
 const x=await loader(data())();assert.equal(x.documents.length,3);assert.equal(x.dispatchApproved,false);
 assert.equal(x.documents.at(-1).kind,'receipt');assert.equal(x.avvRequired,false);
});
test('completed record returns without Firestore, Drive or receipt-pin access',async()=>{
 const d=data();d.fields['Online-Annahme Bestätigung gesendet am']='2026-10-20T15:14:15Z';
 const forbidden=()=>assert.fail('must not access another provider');
 const load=createInternalRecoveryLoader({recordId,readRow:async()=>({id:recordId,fields:d.fields}),
 readAcceptedOffer:forbidden,readReceiptPin:forbidden,readDocument:forbidden});
 assert.equal((await load()).sentAt,'2026-10-20T15:14:15Z');
});
test('changed source, hash or independently pinned receipt stops before sending',async()=>{
 for(const mutate of [d=>d.fields['Versand freigegeben']=true,
  d=>d.offer.evidence.quote_pdf_sha256='a'.repeat(64),d=>d.pin.receiptId='Z'.repeat(25),
  d=>d.offer.acceptedAt='2026-10-21T00:00:00Z']){
  const d=data();mutate(d);await assert.rejects(loader(d)());
 }
});
test('Drive reads only pinned test-folder PDFs and compares streamed bytes',async()=>{
 const bytes=pdf('quote'),id='1'.repeat(25);let calls=0;
 const read=createInternalDriveReader({getReadToken:async()=>'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async()=>{
  calls++;return calls===1?{ok:true,json:async()=>({id,mimeType:'application/pdf',size:String(bytes.length),sha256Checksum:sha(bytes),parents:[folder],contentRestrictions:[{readOnly:true}]})}:
   {ok:true,body:(async function*(){yield bytes;})()};
 }});
 assert.equal((await read(id)).bytes.equals(bytes),true);
});
test('wrong archive or unlocked file is rejected before any PDF download',async()=>{
 let calls=0;
 const read=createInternalDriveReader({getReadToken:async()=>'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async()=>{
  calls++;return{ok:true,json:async()=>({id:'1'.repeat(25),mimeType:'application/pdf',size:100,
   sha256Checksum:'a'.repeat(64),parents:['wrong-folder'],contentRestrictions:[]})};
 }});
 await assert.rejects(read('1'.repeat(25)));assert.equal(calls,1);
});
test('Gmail sender defaults off, validates account and emits fixed three-PDF MIME',async()=>{
 assert.equal(createInternalGmailSender(),undefined);
 const input=await loader(data())(),requests=[];
 const send=createInternalGmailSender({enabled:true,getSendToken:async()=>'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async(url,options)=>{
  requests.push({url,options});return{ok:true,json:async()=>url.endsWith('/profile')?{emailAddress:'lars@lszh-automations.ch'}:{id:'FAKE_PROVIDER_ID'}};
 }});
 const result=await send({to:[email],cc:[],bcc:[],subject:'TEST_ONLY – vorhandener Annahmebeleg – kein Vertrag',
 correlationKey:'a'.repeat(64),attachments:input.documents.map(d=>({filename:'TEST_ONLY_'+d.kind+'.pdf',data:d.bytes}))});
 assert.equal(result.id,'FAKE_PROVIDER_ID');assert.equal(requests.length,2);
 const mime=Buffer.from(JSON.parse(requests[1].options.body).raw,'base64url').toString();
 assert.match(mime,/To: lars\.schulthess@outlook\.com/);assert.equal((mime.match(/Content-Type: application\/pdf/g)||[]).length,3);
 assert.doesNotMatch(mime,/Bcc:|Cc:/);assert.equal(requests[1].options.redirect,'error');
});
test('wrong Gmail account or arbitrary recipient cannot reach send endpoint',async()=>{
 let calls=0;const input=await loader(data())();
 const send=createInternalGmailSender({enabled:true,getSendToken:async()=>'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async()=>{
  calls++;return{ok:true,json:async()=>({emailAddress:'other@example.invalid'})};
 }});
 const mail={to:[email],cc:[],bcc:[],subject:'TEST_ONLY – vorhandener Annahmebeleg – kein Vertrag',correlationKey:'a'.repeat(64),
 attachments:input.documents.map(d=>({filename:'TEST_ONLY_'+d.kind+'.pdf',data:d.bytes}))};
 await assert.rejects(send({...mail,to:['wrong@example.invalid']}));assert.equal(calls,0);
 await assert.rejects(send(mail));assert.equal(calls,1);
});
test('Firestore reader defaults off and rejects customer DB before provider access',()=>{
 assert.throws(()=>createInternalFirestoreReaders({}));
 assert.throws(()=>createInternalFirestoreReaders({projectId:'lszh-automations',databaseId:'lszh-offers',doc:()=>{}},{enabled:true}));
});
test('AVV Ja maps separate consent and Gmail serializes all four existing PDFs',async()=>{
 const d=data(),id='recktLXj5wUxLmHFQ',person='Synthetischer Cloud-Testkunde',recipient='fake-lszh-e2e@example.invalid';
 const version='TEST_ONLY_AVV_v1.0_RC1',number='TEST_CLOUD_AVV_JA_20261019_NO_CONTRACT';
 d.docs.avv={id:'4'.repeat(25),sha256:sha(pdf('avv'))};
 Object.assign(d.fields,{Offertennummer:number,'AVV erforderlich':'Ja','Online-Annahme Person':person,
 'Online-Annahme E-Mail':recipient,'Online-Annahme AVV Drive ID':d.docs.avv.id,
 'Online-Annahme AVV-SHA256':d.docs.avv.sha256,'Online-Annahme AVV ausdrücklich akzeptiert':true,'Online-Annahme AVV-Version':version});
 Object.assign(d.offer,{offerNumber:number,recipientEmail:recipient,details:{avvVersion:version}});
 d.offer.source.recordId=id;Object.assign(d.offer.bundle,{avv_required:'Ja',avv:d.docs.avv});
 Object.assign(d.offer.evidence,{name:person,email:recipient,offer_number:number,avv_required:true,avv_confirmed:true,
 avv_pdf_sha256:d.docs.avv.sha256,avv_version:version});d.pin.recordId=id;
 const input=await loader(d,id)();assert.equal(input.documents.length,4);assert.equal(input.avvConfirmed,true);
 let raw;
 const send=createInternalGmailSender({enabled:true,getSendToken:async()=>'TEST_FAKE_TOKEN_NOT_SECRET',fetcher:async(url,options)=>{
  if(url.endsWith('/profile'))return{ok:true,json:async()=>({emailAddress:'lars@lszh-automations.ch'})};
  raw=Buffer.from(JSON.parse(options.body).raw,'base64url').toString();return{ok:true,json:async()=>({id:'FAKE_ID'})};
 }});
 await send({to:[email],cc:[],bcc:[],subject:'TEST_ONLY – vorhandener Annahmebeleg – kein Vertrag',correlationKey:'a'.repeat(64),
 attachments:input.documents.map(d=>({filename:'TEST_ONLY_'+d.kind+'.pdf',data:d.bytes}))});
 assert.equal((raw.match(/Content-Type: application\/pdf/g)||[]).length,4);assert.match(raw,/TEST_ONLY_avv\.pdf/);
 d.fields['Online-Annahme AVV ausdrücklich akzeptiert']=false;await assert.rejects(loader(d,id)());
});
