'use strict';
/* Draft only. Requires qrcode and pdfkit; route gated by two environment settings. */
const {buildSwissQr,ACCOUNT,CREDITOR}=require('./swiss-qr');
const mm=72/25.4;
// Physical dimensions and minimum acceptance-point clearance from SIX QR-bill guidelines.
const LAYOUT=Object.freeze({slipTop:192,slipHeight:105,receiptWidth:62,paymentWidth:148,qrX:67,qrY:209,qrSize:46,qrQuietZone:5,receiptAmountStart:262,receiptAcceptanceTop:277,receiptAcceptanceHeight:20});
function printAmount(v){
  const s=String(v);
  if(!/^\d+\.\d{2}$/.test(s))throw Error('invalid_visible_amount');
  const [whole,decimals]=s.split('.');
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g,' ')+'.'+decimals;
}
// Never silently draw beyond a section boundary. Reject an address too long for
// the prescribed minimum 6 pt receipt / 8 pt payment-part type sizes.
function textFit(d,s,x,y,maxWidth,size=8,minSize=6,bold=false){
  const value=String(s),font=bold?'Helvetica-Bold':'Helvetica';
  d.font(font);
  let pts=size;
  while(pts>=minSize&&d.fontSize(pts).widthOfString(value)>maxWidth*mm)pts-=0.25;
  if(pts<minSize)throw Error('invalid_layout_text_too_long');
  text(d,value,x,y,pts,bold);
}

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
  text(d,'UID CHE-369.474.125',145,27,8,false,'#FFFFFF');
  text(d,data.test?'MUSTERRECHNUNG - NICHT ZUR ZAHLUNG VERWENDEN':'RECHNUNG',18,42,10,true,'#FFFFFF');
  text(d,'RECHNUNG',18,73,12,true,dark);
  text(d,request.invoiceNumber,18,87,23,true,dark);
  d.strokeColor('#DCE5EE').moveTo(18*mm,101*mm).lineTo(192*mm,101*mm).stroke();
  text(d,'RECHNUNG AN',18,106,8,true,gray);text(d,'RECHNUNGSDATEN',113,106,8,true,gray);
  text(d,debtor.name,18,114,10,true,dark);
  text(d,debtor.street+' '+debtor.number,18,121,10,false,dark);
  text(d,debtor.postal+' '+debtor.city+', '+debtor.country,18,128,10,false,dark);
  text(d,'Datum',113,114,9,true,gray);text(d,request.invoiceDate||'',143,114,10,false,dark);
  text(d,'Fällig am',113,121,9,true,gray);text(d,request.dueDate||'',143,121,10,false,dark);
  if(request.servicePeriod){
    textFit(d,'Leistungsdatum/-zeitraum: '+String(request.servicePeriod),18,137,174,9,8);
  }
  text(d,'LEISTUNG',18,147,8,true,gray);text(d,'BETRAG',159,147,8,true,gray);
  text(d,String(request.description||'Automationsdienstleistung').slice(0,58),18,155,10,false,dark);
  text(d,data.amount,169,155,10,true,dark);
  d.strokeColor('#DCE5EE').moveTo(18*mm,166*mm).lineTo(192*mm,166*mm).stroke();
  text(d,'TOTAL',131,172,10,true,dark);text(d,'CHF '+data.amount,160,171,14,true,dark);
  text(d,'MWST-Hinweis: nicht mehrwertsteuerpflichtig; keine MWST ausgewiesen.',18,183,8,false,gray);
  text(d,'Zahlungsinformationen',18,196,12,true,'#315e95');
  text(d,'IBAN: '+fmt(ACCOUNT),18,206,10,false,dark);
  text(d,'SCOR: '+fmt(data.reference),18,214,10,false,dark);
  text(d,data.preview?'VORSCHAU CHF '+data.amount+' - KEINE FORDERUNG, NICHT BEZAHLEN':(data.test?'CHF 0.00 - NICHT ZUR ZAHLUNG VERWENDEN':'Zahlbar bis: '+(request.dueDate||'gemäss Rechnung')),18,224,10,data.test,dark);
  text(d,'LSZH Invest GmbH  |  Rummelmatt 8  |  5610 Wohlen AG',18,275,8,false,gray);
}
// Scissors marks identify the legal 210 x 105 mm payment-slip boundary on A4.
function scissors(d,x,y){
  const p=(n)=>n*mm;
  d.save().strokeColor('#000000').lineWidth(.7);
  d.circle(p(x-1.2),p(y-1.15),p(.95)).stroke();
  d.circle(p(x+1.2),p(y-1.15),p(.95)).stroke();
  d.moveTo(p(x-.55),p(y-.45)).lineTo(p(x+2.6),p(y+1.4)).stroke();
  d.moveTo(p(x+.55),p(y-.45)).lineTo(p(x-2.6),p(y+1.4)).stroke();
  d.restore();
}
// SIX-prescribed corner marks for an unspecified payment amount.
function amountCornerMarks(d,x,y,width,height){
  const p=n=>n*mm,L=3*mm;
  d.save().strokeColor('#000000').lineWidth(.75);
  for(const [xx,yy,dx,dy] of [[x,y,1,1],[x+width,y,-1,1],[x,y+height,1,-1],[x+width,y+height,-1,-1]]){
    const X=p(xx),Y=p(yy);
    d.moveTo(X+dx*L,Y).lineTo(X,Y).lineTo(X,Y+dy*L).stroke();
  }
  d.restore();
}
function paymentSlip(d,q){
  const a=q.debtor,ref=q.reference,y0=LAYOUT.slipTop;
  d.fillColor('#FFFFFF').rect(0,y0*mm,210*mm,105*mm).fill();
  d.save().strokeColor('#000000').lineWidth(.65).dash(3,{space:2})
    .moveTo(0,y0*mm).lineTo(210*mm,y0*mm).stroke()
    .moveTo(62*mm,y0*mm).lineTo(62*mm,297*mm).stroke().undash().restore();
  scissors(d,7,188.6);scissors(d,62,199.4);
  // Receipt: amount finishes before the dedicated 20 mm acceptance-point zone.
  text(d,'Empfangsschein',5,197,11,true);
  text(d,'Konto / Zahlbar an',5,206,6,true);
  text(d,fmt(ACCOUNT),5,211,7.5);
  text(d,CREDITOR.name,5,215,8);
  text(d,'Rummelmatt 8',5,219,8);
  text(d,'5610 Wohlen',5,223,8);
  text(d,'Referenz',5,230,6,true);
  textFit(d,fmt(ref),5,234,52,7.5,6);
  text(d,'Zahlbar durch',5,241,6,true);
  textFit(d,a.name,5,245,52,8,6);
  textFit(d,a.street+' '+a.number,5,249,52,8,6);
  textFit(d,a.postal+' '+a.city+(a.country==='CH'?'':' '+a.country),5,253,52,8,6);
  text(d,'Währung',5,262,6,true);text(d,'Betrag',26,262,6,true);
  text(d,'CHF',5,267,8);
  if(q.qrAmount) textFit(d,printAmount(q.qrAmount),26,267,31,8,6);
  else amountCornerMarks(d,26,264,30,10);
  // Mandatory acceptance-point section: y=277..297 mm; no invoice values here.
  text(d,'Annahmestelle',42,287,6);
  text(d,'Zahlteil',67,197,11,true);qrCode(d,q.payload,LAYOUT.qrX,LAYOUT.qrY);
  text(d,'Währung',67,267,8,true);text(d,'Betrag',89,267,8,true);
  text(d,'CHF',67,274,10);
  if(q.qrAmount) text(d,printAmount(q.qrAmount),89,274,10);
  else amountCornerMarks(d,77.5,273,40,15);
  text(d,'Konto / Zahlbar an',118,208,8,true);
  text(d,fmt(ACCOUNT),118,215,9);
  textFit(d,CREDITOR.name,118,221,87,10,8);
  text(d,'Rummelmatt 8',118,227,10);
  text(d,'5610 Wohlen',118,233,10);
  text(d,'Referenz',118,243,8,true);
  textFit(d,fmt(ref),118,249,87,10,8);
  text(d,'Zusätzliche Informationen',118,259,8,true);
  textFit(d,q.message,118,265,87,8,8);
  text(d,'Zahlbar durch',118,275,8,true);
  textFit(d,a.name,118,281,87,10,8);
  textFit(d,a.street+' '+a.number+', '+a.postal+' '+a.city+(a.country==='CH'?'':' '+a.country),118,287,87,10,8);
}
async function renderInvoice(request){
  const servicePeriod=String(request.servicePeriod||'').trim();
  if(servicePeriod.length>60||/[\r\n\x00-\x1f]/.test(servicePeriod))throw Error('invalid_service_period');
  const PDFDocument=require('pdfkit');
  const q=buildSwissQr({invoiceNumber:request.invoiceNumber,amountCHF:request.amountCHF,debtor:request.debtor,test:request.test===true,preview:request.preview===true,variablePreview:request.variablePreview===true});
  const d=new PDFDocument({autoFirstPage:false,margin:0,compress:true});
  const pieces=[];
  const finished=new Promise((ok,fail)=>{d.on('data',b=>pieces.push(b));d.on('end',()=>ok(Buffer.concat(pieces)));d.on('error',fail);});
  d.addPage({size:'A4',margin:0});firstPage(d,q,request);
  d.addPage({size:'A4',margin:0});
  text(d,'LSZH AUTOMATIONS',15,19,17,true,'#102945');
  text(d,'Zahlteil / Empfangsschein',15,31,11,false,'#102945');
  if(q.test){d.fillColor('#FFF4E5').rect(15*mm,72*mm,180*mm,27*mm).fill();
    text(d,'NICHT ZUR ZAHLUNG VERWENDEN',21,78,13,true,'#784E00');
    text(d,q.preview?'Vorschau CHF '+q.amount+'. Nur scannen, NICHT bezahlen!':'Technische Entwicklungsversion; keine echte Forderung.',21,87,9,false,'#784E00');}
  paymentSlip(d,q);
  d.end();return {pdf:await finished,reference:q.reference};
}
module.exports={renderInvoice,LAYOUT,printAmount};