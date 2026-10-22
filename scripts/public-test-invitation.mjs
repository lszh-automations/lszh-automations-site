// One fixed internal invitation. No customer choice, replay or acceptance.
import {createHash} from 'node:crypto';
import {buildFixtures} from './offerSyntheticPdfFixtures.mjs';
import {PREVIEW} from '../cloud-run/public-test-preview/preview.mjs';
export const INVITATION_KEY='LSZH_PUBLIC_PREVIEW_INVITATION_20261021_NO_CONTRACT';
export const INVITATION_EMAIL='lars@lszh-automations.ch';
export async function sendPreviewInvitation({code,expiresAt,reserve,send,confirm,now=new Date()}={}){
 const ttl=Date.parse(expiresAt)-Number(now);
 if(!/^[A-Za-z0-9_-]{40,80}$/.test(code||'')||!Number.isFinite(ttl)||ttl<5*60000||ttl>31*60000||[reserve,send,confirm].some(f=>typeof f!=='function'))throw Error('internal_invitation_config_rejected');
 const link=new URL('/offerte-annehmen/',PREVIEW.origin);link.hash=new URLSearchParams({code}).toString();
 const {files}=buildFixtures(),boundary='lszh_'+INVITATION_KEY;
 const b64=b=>Buffer.from(b).toString('base64').match(/.{1,76}/g)?.join('\r\n')||'';
 const html='<h2>TEST_ONLY – interne Offertenmail</h2><p>Kein Vertrag, keine Rechnung. Diese Vorschau kann nicht angenommen werden.</p><p><a href="'+link.href+'">Fiktive Offerte und TEST-Bedingungen prüfen</a></p><p>Bitte beide angehängten PDFs und den Link prüfen. Der Zugang ist nur kurz gültig. Kein Kunden-Onboarding wird ausgelöst.</p>';
 const lines=['From: LSZH Automations <'+INVITATION_EMAIL+'>','To: '+INVITATION_EMAIL,
  'Subject: =?UTF-8?B?'+Buffer.from('TEST_ONLY – Offertenmail mit öffentlichem Testlink – kein Vertrag').toString('base64')+'?=',
  'Message-ID: <'+INVITATION_KEY+'@lszh-automations.ch>','MIME-Version: 1.0','Content-Type: multipart/mixed; boundary="'+boundary+'"','',
  '--'+boundary,'Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',b64(html)];
 for(const [name,bytes] of [['TEST_ONLY_Offerte.pdf',files.quoteNein],['TEST_ONLY_Bedingungen.pdf',files.terms]])lines.push('--'+boundary,'Content-Type: application/pdf','Content-Disposition: attachment; filename="'+name+'"','Content-Transfer-Encoding: base64','',b64(bytes));
 lines.push('--'+boundary+'--','');
 await reserve({key:INVITATION_KEY,purpose:'TEST_ONLY_NO_CONTRACT',tokenHash:createHash('sha256').update(code).digest('hex'),expiresAt});
 // Any ambiguity after this boundary retains the reservation and blocks replay.
 const result=await send({raw:Buffer.from(lines.join('\r\n')).toString('base64url')});
 if(typeof result?.id!=='string'||!/^[a-f0-9]+$/.test(result.id))throw Error('internal_invitation_provider_receipt_missing');
 await confirm({key:INVITATION_KEY,gmailId:result.id});
 return {result:'INTERNAL_PUBLIC_LINK_INVITATION_SENT',gmailId:result.id,recipient:INVITATION_EMAIL,attachments:2,acceptanceEnabled:false};
}
