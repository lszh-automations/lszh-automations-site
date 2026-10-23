'use strict';
// Download-only Swiss QR invoice PDF. Never transmits invoices or creates payments.
// All graphic elements of the Swiss QR Code are vector rectangles in the PDF.
const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
const QRCode=require('qrcode');
const {prepareSwissQR}=require('./swiss-qr');
const {invoiceTotals,invoiceLegacyItems}=require('./invoice-pricing');
const MM=72/25.4, W=210*MM, H=297*MM, RECEIPT=62*MM, SLIP=105*MM;
const NAVY=rgb(.024,.063,.114),BLUE=rgb(.357,.549,1),INK=rgb(.12,.17,.23),
  MUTED=rgb(.43,.49,.56),WHITE=rgb(1,1,1),PALE=rgb(.94,.96,.98);
const clean=s=>String(s??'').replace(/[\u2010-\u2015]/g,'-')
  .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
  .replace(/[^\x20-\x7e\xa0-\xff]/g,'?');
const date=s=>/^\d{4}-\d\d-\d\d$/.test(String(s||''))?
  s.slice(8)+'.'+s.slice(5,7)+'.'+s.slice(0,4):'-';
const price=n=>'CHF '+Number(n).toFixed(2);
const spacedIban=iban=>String(iban).replace(/(.{4})/g,'$1 ').trim();
const spacedAmount=amount=>String(amount).replace(/\B(?=(\d{3})+(?=\.))/g,' ');
function splitText(value,font,size,width,maxLines=4){
  const words=clean(value).split(/\s+/).filter(Boolean),result=[];
  let current='';
  for(const word of words){
    const candidate=current?current+' '+word:word;
    if(font.widthOfTextAtSize(candidate,size)<=width){current=candidate;continue;}
    if(current)result.push(current);
    current='';
    for(const char of word){
      if(font.widthOfTextAtSize(current+char,size)>width&&current){result.push(current);current='';}
      current+=char;
    }
    if(result.length>=maxLines)break;
  }
  if(current&&result.length<maxLines)result.push(current);
  if(result.length>maxLines)result.length=maxLines;
  return result.length?result:[''];
}
function text(page,font,s,x,y,size=9,color=INK){
  page.drawText(clean(s),{x,y,size,font,color});
}
function circleScissors(page,x,y){
  page.drawEllipse({x,y,width:5,height:5,borderColor:INK,borderWidth:.7});
  page.drawEllipse({x:x+6,y,width:5,height:5,borderColor:INK,borderWidth:.7});
  page.drawLine({start:{x:x+4,y:y+3},end:{x:x+15,y:y+11},thickness:.6,color:INK});
  page.drawLine({start:{x:x+9,y:y+3},end:{x:x+1,y:y+11},thickness:.6,color:INK});
}
function qrVector(page,payload,x,y){
  const qr=QRCode.create(payload,{errorCorrectionLevel:'M'});
  const n=qr.modules.size,size=46*MM,module=size/n;
  if(module/MM<.4)throw Object.assign(new Error('Swiss QR: Modul kleiner als 0.4 mm'),{status:422});
  const dark=rgb(0,0,0);
  for(let row=0;row<n;row++)
    for(let col=0;col<n;col++)
      if(qr.modules.get(row,col))
        page.drawRectangle({x:x+col*module,y:y+(n-row-1)*module,
          width:module+.01,height:module+.01,color:dark});
  // Mandatory Swiss cross in the centre: white quiet surround, black field, white cross.
  const mid=x+size/2,centre=y+size/2;
  page.drawRectangle({x:mid-4.5*MM,y:centre-4.5*MM,width:9*MM,height:9*MM,color:WHITE});
  page.drawRectangle({x:mid-3.5*MM,y:centre-3.5*MM,width:7*MM,height:7*MM,color:dark});
  page.drawRectangle({x:mid-.65*MM,y:centre-2.25*MM,width:1.3*MM,height:4.5*MM,color:WHITE});
  page.drawRectangle({x:mid-2.25*MM,y:centre-.65*MM,width:4.5*MM,height:1.3*MM,color:WHITE});
  return {modules:n,moduleMm:module/MM};
}
function slip(page,regular,bold,payment){
  const displayIban=spacedIban(payment.iban), displayAmount=spacedAmount(payment.amount);
  // Exact physical size: 210 x 105 mm; 62 mm receipt and 148 mm payment part.
  page.drawLine({start:{x:0,y:SLIP},end:{x:W,y:SLIP},color:INK,thickness:.5,dashArray:[3,3]});
  page.drawLine({start:{x:RECEIPT,y:0},end:{x:RECEIPT,y:SLIP},color:INK,thickness:.5,dashArray:[3,3]});
  circleScissors(page,12,SLIP-3);
  // Separate scissors mark for the vertical dividing line, also required for PDF bills.
  circleScissors(page,RECEIPT-6,SLIP-16);
  const left=12,right=RECEIPT+19;
  text(page,bold,'Empfangsschein',left,SLIP-27,11);
  text(page,bold,'Konto / Zahlbar an',left,SLIP-49,6.7);
  text(page,regular,displayIban,left,SLIP-61,8);
  text(page,regular,'LSZH Invest GmbH',left,SLIP-73,8);
  text(page,regular,'Rummelmatt 8',left,SLIP-85,8);
  text(page,regular,'5610 Wohlen',left,SLIP-97,8);
  text(page,bold,'Zahlbar durch',left,SLIP-121,6.7);
  let yy=SLIP-134;
  for(const line of [payment.debtor[1],payment.debtor[2]+' '+payment.debtor[3],
    payment.debtor[4]+' '+payment.debtor[5]].map(clean)){
    for(const wrapped of splitText(line,regular,7.6,RECEIPT-23,2)){
      text(page,regular,wrapped,left,yy,7.6);yy-=10;
    }
  }
  text(page,bold,'Währung',left,50,7);
  text(page,bold,'Betrag',left+55,50,7);
  text(page,regular,'CHF',left,34,10);
  text(page,regular,displayAmount,left+55,34,10);
  const acceptance='Annahmestelle';
  text(page,bold,acceptance,RECEIPT-12-bold.widthOfTextAtSize(acceptance,7),11,7);
  text(page,bold,'Zahlteil',right,SLIP-27,11);
  text(page,bold,'Konto / Zahlbar an',right+169,SLIP-49,7);
  let rx=right+169,ry=SLIP-64;
  for(const line of [displayIban,'LSZH Invest GmbH','Rummelmatt 8','5610 Wohlen']){
    text(page,regular,line,rx,ry,9);ry-=13;
  }
  text(page,bold,'Zahlbar durch',rx,SLIP-130,7);
  let py=SLIP-145;
  for(const line of [payment.debtor[1],
    payment.debtor[2]+' '+payment.debtor[3],
    payment.debtor[4]+' '+payment.debtor[5]]){
    for(const wrapped of splitText(line,regular,9,205,2)){
      text(page,regular,wrapped,rx,py,9);py-=13;
    }
  }
  // 46mm code; the top of the amount headings is >= 5mm below the code.
  qrVector(page,payment.payload,right,87);
  text(page,bold,'Währung',right,57,8);
  text(page,bold,'Betrag',right+55,57,8);
  text(page,regular,'CHF',right,39,10);
  text(page,regular,displayAmount,right+55,39,10);
  text(page,bold,'Zusätzliche Informationen',rx,67,7);
  text(page,regular,payment.message,rx,53,9);
}
async function makeInvoicePdf(invoice,customer,project,config){
  const payment=prepareSwissQR(invoice,customer,config);
  const items=invoiceTotals(invoiceLegacyItems(invoice)).items;
  const pdf=await PDFDocument.create();
  pdf.setTitle('Rechnung '+invoice.number);
  pdf.setAuthor('LSZH Invest GmbH');
  pdf.setSubject('Rechnung in CHF mit Swiss QR-Zahlteil');
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let page,y,first=true;
  function startPage(){
    page=pdf.addPage([W,H]);
    page.drawRectangle({x:0,y:H-103,width:W,height:103,color:NAVY});
    page.drawRectangle({x:46,y:H-106,width:155,height:3,color:BLUE});
    text(page,bold,'LSZH',46,H-51,24,WHITE);
    text(page,bold,'AUTOMATIONS',138,H-51,11,rgb(.455,.847,1));
    text(page,regular,'Ein Geschäftsbereich der LSZH Invest GmbH',46,H-75,9,WHITE);
    text(page,bold,'RECHNUNG',W-126,H-51,11,WHITE);
    // Footer intentionally omitted: the 105mm Swiss payment section occupies the bottom of the final A4 page.
    y=H-134;
    if(first){
      text(page,bold,'Rechnung Nr. '+invoice.number,46,y-19,19);
      y-=48;
      text(page,bold,'RECHNUNGSEMPFÄNGER',46,y,9,MUTED);
      text(page,bold,'RECHNUNGSDATEN',315,y,9,MUTED);
      let addrY=y-20;
      for(const s of [customer.company||customer.contactName,customer.contactName,
        customer.street,[customer.postalCode,customer.city].filter(Boolean).join(' '),
        customer.country||'Schweiz'].filter(Boolean)){
        for(const line of splitText(s,regular,9,240,2)){
          text(page,regular,line,46,addrY,9);addrY-=13;
        }
      }
      text(page,regular,'Datum: '+date(invoice.invoiceDate||String(invoice.createdAt||'').slice(0,10)),315,y-20,9);
      text(page,regular,'Fällig: '+date(invoice.dueDate),315,y-35,9);
      text(page,regular,'Projekt: '+clean(project?.title||'-').slice(0,36),315,y-50,9);
      y=Math.min(addrY,y-64)-23;
      text(page,bold,clean(invoice.description||'Leistungen').slice(0,78),46,y,12);
      y-=26;
    }else{
      text(page,bold,'Rechnung '+invoice.number+' - Fortsetzung',46,y-20,16);
      y-=60;
    }
    first=false;
  }
  function tableHead(){
    page.drawRectangle({x:46,y:y-15,width:W-92,height:27,color:NAVY});
    text(page,bold,'POS.',54,y-6,8,WHITE);
    text(page,bold,'LEISTUNG',97,y-6,8,WHITE);
    text(page,bold,'MENGE',365,y-6,8,WHITE);
    text(page,bold,'PREIS',423,y-6,8,WHITE);
    text(page,bold,'BETRAG',499,y-6,8,WHITE);
    y-=34;
  }
  startPage();tableHead();
  for(let i=0;i<items.length;i++){
    const item=items[i],parts=splitText(item.title,regular,8.8,248,6);
    const height=Math.max(30,parts.length*12+13);
    if(y-height<90){startPage();tableHead();}
    if(i%2===0)page.drawRectangle({x:46,y:y-height+1,width:W-92,height,color:PALE});
    text(page,regular,i+1,54,y-14,9);
    parts.forEach((line,j)=>text(page,regular,line,97,y-14-j*12,8.8));
    text(page,regular,String(item.qty),365,y-14,9);
    text(page,regular,item.unitPriceCHF.toFixed(2),423,y-14,9);
    text(page,regular,(Math.round(item.qty*Math.round(item.unitPriceCHF*100))/100).toFixed(2),499,y-14,9);
    y-=height;
  }
  // The physical payment section cannot collide with invoice content.
  if(y<SLIP+108){startPage();}
  y-=27;
  page.drawRectangle({x:305,y:y-33,width:244,height:46,color:PALE});
  text(page,bold,'TOTAL CHF',319,y-8,11);
  text(page,bold,price(payment.amountCHF),405,y-8,15);
  y-=60;
  text(page,regular,'Keine MWST ausgewiesen - LSZH Invest GmbH ist nicht MWST-registriert.',46,y,9);
  y-=20;
  text(page,regular,'Zahlbar bis '+date(invoice.dueDate)+'. Bitte die Rechnungsnummer angeben.',46,y,9);
  slip(page,regular,bold,payment);
  const bytes=await pdf.save({useObjectStreams:false});
  return Buffer.from(bytes);
}
module.exports={makeInvoicePdf,qrVector};
