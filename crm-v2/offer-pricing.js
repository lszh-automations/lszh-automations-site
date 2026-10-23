'use strict';

// All prices are non-negative CHF amounts. The preview has two separate totals:
// one-time costs and recurring monthly costs; they are never combined into a fake grand total.
const MODES=['einmalig','monatlich'];
function invalid(message){return Object.assign(new Error(message),{status:400});}
function roundCents(value){return Math.round((value+Number.EPSILON)*100);}
function parseMoney(value,field){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>100000000)
    throw invalid('Ungültiger Betrag: '+field);
  const cents=roundCents(value);
  if(Math.abs(cents/100-value)>0.000001)throw invalid('Betrag muss auf Rappen gerundet sein: '+field);
  return cents;
}
function sanitizeItems(input){
  if(!Array.isArray(input)||input.length>60)throw invalid('Ungültige Offertenpositionen');
  return input.map((item,i)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw invalid('Ungültige Position '+(i+1));
    const title=String(item.title||'').trim();
    if(!title||title.length>180||typeof item.title!=='string')throw invalid('Bezeichnung fehlt bei Position '+(i+1));
    const mode=item.mode;
    if(!MODES.includes(mode))throw invalid('Art fehlt bei Position '+(i+1));
    const qty=Number(item.qty);
    if(!Number.isFinite(qty)||qty<=0||qty>10000||Math.round(qty*1000)!==qty*1000)
      throw invalid('Ungültige Menge bei Position '+(i+1));
    const unitCents=parseMoney(item.unitPriceCHF,'Position '+(i+1));
    const totalCents=Math.round(unitCents*qty);
    if(!Number.isSafeInteger(totalCents)||totalCents>10000000000)
      throw invalid('Positionsbetrag zu hoch');
    return {title,mode,qty,unitPriceCHF:unitCents/100};
  });
}
function quoteTotals(items){
  const clean=sanitizeItems(items);
  let onceCents=0,monthlyCents=0;
  for(const item of clean){
    const amount=Math.round(roundCents(item.unitPriceCHF)*item.qty);
    if(item.mode==='einmalig')onceCents+=amount;
    else monthlyCents+=amount;
  }
  return {oneTimeCHF:onceCents/100,monthlyCHF:monthlyCents/100,items:clean};
}
function existingLines(offer){
  if(Array.isArray(offer.items))return offer.items;
  const lines=[];
  const once=Number(offer.oneTimeCHF)||0;
  const monthly=Number(offer.monthlyCHF)||0;
  if(once>0)lines.push({title:'Einmalige Umsetzung',qty:1,unitPriceCHF:once,mode:'einmalig'});
  if(monthly>0)lines.push({title:'Monatliche Betreuung',qty:1,unitPriceCHF:monthly,mode:'monatlich'});
  return lines;
}
module.exports={sanitizeItems,quoteTotals,existingLines,MODES};
