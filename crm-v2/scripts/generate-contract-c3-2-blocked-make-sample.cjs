'use strict';
// Generates only synthetic TEST_ONLY C3.2 webhook payloads for schema learning.
// No secret webhook URL, Make/Gmail client, HTTP request or real user data.
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {makePdf}=require('../offer-pdf');
const {PURPOSE,createContractReleaseGate}=require('../contract-dispatch-release-staging');
const {createGmailTestDraftBuilder}=require('../contract-gmail-draft-staging');
const {createBlockedMakeGmailEnvelope}=require('../contract-gmail-make-transport-staging');
const avv=process.argv[2];
if(!['yes','no'].includes(avv)||process.argv.length!==3){
  process.stderr.write('Usage: node generate-contract-c3-2-blocked-make-sample.cjs yes|no\n');
  process.exit(2);
}
const secret=Buffer.from('TEST_ONLY_C3_2_fake_signing_key_not_for_real_credentials_20261025');
const to='test-approved@example.com',operator='operator-test@example.com';
const bytes=new Map(),kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
const documents=kinds.map(kind=>{
  const pdf=makePdf({
    number:'1101',title:'TEST_ONLY '+kind+' – KEIN VERTRAG',
    validUntil:'2026-12-31',items:[
      {title:'TEST_ONLY '+kind,qty:1,unitPriceCHF:10,mode:'einmalig'}
    ]
  },{
    name:'Test Muster',company:'TEST_ONLY Muster',
    email:'preview@example.invalid',street:'Musterweg 12',
    postalCode:'5610',city:'Wohlen',country:'Schweiz'
  });
  const archiveFileId='test_c32_archive_'+kind+'_20261025';
  bytes.set(archiveFileId,pdf);
  return {
    kind,version:'RC1_TEST_ONLY',archiveFileId,filename:'TEST_ONLY_'+kind+'.pdf',
    bytes:pdf.length,sha256:digest(pdf)
  };
});
(async()=>{
 const pkg=prepareOfferPackage({
   offerId:'test_c32_quote_1101',offerNumber:'1101',revision:avv==='yes'?2:1,
   offerSnapshotSha256:digest(Buffer.from('TEST_ONLY C3.2 quote '+avv)),
   avvRequired:avv,avvAnnexesConfirmed:avv==='yes',documents
 });
 const clock=Date.now();
 const reader=async id=>bytes.get(id);
 const gate=createContractReleaseGate({
   signingSecret:secret,allowedRecipients:[to],allowedOperators:[operator],
   readArchivedPdf:reader,now:()=>clock,authorizeOperator:async()=>true
 });
 const manifest=await gate.approve(pkg,{
   purpose:PURPOSE,recipient:to,operatorEmail:operator,
   approvalId:'approval_c32_20261025',
   approvedAt:new Date(clock).toISOString()
 });
 const draft=await createGmailTestDraftBuilder({
   signingSecret:secret,allowedRecipients:[to],readArchivedPdf:reader,
   now:()=>clock
 }).prepare(manifest);
 const envelope=createBlockedMakeGmailEnvelope(draft,manifest,{
   signingSecret:secret,allowedRecipients:[to],now:()=>clock
 });
 if(envelope.neverSend!==true||envelope.sendMode!=='blocked_preview_only'||
    ![2,3].includes(envelope.attachments.length))
   throw Error('unsafe TEST_ONLY envelope');
 process.stdout.write(JSON.stringify(envelope)+'\n');
})().catch(()=>{
 process.stderr.write('TEST_ONLY sample generation rejected; no request was sent.\n');
 process.exitCode=1;
});
