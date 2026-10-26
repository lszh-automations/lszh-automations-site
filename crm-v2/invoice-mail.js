'use strict';
const {wordmarkHtml}=require('./brand');
const {invoiceTotals,invoiceLegacyItems}=require('./invoice-pricing');

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);
const dateCH=value=>{
  const v=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v)?v.slice(8)+'.'+v.slice(5,7)+'.'+v.slice(0,4):v;
};
const money=value=>'CHF '+new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value);
function renderInvoiceEmail(invoice,customer){
  const number=String(invoice?.number||'');
  if(!/^RE-[0-9]{1,10}$/.test(number))throw Error('invalid_invoice_number');
  if(invoice?.status!=='Offen')throw Error('invoice_not_open');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(invoice.dueDate||'')))throw Error('invalid_due_date');
  const total=invoiceTotals(invoiceLegacyItems(invoice));
  if(!(total.amountCHF>0)||Math.abs(total.amountCHF-Number(invoice.amountCHF))>.001)
    throw Error('invoice_amount_mismatch');
  const name=String(customer?.contactName||'').trim().slice(0,180);
  const greeting=name?'Guten Tag '+esc(name):'Guten Tag';
  const subject='Ihre Rechnung Nr. '+number+' | LSZH Automations';
  const filename='LSZH_Rechnung_'+number+'.pdf';
  const html='<!doctype html><html lang="de-CH"><head><meta charset="UTF-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>LSZH Automations – Ihre Rechnung</title></head>'+
    '<body style="margin:0;padding:0;background:#f4f7fb;color:#0f1726;font-family:Arial,Helvetica,sans-serif;">'+
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'+
    'Rechnung '+esc(number)+' von LSZH Automations als Swiss-QR-PDF im Anhang.</div>'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#f4f7fb;">'+
    '<tr><td align="center" style="padding:28px 14px 36px;">'+
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#fff;border:1px solid #dfe7f2;border-radius:16px;overflow:hidden;">'+
    '<tr><td bgcolor="#06101d" style="background:#06101d;padding:29px 32px;">'+
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>'+
    '<td valign="middle">'+wordmarkHtml()+
    '<div style="font-size:9px;color:#b2bfd3;font-weight:700;line-height:16px;letter-spacing:1.2px;margin-top:6px;">AUTOMATION FÜR SCHWEIZER KMU</div>'+
    '</td></tr></table></td></tr>'+
    '<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>'+
    '<td width="34%" height="4" bgcolor="#74d8ff" style="background:#74d8ff;font-size:0;">&nbsp;</td>'+
    '<td width="33%" height="4" bgcolor="#5b8cff" style="background:#5b8cff;font-size:0;">&nbsp;</td>'+
    '<td width="33%" height="4" bgcolor="#8e72ff" style="background:#8e72ff;font-size:0;">&nbsp;</td>'+
    '</tr></table></td></tr>'+
    '<tr><td style="padding:37px 34px 36px;">'+
    '<p style="margin:0 0 12px;color:#5b8cff;font-size:11px;font-weight:700;letter-spacing:1.4px;">IHRE RECHNUNGSUNTERLAGEN</p>'+
    '<h1 style="margin:0 0 24px;color:#06101d;font-size:27px;line-height:36px;">Rechnung '+esc(number)+'</h1>'+
    '<p style="margin:0 0 15px;font-size:15px;line-height:25px;">'+greeting+'</p>'+
    '<p style="margin:0 0 22px;color:#344259;font-size:15px;line-height:25px;">'+
    'Im Anhang erhalten Sie unsere Rechnung als PDF mit Schweizer QR-Zahlteil. Vielen Dank für die Zusammenarbeit.</p>'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f4f7fb;border:1px solid #dfe7f2;border-radius:10px;"><tr><td style="padding:19px 20px;">'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'+
    '<tr><td style="color:#526278;font-size:13px;line-height:23px;">Rechnungsnummer</td><td align="right" style="color:#06101d;font-size:14px;font-weight:700;">'+esc(number)+'</td></tr>'+
    '<tr><td style="padding-top:9px;color:#526278;font-size:13px;">Betrag</td><td align="right" style="padding-top:9px;color:#06101d;font-size:16px;font-weight:700;">'+esc(money(total.amountCHF))+'</td></tr>'+
    '<tr><td style="padding-top:9px;color:#526278;font-size:13px;">Zahlbar bis</td><td align="right" style="padding-top:9px;color:#06101d;font-size:14px;font-weight:700;">'+esc(dateCH(invoice.dueDate))+'</td></tr>'+
    '</table></td></tr></table>'+
    '<p style="margin:12px 0 0;color:#526278;font-size:12px;line-height:19px;">Keine MWST ausgewiesen – LSZH Invest GmbH ist nicht MWST-registriert.</p>'+
    '<p style="margin:22px 0 20px;color:#344259;font-size:14px;line-height:24px;">'+
    'Sie können den QR-Zahlteil im Anhang mit Ihrer Schweizer Banking-App scannen. Bitte zahlen Sie nur einmal.</p>'+
    '<p style="margin:0;color:#344259;font-size:14px;line-height:23px;">'+
    'Bei Fragen helfen wir Ihnen gerne weiter.<br><br>Freundliche Grüsse<br>'+
    '<strong style="color:#06101d;">Ihr Team von LSZH Automations</strong></p>'+
    '</td></tr>'+
    '<tr><td bgcolor="#0a1728" style="background:#0a1728;padding:25px 34px 27px;">'+
    '<p style="margin:0 0 8px;color:#fff;font-size:13px;font-weight:700;">LSZH Automations</p>'+
    '<p style="margin:0 0 11px;color:#b2bfd3;font-size:11px;line-height:19px;">'+
    'Ein Geschäftsbereich der LSZH Invest GmbH<br>Rummelmatt 8 · 5610 Wohlen AG · Schweiz<br>UID: CHE-369.474.125</p>'+
    '<p style="margin:0;color:#74d8ff;font-size:11px;line-height:19px;">'+
    '<a href="mailto:info@lszh-automations.ch" style="color:#74d8ff;text-decoration:none;">info@lszh-automations.ch</a> · '+
    '<a href="https://lszh-automations.ch/" style="color:#74d8ff;text-decoration:none;">lszh-automations.ch</a></p>'+
    '</td></tr></table></td></tr></table></body></html>';
  return {subject,filename,html};
}
module.exports={renderInvoiceEmail};
