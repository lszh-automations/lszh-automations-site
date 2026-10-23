'use strict';
const {quoteTotals,existingLines}=require('./offer-pricing');
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);}
function renderOfferEmail(offer,recipient){
  const company=String(recipient?.company||'').trim();
  const number=String(offer.number||'');
  if(!/^\d{1,10}$/.test(number))throw Error('invalid_offer_number');
  const title=String(offer.title||'Angebot').trim();
  const totals=quoteTotals(existingLines(offer));
  const subject='Ihre Offerte Nr. '+number+' | LSZH Automations';
  const filename='LSZH-Offerte-'+number+'.pdf';
  const money=value=>'CHF '+new Intl.NumberFormat('de-CH',{
    minimumFractionDigits:2,maximumFractionDigits:2
  }).format(value);
  const html='<!doctype html><html lang="de"><head><meta charset="UTF-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
    '<body style="margin:0;background:#f0f3f7;font-family:Arial,Helvetica,sans-serif;color:#122136">'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:30px 12px"><tr><td align="center">'+
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden">'+
    '<tr><td style="background:#0e1929;padding:30px 36px;color:#fff">'+
    '<div style="font-size:23px;font-weight:800;letter-spacing:1px">LSZH <span style="color:#74d8ff">AUTOMATIONS</span></div>'+
    '<div style="font-size:11px;color:#a9c2d9;margin-top:8px;letter-spacing:2px">LSZH INVEST GMBH</div></td></tr>'+
    '<tr><td style="padding:34px 36px">'+
    '<div style="font-size:11px;letter-spacing:1.6px;color:#397ead;font-weight:700">IHRE OFFERTENUNTERLAGEN</div>'+
    '<h1 style="font-size:24px;line-height:1.3;margin:12px 0 22px">Offerte Nr. '+esc(number)+'</h1>'+
    '<p style="font-size:15px;line-height:1.7">Guten Tag'+(company?' '+esc(company):'')+'</p>'+
    '<p style="font-size:15px;line-height:1.7">Vielen Dank für Ihr Interesse an LSZH Automations. '+
    'Im Anhang erhalten Sie unsere Offerte für <strong>'+esc(title)+'</strong> als PDF.</p>'+
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f7fb;border:1px solid #dce9f3;border-radius:10px;padding:18px">'+
    '<tr><td style="color:#456078;font-size:12px">Einmalige Leistungen</td><td style="text-align:right;font-weight:700;font-size:14px">'+esc(money(totals.oneTimeCHF))+'</td></tr>'+
    '<tr><td style="padding-top:10px;color:#456078;font-size:12px">Monatliche Leistungen</td>'+
    '<td style="padding-top:10px;text-align:right;font-weight:700;font-size:14px">'+esc(money(totals.monthlyCHF))+'</td></tr></table>'+
    '<p style="font-size:14px;line-height:1.7;margin-top:24px">Die Offerte ist gültig bis <strong>'+esc(offer.validUntil)+'</strong>. '+
    'Für Fragen oder Rückmeldungen stehen wir gerne zur Verfügung.</p>'+
    '<p style="font-size:14px;line-height:1.7;margin-top:27px">Freundliche Grüsse<br><strong>LSZH Automations</strong><br>LSZH Invest GmbH</p>'+
    '</td></tr><tr><td style="background:#e9f1f8;padding:18px 36px;font-size:11px;line-height:1.6;color:#59728a">'+
    'LSZH Automations · Ein Geschäftsbereich der LSZH Invest GmbH · Schweiz</td></tr>'+
    '</table></td></tr></table></body></html>';
  return {subject,filename,html};
}
module.exports={renderOfferEmail};
