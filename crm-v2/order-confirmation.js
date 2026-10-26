'use strict';
// Explicit operator dispatch. Durable claim precedes every external write/send.
const {PDFDocument,StandardFonts,rgb,PDFName,PDFString}=require('pdf-lib');
const {key}=require('./contract-acceptance-store-staging');
const {digest,verifyDocumentBytes,verifyOfferPackage}=require('./offer-contract-package');
const {fault}=require('./contract-acceptance-staging');
const confirmationKey=id=>'confirmationDelivery_'+digest(Buffer.from(id));
const documentKey=id=>'confirmationDocument_'+digest(Buffer.from(id));
const canonical=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const escape=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function makeSetupGuide(){
 return ['MAKE-ANLEITUNG','Make einrichten und LSZH einladen',
  'Einrichtungshilfe nach Ihrer Auftragsbestätigung. Diese Anleitung ergänzt keine Vertragsbedingungen. Stand: 26.10.2026.',
  '1. Eigenes Konto: Registrieren Sie sich über unseren Partnerlink mit Ihrer geschäftlichen E-Mail-Adresse. Haben Sie bereits ein Firmenkonto, verwenden Sie dieses.',
  'Registrierung: https://www.make.com/en/register?pc=lszhautomations',
  'Ihr Startvorteil: Bei Neuregistrierung über diesen Partnerlink erhalten Sie 10’000 Credits gratis im ersten Monat gemäss den Make-Aktionsbedingungen. Bei einem späteren kostenpflichtigen Abonnement erhält LSZH Automations eine Provision von Make.',
  '2. Eigene Organisation: Verwenden Sie die Organisation Ihres Unternehmens. Falls noch keine besteht: Profil > Organizations > Create organization. Den Namen wählen Sie passend zu Ihrer Firma. Die Datenregion stimmen Sie vor dem Erstellen mit LSZH ab; sie lässt sich danach nicht ändern.',
  '3. Einladung: Öffnen Sie in Ihrer Organisation Org > Org Users (je nach Ansicht Users) > Invite user. Tragen Sie lars@lszh-automations.ch und als Namen LSZH Automations ein. Wählen Sie das für Ihr Projekt vorgesehene Team.',
  '4. Rechte: Wählen Sie auf Organisationsebene Member. Für die Einrichtung der Szenarien ist im Projektteam Team Member vorgesehen, soweit Ihr Tarif diese Rollenwahl anbietet. Weitergehende Rechte stimmen wir bei konkretem Bedarf mit Ihnen ab. Sie bleiben Owner Ihrer Organisation.',
  '5. Einladung senden: Klicken Sie auf Save. Make schickt die Einladung direkt an LSZH. Melden Sie uns danach kurz, dass die Einladung versendet wurde. Falls eine Option in Ihrem Tarif fehlt, helfen wir Ihnen; ändern Sie den kostenpflichtigen Tarif erst nach Absprache.',
  '6. Zugang prüfen: Nach Annahme der Einladung prüfen wir die benötigten Zugänge gemeinsam. Verbindungen zu Ihren weiteren Systemen richten wir kontrolliert ein. Senden Sie keine Passwörter oder Zugangsdaten per E-Mail. Die technische Einrichtung beginnt nach der Zugangsprüfung.',
  'Ihr Make-Konto und die Organisation bleiben bei Ihnen. Make-Abonnement und Nutzungskosten laufen direkt zwischen Ihnen und Make gemäss den bereits vereinbarten Bedingungen.',
  'Offizielle Make-Hilfe: https://help.make.com/organizations und https://help.make.com/teams'];
}
function confirmationText(pkg,recipient,acceptedAt){
 return ['AUFTRAGSBESTÄTIGUNG','Zur Offerte Nr. '+pkg.offerNumber,'Empfänger: '+recipient,
  'Wir bestätigen Ihren Auftrag gemäss der von Ihnen am '+new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',dateStyle:'medium'}).format(new Date(acceptedAt))+' angenommenen Offerte und den zugehörigen Vertragsunterlagen.',
  'Es gelten die Leistungen, Preise und Bedingungen des angenommenen Dokumentpakets. Diese Bestätigung ändert die vereinbarten Unterlagen nicht.',
  'Angenommene Unterlagen:',...pkg.documents.map(d=>d.filename+' (Version '+d.version+')'),
  ...(pkg.makeRequirementsVersion?['Für die Einrichtung verwenden Sie Ihre eigene Make-Organisation. Bitte laden Sie LSZH Automations nach dieser Bestätigung mit den benötigten Berechtigungen ein. Die Einrichtung beginnt nach Prüfung der Zugänge.']:[]),
  'Bei Fragen erreichen Sie uns unter info@lszh-automations.ch.',
  ...(pkg.makeRequirementsVersion?makeSetupGuide():[])];
}
function renderConfirmationEmail(preview){
 // Same inline/table design as the live offer and customer acknowledgement.
 // Contractual text still originates solely from the accepted package/PDF.
 const lines=preview.text.split('\n\n'),paragraph=content=>'<p style="margin:0 0 18px;color:#344259;font-size:15px;line-height:25px;overflow-wrap:anywhere;word-break:break-word;">'+escape(content)+'</p>';
 const guideIndex=lines.indexOf('MAKE-ANLEITUNG');
 const body=lines.slice(3,guideIndex<0?undefined:guideIndex).filter(line=>!line.startsWith('Paketreferenz: ')&&!line.startsWith('SHA-256: ')).map(line=>{
  if(line==='Angenommene Unterlagen:')return '<p style="margin:26px 0 12px;color:#06101d;font-size:13px;font-weight:700;line-height:21px;">'+escape(line)+'</p>';
  if(line.startsWith('Für die Einrichtung verwenden Sie Ihre eigene Make-Organisation.'))return '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;background-color:#f4f7fb;border:1px solid #dfe7f2;border-radius:10px;"><tr><td style="padding:19px 20px;"><p style="margin:0 0 8px;color:#06101d;font-size:13px;font-weight:700;line-height:21px;">Ihr Make-Konto und die Einrichtung</p><p style="margin:0;color:#344259;font-size:14px;line-height:23px;">'+escape(line)+'</p></td></tr></table>';
  return paragraph(line);
 }).join('');
 const guide=guideIndex<0?'':'<h2 style="margin:30px 0 14px;color:#06101d;font-size:20px;line-height:28px;">'+escape(lines[guideIndex+1])+'</h2>'+
  '<p style="margin:0 0 16px;color:#526278;font-size:13px;line-height:21px;">Die Anleitung finden Sie auch auf der nächsten Seite des beigefügten PDFs.</p>'+
  lines.slice(guideIndex+2).filter(line=>!line.startsWith('Offizielle Make-Hilfe:')).map(line=>'<p style="margin:0 0 14px;color:#344259;font-size:13px;line-height:21px;overflow-wrap:anywhere;word-break:break-word;">'+escape(line).replace('https://www.make.com/en/register?pc=lszhautomations','<a href="https://www.make.com/en/register?pc=lszhautomations" style="color:#356bde;">https://www.make.com/en/register?pc=lszhautomations</a>')+'</p>').join('')+
  '<p style="margin:0 0 18px;font-size:12px;line-height:20px;"><a href="https://help.make.com/organizations" style="color:#356bde;">Make-Hilfe: Organisation und Einladung</a> · <a href="https://help.make.com/teams" style="color:#356bde;">Teams und Rollen</a></p>';
 return '<!doctype html><html lang="de-CH"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LSZH Automations – Auftragsbestätigung</title></head>'+
  '<body style="margin:0;padding:0;background-color:#f4f7fb;color:#0f1726;font-family:Arial,Helvetica,sans-serif;">'+
  '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Ihre Auftragsbestätigung von LSZH Automations als PDF im Anhang.</div>'+
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background-color:#f4f7fb;"><tr><td align="center" style="padding:28px 14px 36px;">'+
  '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dfe7f2;border-radius:16px;overflow:hidden;">'+
  '<tr><td bgcolor="#06101d" style="background-color:#06101d;padding:29px 32px;"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>'+
  '<td width="53" valign="middle"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="43" height="43" align="center" bgcolor="#5b8cff" style="background-color:#5b8cff;color:#ffffff;font-size:27px;font-weight:800;line-height:43px;border-radius:12px;">L</td></tr></table></td>'+
  '<td valign="middle" style="padding-left:10px;"><div style="font-size:18px;color:#ffffff;font-weight:700;line-height:23px;">LSZH Automations</div><div style="font-size:9px;color:#b2bfd3;font-weight:700;line-height:16px;letter-spacing:1.6px;">AUTOMATION FÜR SCHWEIZER KMU</div></td></tr></table></td></tr>'+
  '<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td width="34%" height="4" bgcolor="#74d8ff" style="height:4px;background-color:#74d8ff;font-size:0;line-height:0;">&nbsp;</td><td width="33%" height="4" bgcolor="#5b8cff" style="height:4px;background-color:#5b8cff;font-size:0;line-height:0;">&nbsp;</td><td width="33%" height="4" bgcolor="#8e72ff" style="height:4px;background-color:#8e72ff;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>'+
  '<tr><td style="padding:37px 28px 36px;"><p style="margin:0 0 12px;color:#5b8cff;font-size:11px;font-weight:700;line-height:18px;letter-spacing:1.4px;">IHRE AUFTRAGSBESTÄTIGUNG</p>'+
  '<h1 style="margin:0 0 24px;color:#06101d;font-size:27px;line-height:36px;">Ihr Auftrag ist bestätigt</h1>'+paragraph('Guten Tag')+paragraph('Vielen Dank für Ihr Vertrauen in LSZH Automations.')+
  '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 25px;background-color:#f4f7fb;border:1px solid #dfe7f2;border-radius:10px;"><tr><td style="padding:19px 20px;">'+
  '<p style="margin:0 0 8px;color:#06101d;font-size:16px;font-weight:700;line-height:25px;">'+escape(lines[1])+'</p><p style="margin:0 0 12px;color:#526278;font-size:13px;line-height:21px;overflow-wrap:anywhere;word-break:break-word;">Empfänger: '+escape(preview.recipient)+'</p><p style="margin:0;color:#344259;font-size:13px;line-height:21px;overflow-wrap:anywhere;word-break:break-word;">PDF im Anhang: <strong>'+escape(preview.filename)+'</strong></p></td></tr></table>'+body+guide+
  '<p style="margin:24px 0 0;color:#344259;font-size:14px;line-height:23px;">Freundliche Grüsse<br><strong style="color:#06101d;">Ihr Team von LSZH Automations</strong></p></td></tr>'+
  '<tr><td bgcolor="#0a1728" style="background-color:#0a1728;padding:25px 28px 27px;"><p style="margin:0 0 8px;color:#ffffff;font-size:13px;font-weight:700;line-height:21px;">LSZH Automations</p><p style="margin:0 0 11px;color:#b2bfd3;font-size:11px;line-height:19px;">Ein Geschäftsbereich der LSZH Invest GmbH<br>Rummelmatt 8 · 5610 Wohlen AG · Schweiz<br>UID: CHE-369.474.125</p>'+
  '<p style="margin:0;color:#74d8ff;font-size:11px;line-height:19px;"><a href="mailto:info@lszh-automations.ch" style="color:#74d8ff;text-decoration:none;">info@lszh-automations.ch</a> · <a href="https://lszh-automations.ch/" style="color:#74d8ff;text-decoration:none;">lszh-automations.ch</a></p></td></tr></table></td></tr></table></body></html>';
}
async function confirmationPdf(lines,date){
 const pdf=await PDFDocument.create();pdf.setCreationDate(new Date(date));pdf.setModificationDate(new Date(date));
 pdf.setTitle('LSZH Automations – Auftragsbestätigung');
 const font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const W=595.28,H=841.89,left=46,width=W-92,bottom=95;
 const navy=rgb(.024,.063,.114),blue=rgb(.357,.549,1),cyan=rgb(.455,.847,1),purple=rgb(.557,.447,1),ink=rgb(.12,.17,.23),muted=rgb(.33,.39,.47),pale=rgb(.957,.969,.984),white=rgb(1,1,1);
 let page,y;
 function text(value,x,yy,size=10,strong=false,color=ink){page.drawText(value,{x,y:yy,size,font:strong?bold:font,color});}
 function next(){
  page=pdf.addPage([W,H]);
  page.drawRectangle({x:0,y:H-106,width:W,height:106,color:navy});
  page.drawRectangle({x:left,y:H-70,width:36,height:36,color:blue});text('L',left+10,H-59,25,true,white);
  text('LSZH Automations',left+51,H-48,19,true,white);text('AUTOMATION FÜR SCHWEIZER KMU',left+51,H-66,8,false,rgb(.70,.75,.83));
  for(const [i,color] of [cyan,blue,purple].entries())page.drawRectangle({x:i*W/3,y:H-109,width:W/3,height:3,color});
  page.drawRectangle({x:0,y:0,width:W,height:65,color:navy});text('LSZH Automations',left,46,9,true,white);
  text('Ein Geschäftsbereich der LSZH Invest GmbH',left,32,7,false,rgb(.70,.75,.83));
  text('Rummelmatt 8 · 5610 Wohlen AG · Schweiz · CHE-369.474.125',left,19,7,false,rgb(.70,.75,.83));
  text('info@lszh-automations.ch',W-186,46,8,false,cyan);y=H-145;
 }
 function ensure(height){if(y-height<bottom)next();}
 function wrap(value,size,strong=false,limit=width){
  const f=strong?bold:font,result=[];let line='';
  for(const word of String(value).split(/\s+/).filter(Boolean)){
   if(line&&f.widthOfTextAtSize(line+' '+word,size)>limit){result.push(line);line='';}
   if(f.widthOfTextAtSize(word,size)<=limit){line+=(line?' ':'')+word;continue;}
   for(const char of word){if(line&&f.widthOfTextAtSize(line+char,size)>limit){result.push(line);line='';}line+=char;}
  }
  if(line)result.push(line);return result;
 }
 function paragraph(value,{size=10,strong=false,color=ink,gap=10}={}){
  const rows=wrap(value,size,strong),height=rows.length*(size+5)+gap;
  ensure(height<=H-145-bottom?height:3*(size+5));
  for(const row of rows){ensure(size+5);text(row,left,y,size,strong,color);
   if(row.startsWith('Registrierung: https://www.make.com/en/register?pc=lszhautomations')){
    const link=pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[left,y-2,left+font.widthOfTextAtSize(row,size),y+size+2],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of('https://www.make.com/en/register?pc=lszhautomations')}});
    page.node.addAnnot(pdf.context.register(link));
   }
   y-=size+5;}y-=gap;
 }
 function box(entries){
  const rows=entries.flatMap(entry=>wrap(entry.text,entry.size||10,Boolean(entry.strong),width-32).map(value=>({...entry,text:value,size:entry.size||10})));
  while(rows.length){
   ensure(65);let height=28,count=0;
   while(count<rows.length&&height+rows[count].size+5<=y-bottom){height+=rows[count].size+5;count++;}
   if(!count){next();continue;}
   page.drawRectangle({x:left,y:y-height,width,height,color:pale,borderColor:rgb(.875,.906,.949),borderWidth:.6});
   let baseline=y-14;
   for(const row of rows.splice(0,count)){baseline-=row.size;text(row.text,left+16,baseline,row.size,row.strong,row.color||ink);baseline-=5;}
   y-=height+17;if(rows.length)next();
  }
 }
 next();paragraph('IHRE AUFTRAGSBESTÄTIGUNG',{size:8,strong:true,color:blue,gap:13});
 paragraph('Ihr Auftrag ist bestätigt',{size:23,strong:true,color:navy,gap:14});
 box([{text:lines[1],size:14,strong:true,color:navy},{text:lines[2],size:9,color:muted}]);
 let inGuide=false;
 for(const value of lines.slice(3).filter(line=>!line.startsWith('Paketreferenz: ')&&!line.startsWith('SHA-256: '))){
  if(value==='MAKE-ANLEITUNG'){next();inGuide=true;paragraph('IHRE MAKE-EINRICHTUNG',{size:8,strong:true,color:blue,gap:13});continue;}
  if(inGuide){paragraph(value,{size:value==='Make einrichten und LSZH einladen'?21:9,strong:value==='Make einrichten und LSZH einladen',color:ink,gap:9});continue;}
  if(value==='Angenommene Unterlagen:'){ensure(40);paragraph(value,{size:10,strong:true,color:navy,gap:3});}
  else if(value.startsWith('Für die Einrichtung verwenden Sie Ihre eigene Make-Organisation.'))box([{text:'Ihr Make-Konto und die Einrichtung',size:10,strong:true,color:navy},{text:value,size:9,color:muted}]);
  else paragraph(value,{size:10,gap:10});
 }
 const pages=pdf.getPages();pages.forEach((p,index)=>p.drawText('Seite '+(index+1)+' / '+pages.length,{x:W-95,y:19,size:7,font,color:rgb(.70,.75,.83)}));
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
   const document={kind:'offer',version:'confirmation-v3',archiveFileId:fileId,filename:p.filename,bytes:bytes.length,sha256:p.sha256};verifyDocumentBytes(document,Buffer.from(await readArchivedPdf(fileId,document)));
   await transaction(async tx=>{await binding(tx,id);const row=await tx.get(claim),old=await tx.get(docId);if(row?.state!=='preparing'||old)throw fault('CONFIRMATION_NOT_READY',409);
    tx.create(docId,{packageSha256:b.pkg.packageSha256,recipient:b.recipient,approvedBy:operator,document});tx.set(claim,{...row,state:'sending',document});
   });
   const eventId='confirmation_'+b.pkg.packageId;
   const receipt=await sendOnce({kind:'order_confirmation',sendMode:'customer',from:'info@lszh-automations.ch',to:[b.recipient],cc:[],bcc:[],eventId,packageSha256:b.pkg.packageSha256,subject:p.subject,html:renderConfirmationEmail(p),attachments:[{filename:p.filename,data:p.data}]});
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
module.exports={createOrderConfirmation,createConfirmationTransport,confirmationKey,confirmationPdf,confirmationText,renderConfirmationEmail,makeSetupGuide};
