'use strict';
// Passwordless mailbox proof. Provider delivery is injected; never returned to HTTP.
const {randomBytes,randomInt,createHmac,timingSafeEqual}=require('node:crypto');
const {tokenHash,fault}=require('./contract-acceptance-staging');
function createCustomerLogin({transaction,acceptanceStore,sendCode,secret,now=Date.now}={}){
  if(typeof transaction!=='function'||!acceptanceStore||typeof sendCode!=='function'||!Buffer.isBuffer(secret)||secret.length<32)
    throw fault('LOGIN_NOT_CONFIGURED',503);
  const key=Buffer.from(secret),mac=s=>createHmac('sha256',key).update(s).digest('hex');
  const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
  async function request(token){
    const invitationHash=tokenHash(token),time=now();
    const {invitation}=await acceptanceStore.resolve(invitationHash,time);
    const code=String(randomInt(100000000)).padStart(8,'0');
    const challengeId=randomBytes(24).toString('base64url'),id='login_'+invitationHash;
    await transaction(async tx=>{
      const previous=await tx.get(id);
      if(previous&&time<previous.nextRequestAt)throw fault('LOGIN_RATE_LIMITED',429);
      // A rolling hourly window prevents refreshing away the guessing/send budget.
      const recent=previous&&time-previous.windowStart<3600000;
      if(recent&&previous.requests>=5)throw fault('LOGIN_RATE_LIMITED',429);
      tx.set(id,{challengeId,codeHash:mac(invitationHash+'|'+challengeId+'|'+code),
        invitationHash,email:invitation.recipient,expiresAt:time+10*60000,
        attempts:0,used:false,delivered:false,nextRequestAt:time+60000,
        windowStart:recent?previous.windowStart:time,requests:recent?previous.requests+1:1});
    });
    try{
      await sendCode({recipient:invitation.recipient,code,expiresInMinutes:10,
        idempotencyKey:'customer_login_'+challengeId});
      await transaction(async tx=>{const c=await tx.get(id);if(c?.challengeId===challengeId)tx.set(id,{...c,delivered:true});});
    }catch{throw fault('LOGIN_DELIVERY_FAILED',503);}
    return {challengeId,expiresInSeconds:600};
  }
  async function verify(token,{challengeId,code}={}){
    const hash=tokenHash(token),time=now();
    const {invitation}=await acceptanceStore.resolve(hash,time);
    if(typeof challengeId!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(challengeId)||typeof code!=='string'||!/^\d{8}$/.test(code))
      throw fault('LOGIN_CODE_INVALID',401);
    const session=randomBytes(32).toString('base64url');
    const result=await transaction(async tx=>{
      const id='login_'+hash,c=await tx.get(id);
      if(!c||c.challengeId!==challengeId||c.used||!c.delivered||time>=c.expiresAt||c.attempts>=5)return false;
      if(!equal(c.codeHash,mac(hash+'|'+challengeId+'|'+code))){tx.set(id,{...c,attempts:c.attempts+1});return false;}
      tx.set(id,{...c,used:true,codeHash:null});
      tx.set('session_'+tokenHash(session),{invitationHash:hash,email:invitation.recipient,
        subject:'mailbox_'+mac(invitation.recipient),verifiedAt:time,expiresAt:Math.min(time+15*60000,invitation.expiresAt)});
      return true;
    });
    if(!result)throw fault('LOGIN_CODE_INVALID',401);
    return {session,expiresInSeconds:900};
  }
  async function identity(token,session){
    const hash=tokenHash(token),sessionHash=tokenHash(session);
    const record=await transaction(tx=>tx.get('session_'+sessionHash));
    if(!record||record.invitationHash!==hash||now()>=record.expiresAt)throw fault('IDENTITY_REQUIRED',401);
    return {email:record.email,emailVerified:true,subject:record.subject,method:'verified_session',verifiedAt:record.verifiedAt};
  }
  return Object.freeze({request,verify,identity});
}
module.exports={createCustomerLogin};
