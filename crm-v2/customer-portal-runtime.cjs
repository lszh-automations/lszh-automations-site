'use strict';
// Isolated TEST_ONLY Cloud Run entry. Existing CRM and public offer services are not imported.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {randomBytes}=require('node:crypto');
const {Firestore}=require('@google-cloud/firestore');const {OAuth2Client}=require('google-auth-library');
const {createDriveAcceptanceArchive}=require('./contract-acceptance-drive');
const {createPortalGateways}=require('./customer-portal-gateways');
const {createCustomerAcceptanceApplication}=require('./customer-acceptance-application');
const {prepareOfferPackage,digest}=require('./offer-contract-package');
const expected=require('./c373-sent-readback-expected.json');
const PROJECT='lszh-automations',PREFIX='lszh_crm_v2_staging_';
const FOLDER='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const db=new Firestore({projectId:PROJECT}),auth=new OAuth2Client();
let app,gateways;
function initialize(){
  if(app)return app;
  const config=JSON.parse(process.env.PORTAL_CONFIG||'{}');
  const origin=process.env.PORTAL_ORIGIN;
  if(!origin||!config.csrf||!config.login)throw Error('NOT_CONFIGURED');
  const reader=createDriveAcceptanceArchive({folderId:FOLDER});
  gateways=createPortalGateways({...config,reader});
  const files=new Map(expected.documentHashes.map(doc=>[doc.archiveFileId,fs.readFileSync(path.join(__dirname,'test/fixtures/acceptance',doc.filename))]));
  const pkg={...prepareOfferPackage({offerId:'test_c373_transport_001',offerNumber:'1101',revision:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY C373 transport test; no contract; 2026-10-25')),
    avvRequired:'yes',avvAnnexesConfirmed:true,documents:expected.documentHashes}),status:'sent'};
  if(pkg.packageSha256!==expected.packageSha256)throw Error('TEST_PACKAGE_MISMATCH');
  app=createCustomerAcceptanceApplication({db,projectId:PROJECT,prefix:PREFIX,origin,mode:'test',
    csrfSecret:Buffer.from(config.csrf,'base64'),loginSecret:Buffer.from(config.login,'base64'),
    sendCode:gateways.sendCode,archive:{...gateways,readArchivedPdf:async(id,doc)=>files.has(id)?files.get(id):reader.readArchivedPdf(id,doc)},
    authorizeIssue:async({package:p,recipient,operatorContext})=>operatorContext?.operatorVerified===true&&p.packageSha256===expected.packageSha256&&recipient===expected.recipient,
    verifySentPackage:async({package:p,recipient})=>({verified:p.packageSha256===expected.packageSha256&&recipient===expected.recipient,
      eventId:expected.eventId,packageSha256:expected.packageSha256,recipient:expected.recipient,
      provider:'gmail',messageId:'1a17462a3571a435',verifiedAt:'2026-10-25T18:51:42.962671Z'}),
    verifyRepresentative:async({identity})=>identity.method==='verified_session'&&identity.email===expected.recipient});
  app=Object.freeze({...app,testPackage:pkg});
  return app;
}
async function operator(req){
  const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];if(!token)throw Error('UNAUTHORISED');
  const result=await auth.verifyIdToken({idToken:token,audience:[process.env.PORTAL_ORIGIN,'32555940559.apps.googleusercontent.com']});
  const p=result.getPayload();
  if(p?.email_verified!==true||!['lars@lszh-automations.ch','lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'].includes(p.email))throw Error('UNAUTHORISED');
}
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,mode:'TEST_ONLY',configured:Boolean(process.env.PORTAL_ORIGIN&&process.env.PORTAL_CONFIG)});
    if(req.url.startsWith('/internal/')){
      if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
      await operator(req);const current=initialize();
      if(req.url==='/internal/test-invitation'){
        const ref=db.collection(PREFIX+'offerten').doc('test_c373_transport_001');
        await db.runTransaction(async tx=>{const old=await tx.get(ref);if(!old.exists)tx.create(ref,{title:'TEST_ONLY C373 Kundenanmeldung – kein Vertrag',number:'TEST_ONLY-1101',status:'Versendet',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});});
        const result=await current.service.issue(current.testPackage,expected.recipient,{operatorContext:{operatorVerified:true},expiresInMs:48*3600000});
        return json(res,200,{url:process.env.PORTAL_ORIGIN+'/#'+result.token,expiresAt:result.expiresAt,testOnly:true});
      }
      if(req.url==='/internal/archive-smoke'){
        const responseId='response_'+randomBytes(16).toString('hex');
        const bytes=Buffer.from(JSON.stringify({kind:'TEST_ONLY_ARCHIVE_READBACK',responseId,noContract:true,createdAt:new Date().toISOString()}));
        const fileId=await gateways.reserveId();await gateways.putVerified(fileId,bytes,{responseId,sha256:digest(bytes)});
        return json(res,200,{fileId,sha256:digest(bytes),readback:true,testOnly:true});
      }
      if(req.url==='/internal/archive-tick'){
        const rows=await db.collection(PREFIX+'acceptance_v1').where('state','==','pending').limit(10).get();
        let completed=0,failed=0;
        for(const row of rows.docs){try{await current.archiveResponse(row.data().responseId);completed++;}catch{failed++;}}
        return json(res,200,{completed,failed});
      }
      return json(res,404,{error:'NOT_FOUND'});
    }
    return initialize().handler(req,res);
  }catch(error){
    // Never log tokens, requests, codes, provider payloads or secret URLs.
    const code=typeof error.code==='string'&&/^[A-Z_]{3,50}$/.test(error.code)?error.code:'PORTAL_OPERATION_FAILED';
    json(res,error.message==='UNAUTHORISED'?401:503,{error:error.message==='UNAUTHORISED'?'UNAUTHORISED':code});
  }
});
server.requestTimeout=60000;server.headersTimeout=10000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0');
