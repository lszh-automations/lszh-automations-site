'use strict';
// Shared by the Make code modules and the read-only link service.
// This rollout accepts only an explicitly configured internal pilot record.
const {createHash,randomBytes}=require('node:crypto');
const PILOT=Object.freeze({number:'TEST_CRM_CLOUD_20261021_NO_CONTRACT',company:'LSZH Invest GmbH – TEST_CRM_CLOUD_20261021',email:'lars@lszh-automations.ch',purpose:'TEST_ONLY_CRM_CLOUD_20261021',termsId:'1yPtsWTeEUclniKFWRM81EHEUMnu1E9nO',termsHash:'baec0946db9b892da86e4009ade769863d5087d8961e16940d0dda420d1bf279',quoteFolder:'1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in',termsFolder:'10bZHaNYWsxxUGkFBfRcdh45NxC-66Nko'});
const SOURCE_KEYS=['Offerte','Offertennummer','Lead','Lead E-Mail','Lead Firma','Lead Name','Lead Strasse','Lead PLZ','Lead Ort','Lead Land','Leistung','Ausgangssituation','Ziel','Leistungsumfang','Nicht enthalten','Beteiligte Systeme','Einmalig CHF','Monatlich CHF','Zahlungsmodell','Zahlungsziel Tage','Gültig bis','Projektbedingungen Version','AVV erforderlich'];
const sha=x=>createHash('sha256').update(x).digest('hex');
function fingerprint(f){return sha(JSON.stringify(SOURCE_KEYS.map(k=>[k,f[k]??null])));}
function assertSource(row,policy,now=new Date()){
 const f=row?.fields;
 if(!/^rec[A-Za-z0-9]{14}$/.test(policy?.recordId||'')||!/^rec[A-Za-z0-9]{14}$/.test(policy?.leadId||'')||row?.id!==policy.recordId||!f||f.Offertennummer!==PILOT.number||f.Status!=='Entwurf'||f.Schnellaktion!=='Für Versand freigeben'||f.Versandprüfung!=='BEREIT'||JSON.stringify(f.Lead)!==JSON.stringify([policy.leadId])||JSON.stringify(f['Lead E-Mail'])!==JSON.stringify([PILOT.email])||JSON.stringify(f['Lead Firma'])!==JSON.stringify([PILOT.company])||f.Übernommen!==true||!String(f['Interne Notiz']||'').includes(PILOT.purpose)||f['AVV erforderlich']!=='Nein'||f['Projektbedingungen Version']!=='TEST_v1.0_RC1')throw Error('pilot_source_rejected');
 for(const k of ['Echtbetrieb – kein Test','Online-Annahme rechtlich freigegeben','Vertragsunterlagen akzeptiert','Vertragsunterlagen versendet'])if(f[k])throw Error('pilot_release_rejected');
 for(const k of ['Kunde','Auftrag','Online-Annahme Zeitstempel','Online-Annahme Link gesendet am'])if(f[k]?.length)throw Error('pilot_already_processed');
 for(const k of SOURCE_KEYS.filter(k=>!['Lead','Einmalig CHF','Monatlich CHF','Zahlungsziel Tage'].includes(k))){const v=f[k];if(Array.isArray(v)?v.length!==1||!String(v[0]??'').trim():typeof v!=='string'||!v.trim()||v.length>6000)throw Error('pilot_required_fields');}
 if(f['Einmalig CHF']!==120||(f['Monatlich CHF']||0)!==0||f['Zahlungsziel Tage']!==30||!/^\d{4}-\d{2}-\d{2}$/.test(f['Gültig bis'])||Date.parse(f['Gültig bis']+'T23:59:59Z')<+now)throw Error('pilot_values_rejected');
 return f;
}
function offerHtml(f){
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const section=(title,text)=>'<p style="margin:10px 0;font-size:10pt"><strong>'+esc(title)+'</strong><br>'+esc(text).replace(/\n/g,'<br>')+'</p>';
 return '<div style="font-family:Arial;color:#152c43;font-size:10pt;line-height:1.25"><p style="color:#b00020;font-weight:bold">TEST_ONLY – interner Versandtest. Kein Vertrag. Keine Rechnung.</p><h1 style="font-size:20pt">LSZH AUTOMATIONS</h1><p>Ein Geschäftsbereich der LSZH Invest GmbH · Rummelmatt 8 · 5610 Wohlen AG</p><h2 style="font-size:15pt">Offerte '+esc(f.Offertennummer)+'</h2><p>'+esc(f['Lead Firma'][0])+'<br>'+esc(f['Lead Name'][0])+'<br>'+esc(f['Lead Strasse'][0])+'<br>'+esc(f['Lead PLZ'][0])+' '+esc(f['Lead Ort'][0])+'<br>'+esc(f['Lead Land'][0])+'</p>'+section('Leistung',f.Leistung)+section('Ausgangslage',f.Ausgangssituation)+section('Ziel',f.Ziel)+section('Leistungsumfang',f.Leistungsumfang)+section('Beteiligte Systeme',f['Beteiligte Systeme'])+section('Nicht enthalten',f['Nicht enthalten'])+'<hr><p><strong>Einmalig CHF 120 · Monatlich CHF 0</strong></p>'+section('Zahlungsmodell / Zahlungsziel',f.Zahlungsmodell+' / 30 Tage')+section('Gültig bis',f['Gültig bis'])+section('Projektbedingungen / AVV','TEST_v1.0_RC1 / Nein')+'<p>Alle Preise sind interne Testwerte. Keine Annahme oder Zahlung möglich.</p></div>';
}
function preflight(row,policy,now){
 const f=row?.fields;
 // A queued search may have matched before a previous run completed. Re-read
 // state wins: never overwrite an in-flight, sent or ambiguous mail outcome.
 if(row?.id===policy?.recordId&&f&&(f.Status!=='Entwurf'||f.Schnellaktion!=='Für Versand freigeben'||f['Online-Annahme Offerten Drive ID']||f['Online-Annahme Link gesendet am']||['PDF angefordert','Mail reserviert','Manuelle Prüfung','Versandt'].includes(f.Versandstatus)))return{ok:false,shouldWrite:false};
 try{const f=assertSource(row,policy,now);return{ok:true,shouldWrite:true,fingerprint:fingerprint(f),html:offerHtml(f),patchBody:JSON.stringify({fields:{Versandstatus:'PDF angefordert',Versandfehler:'','Versand freigegeben':true}})};}
 catch{return{ok:false,shouldWrite:true,patchBody:JSON.stringify({fields:{Versandstatus:'Blockiert',Versandfehler:row?.fields?.Versandprüfung!=='BEREIT'?String(row?.fields?.Versandprüfung||'Pflichtfelder prüfen'):'Interne Testbegrenzung oder Quelldaten prüfen','Versand freigegeben':false,Schnellaktion:null}})};}
}
function verifiedPdf(meta,base64,folder){
 const b=Buffer.from(base64||'','base64');
 if(!/^[A-Za-z0-9_-]{20,100}$/.test(meta?.id||'')||meta.mimeType!=='application/pdf'||!meta.contentRestrictions?.some(x=>x.readOnly===true)||meta.parents?.length!==1||meta.parents[0]!==folder||b.length<8||b.length>250000||b.length!==Number(meta.size)||!b.subarray(0,5).equals(Buffer.from('%PDF-'))||sha(b)!==meta.sha256Checksum)throw Error('pilot_archive_rejected');
 return {id:meta.id,sha256:meta.sha256Checksum,base64:b.toString('base64')};
}
function prepareSnapshot({row,policy,sourceFingerprint,quoteMeta,quoteBase64,termsMeta,termsBase64,origin,now=new Date()}){
 const f=assertSource(row,policy,now);
 if(fingerprint(f)!==sourceFingerprint||origin!=='https://lszh-crm-offer-links-ozx7mp2bka-oa.a.run.app')throw Error('pilot_source_changed');
 const quote=verifiedPdf(quoteMeta,quoteBase64,PILOT.quoteFolder),terms=verifiedPdf(termsMeta,termsBase64,PILOT.termsFolder);
 if(terms.id!==PILOT.termsId||terms.sha256!==PILOT.termsHash||f['Online-Annahme Offerten Drive ID']!==quote.id||f['Online-Annahme Offerten-SHA256']!==quote.sha256||f['Online-Annahme Offerten-Archivstatus']!=='VERIFIZIERT')throw Error('pilot_archive_binding_rejected');
 const code=randomBytes(32).toString('base64url'),tokenHash=sha(code),expiresAt=new Date(Math.min(+now+7*86400000,Date.parse(f['Gültig bis']+'T23:59:59Z'))).toISOString();
 const snapshot={purpose:PILOT.purpose,testOnly:true,recordId:policy.recordId,createdAt:now.toISOString(),expiresAt,sourceFingerprint,
  offer:{tokenHash,status:'sent',approved:true,revision:1,termsVersion:'TEST_v1.0_RC1',expiresAt,recipientEmail:'synthetic@example.invalid',offerNumber:PILOT.number,details:{company:PILOT.company,service:f.Leistung,onceCHF:120,monthlyCHF:0,paymentModel:f.Zahlungsmodell},bundle:{avv_required:'Nein',quote:{id:quote.id,sha256:quote.sha256},terms:{id:terms.id,sha256:terms.sha256}},source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',recordId:policy.recordId},downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}},documents:{quote:{base64:quote.base64},terms:{base64:terms.base64}}};
 return {tokenHash,expiresAt,link:origin+'/offerte-annehmen/#code='+code,firestoreBody:JSON.stringify({fields:{snapshotJSON:{stringValue:JSON.stringify(snapshot)}}}),snapshot};
}
function validateSnapshot(s,hash,recordId,now=new Date()){
 if(s?.purpose!==PILOT.purpose||s.testOnly!==true||s.recordId!==recordId||s.offer?.tokenHash!==hash||s.offer?.offerNumber!==PILOT.number||s.offer?.source?.recordId!==recordId||s.offer?.recipientEmail!=='synthetic@example.invalid'||s.offer?.details?.company!==PILOT.company||s.offer.details.onceCHF!==120||s.offer.details.monthlyCHF!==0||s.offer?.expiresAt!==s.expiresAt||!Number.isFinite(Date.parse(s.createdAt))||Date.parse(s.createdAt)>+now+60000||!Number.isFinite(Date.parse(s.expiresAt))||Date.parse(s.expiresAt)<=+now||Date.parse(s.expiresAt)>Date.parse(s.createdAt)+7*86400000||s.offer.bundle?.avv_required!=='Nein'||s.offer.bundle.terms?.id!==PILOT.termsId||s.offer.bundle.terms.sha256!==PILOT.termsHash)throw Error('pilot_snapshot_rejected');
 for(const which of ['quote','terms']){const bytes=Buffer.from(s.documents?.[which]?.base64||'','base64');if(bytes.length<8||bytes.length>250000||!bytes.subarray(0,5).equals(Buffer.from('%PDF-'))||sha(bytes)!==s.offer.bundle[which].sha256)throw Error('pilot_snapshot_bytes_rejected');}
 return s;
}
module.exports={PILOT,SOURCE_KEYS,sha,fingerprint,assertSource,offerHtml,preflight,verifiedPdf,prepareSnapshot,validateSnapshot};
