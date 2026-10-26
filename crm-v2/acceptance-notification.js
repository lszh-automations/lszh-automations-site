'use strict';
// Internal-only outbox; records are enqueued after verified evidence archival.
const {digest}=require('./offer-contract-package');
const INTERNAL_TO='lars@lszh-automations.ch';
const notificationKey=id=>'acceptanceNotification_'+digest(Buffer.from(id));
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createAcceptanceNotifier({db,prefix,enabled=false,webhookUrl,fetchImpl=fetch,now=Date.now}={}){
 if(!/^lszh_crm_v2_(?:staging_)?$/.test(prefix))throw Error('invalid_crm_prefix');
 const active=enabled&&/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(webhookUrl||'');
 const collection=db.collection(prefix+'acceptance_v1');
 async function deliver(id){
  if(!active||!/^acceptanceNotification_[a-f0-9]{64}$/.test(id))return {status:'skipped'};
  const ref=collection.doc(id);
  const claim=await db.runTransaction(async tx=>{
   const doc=await tx.get(ref),row=doc.exists?doc.data():null;if(row?.state!=='notification_pending')return null;
   if(id!==notificationKey(row.responseId)||!/^[A-Za-z0-9_-]{1,100}$/.test(row.offerId))throw Error('invalid_acceptance_notification');
   const offerSnap=await tx.get(db.collection(prefix+'offerten').doc(row.offerId)),archiveSnap=await tx.get(collection.doc('archive_'+row.responseId));
   const offer=offerSnap.data(),archive=archiveSnap.data();
   if(offer?.onlineAcceptance?.responseId!==row.responseId||offer.onlineAcceptance.packageSha256!==row.packageSha256||offer.onlineAcceptance.archiveState!=='complete'||archive?.state!=='complete'||archive.archiveFileId!==offer.onlineAcceptance.archiveFileId)throw Error('acceptance_notification_not_ready');
   tx.update(ref,{state:'notification_sending',claimedAt:new Date(now()).toISOString()});return {...row,number:String(offer.number||row.offerNumber||'')};
  });
  if(!claim)return {status:'already_claimed'};
  try{
   const subject='Kundenannahme eingegangen – Offerte '+claim.number;
   const html='<h1>Kunde hat die Vertragsunterlagen angenommen</h1><p>Offerte '+escape(claim.number)+'</p><p>Die Annahme der zugeordneten PDFs ist gespeichert und im privaten Archiv gesichert.</p><p>Bitte Kundenannahme intern prüfen und anschliessend die schriftliche Auftragsbestätigung auslösen.</p><p><a href="https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app">Live-CRM öffnen</a></p><p>Referenz: '+escape(claim.responseId)+'</p>';
   const response=await fetchImpl(webhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'internal_acceptance',eventId:'internal_acceptance__'+claim.responseId,to:INTERNAL_TO,subject,html}),redirect:'error',signal:AbortSignal.timeout(10000)});
   const receipt=await response.json().catch(()=>null);
   if(!response.ok||receipt?.ok!==true||!/^[A-Za-z0-9_-]{4,200}$/.test(receipt.messageId||''))throw Error('unconfirmed');
   await ref.update({state:'notification_sent',messageId:receipt.messageId,sentAt:new Date(now()).toISOString()});return {status:'sent'};
  }catch{await ref.update({state:'notification_manual_review',updatedAt:new Date(now()).toISOString()});return {status:'manual_review'};}
 }
 async function tick(){if(!active)return {enabled:false,processed:0};const rows=await collection.where('state','==','notification_pending').limit(30).get(),results=[];for(const row of rows.docs)results.push(await deliver(row.id));return {enabled:true,processed:rows.docs.length,results};}
 return Object.freeze({tick,deliver});
}
module.exports={notificationKey,createAcceptanceNotifier};
