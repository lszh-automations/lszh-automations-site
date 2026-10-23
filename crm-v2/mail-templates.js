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
function shell(content){
  return '<!doctype html><html lang="de-CH"><head><meta charset="UTF-8"></head>'+
    '<body style="font-family:Arial,sans-serif;background:#f7f9fc;color:#182332;padding:24px">'+
    '<div style="max-width:660px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">'+
    '<h2 style="margin-top:0">LSZH Automations</h2>'+content+
    '<hr style="border:0;border-top:1px solid #e2e8f0;margin:25px 0">'+
    '<p style="font-size:12px;color:#66758c">LSZH Automations · Geschäftsbereich der LSZH Invest GmbH · 5610 Wohlen AG</p>'+
    '</div></body></html>';
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
  const basic='<p><b>Kontakt:</b> '+escapeHtml(name)+'</p>'+
    '<p><b>Unternehmen:</b> '+escapeHtml(firm)+'</p>'+
    '<p><b>E-Mail:</b> '+escapeHtml(lead.email)+'</p>'+
    '<p><b>Anfrage:</b><br>'+paragraph(lead.message)+'</p>'+
    '<p><b>Lead-ID:</b> '+escapeHtml(id)+'</p>'+
    '<p><a href="'+CRM_URL+'">Live-CRM öffnen</a></p>';
  if(kind===EVENT_TYPES.CUSTOMER_ACK){
    return {
      to:asText(lead.email,254).toLowerCase(),
      subject:'Ihre Anfrage bei LSZH Automations ist eingegangen',
      html:shell('<p>Guten Tag '+escapeHtml(name)+'</p>'+
        '<p>Vielen Dank für Ihre Anfrage und Ihr Interesse an LSZH Automations. '+
        'Wir haben Ihre Angaben erhalten und werden sie prüfen. '+
        'Wir melden uns persönlich bei Ihnen, um die nächsten Schritte zu besprechen.</p>'+
        '<p>Dies ist eine automatische Eingangsbestätigung; es wurde noch kein Auftrag abgeschlossen.</p>'+
        '<p>Freundliche Grüsse<br>LSZH Automations</p>')
    };
  }
  if(kind===EVENT_TYPES.INTERNAL_NEW){
    return {
      to:INTERNAL_TO,
      subject:'[LSZH CRM] Neuer Website-Lead: '+subjectFirm,
      html:shell('<h3>Neue Website-Anfrage eingegangen</h3>'+basic)
    };
  }
  if(kind===EVENT_TYPES.INTERNAL_24H){
    return {
      to:INTERNAL_TO,
      subject:'[LSZH CRM] 24h-Erinnerung: '+subjectFirm+' – weiterhin Neu',
      html:shell('<h3>Lead nach 24 Stunden noch auf «Neu»</h3>'+
        '<p>Dieser Lead wurde vor mindestens 24 Stunden erfasst und ist aktuell weiterhin im Status «Neu». '+
        'Bitte prüfen und bearbeiten.</p>'+basic)
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
