'use strict';
const {quoteTotals,existingLines}=require('./offer-pricing');
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);}
function dateCH(value){
  const raw=String(value||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ?raw.slice(8,10)+'.'+raw.slice(5,7)+'.'+raw.slice(0,4):raw;
}
function renderOfferEmail(offer,recipient){
  const number=String(offer.number||'');
  if(!/^\d{1,10}$/.test(number))throw Error('invalid_offer_number');
  const title=String(offer.title||'Leistungsangebot').trim();
  const contact=String(recipient?.name||recipient?.contactName||'').trim().slice(0,180);
  const greeting=contact?'Guten Tag '+esc(contact):'Guten Tag';
  const totals=quoteTotals(existingLines(offer));
  const money=value=>'CHF '+new Intl.NumberFormat('de-CH',{
    minimumFractionDigits:2,maximumFractionDigits:2
  }).format(value);
  const subject='Ihre Offerte Nr. '+number+' | LSZH Automations';
  const filename='LSZH-Offerte-'+number+'.pdf';
  // Same navy/blue tri-accent brand as the already live customer acknowledgement.
  // Inline CSS/tables make this work in Gmail and Outlook without external assets.
  const html='<!doctype html><html lang="de-CH"><head><meta charset="UTF-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>LSZH Automations – Ihre Offerte</title></head>'+
    '<body style="margin:0;padding:0;background:#f4f7fb;color:#0f1726;font-family:Arial,Helvetica,sans-serif;">'+
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'+
    'Ihre Offerte Nr. '+esc(number)+' von LSZH Automations als PDF im Anhang.</div>'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;background:#f4f7fb;">'+
    '<tr><td align="center" style="padding:28px 14px 36px;">'+
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" '+
      'style="max-width:600px;width:100%;background:#fff;border:1px solid #dfe7f2;border-radius:16px;overflow:hidden;">'+
    '<tr><td bgcolor="#06101d" style="background:#06101d;padding:29px 32px;">'+
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>'+
    '<td width="53" valign="middle">'+
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>'+
    '<td width="43" height="43" align="center" bgcolor="#5b8cff" '+
      'style="background:#5b8cff;color:#fff;font-size:27px;font-weight:800;line-height:43px;border-radius:12px;">L</td>'+
    '</tr></table></td>'+
    '<td valign="middle" style="padding-left:10px;">'+
    '<div style="font-size:18px;color:#fff;font-weight:700;line-height:23px;">LSZH Automations</div>'+
    '<div style="font-size:9px;color:#b2bfd3;font-weight:700;letter-spacing:1.6px;">AUTOMATION FÜR SCHWEIZER KMU</div>'+
    '</td></tr></table></td></tr>'+
    '<tr><td><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>'+
    '<td width="34%" height="4" bgcolor="#74d8ff" style="background:#74d8ff;font-size:0;">&nbsp;</td>'+
    '<td width="33%" height="4" bgcolor="#5b8cff" style="background:#5b8cff;font-size:0;">&nbsp;</td>'+
    '<td width="33%" height="4" bgcolor="#8e72ff" style="background:#8e72ff;font-size:0;">&nbsp;</td>'+
    '</tr></table></td></tr>'+
    '<tr><td style="padding:37px 34px 36px;">'+
    '<p style="margin:0 0 12px;color:#5b8cff;font-size:11px;font-weight:700;letter-spacing:1.4px;">IHRE OFFERTENUNTERLAGEN</p>'+
    '<h1 style="margin:0 0 24px;color:#06101d;font-size:27px;line-height:36px;">Offerte Nr. '+esc(number)+'</h1>'+
    '<p style="margin:0 0 15px;font-size:15px;line-height:25px;">'+greeting+'</p>'+
    '<p style="margin:0 0 25px;color:#344259;font-size:15px;line-height:25px;">'+
    'Vielen Dank für Ihr Interesse an LSZH Automations. Im Anhang erhalten Sie unsere '+
    'unverbindliche Offerte für <strong>'+esc(title)+'</strong> als PDF.</p>'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" '+
      'style="background:#f4f7fb;border:1px solid #dfe7f2;border-radius:10px;">'+
    '<tr><td style="padding:19px 20px;">'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">'+
    '<tr><td style="color:#526278;font-size:13px;line-height:23px;">Einmalige Leistungen</td>'+
    '<td align="right" style="color:#06101d;font-size:15px;font-weight:700;">'+esc(money(totals.oneTimeCHF))+'</td></tr>'+
    '<tr><td style="padding-top:12px;color:#526278;font-size:13px;line-height:23px;">Monatliche Leistungen</td>'+
    '<td align="right" style="padding-top:12px;color:#06101d;font-size:15px;font-weight:700;">'+esc(money(totals.monthlyCHF))+' / Monat</td></tr>'+
    '</table></td></tr></table>'+
    '<p style="margin:12px 0 0;color:#526278;font-size:12px;line-height:19px;">'+
    'Keine MWST ausgewiesen – LSZH Invest GmbH ist nicht MWST-registriert.</p>'+
    '<p style="margin:23px 0 8px;color:#344259;font-size:14px;line-height:24px;">'+
    'Gültig bis: <strong>'+esc(dateCH(offer.validUntil))+'</strong></p>'+
    '<p style="margin:0 0 22px;color:#526278;font-size:12px;line-height:21px;">'+
    'Diese Offerte ist unverbindlich. Ein Auftrag kommt erst durch unsere ausdrückliche '+
    'schriftliche Auftragsbestätigung zustande.</p>'+
    '<p style="margin:0;color:#344259;font-size:14px;line-height:23px;">'+
    'Bei Fragen sind wir gerne für Sie da.<br><br>Freundliche Grüsse<br>'+
    '<strong style="color:#06101d;">Ihr Team von LSZH Automations</strong></p>'+
    '</td></tr>'+
    '<tr><td bgcolor="#0a1728" style="background:#0a1728;padding:25px 34px 27px;">'+
    '<p style="margin:0 0 8px;color:#fff;font-size:13px;font-weight:700;">LSZH Automations</p>'+
    '<p style="margin:0 0 11px;color:#b2bfd3;font-size:11px;line-height:19px;">'+
    'Ein Geschäftsbereich der LSZH Invest GmbH<br>Rummelmatt 8 · 5610 Wohlen AG · Schweiz<br>'+
    'UID: CHE-369.474.125</p>'+
    '<p style="margin:0;color:#74d8ff;font-size:11px;line-height:19px;">'+
    '<a href="mailto:info@lszh-automations.ch" style="color:#74d8ff;text-decoration:none;">info@lszh-automations.ch</a> · '+
    '<a href="https://lszh-automations.ch/" style="color:#74d8ff;text-decoration:none;">lszh-automations.ch</a></p>'+
    '</td></tr></table></td></tr></table></body></html>';
  return {subject,filename,html};
}
module.exports={renderOfferEmail};
