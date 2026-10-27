'use strict';
const {createArchiveMetadataReader}=require('./contract-archive-metadata');
const {OAuth2Client}=require('google-auth-library');
const {createDurableAcceptance}=require('./contract-acceptance-durable');
const {createProductionDocumentReader}=require('./contract-production-document-reader');
const {createPackageMakeTransport}=require('./contract-package-make-transport');
const {createC35GmailApiReadOnlyAdapter,SCOPE}=require('./contract-gmail-c35-readonly-api-staging');
const {createLiveSentVerifier}=require('./contract-gmail-live-verifier');
const {createLivePackageBridge,createLivePublicationPolicy}=require('./contract-live-package-bridge');
const {createContractAcceptance,fault}=require('./contract-acceptance-staging');
const {createAcceptanceReview}=require('./contract-acceptance-review');
const {createCrmContractActions}=require('./contract-crm-actions');
const {createCustomerPackagePreparation,createPackageArchiveGateway}=require('./contract-package-preparation');
const {createInvitationDelivery,createInvitationTransport,createInvitationSentVerifier}=require('./simple-customer-send');
const {createOrderConfirmation,createConfirmationTransport}=require('./order-confirmation');
const {digest}=require('./offer-contract-package');
function createContractCrmRuntime({db,prefix,allowedEmails,env=process.env}={}){
 if(env.CRM_CONTRACT_ACTIONS_ENABLED!=='true')throw fault('CONTRACT_ACTIONS_DISABLED',503);
 let c;try{c=JSON.parse(env.CRM_CONTRACT_CONFIG||'');}catch{throw fault('CONTRACT_CONFIG_INVALID',503);}
 const general=c.accessMode==='customer';
 if(!general&&(!c.pilot||!c.pilot.offerId||!/^[a-f0-9]{64}$/.test(c.pilot.packageSha256||'')||c.pilot.recipient!=='lars.schulthess@outlook.com'))throw fault('PILOT_CONFIG_INVALID',503);
 if(!c.gmailOAuth?.clientId||!c.gmailOAuth.clientSecret||!c.gmailOAuth.refreshToken||
    typeof c.portalCsrfSecret!=='string'||Buffer.from(c.portalCsrfSecret,'base64').length<32||
    !/^https:\/\/[A-Za-z0-9.-]+$/.test(c.portalOrigin||'')||!Array.isArray(allowedEmails)||allowedEmails.length===0)throw fault('CONTRACT_CONFIG_INVALID',503);
 if(c.accessMode&&!['pilot','customer'].includes(c.accessMode))throw fault('CONTRACT_CONFIG_INVALID',503);
 const persistence=createDurableAcceptance({db,projectId:'lszh-automations',prefix});
 const authorizeOperator=async user=>allowedEmails.includes(user?.email)?{verified:true,email:user.email}:null;
 const reader=createProductionDocumentReader({metadataReader:createArchiveMetadataReader({metadataHook:c.metadataHook})});
 const oauth=new OAuth2Client(c.gmailOAuth.clientId,c.gmailOAuth.clientSecret);oauth.setCredentials({refresh_token:c.gmailOAuth.refreshToken});
 let scopeUntil=0;
 const scopedClient={request:async options=>{
  if(Date.now()>=scopeUntil){const access=await oauth.getAccessToken();const info=await oauth.getTokenInfo(access.token);
   if(!Array.isArray(info.scopes)||info.scopes.length!==1||info.scopes[0]!==SCOPE)throw fault('GMAIL_READONLY_SCOPE_REQUIRED',503);
   scopeUntil=Math.min(info.expiry_date-30000,Date.now()+300000);
  }
  return oauth.request({...options,retry:false});
 }};
 const read=createC35GmailApiReadOnlyAdapter({authClient:scopedClient,expectedMailbox:'lars@lszh-automations.ch'});
 const sent=createLiveSentVerifier({read});
 const policy=createLivePublicationPolicy({transaction:persistence.transaction,authorizeOperator});
 const acceptance=createContractAcceptance({store:persistence.store,readArchivedPdf:reader.readArchivedPdf,
  authorizeIssue:policy.authorizeIssue,verifySentPackage:policy.verifySentPackage,
  resolveIdentity:async()=>null,verifyRepresentative:async()=>false,csrfSecret:Buffer.from(c.portalCsrfSecret,'base64'),mode:'customer'});
 const transport=createPackageMakeTransport({webhookUrl:c.packageWebhookUrl,enabled:env.CRM_CONTRACT_SEND_ENABLED==='true'});
 const publisher=createLivePackageBridge({transaction:persistence.transaction,authorizeOperator,readArchivedPdf:reader.readArchivedPdf,
  sendOnce:transport.sendOnce,verifySentPackage:sent.verify,acceptanceService:acceptance,enabled:env.CRM_CONTRACT_SEND_ENABLED==='true'});
 const review=createAcceptanceReview({transaction:persistence.transaction,authorizeOperator,enabled:env.CRM_CONTRACT_REVIEW_ENABLED==='true',
  verifyWrittenConfirmation:async({messageId,package:pkg,recipient})=>{
   const row=await persistence.transaction(tx=>tx.get('confirmationDocument_'+digest(Buffer.from(pkg.packageId))));
   if(!row||row.packageSha256!==pkg.packageSha256||row.recipient!==recipient||!row.approvedBy||!row.document)throw fault('CONFIRMATION_PROOF_REQUIRED',409);
   return sent.verify({package:pkg,recipient,messageId,confirmationDocument:row.document});
  }});
 const preparation=general?createCustomerPackagePreparation({transaction:persistence.transaction,authorizeOperator,readArchivedPdf:reader.readArchivedPdf,archivePdf:createPackageArchiveGateway({webhookUrl:c.packageArchiveHook})}):undefined;
 const invitations=general&&c.invitationWebhookUrl?createInvitationDelivery({transaction:persistence.transaction,publisher,portalOrigin:c.portalOrigin,sendOnce:createInvitationTransport({webhookUrl:c.invitationWebhookUrl,portalOrigin:c.portalOrigin}),verifySent:createInvitationSentVerifier({read})}):undefined;
 const confirmation=general&&c.packageWebhookUrl?createOrderConfirmation({transaction:persistence.transaction,authorizeOperator,review,archivePdf:createPackageArchiveGateway({webhookUrl:c.packageArchiveHook}),readArchivedPdf:reader.readArchivedPdf,sendOnce:createConfirmationTransport({webhookUrl:c.packageWebhookUrl}),enabled:env.CRM_CONTRACT_REVIEW_ENABLED==='true'}):undefined;
 return createCrmContractActions({readArchivedPdf:reader.readArchivedPdf,confirmation,preparation,invitations,transaction:persistence.transaction,publisher,review,portalOrigin:c.portalOrigin,pilot:general?undefined:c.pilot,reviewEnabled:env.CRM_CONTRACT_REVIEW_ENABLED==='true'});
}
module.exports={createContractCrmRuntime};
