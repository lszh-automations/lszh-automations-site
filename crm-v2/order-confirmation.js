'use strict';
// Explicit operator dispatch. Durable claim precedes every external write/send.
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const {key}=require('./contract-acceptance-store-staging');
const {digest,verifyDocumentBytes,verifyOfferPackage}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
const confirmationKey=id=>'confirmationDelivery_'+digest(Buffer.from(id));
const documentKey=id=>'confirmationDocument_'+digest(Buffer.from(id));
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function confirmationText(pkg,recipient,acceptedAt){
 return ['AUFTRAGSBESTÄTIGUNG','Zur Offerte Nr. '+pkg.offerNumber,'Empfänger: '+recipient,
  'Wir bestätigen Ihren Auftrag gemäss der von Ihnen am '+new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',dateStyle:'medium'}).format(new Date(acceptedAt))+' angenommenen Offerte und den zugehörigen Vertragsunterlagen.',
  'Es gelten die Leistungen, Preise und Bedingungen des angenommenen Dokumentpakets. Diese Bestätigung ändert die vereinbarten Unterlagen nicht.',
  'Angenommene Unterlagen:',...pkg.documents.map(d=>d.filename+' (Version '+d.version+')'),
  ...(pkg.makeRequirementsVersion?['Für die Einrichtung verwenden Sie Ihre eigene Make-Organisation. Bitte laden Sie LSZH Automations nach dieser Bestätigung mit den benötigten Berechtigungen ein. Die Einrichtung beginnt nach Prüfung der Zugänge.']:[]),
  'Bei Fragen erreichen Sie uns unter info@lszh-automations.ch.',
  'Paketreferenz: '+pkg.packageId,'SHA-256: '+pkg.packageSha256];
}
async function confirmationPdf(lines,date){
 const pdf=await PDFDocument.create();pdf.setCreationDate(new Date(date));pdf.setModificationDate(new Date(date));
 pdf.setTitle('LSZH Automations – Auftragsbestätigung');
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 let page,y;function next(){page=pdf.addPage([595.28,841.89]);y=687;page.drawRectangle({x:0,y:735,width:596,height:107,color:rgb(.024,.063,.114)});page.drawText('LSZH AUTOMATIONS',{x:46,y:785,size:21,font:bold,color:rgb(1,1,1)});page.drawText('Ein Geschäftsbereich der LSZH Invest GmbH',{x:46,y:760,size:9,font,color:rgb(.72,.81,.9)});page.drawText('LSZH Invest GmbH · Rummelmatt 8 · 5610 Wohlen AG',{x:46,y:40,size:8,font});page.drawText('info@lszh-automations.ch · CHE-369.474.125',{x:46,y:27,size:8,font});}
 next();
 for(let i=0;i<lines.length;i++){
  const size=i===0?18:i>=lines.length-2?8:10,f=i===0?bold:font;let line='';
  const draw=()=>{if(y<80)next();page.drawText(line,{x:46,y,size,font:f});y-=size+5;line='';};
  // Break long unspaced references as well as ordinary text.
  for(const word of lines[i].split(/\s+/)){
   if(line&&f.widthOfTextAtSize(line+' '+word,size)>499)draw();
   if(f.widthOfTextAtSize(word,size)<=499){line+=(line?' ':'')+word;continue;}
   for(const char of word){if(f.widthOfTextAtSize(line+char,size)>499)draw();line+=char;}
  }if(line)draw();y-=12;
 }
 return Buffer.from(await pdf.save({useObjectStreams:false}));
}
function createOrderConfirmation({transaction,authorizeOperator,review,archivePdf,readArchivedPdf,sendOnce,enabled=false,now=Date.now}={}){
 async function allow(user){if(!enabled)throw fault('CONFIRMATION_DISABLED',503);const u=await authorizeOperator(user);if(u?.verified!==true||!u.email)throw fault('OPERATOR_REQUIRED',403);return u.email;}
 async function binding(tx,id){
  const offer=await tx.get('crmOffer:'+id),a=offer?.onlineAcceptance;
  if(offer?.status!=='Versendet'||a?.state!=='awaiting_lszh_confirmation'||a.reviewRequired!==false||a.archiveState!=='complete'||!Number.isFinite(Date.parse(a.reviewedAt)))throw fault('CONFIRMATION_NOT_READY',409);
  const record=await tx.get(key('package',a.packageId)),evidence=await tx.get(key('response',a.packageId)),archive=await tx.get('archive_'+a.responseId);
  if(!record||!evidence||record.package.offerId!==id||evidence.responseId!==a.responseId||evidence.packageSha256!==a.packageSha256||record.package.packageSha256!==a.packageSha256||record.recipient!==evidence.recipient||archive?.state!=='complete'||archive.archiveFileId!==a.archiveFileId||archive.evidenceSha256!==digest(Buffer.from(canonical(evidence))))throw fault('ARCHIVED_RESPONSE_REQUIRED',409);
  verifyOfferPackage(record.package);return {pkg:record.package,recipient:evidence.recipient,acceptedAt:evidence.acceptedAt,responseId:a.responseId,reviewedAt:a.reviewedAt};
 }
 async function preview(id,user){await allow(user);const b=await transaction(tx=>binding(tx,id)),lines=confirmationText(b.pkg,b.recipient,b.acceptedAt),bytes=await confirmationPdf(lines,b.reviewedAt);
  return {recipient:b.recipient,subject:'Ihre Auftragsbestätigung zur Offerte Nr. '+b.pkg.offerNumber,filename:'Auftragsbestaetigung_'+b.pkg.offerNumber+'.pdf',text:lines.join('\n\n'),data:bytes.toString('base64'),sha256:digest(bytes),...{packageSha256:b.pkg.packageSha256}};
 }
 async function check(id,user){await allow(user);const offer=await transaction(tx=>tx.get('crmOffer:'+id));if(offer?.onlineAcceptance?.state==='confirmed')return {state:'confirmed',crmWinStillManual:true};
  const b=await transaction(tx=>binding(tx,id)),row=await transaction(tx=>tx.get(confirmationKey(b.pkg.packageId)));
  if(!row?.messageId||row.packageSha256!==b.pkg.packageSha256||row.responseId!==b.responseId)throw fault('CONFIRMATION_RECEIPT_REQUIRED',409);
  const result=await review.confirm(id,row.messageId,user);
  await transaction(async tx=>{const current=await tx.get(confirmationKey(b.pkg.packageId));tx.set(confirmationKey(b.pkg.packageId),{...current,state:'confirmed',confirmedAt:new Date(now()).toISOString()});});return result;
 }
 async function send(id,input,user){
  const operator=await allow(user),p=await preview(id,user);if(input?.documentReviewed!==true||input.sha256!==p.sha256)throw fault('CONFIRMATION_PREVIEW_REQUIRED',409);
  const b=await transaction(tx=>binding(tx,id)),claim=confirmationKey(b.pkg.packageId),docId=documentKey(b.pkg.packageId);
  const existing=await transaction(async tx=>{const fresh=await binding(tx,id),old=await tx.get(claim),doc=await tx.get(docId);
   if(fresh.responseId!==b.responseId||fresh.pkg.packageSha256!==p.packageSha256||fresh.recipient!==p.recipient)throw fault('CONFIRMATION_NOT_READY',409);
   if(old||doc)return old||{state:'manual_review'};
   tx.create(claim,{state:'preparing',offerId:id,responseId:b.responseId,packageSha256:b.pkg.packageSha256,recipient:b.recipient,approvedBy:operator,pdfSha256:p.sha256,at:new Date(now()).toISOString()});return null;
  });
  if(existing){if(existing.messageId)return check(id,user);return {state:'manual_review',resendAllowed:false};}
  try{
   const bytes=Buffer.from(p.data,'base64'),fileId=await archivePdf({offerId:id,filename:p.filename,bytes,sha256:p.sha256});
   // Correspondence uses the existing archived offer-PDF document schema, outside the accepted package.
   const document={kind:'offer',version:'confirmation-v1',archiveFileId:fileId,filename:p.filename,bytes:bytes.length,sha256:p.sha256};verifyDocumentBytes(document,Buffer.from(await readArchivedPdf(fileId,document)));
   await transaction(async tx=>{await binding(tx,id);const row=await tx.get(claim),old=await tx.get(docId);if(row?.state!=='preparing'||old)throw fault('CONFIRMATION_NOT_READY',409);
    tx.create(docId,{packageSha256:b.pkg.packageSha256,recipient:b.recipient,approvedBy:operator,document});tx.set(claim,{...row,state:'sending',document});
   });
   const eventId='confirmation_'+b.pkg.packageId;
   const receipt=await sendOnce({kind:'order_confirmation',sendMode:'customer',from:'info@lszh-automations.ch',to:[b.recipient],cc:[],bcc:[],eventId,packageSha256:b.pkg.packageSha256,subject:p.subject,html:p.text.split('\n\n').map(x=>'<p>'+escape(x)+'</p>').join(''),attachments:[{filename:p.filename,data:p.data}]});
   if(receipt?.ok!==true||receipt.eventId!==eventId||receipt.packageSha256!==b.pkg.packageSha256||!/^[A-Za-z0-9_-]{4,200}$/.test(receipt.messageId||''))throw fault('CONFIRMATION_RECEIPT_REQUIRED',409);
   // Persist before independent Gmail verification: checking never dispatches again.
   await transaction(async tx=>{const row=await tx.get(claim);tx.set(claim,{...row,state:'verification_pending',messageId:receipt.messageId});});
   return await check(id,user);
  }catch(error){await transaction(async tx=>{const row=await tx.get(claim);if(row&&row.state!=='confirmed')tx.set(claim,{...row,state:'manual_review',error:String(error.code||'UNCONFIRMED').slice(0,80)});});throw error;}
 }
 return Object.freeze({preview,send,check});
}
function createConfirmationTransport({webhookUrl,fetchImpl=fetch}={}){
 return async body=>{
  if(!/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(webhookUrl||''))throw fault('CONFIRMATION_DISABLED',503);
  if(body?.kind!=='order_confirmation'||body.sendMode!=='customer'||body.from!=='info@lszh-automations.ch'||body.to?.length!==1||!/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(body.to[0])||body.cc?.length!==0||body.bcc?.length!==0||!/^confirmation_pkg_[A-Za-z0-9_-]+_r[1-9][0-9]*$/.test(body.eventId)||!/^[a-f0-9]{64}$/.test(body.packageSha256)||body.attachments?.length!==1||!/^Auftragsbestaetigung_[0-9]{1,10}\.pdf$/.test(body.attachments[0].filename))throw fault('CONFIRMATION_PAYLOAD_INVALID',400);
  const data=body.attachments[0].data,bytes=Buffer.from(data,'base64');if(bytes.length>700000||bytes.subarray(0,5).toString()!=='%PDF-'||bytes.toString('base64')!==data)throw fault('CONFIRMATION_PAYLOAD_INVALID',400);
  const r=await fetchImpl(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});const receipt=await r.json().catch(()=>null);if(!r.ok)throw fault('CONFIRMATION_UNCONFIRMED',409);return receipt;
 };
}
module.exports={createOrderConfirmation,createConfirmationTransport,confirmationKey,confirmationPdf,confirmationText};
