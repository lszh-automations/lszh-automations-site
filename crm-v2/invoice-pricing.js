'use strict';
// Local test invoices: CHF amounts stored to cents, no fictitious tax or payment data.
function bad(message){throw Object.assign(new Error(message),{status:400});}
function cleanInvoiceItems(items){
  if(!Array.isArray(items)||items.length>60)bad('Ungültige Rechnungspositionen (maximal 60)');
  return items.map((row,index)=>{
    const position=index+1;
    if(!row||typeof row!=='object'||Array.isArray(row))bad('Ungültige Position '+position);
    if(typeof row.title!=='string'||!row.title.trim()||row.title.trim().length>180)
      bad('Bezeichnung fehlt oder zu lang bei Position '+position);
    const quantity=row.qty;
    if(typeof quantity!=='number'||!Number.isFinite(quantity)||quantity<=0||quantity>10000 ||
       Math.abs(quantity*1000-Math.round(quantity*1000))>0.00000001)bad('Ungültige Menge bei Position '+position);
    const price=row.unitPriceCHF;
    if(typeof price!=='number'||!Number.isFinite(price)||price<0||price>100000000 ||
       Math.abs(price*100-Math.round(price*100))>0.000001)bad('Ungültiger Einzelpreis bei Position '+position);
    const cents=Math.round(price*100);
    if(!Number.isSafeInteger(Math.round(quantity*cents)) || Math.round(quantity*cents)>10000000000)
      bad('Positionsbetrag zu hoch');
    return {title:row.title.trim(),qty:quantity,unitPriceCHF:cents/100};
  });
}
function invoiceTotals(items){
  const clean=cleanInvoiceItems(items);
  const cents=clean.reduce((sum,item)=>sum+Math.round(item.qty*Math.round(item.unitPriceCHF*100)),0);
  if(!Number.isSafeInteger(cents)||cents>10000000000)bad('Rechnungsbetrag zu hoch');
  return {items:clean,amountCHF:cents/100};
}
function invoiceLegacyItems(invoice){
  if(Array.isArray(invoice?.items))return invoice.items;
  const amount=Number(invoice?.amountCHF)||0;
  return amount>0?[{title:String(invoice?.description||'Leistung'),qty:1,unitPriceCHF:amount}]:[];
}
function isInvoiceLocked(invoice){return invoice?.status==='Bezahlt'||invoice?.status==='Storniert';}
module.exports={cleanInvoiceItems,invoiceTotals,invoiceLegacyItems,isInvoiceLocked};
