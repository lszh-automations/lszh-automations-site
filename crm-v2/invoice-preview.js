'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {invoiceTotals,invoiceLegacyItems}=require('./invoice-pricing');
const TEMPLATE=path.join(__dirname,'public','invoice-preview.html');
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));}
const money=n=>'CHF '+new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0);
function formatDate(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '–';
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(+date)?new Intl.DateTimeFormat('de-CH',{timeZone:'UTC',day:'2-digit',month:'2-digit',year:'numeric'}).format(date):'–';
}
function renderInvoicePreview(invoice,customer,project){
 const address=customer?[customer.company,customer.contactName,customer.street,
    [customer.postalCode,customer.city].filter(Boolean).join(' '),customer.country].filter(Boolean):
    ['Kunde noch nicht ausgewählt'];
 const items=invoiceLegacyItems(invoice);
 const totals=invoiceTotals(items);
 const rows=items.map((item,i)=>{
   const sum=Math.round(Math.round(item.unitPriceCHF*100)*item.qty)/100;
   return '<tr><td>'+escapeHtml(i+1)+'</td><td>'+escapeHtml(item.title)+'</td><td class="right">'+escapeHtml(item.qty)+
      '</td><td class="right">'+money(item.unitPriceCHF)+'</td><td class="right">'+money(sum)+'</td></tr>';
 }).join('');
 const replacements={
   NUMBER:escapeHtml(invoice.number||'Entwurf'),
   STATUS:escapeHtml(invoice.status||'Entwurf'),
   RECIPIENT:address.map(escapeHtml).join('<br>'),
   ISSUED:formatDate(invoice.invoiceDate||String(invoice.createdAt||'').slice(0,10)),
   DUE:formatDate(invoice.dueDate),
   SUBJECT:escapeHtml(invoice.description||'Leistungen'),
   PROJECT:project?escapeHtml(project.title):'–',
   POSITIONS:items.length?'<table><thead><tr><th>Pos.</th><th>Leistung</th><th class="right">Menge</th><th class="right">Einzelpreis</th><th class="right">Betrag</th></tr></thead><tbody>'+rows+'</tbody></table>':'<p class="muted">Noch keine Positionen erfasst.</p>',
   TOTAL:money(totals.amountCHF)
 };
 return fs.readFileSync(TEMPLATE,'utf8').replace(/\{\{([A-Z]+)\}\}/g,(full,key)=>Object.hasOwn(replacements,key)?replacements[key]:full);
}
module.exports={renderInvoicePreview};
