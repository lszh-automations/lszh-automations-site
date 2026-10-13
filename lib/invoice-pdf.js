'use strict';
/* Draft only. Requires qrcode and pdfkit; route gated by two environment settings. */
const {buildSwissQr,ACCOUNT,CREDITOR}=require('./swiss-qr');
const mm=72/25.4;
function text(d,s,x,y,size=9,bold=false,color='#000000'){
  d.fillColor(color).font(bold?'Helvetica-Bold':'Helvetica').fontSize(size)
    .text(String(s),x*mm,y*mm,{lineBreak:false});
}
function fmt(s){return String(s).match(/.{1,4}/g).join(' ');}
function qrCode(d,payload,x,y){
  const qr=require('qrcode').create(payload,{errorCorrectionLevel:'M'});
  const n=qr.modules.size,box=46*mm/n,sx=x*mm,sy=y*mm;
  d.fillColor('#FFFFFF').rect(sx-5*mm,sy-5*mm,56*mm,56*mm).fill();
  d.fillColor('#000000');
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)
    if(qr.modules.data[r*n+c])
      d.rect(sx+c*box,sy+r*box,box+.005,box+.005).fill();
  const cx=sx+23*mm,cy=sy+23*mm;
  d.fillColor('#FFFFFF').rect(cx-3.5*mm,cy-3.5*mm,7*mm,7*mm).fill();
  d.fillColor('#000000').rect(cx-3*mm,cy-3*mm,6*mm,6*mm).fill();
  d.fillColor('#FFFFFF').rect(cx-.59*mm,cy-2.12*mm,1.18*mm,4.24*mm).fill();
  d.rect(cx-2.12*mm,cy-.59*mm,4.24*mm,1.18*mm).fill();
}
function firstPage(d,data,request){
  const dark='#102945',gray='#637589',debtor=data.debtor;
  d.fillColor(dark).rect(0,0,210*mm,57*mm).fill();
  text(d,'LSZH AUTOMATIONS',18,17,19,true,'#FFFFFF');
  text(d,'ein Geschäftsbereich der LSZH Invest GmbH',18,27,10,false,'#FFFFFF');
  text(d,data.test?'MUSTERRECHNUNG - NICHT ZUR ZAHLUNG VERWENDEN':'RECHNUNG',18,42,10,true,'#FFFFFF');
  text(d,'RECHNUNG',18,73,12,true,dark);
  text(d,request.invoiceNumber,18,87,23,true,dark);
  d.strokeColor('#DCE5EE').moveTo(18*mm,101*mm).lineTo(192*mm,101*mm).stroke();
  text(d,'RECHNUNG AN',18,106,8,true,gray);text(d,'RECHNUNGSDATEN',113,106,8,true,gray);
  text(d,debtor.name,18,114,10,true,dark);
  text(d,debtor.street+' '+debtor.number,18,121,10,false,dark);
  text(d,debtor.postal+' '+debtor.city+', '+debtor.country,18,128,10,false,dark);
  text(d,request.invoiceDate||'',113,114,10,false,dark);
  text(d,request.dueDate||'',113,121,10,false,dark);
  text(d,'LEISTUNG',18,147,8,true,gray);text(d,'BETRAG',159,147,8,true,gray);
  text(d,String(request.description||'Automationsdienstleistung').slice(0,58),18,155,10,false,dark);
  text(d,data.amount,169,155,10,true,dark);
  d.strokeColor('#DCE5EE').moveTo(18*mm,166*mm).lineTo(192*mm,166*mm).stroke();
  text(d,'TOTAL',131,172,10,true,dark);text(d,'CHF '+data.amount,160,171,14,true,dark);
  text(d,'Zahlungsinformationen',18,192,12,true,'#315e95');
  text(d,'IBAN: '+fmt(ACCOUNT),18,202,10,false,dark);
  text(d,'SCOR: '+fmt(data.reference),18,210,10,false,dark);
  text(d,data.test?'CHF 0.00 - NICHT ZUR ZAHLUNG VERWENDEN':'Zahlbar bis: '+(request.dueDate||'gemäss Rechnung'),18,220,10,data.test,dark);
  text(d,'LSZH Invest GmbH  |  Rummelmatt 8  |  5610 Wohlen AG',18,275,8,false,gray);
}
function paymentSlip(d,q){
  const a=q.debtor,ref=q.reference,y0=192;
  d.fillColor('#FFFFFF').rect(0,y0*mm,210*mm,105*mm).fill();
  d.save().strokeColor('#000000').lineWidth(.65).dash(3,{space:2})
    .moveTo(0,y0*mm).lineTo(210*mm,y0*mm).stroke()
    .moveTo(62*mm,y0*mm).lineTo(62*mm,297*mm).stroke().undash().restore();
  text(d,'Empfangsschein',5,197,11,true);
  text(d,'Konto / Zahlbar an',5,209,6,true);
  text(d,fmt(ACCOUNT),5,215,7.4);text(d,CREDITOR.name,5,220,8);
  text(d,'Rummelmatt 8',5,225,8);text(d,'5610 Wohlen',5,230,8);
  const parts=fmt(ref).split(' ');
  text(d,'Referenz',5,241,6,true);text(d,parts.slice(0,4).join(' '),5,246,7.2);
  if(parts.length>4)text(d,parts.slice(4).join(' '),5,251,7.2);
  text(d,'Zahlbar durch',5,258,6,true);text(d,a.name,5,263,7.9);
  text(d,a.street+' '+a.number,5,268,7.9);
  text(d,a.postal+' '+a.city,5,273,7.9);
  text(d,'Währung',5,285,6,true);text(d,'Betrag',26,285,6,true);
  text(d,'CHF',5,290,8);text(d,q.amount,26,290,8);
  text(d,'Annahmestelle',42,292,6);
  text(d,'Zahlteil',67,197,11,true);qrCode(d,q.payload,67,209);
  text(d,'Währung',67,267,8,true);text(d,'Betrag',89,267,8,true);
  text(d,'CHF',67,274,10);text(d,q.amount,89,274,10);
  text(d,'Konto / Zahlbar an',118,208,8,true);
  text(d,fmt(ACCOUNT),118,215,9);text(d,CREDITOR.name,118,221,9);
  text(d,'Rummelmatt 8',118,227,9);text(d,'5610 Wohlen',118,233,9);
  text(d,'Referenz',118,243,8,true);text(d,fmt(ref),118,249,8.4);
  text(d,'Zusätzliche Informationen',118,259,8,true);
  text(d,q.message.slice(0,55),118,265,7.5);
  text(d,'Zahlbar durch',118,275,8,true);text(d,a.name,118,281,9);
  text(d,a.street+' '+a.number+', '+a.postal+' '+a.city,118,287,8.4);
}
async function renderInvoice(request){
  const PDFDocument=require('pdfkit');
  const q=buildSwissQr({invoiceNumber:request.invoiceNumber,amountCHF:request.amountCHF,debtor:request.debtor,test:request.test===true});
  const d=new PDFDocument({autoFirstPage:false,margin:0,compress:true});
  const pieces=[];
  const finished=new Promise((ok,fail)=>{d.on('data',b=>pieces.push(b));d.on('end',()=>ok(Buffer.concat(pieces)));d.on('error',fail);});
  d.addPage({size:'A4',margin:0});firstPage(d,q,request);
  d.addPage({size:'A4',margin:0});
  text(d,'LSZH AUTOMATIONS',15,19,17,true,'#102945');
  text(d,'Zahlteil / Empfangsschein',15,31,11,false,'#102945');
  if(q.test){d.fillColor('#FFF4E5').rect(15*mm,72*mm,180*mm,27*mm).fill();
    text(d,'NICHT ZUR ZAHLUNG VERWENDEN',21,78,13,true,'#784E00');
    text(d,'Technische Entwicklungsversion; keine echte Forderung.',21,87,9,false,'#784E00');}
  paymentSlip(d,q);
  d.end();return {pdf:await finished,reference:q.reference};
}
module.exports={renderInvoice};