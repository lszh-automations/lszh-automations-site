import {createHash} from 'node:crypto';
export const CRM_TEST={recordId:'recu9g2QdW6KvavCp',leadId:'recHRNFVth6cyEWls',number:'TEST_CRM_VERSAND_20261021_NO_CONTRACT',purpose:'TEST_ONLY_CRM_DISPATCH_20261021',email:'lars@lszh-automations.ch',company:'LSZH Invest GmbH – TEST_CRM_VERSAND_20261021'};
const text=v=>typeof v==='string'?v.trim():'';
export function assertCrmTestOffer(row){const f=row?.fields;
 if(row?.id!==CRM_TEST.recordId||!f||f.Offertennummer!==CRM_TEST.number||f.Status!=='Entwurf'||f.Lead?.length!==1||f.Lead[0]!==CRM_TEST.leadId||JSON.stringify(f['Lead E-Mail'])!==JSON.stringify([CRM_TEST.email])||JSON.stringify(f['Lead Firma'])!==JSON.stringify([CRM_TEST.company])||f.Übernommen!==true||['Echtbetrieb – kein Test','Online-Annahme rechtlich freigegeben','Vertragsunterlagen akzeptiert'].some(k=>f[k]===true)||['Kunde','Auftrag'].some(k=>f[k]?.length)||f['Online-Annahme Zeitstempel']||f['Online-Annahme Link gesendet am']||f['AVV erforderlich']!=='Nein'||f['Projektbedingungen Version']!=='TEST_v1.0_RC1'||!text(f['Interne Notiz']).includes('TEST_CRM_VERSAND_20261021'))throw Error('crm_test_source_rejected');
 for(const k of ['Offerte','Leistung','Ausgangssituation','Ziel','Leistungsumfang','Nicht enthalten','Beteiligte Systeme','Zahlungsmodell','Projektbedingungen Version'])if(!text(f[k])||/[<>]/.test(f[k]))throw Error('crm_required_field_'+k.replace(/[^A-Za-z]/g,''));
 if(f['Einmalig CHF']!==120||(f['Monatlich CHF']||0)!==0||f['Zahlungsziel Tage']!==30||f['Gültig bis']!=='2026-11-20')throw Error('crm_test_values_changed');
 return f;
}
export function crmSourceFingerprint(f){const keys=['Offerte','Offertennummer','Lead','Lead E-Mail','Lead Firma','Lead Name','Lead Strasse','Lead PLZ','Lead Ort','Lead Land','Leistung','Ausgangssituation','Ziel','Leistungsumfang','Nicht enthalten','Beteiligte Systeme','Einmalig CHF','Monatlich CHF','Zahlungsmodell','Zahlungsziel Tage','Gültig bis','Projektbedingungen Version','AVV erforderlich'];return createHash('sha256').update(JSON.stringify(keys.map(k=>[k,f[k]??null]))).digest('hex');}
export function makeCrmPreviewSnapshot(f,{tokenHash,expiresAt,quote,terms}){
 return {purpose:CRM_TEST.purpose,testOnly:true,recordId:CRM_TEST.recordId,previewExpiresAt:expiresAt,
 offer:{tokenHash,status:'sent',approved:true,revision:1,termsVersion:f['Projektbedingungen Version'],expiresAt:'2026-11-20T23:00:00.000Z',recipientEmail:'synthetic@example.invalid',offerNumber:f.Offertennummer,
 details:{company:f['Lead Firma'][0],service:f.Leistung,onceCHF:f['Einmalig CHF'],monthlyCHF:f['Monatlich CHF']||0,paymentModel:f.Zahlungsmodell},
 bundle:{avv_required:'Nein',quote:{id:quote.id,sha256:quote.sha256},terms:{id:terms.id,sha256:terms.sha256}},source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',recordId:CRM_TEST.recordId},downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}},
 documents:{quote:{base64:quote.bytes.toString('base64')},terms:{base64:terms.bytes.toString('base64')}}};
}
