'use strict';

// Single-purpose mail dispatcher. Sends only via the dedicated Make mail webhook,
// never from the public website request, so lead intake stays independent.
// Each message is claimed once before sending. Ambiguous provider responses
// require operator review, not an unsafe automatic retry.
const {EVENT_TYPES,isEligible,renderMail,eventId}=require('./mail-templates');
const KINDS=[EVENT_TYPES.CUSTOMER_ACK,EVENT_TYPES.INTERNAL_NEW,EVENT_TYPES.INTERNAL_24H];
function makeDispatcher(db,prefix,config={}){
  if(!/^lszh_crm_v2_(?:staging_)?$/.test(prefix))throw Error('invalid_crm_prefix');
  const now=config.now||(()=>Date.now());
  const post=config.fetchImpl||globalThis.fetch;
  const active=Boolean(config.enabled);
  const from=Date.parse(config.activeFrom||'');
  const hook=String(config.webhookUrl||'');
  const configured=active&&Number.isFinite(from)&&from>0&&/^https:\/\/hook\.eu1\.make\.com\/[A-Za-z0-9]+$/.test(hook);
  const leads=db.collection(prefix+'leads');
  const events=db.collection(prefix+'mail_events');
  const stats=()=>({enabled:configured,mode:configured?'manual_review_on_unknown_send':'disabled'});

  async function deliver(lead,kind){
    if(!configured||!isEligible(lead,kind,now(),from))return {status:'skipped'};
    // Recheck live status: a lead may have moved away from "Neu" since a scan.
    const latest=await leads.doc(lead.id).get();
    if(!latest.exists)return {status:'removed'};
    const current={id:latest.id,...latest.data()};
    if(!isEligible(current,kind,now(),from))return {status:'no_longer_due'};
    const id=eventId(kind,current.id);
    const event=events.doc(id);
    const mail=renderMail(kind,current);
    const when=new Date(now()).toISOString();
    try{
      await event.create({kind,leadId:current.id,to:mail.to,status:'sending',
        createdAt:when,updatedAt:when});
    }catch(err){
      if([6,'6','already-exists'].includes(err.code))return {status:'already_claimed'};
      throw err;
    }
    let response;
    try{
      response=await post(hook,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({eventId:id,kind,to:mail.to,subject:mail.subject,html:mail.html}),
        signal:AbortSignal.timeout(10000)
      });
      let receipt=null;
      try{receipt=await response.json()}catch{}
      // "Accepted" means queued, NOT mailed. An explicit response sent only
      // after Make's Gmail action is needed to safely mark confirmation.
      const confirmed=response.ok&&receipt?.ok===true&&
        typeof receipt?.messageId==='string'&&receipt.messageId.length>0;
      const status=confirmed?'confirmed':'manual_review';
      await event.update({status,updatedAt:new Date(now()).toISOString(),
        providerId:confirmed?receipt.messageId:null,
        httpStatus:response.status});
      return {status,kind,leadId:current.id};
    }catch(error){
      // A timeout can occur AFTER Make successfully sent the message.
      // Never silently retry and risk sending two customer confirmations.
      try{await event.update({status:'manual_review',updatedAt:new Date(now()).toISOString(),
        failure:String(error.name||'delivery_exception').slice(0,80)});}
      catch(updateError){console.error('crm_mail_outbox_update_failed',updateError.message);}
      return {status:'manual_review',kind,leadId:current.id};
    }
  }
  async function tick({maxLeads=100}={}){
    if(!configured)return {...stats(),processed:0,results:[]};
    const snap=await leads.orderBy('createdAt','desc').limit(
      Math.max(1,Math.min(Number(maxLeads)||100,200))).get();
    const results=[];
    for(const doc of snap.docs){
      const lead={id:doc.id,...doc.data()};
      for(const kind of KINDS){
        if(!isEligible(lead,kind,now(),from))continue;
        const result=await deliver(lead,kind);
        if(result.status!=='already_claimed'&&result.status!=='skipped')results.push(result);
      }
    }
    return {...stats(),processed:snap.docs.length,results};
  }
  return {tick,deliver,stats};
}
module.exports={makeDispatcher};
