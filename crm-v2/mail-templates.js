'use strict';

// Transactional e-mails for the internal CRM. No mail is sent by this module.
// All text originates from Firestore, never from client-provided e-mail content.
const INTERNAL_TO='lars@lszh-automations.ch';
const CRM_URL='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app';
const EVENT_TYPES=Object.freeze({
  CUSTOMER_ACK:'customer_ack',
  INTERNAL_NEW:'internal_new',
  INTERNAL_24H:'internal_24h'
});
const email=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const asText=(value,max=500)=>String(value??'').trim().slice(0,max);
function escapeHtml(value) {
  return asText(value,4000).replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[c]);
}
function paragraph(value){
  return escapeHtml(value).replace(/\r?\n/g,'<br>');
}
// Internal CRM notifications share the customer brand while prioritising
// readable business fields and a fixed CRM action. No external assets/scripts.
function internalShell(content,preheader){
  return '<!doctype html><html lang="de-CH"><head>'+
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>LSZH Automations – Interne CRM-Benachrichtigung</title></head>'+
    '<body style="margin:0;padding:0;background-color:#f4f7fb;color:#0f1726;font-family:Arial,Helvetica,sans-serif;">'+
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'+
      escapeHtml(preheader)+'</div>'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f4f7fb;">'+
    '<tr><td align="center" style="padding:28px 14px 36px;">'+
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dfe7f2;border-radius:16px;overflow:hidden;">'+
    '<tr><td bgcolor="#06101d" style="background-color:#06101d;padding:29px 32px;">'+
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
      '<td width="53" valign="middle" style="width:53px;">'+
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
        '<td width="43" height="43" align="center" valign="middle" bgcolor="#5b8cff" style="width:43px;height:43px;border-radius:12px;background-color:#5b8cff;color:#ffffff;font-size:27px;font-weight:800;line-height:43px;">L</td>'+
        '</tr></table>'+
      '</td>'+
      '<td valign="middle" style="padding-left:10px;">'+
        '<div style="color:#ffffff;font-size:18px;font-weight:700;line-height:23px;letter-spacing:-0.3px;">LSZH Automations</div>'+
        '<div style="color:#b2bfd3;font-size:9px;font-weight:700;line-height:16px;letter-spacing:1.6px;">INTERNES CRM</div>'+
      '</td></tr></table>'+
    '</td></tr>'+
    '<tr><td style="padding:0;">'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>'+
      '<td width="34%" height="4" bgcolor="#74d8ff" style="height:4px;font-size:0;line-height:0;background-color:#74d8ff;">&nbsp;</td>'+
      '<td width="33%" height="4" bgcolor="#5b8cff" style="height:4px;font-size:0;line-height:0;background-color:#5b8cff;">&nbsp;</td>'+
      '<td width="33%" height="4" bgcolor="#8e72ff" style="height:4px;font-size:0;line-height:0;background-color:#8e72ff;">&nbsp;</td>'+
      '</tr></table>'+
    '</td></tr>'+
    '<tr><td style="background-color:#ffffff;padding:36px 34px 38px;">'+content+'</td></tr>'+
    '<tr><td bgcolor="#0a1728" style="background-color:#0a1728;padding:24px 34px 26px;">'+
      '<p style="margin:0 0 7px;color:#ffffff;font-size:13px;font-weight:700;line-height:20px;">LSZH Automations</p>'+
      '<p style="margin:0 0 12px;color:#b2bfd3;font-size:11px;line-height:19px;">'+
        'Ein Geschäftsbereich der LSZH Invest GmbH<br>Rummelmatt 8 · 5610 Wohlen AG · Schweiz</p>'+
      '<p style="margin:0;padding-top:12px;border-top:1px solid #25354d;color:#93a4bc;font-size:10px;line-height:17px;">'+
        'INTERNER CRM-HINWEIS · Automatisch erstellt · Nur für LSZH Automations</p>'+
    '</td></tr></table>'+
    '</td></tr></table></body></html>';
}
function internalField(label,value){
  return '<tr><td width="116" valign="top" style="width:116px;padding:8px 12px 8px 0;color:#66758c;font-size:12px;line-height:20px;">'+
    escapeHtml(label)+'</td>'+
    '<td valign="top" style="padding:8px 0;color:#0f1726;font-size:14px;font-weight:600;line-height:21px;overflow-wrap:anywhere;word-break:break-word;">'+
    escapeHtml(value)+'</td></tr>';
}
function internalLeadMail(lead,name,firm,id,isReminder){
  const title=isReminder?'Lead nach 24 Stunden noch auf «Neu»':'Neue Website-Anfrage eingegangen';
  const eyebrow=isReminder?'24H-ERINNERUNG':'NEUER WEBSITE-LEAD';
  const statusLabel=isReminder?'NOCH OFFEN':'NEU';
  const description=isReminder
    ?'Dieser Lead wurde vor mindestens 24 Stunden erfasst und ist aktuell weiterhin im Status «Neu». Bitte prüfen und bearbeiten.'
    :'Über das Website-Formular ist eine neue Anfrage eingegangen. Die Kontaktdaten und das Anliegen findest du nachfolgend.';
  return internalShell(
    '<p style="margin:0 0 12px;color:#5b8cff;font-size:11px;font-weight:700;line-height:17px;letter-spacing:1.5px;">'+eyebrow+'</p>'+
    '<h1 style="margin:0 0 16px;color:#06101d;font-size:26px;font-weight:700;line-height:35px;letter-spacing:-0.6px;">'+title+'</h1>'+
    '<p style="margin:0 0 25px;color:#526278;font-size:14px;line-height:23px;">'+description+'</p>'+
    '<p style="margin:0 0 17px;color:#5b8cff;font-size:11px;font-weight:700;letter-spacing:1.2px;">KONTAKTDATEN &nbsp;·&nbsp; '+statusLabel+'</p>'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:#f4f7fb;border:1px solid #dfe7f2;border-radius:10px;">'+
    '<tr><td style="padding:14px 20px;">'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'+
      internalField('Kontakt',name)+
      internalField('Unternehmen',firm)+
      internalField('E-Mail',lead.email)+
      '</table>'+
    '</td></tr></table>'+
    '<p style="margin:27px 0 11px;color:#06101d;font-size:13px;font-weight:700;line-height:20px;">Anfrage</p>'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:#ffffff;border:1px solid #dfe7f2;border-radius:10px;">'+
    '<tr><td style="padding:19px 20px;color:#344259;font-size:14px;line-height:23px;overflow-wrap:anywhere;word-break:break-word;">'+
      (paragraph(lead.message)||'–')+
    '</td></tr></table>'+
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin-top:27px;"><tr>'+
    '<td bgcolor="#5b8cff" style="background-color:#5b8cff;border-radius:9px;">'+
      '<a href="'+CRM_URL+'" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;line-height:20px;">Live-CRM öffnen &rarr;</a>'+
    '</td></tr></table>'+
    '<p style="margin:24px 0 0;color:#8190a6;font-size:11px;line-height:19px;">Lead-ID: '+escapeHtml(id)+'</p>',
    isReminder?'24h-Erinnerung: Website-Lead weiterhin Neu':'Neue Website-Anfrage im LSZH CRM'
  );
}

// Dedicated, email-client-friendly customer layout in the live LSZH brand.
// Tables and inline CSS work in Gmail/Outlook; no external images, JS or fonts.
function customerShell(content){
  return '<!doctype html><html lang="de-CH"><head>'+
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>LSZH Automations – Ihre Anfrage</title></head>'+
    '<body style="margin:0;padding:0;background-color:#f4f7fb;color:#0f1726;font-family:Arial,Helvetica,sans-serif;">'+
    '<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">'+
      'Vielen Dank. Wir haben Ihre Anfrage erhalten und melden uns persönlich bei Ihnen.</div>'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background-color:#f4f7fb;">'+
    '<tr><td align="center" style="padding:28px 14px 36px;">'+
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;width:100%;max-width:600px;background-color:#ffffff;border:1px solid #dfe7f2;border-radius:16px;overflow:hidden;">'+
    '<tr><td bgcolor="#06101d" style="background-color:#06101d;padding:29px 32px;">'+
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
      '<td width="53" valign="middle" style="width:53px;">'+
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'+
        '<td width="43" height="43" align="center" valign="middle" bgcolor="#5b8cff" style="width:43px;height:43px;border-radius:12px;background-color:#5b8cff;color:#ffffff;font-size:27px;font-weight:800;line-height:43px;">L</td>'+
        '</tr></table>'+
      '</td>'+
      '<td valign="middle" style="padding-left:10px;">'+
        '<div style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:18px;font-weight:700;line-height:23px;letter-spacing:-0.3px;">LSZH Automations</div>'+
        '<div style="color:#b2bfd3;font-size:9px;font-weight:700;line-height:16px;letter-spacing:1.6px;">AUTOMATION FÜR SCHWEIZER KMU</div>'+
      '</td></tr></table>'+
    '</td></tr>'+
    '<tr><td style="padding:0;">'+
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'+
        '<tr><td width="34%" height="4" bgcolor="#74d8ff" style="height:4px;font-size:0;line-height:0;background-color:#74d8ff;">&nbsp;</td>'+
        '<td width="33%" height="4" bgcolor="#5b8cff" style="height:4px;font-size:0;line-height:0;background-color:#5b8cff;">&nbsp;</td>'+
        '<td width="33%" height="4" bgcolor="#8e72ff" style="height:4px;font-size:0;line-height:0;background-color:#8e72ff;">&nbsp;</td></tr>'+
      '</table>'+
    '</td></tr>'+
    '<tr><td style="background-color:#ffffff;padding:40px 34px 38px;">'+content+'</td></tr>'+
    '<tr><td bgcolor="#0a1728" style="background-color:#0a1728;padding:27px 34px 29px;">'+
      '<p style="margin:0 0 9px;color:#ffffff;font-size:13px;font-weight:700;line-height:20px;">LSZH Automations</p>'+
      '<p style="margin:0 0 13px;color:#b2bfd3;font-size:11px;line-height:19px;">'+
        'Ein Geschäftsbereich der LSZH Invest GmbH<br>Rummelmatt 8 · 5610 Wohlen AG · Schweiz</p>'+
      '<p style="margin:0 0 14px;font-size:11px;line-height:19px;">'+
        '<a href="mailto:info@lszh-automations.ch" style="color:#74d8ff;text-decoration:none;">info@lszh-automations.ch</a>'+
        '<span style="color:#66758c;"> &nbsp;·&nbsp; </span>'+
        '<a href="https://lszh-automations.ch/" style="color:#74d8ff;text-decoration:none;">lszh-automations.ch</a></p>'+
      '<p style="margin:0;padding-top:13px;border-top:1px solid #25354d;color:#93a4bc;font-size:10px;line-height:17px;">'+
        'Diese Nachricht bestätigt nur den Eingang Ihrer Anfrage. Es ist noch kein Auftrag zustande gekommen.</p>'+
    '</td></tr></table>'+
    '</td></tr></table></body></html>';
}
function customerConfirmation(lead,name){
  const greeting=name ? 'Guten Tag '+escapeHtml(name) : 'Guten Tag';
  return customerShell(
    '<p style="margin:0 0 13px;color:#5b8cff;font-size:11px;font-weight:700;line-height:17px;letter-spacing:1.6px;">ANFRAGE EINGEGANGEN</p>'+
    '<h1 style="margin:0 0 26px;color:#06101d;font-size:29px;font-weight:700;line-height:37px;letter-spacing:-0.8px;">Ihre Anfrage ist bei uns eingegangen.</h1>'+
    '<p style="margin:0 0 17px;color:#0f1726;font-size:15px;line-height:25px;">'+greeting+'</p>'+
    '<p style="margin:0 0 26px;color:#344259;font-size:15px;line-height:25px;">'+
      'Vielen Dank für Ihr Interesse an LSZH Automations. Wir haben Ihre Angaben erhalten.</p>'+
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background-color:#f4f7fb;border:1px solid #dfe7f2;border-radius:10px;">'+
      '<tr><td style="padding:20px 22px;">'+
        '<p style="margin:0 0 8px;color:#06101d;font-size:13px;font-weight:700;line-height:20px;">Wie geht es weiter?</p>'+
        '<p style="margin:0;color:#526278;font-size:14px;line-height:23px;">'+
          'Wir prüfen Ihr Anliegen und melden uns persönlich bei Ihnen, um mögliche Lösungen und die nächsten Schritte zu besprechen.</p>'+
      '</td></tr></table>'+
    '<p style="margin:28px 0 0;color:#344259;font-size:14px;line-height:24px;">'+
      'Freundliche Grüsse<br><strong style="color:#06101d;">Ihr Team von LSZH Automations</strong></p>'
  );
}

function isEligible(lead,kind,nowMs=Date.now(),notBeforeMs=0){
  // This workflow is exclusively for leads created by the public website,
  // not manually entered CRM contacts or imported records.
  if(!lead||!/^web_[0-9a-f]{32}$/.test(String(lead.id||''))||
     lead.source!=='LSZH Automations Website'||!email.test(asText(lead.email,254)))return false;
  if(/TEST_ONLY/i.test(asText(lead.name,180)+' '+asText(lead.company,180)) || /@example\.(?:com|org|net)$/i.test(asText(lead.email,254))) return false;
  const created=Date.parse(lead.createdAt||'');
  if(!Number.isFinite(created)||created<notBeforeMs)return false;
  if(kind===EVENT_TYPES.INTERNAL_24H)
    return lead.status==='Neu' && (nowMs-created)>=24*60*60*1000;
  return kind===EVENT_TYPES.CUSTOMER_ACK||kind===EVENT_TYPES.INTERNAL_NEW;
}
function renderMail(kind,lead){
  const id=asText(lead.id,100),name=asText(lead.name,180)||'Guten Tag';
  const firm=asText(lead.company,180)||'–';
  const subjectFirm=firm.replace(/[\r\n\u0000-\u001f]+/g,' ').slice(0,100);
  if(kind===EVENT_TYPES.CUSTOMER_ACK){
    return {
      to:asText(lead.email,254).toLowerCase(),
      subject:'Ihre Anfrage bei LSZH Automations ist eingegangen',
      html:customerConfirmation(lead,asText(lead.name,180))
    };
  }
  if(kind===EVENT_TYPES.INTERNAL_NEW){
    return {
      to:INTERNAL_TO,
      subject:'[LSZH CRM] Neuer Website-Lead: '+subjectFirm,
      html:internalLeadMail(lead,name,firm,id,false)
    };
  }
  if(kind===EVENT_TYPES.INTERNAL_24H){
    return {
      to:INTERNAL_TO,
      subject:'[LSZH CRM] 24h-Erinnerung: '+subjectFirm+' – weiterhin Neu',
      html:internalLeadMail(lead,name,firm,id,true)
    };
  }
  throw Error('unsupported_mail_kind');
}
function eventId(kind,leadId){
  if(!Object.values(EVENT_TYPES).includes(kind)||!/^[A-Za-z0-9_-]{1,100}$/.test(leadId))
    throw Error('invalid_mail_event');
  return kind+'__'+leadId;
}
module.exports={EVENT_TYPES,INTERNAL_TO,CRM_URL,escapeHtml,isEligible,renderMail,eventId};
