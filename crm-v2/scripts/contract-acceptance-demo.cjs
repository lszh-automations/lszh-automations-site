'use strict';
// Explicit loopback-only demo; simulated identity and in-memory receipts.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const {randomBytes}=require('node:crypto');
const {prepareOfferPackage,digest}=require('../offer-contract-package');
const {createContractAcceptance}=require('../contract-acceptance-staging');
const {createDemoMemoryAcceptanceStore}=require('../contract-acceptance-store-staging');
const {createAcceptanceHandler}=require('../contract-acceptance-http-staging');
const expected=require('../c373-sent-readback-expected.json');
async function startDemo({port=8793}={}){
  if(process.env.K_SERVICE||process.env.CLOUD_RUN_JOB)throw Error('LOCAL_DEMO_ONLY');
  const files=new Map();
  for(const doc of expected.documentHashes)files.set(doc.archiveFileId,
    fs.readFileSync(path.join(__dirname,'../test/fixtures/acceptance',doc.filename)));
  const pkg={...prepareOfferPackage({offerId:'test_c373_transport_001',offerNumber:'1101',revision:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY C373 transport test; no contract; 2026-10-25')),
    avvRequired:'yes',avvAnnexesConfirmed:true,documents:expected.documentHashes}),status:'sent'};
  if(pkg.packageSha256!==expected.packageSha256)throw Error('DEMO_PACKAGE_MISMATCH');
  const {store}=createDemoMemoryAcceptanceStore();
  const service=createContractAcceptance({store,csrfSecret:randomBytes(32),
    readArchivedPdf:async id=>files.get(id),
    authorizeIssue:async({operatorContext})=>operatorContext?.purpose==='LOCAL_TEST_ONLY',
    // Reuse only the recorded C373 test proof, not arbitrary browser claims.
    verifySentPackage:async({package:p,recipient})=>({
      verified:p.packageSha256===expected.packageSha256&&recipient===expected.recipient,
      eventId:expected.eventId,packageSha256:expected.packageSha256,
      recipient:expected.recipient,messageId:'1a17462a3571a435',provider:'gmail',
      verifiedAt:'2026-10-25T18:51:42.962671Z'}),
    // Explicitly simulated for this local preview. No real customer identity claim.
    resolveIdentity:async()=>({email:expected.recipient,emailVerified:true,
      subject:'test_only_local_preview',method:'test_only_session',verifiedAt:Date.now()}),
    verifyRepresentative:async({identity})=>identity.method==='test_only_session'
  });
  const invitation=await service.issue(pkg,expected.recipient,{expiresInMs:15*60000,
    operatorContext:{purpose:'LOCAL_TEST_ONLY'}});
  let handler;
  const server=http.createServer((req,res)=>handler?handler(req,res):res.writeHead(503).end());
  server.requestTimeout=15000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;
  handler=createAcceptanceHandler({service,origin,demoSession:async()=>({token:invitation.token,
    testOnly:true,identitySimulated:true,receiptsInMemoryOnly:true})});
  return {server,origin};
}
if(require.main===module){
  if(process.argv.length!==3||process.argv[2]!=='--local-test-demo'){
    console.error('Start only with --local-test-demo; no public/customer use.');process.exitCode=1;
  }else startDemo().then(({origin})=>console.log('LOCAL TEST ONLY: '+origin+
    ' | Simulated identity; in-memory receipts; no mail or cloud writes.'))
    .catch(()=>{console.error('LOCAL DEMO BLOCKED');process.exitCode=1;});
}
module.exports={startDemo};
