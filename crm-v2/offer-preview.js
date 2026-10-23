'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {quoteTotals,existingLines}=require('./offer-pricing');
const TEMPLATE=path.join(__dirname,'public','offer-preview.html');
function esc(value){
  return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function textLines(value){return esc(value).replace(/\r?\n/g,'<br>');}
function chf(value){
  return 'CHF '+new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
}
function dateCH(input){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(input||'')))return '';
  const date=new Date(input+'T12:00:00Z');
  return Number.isFinite(date.valueOf())?
    new Intl.DateTimeFormat('de-CH',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(date):'';
}
function renderOfferPreview(offer,lead,customer){
  const recipient=lead||customer||{};
  const company=recipient.company||'Empfänger noch nicht zugeordnet';
  const person=recipient.name||recipient.contactName||'';
  const addr=[recipient.street,[recipient.postalCode,recipient.city].filter(Boolean).join(' '),recipient.country].filter(Boolean);
  const items=existingLines(offer);
  const totals=quoteTotals(items);
  const rows=items.map((item,i)=>{
    const amount=Math.round(item.qty*Math.round(item.unitPriceCHF*100))/100;
    return '<tr><td>'+esc(i+1)+'</td><td><strong>'+esc(item.title)+'</strong></td>'+
      '<td class="right">'+esc(item.qty)+'</td>'+
      '<td class="right">'+chf(item.unitPriceCHF)+'</td>'+
      '<td class="right">'+(item.mode==='monatlich'?'Monatlich':'Einmalig')+'</td>'+
      '<td class="right">'+chf(amount)+'</td></tr>';
  }).join('');
  const table=items.length?
    '<table><thead><tr><th>Pos.</th><th>Bezeichnung</th><th class="right">Menge</th><th class="right">Einzelpreis</th><th class="right">Art</th><th class="right">Total</th></tr></thead><tbody>'+rows+'</tbody></table>':
    '<p class="small">Noch keine Positionen erfasst.</p>';
  const created=dateCH(String(offer.createdAt||'').slice(0,10));
  const valid=dateCH(offer.validUntil);
  const addresses=person?'<br>'+esc(person):'';
  const contact=addresses+(addr.length?'<br>'+addr.map(esc).join('<br>'):'');
  const dates=(created?'Erstellt: '+esc(created)+'<br>':'')+
    (valid?'Gültig bis: '+esc(valid):'Gültigkeit noch nicht festgelegt');
  const substitutions={
    NUMBER:esc(offer.number||'–'),
    STATUS:esc(offer.status||'Entwurf'),
    COMPANY:esc(company),
    PERSON_AND_ADDRESS:contact,
    DATES:dates,
    TITLE:esc(offer.title||'Leistung'),
    DESCRIPTION:offer.description?'<p>'+textLines(offer.description)+'</p>':'<p class="small">Leistungsbeschreibung noch offen.</p>',
    ITEM_TABLE:table,
    ONCE:chf(totals.oneTimeCHF),
    MONTHLY:chf(totals.monthlyCHF)
  };
  const template=fs.readFileSync(TEMPLATE,'utf8');
  return template.replace(/\{\{([A-Z_]+)\}\}/g,(match,key)=>Object.hasOwn(substitutions,key)?substitutions[key]:match);
}
module.exports={renderOfferPreview,esc};
