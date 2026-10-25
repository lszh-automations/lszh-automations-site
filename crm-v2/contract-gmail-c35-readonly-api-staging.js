'use strict';
// C3.5 restricted Gmail API readback adapter for an explicitly authorised
// LSZH mailbox. Never creates an OAuth grant or sends, drafts or mutates mail.
// A trusted backend MUST inject an OAuth client granted gmail.readonly only.
// No credential, token or personal ChatGPT connector data may be persisted.
const {blocked}=require('./contract-dispatch-release-staging');
const {createC34GmailReadOnlyVerifier,createC34DemoGmailReadbackLedger}=
  require('./contract-gmail-c34-readback-staging');
const ROOT='https://gmail.googleapis.com/gmail/v1/users/me';
const SCOPE='https://www.googleapis.com/auth/gmail.readonly';
const MAILBOX=/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const IDENTIFIER=/^[A-Za-z0-9_./:+-]{4,200}$/;

function mailbox(value){
  if(typeof value!=='string'||value.length>254||!MAILBOX.test(value)||
     value.endsWith('.invalid')||value.includes('*'))
    throw blocked('C3.5 expected Gmail mailbox invalid');
  return value;
}
function validId(value){
  if(typeof value!=='string'||!IDENTIFIER.test(value))
    throw blocked('C3.5 unsafe Gmail identifier');
  return value;
}
function createC35GmailApiReadOnlyAdapter({
  authClient,expectedMailbox,timeoutMs=10000
}={}){
  const expected=mailbox(expectedMailbox);
  if(!authClient||typeof authClient.request!=='function'||
     !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000)
    throw blocked('C3.5 authorised read-only client missing');
  async function get(url){
    // Fixed allowlist, never arbitrary URL, non-GET, or attacker-controlled path.
    if(url!==ROOT+'/profile'&&
       !/^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/[A-Za-z0-9_./:+-]{4,200}\?format=full$/.test(url)&&
       !/^https:\/\/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/[A-Za-z0-9_./:+-]{4,200}\/attachments\/[A-Za-z0-9_./:+-]{4,200}$/.test(url))
      throw blocked('C3.5 unexpected Gmail read endpoint');
    const response=await authClient.request({
      method:'GET',url,timeout:timeoutMs
    });
    const data=response?.data;
    if(!data||typeof data!=='object'||Array.isArray(data))
      throw blocked('C3.5 invalid Gmail API response');
    return data;
  }
  async function verifyMailbox(){
    const profile=await get(ROOT+'/profile');
    if(profile.emailAddress!==expected)
      throw blocked('C3.5 Gmail OAuth identity does not match approved mailbox');
    return Object.freeze({mailbox:expected,scopeRequired:SCOPE,readOnly:true});
  }
  async function getMessage(messageId){
    validId(messageId);
    await verifyMailbox();
    const value=await get(ROOT+'/messages/'+messageId+'?format=full');
    if(value.id!==messageId)
      throw blocked('C3.5 Gmail message ID mismatched');
    return value;
  }
  async function getAttachment(messageId,attachmentId){
    validId(messageId);validId(attachmentId);
    await verifyMailbox();
    return get(ROOT+'/messages/'+messageId+'/attachments/'+attachmentId);
  }
  return Object.freeze({verifyMailbox,getMessage,getAttachment});
}
function createC35ReadOnlyGmailVerifier({
  authClient,expectedMailbox,allowedRecipients,timeoutMs
}={}){
  const read=createC35GmailApiReadOnlyAdapter({
    authClient,expectedMailbox,timeoutMs
  });
  const verifier=createC34GmailReadOnlyVerifier({
    getMessage:read.getMessage,getAttachment:read.getAttachment,
    allowedSenders:[expectedMailbox],allowedRecipients
  });
  return Object.freeze({
    verifyMailbox:read.verifyMailbox,
    verifyGatewayReceipt:verifier.verifyGatewayReceipt
  });
}
// Emulator-only glue for repeatable transaction tests. Exports no send,
// reservation, login or production Firestore methods.
function createC35DemoGmailReadback({
  db,signingSecret,authClient,expectedMailbox,allowedRecipients,
  now,timeoutMs
}={}){
  const read=createC35GmailApiReadOnlyAdapter({
    authClient,expectedMailbox,timeoutMs
  });
  const ledger=createC34DemoGmailReadbackLedger({
    db,signingSecret,getMessage:read.getMessage,getAttachment:read.getAttachment,
    allowedSenders:[expectedMailbox],allowedRecipients,now
  });
  return Object.freeze({
    verifyMailbox:read.verifyMailbox,
    inspect:ledger.inspect,
    reconcile:ledger.reconcile
  });
}
module.exports={
  SCOPE,ROOT,createC35GmailApiReadOnlyAdapter,
  createC35ReadOnlyGmailVerifier,createC35DemoGmailReadback
};
