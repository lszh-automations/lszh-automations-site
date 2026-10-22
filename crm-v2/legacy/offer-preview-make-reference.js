// Historical Make preview generation script, captured before legacy Make deletion.
// NOT a production-ready renderer; references Airtable-shaped input and Make `input`.
// Use only as a visual/layout reference when implementing CRM V2 PDFs.

'use strict';
const p=JSON.parse(String(input.payload_json||''));
if(!p.preview_only||p.delivery_enabled!==false||p.acceptance_enabled!==false||p.email_sent!==false||p.contract_signed!==false)throw Error('PREVIEW_ONLY_GATE');
if(!/^rec[A-Za-z0-9]{14}$/.test(p.source_record_id)||!p.filename.startsWith('LSZH_VORSCHAU_'))throw Error('PREVIEW_SOURCE_GATE');
const f=p.fields||{}, esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const para=x=>esc(x).replace(/\r?\n/g,'<br>');
const section=(title,text)=>'<div style="margin-top:17px;page-break-inside:avoid"><div style="font-size:8pt;font-weight:700;letter-spacing:.1em;color:#44617a;text-transform:uppercase">'+esc(title)+'</div><div style="margin-top:5px;font-size:10pt">'+para(text)+'</div></div>';
const money=n=>new Intl.NumberFormat('de-CH',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n/100);
const h='<div style="font-family:Arial,Helvetica,sans-serif;color:#152c43;font-size:10pt;line-height:1.45">'+
  '<div style="font-size:20pt;font-weight:700">LSZH <span style="font-size:11pt;color:#356fb0">AUTOMATIONS</span></div>'+
  '<div style="font-size:8pt;color:#56697c">Ein Geschäftsbereich der LSZH Invest GmbH · Wohlen AG · Schweiz</div>'+
  '<div style="margin-top:18px;padding:11px;background:#fff4e7;border:1px solid #e6b76b;color:#80501d;font-size:10pt;font-weight:700">INTERNE PDF-VORSCHAU – ENTWURF – NICHT AN KUNDEN VERSENDEN</div>'+
  '<h1 style="margin:23px 0 4px;font-size:22pt">Offerte</h1>'+
  '<div style="font-size:9pt;color:#526579">Offertennummer: '+esc(p.offer_number)+'</div>'+
  section('Empfänger',f['Lead Firma']+'\n'+f['Lead Name']+'\n'+f['Lead Strasse']+'\n'+f['Lead PLZ']+' '+f['Lead Ort']+'\n'+f['Lead Land'])+
  section('Leistung',f.Leistung)+
  section('Ausgangssituation',f.Ausgangssituation)+
  section('Ziel',f.Ziel)+
  section('Leistungsumfang',f.Leistungsumfang)+
  section('Nicht enthalten',f['Nicht enthalten'])+
  section('Beteiligte Systeme',f['Beteiligte Systeme'])+
  '<div style="margin-top:24px;border-top:1px solid #ccd7e3;padding-top:16px;font-weight:700;font-size:15pt">Investition</div>'+
  '<table style="width:100%;border-collapse:collapse;font-size:10pt;margin-top:8px">'+
  '<tr><td style="padding:9px 0;border-bottom:1px solid #e5eaf0">Einmalige Einrichtung / Umsetzung</td><td style="padding:9px 0;border-bottom:1px solid #e5eaf0;text-align:right">CHF '+esc(money(p.once_chf_cents))+'</td></tr>'+
  '<tr><td style="padding:9px 0;border-bottom:1px solid #e5eaf0">Monatliche Betreuung</td><td style="padding:9px 0;border-bottom:1px solid #e5eaf0;text-align:right">CHF '+esc(money(p.monthly_chf_cents))+' / Monat</td></tr></table>'+
  section('Zahlungsbedingungen',f.Zahlungsmodell+' · Zahlungsziel: '+p.payment_days+' Tage')+
  section('Gültig bis',f['Gültig bis'])+
  section('Vertragsunterlagen','Projektbedingungen '+f['Projektbedingungen Version']+' · AVV erforderlich: '+f['AVV erforderlich'])+
  (p.warnings.length?'<div style="margin-top:18px;color:#a33c25;font-weight:700">Vor Versand zu ergänzen: '+esc(p.warnings.join(', '))+'</div>':'')+
  '<div style="margin-top:25px;border-top:1px solid #dde6f0;padding-top:10px;font-size:8pt;color:#9a4f2c">VORSCHAU. Kein verbindliches Angebot. Keine Online-Annahme, kein Kundenversand, keine Rechnung.</div></div>';
return {html:h,offer_number:p.offer_number,source_record_id:p.source_record_id,filename:p.filename,doc_filename:p.doc_filename,preview_only:true,delivery_enabled:false,warning_count:p.warnings.length};
