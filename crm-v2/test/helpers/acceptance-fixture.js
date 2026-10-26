'use strict';
// Synthetic, offline fixtures only. No real authentication or provider requests.
const {prepareOfferPackage,digest}=require('../../offer-contract-package');
const {createContractAcceptance}=require('../../contract-acceptance-staging');
const {createDemoMemoryAcceptanceStore}=require('../../contract-acceptance-store-staging');
function fixture({avv='yes',offerId='test_acceptance_1101',store:providedStore}={}){
  let time=Date.parse('2026-10-25T19:00:00.000Z');
  const now=()=>time,memory=createDemoMemoryAcceptanceStore({now}),store=providedStore||memory.store;
  const archives=new Map();
  const docs=(avv==='yes'?['offer','terms','avv']:['offer','terms']).map(kind=>{
    const bytes=Buffer.from('%PDF-1.4\nTEST_ONLY '+kind+'\n%%EOF');
    const archiveFileId='test_archive_acceptance_'+kind;archives.set(archiveFileId,bytes);
    return {kind,archiveFileId,version:'TEST_ONLY_v1',filename:'TEST_ONLY_'+kind+'.pdf',
      bytes:bytes.length,sha256:digest(bytes)};
  });
  const packageForRevision=revision=>({...prepareOfferPackage({offerId,offerNumber:'1101',revision,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY snapshot')),avvRequired:avv,
    avvAnnexesConfirmed:avv==='yes',documents:docs}),status:'sent'});
  const pkg=packageForRevision(1),recipient='customer-test@example.com';
  let identityEmail=recipient,representative=true,proofValid=true,issueAllowed=true;
  const config={store,now,csrfSecret:Buffer.alloc(32,42),readArchivedPdf:async id=>archives.get(id),
    authorizeIssue:async()=>issueAllowed,
    verifySentPackage:async({package:p,recipient:r})=>({verified:proofValid,
      eventId:p.sendEventId,packageSha256:p.packageSha256,recipient:r,messageId:'synthetic_message_1101',
      provider:'gmail',verifiedAt:new Date(time).toISOString()}),
    resolveIdentity:async()=>({email:identityEmail,emailVerified:true,subject:'test_identity_1101',
      method:'test_only_session',verifiedAt:time}),
    verifyRepresentative:async()=>representative};
  const service=createContractAcceptance(config);
  const issue=p=>service.issue(p||pkg,recipient,{expiresInMs:60000,operatorContext:{testOnly:true}});
  const body=p=>({packageSha256:p.packageSha256,revision:p.revision,
    termsConsent:true,avvConsent:avv==='yes',representativeDeclaration:true});
  return {service,config,store,pkg,recipient,archives,issue,body,packageForRevision,
    snapshot:memory.snapshot,now,advance:ms=>{time+=ms;},
    setIdentity:email=>{identityEmail=email;},setRepresentative:v=>{representative=v;},
    setProof:v=>{proofValid=v;},setIssueAllowed:v=>{issueAllowed=v;}};
}
module.exports={fixture};
