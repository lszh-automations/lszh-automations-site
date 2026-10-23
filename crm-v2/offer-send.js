'use strict';
const {makePdf}=require('./offer-pdf');
const {renderOfferEmail}=require('./offer-mail');
function error(message,status=400){return Object.assign(new Error(message),{status});}
function createOfferSender(store,config={}){
  const post=config.fetchImpl||globalThis.fetch;
  const hook=String(config.webhookUrl||'');
  const configured=config.enabled===true&&
    /^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(hook);
  const stats=()=>({enabled:configured,mode:configured?'one_click_explicit_approval':'disabled'});
  async function send(id,payload,user){
    if(!configured)throw error('Automatischer Offertenversand ist noch nicht freigegeben',503);
    const claim=await store.claimOfferSend(id,payload,user);
    let attachment,mail;
    try{
      attachment=makePdf(claim.offer,claim.recipient);
      if(!Buffer.isBuffer(attachment)||attachment.length<300||
         attachment.length>700000||!attachment.subarray(0,8).toString().startsWith('%PDF-'))
        throw Error('pdf_attachment_invalid');
      mail=renderOfferEmail(claim.offer,claim.recipient);
    }catch(e){
      await store.finishOfferSend(id,claim.attemptId,'preparation_failed');
      throw error('PDF- oder E-Mail-Erstellung fehlgeschlagen. Es wurde nichts versendet.',500);
    }
    const eventId='offer_send_'+claim.attemptId;
    const body={
      kind:'offer_send',eventId,offerId:id,to:claim.to,
      subject:mail.subject,html:mail.html,
      pdfFilename:mail.filename,pdfBase64:attachment.toString('base64')
    };
    let receipt,verified=false;
    try{
      const response=await post(hook,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(30000)
      });
      try{receipt=await response.json()}catch{receipt=null;}
      verified=response.ok&&receipt?.ok===true&&
        receipt?.eventId===eventId&&
        typeof receipt.messageId==='string'&&receipt.messageId.length>0;
    }catch(_e){
      verified=false;
    }
    if(verified){
      const record=await store.finishOfferSend(id,claim.attemptId,'confirmed',receipt.messageId);
      return {status:'confirmed',record};
    }
    // Make could have submitted to Gmail before the response was lost.
    // There is deliberately no retry, ever, until a human checks Sent mail.
    await store.finishOfferSend(id,claim.attemptId,'manual_review','delivery_unconfirmed');
    throw error('Versandbestätigung fehlt. Bitte zuerst das geschäftliche Postfach prüfen. Kein automatischer Wiederholungsversand.',409);
  }
  return {send,stats};
}
module.exports={createOfferSender};
