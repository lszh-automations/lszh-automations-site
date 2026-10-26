'use strict';
// Dedicated production-prefix pilot entry. No public invitation-issuing endpoint.
const {createArchiveMetadataReader}=require('./contract-archive-metadata');
const http=require('node:http');
const {Firestore}=require('@google-cloud/firestore');
const {OAuth2Client}=require('google-auth-library');
const {createCustomerAcceptanceApplication}=require('./customer-acceptance-application');
const {createDurableAcceptance}=require('./contract-acceptance-durable');
const {createProductionDocumentReader}=require('./contract-production-document-reader');
const {createDriveAcceptanceArchive}=require('./contract-acceptance-drive');
const {createPortalGateways}=require('./customer-portal-gateways');
const {createLivePublicationPolicy}=require('./contract-live-package-bridge');
const {fault}=require('./contract-acceptance-staging');
const catalog=require('./contract-document-catalog.json');
const PROJECT='lszh-automations',PREFIX='lszh_crm_v2_';
function validateConfig(c,origin){
 const general=c?.accessMode==='customer';
 if(c?.accessMode&&!['pilot','customer'].includes(c.accessMode))throw fault('PORTAL_CONFIG_INVALID',503);
 if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(origin||'')||(!general&&(!c?.pilot||
    !/^[A-Za-z0-9_-]{1,100}$/.test(c.pilot.offerId||'')||
    c.pilot.recipient!=='lars.schulthess@outlook.com'||
    !/^[a-f0-9]{64}$/.test(c.pilot.packageSha256||'')))||
    c.evidenceFolderId!==catalog.sourceFolderId||
    ['csrf','login'].some(k=>typeof c[k]!=='string'||Buffer.from(c[k],'base64').length<32))throw fault('PILOT_CONFIG_INVALID',503);
 return c;
}
function createPilotRecordGuard(pilot,policy){
 return async row=>row?.invitation?.recipient===pilot.recipient&&row.record?.recipient===pilot.recipient&&
  row.record?.package?.offerId===pilot.offerId&&row.record.package.packageSha256===pilot.packageSha256&&
  await policy.verifyRelease({package:row.record.package,recipient:pilot.recipient})===true;
}
function createCustomerRecordGuard(policy){
 return async row=>{
  const pkg=row?.record?.package,recipient=row?.record?.recipient;
  return Boolean(pkg&&typeof recipient==='string'&&row.invitation?.recipient===recipient&&
   row.invitation.packageId===pkg.packageId&&row.invitation.packageSha256===pkg.packageSha256&&
   await policy.verifyRelease({package:pkg,recipient})===true);
 };
}
function createLivePortal({config,origin,db=new Firestore({projectId:PROJECT}),auth=new OAuth2Client()}={}){
 validateConfig(config,origin);
 const general=config.accessMode==='customer';
 const persistence=createDurableAcceptance({db,projectId:PROJECT,prefix:PREFIX});
 const policy=createLivePublicationPolicy({transaction:persistence.transaction,authorizeOperator:async()=>null});
 const metadataReader=createArchiveMetadataReader({metadataHook:config.metadataHook});
 const documents=createProductionDocumentReader({metadataReader});
 const reader=createDriveAcceptanceArchive({folderId:config.evidenceFolderId,metadataReader});
 const gateways=createPortalGateways({...config,reader,recipientPolicy:general?'released_packages':'pilot'});
 const guard=general?createCustomerRecordGuard(policy):createPilotRecordGuard(config.pilot,policy);
 const app=createCustomerAcceptanceApplication({db,projectId:PROJECT,prefix:PREFIX,origin,mode:'customer',
  csrfSecret:Buffer.from(config.csrf,'base64'),loginSecret:Buffer.from(config.login,'base64'),
  sendCode:gateways.sendCode,archive:{...gateways,readArchivedPdf:documents.readArchivedPdf},
  authorizeIssue:async()=>false,verifySentPackage:policy.verifySentPackage,acceptanceRecordGuard:guard,
  verifyRepresentative:async({identity,package:pkg})=>identity.method==='verified_session'&&
   (general?await policy.verifyRelease({package:pkg,recipient:identity.email}):identity.email===config.pilot.recipient&&pkg.offerId===config.pilot.offerId&&pkg.packageSha256===config.pilot.packageSha256)});
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end(JSON.stringify(body));};
 return http.createServer(async(req,res)=>{
  try{
   if(req.method==='GET'&&req.url==='/api/health')return json(res,200,{ok:true,mode:general?'customer':'restricted_pilot'});
   if(req.url.startsWith('/internal/')){
    if(req.url!=='/internal/archive-tick')return json(res,404,{error:'NOT_FOUND'});
    if(req.method!=='POST')return json(res,405,{error:'METHOD_NOT_ALLOWED'});
    const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1];
    if(!token)return json(res,401,{error:'UNAUTHORISED'});
    const ticket=await auth.verifyIdToken({idToken:token,audience:[origin,'32555940559.apps.googleusercontent.com']});
    const user=ticket.getPayload();
    if(user?.email_verified!==true||!['lars@lszh-automations.ch','lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'].includes(user.email))return json(res,401,{error:'UNAUTHORISED'});
    const rows=await db.collection(PREFIX+'acceptance_v1').where('state','==','pending').limit(10).get();
    let completed=0,failed=0;
    for(const row of rows.docs){
     const job=row.data();if(!general&&job.offerId!==config.pilot.offerId)continue;
     try{await app.archiveResponse(job.responseId);completed++;}catch{failed++;}
    }
    return json(res,200,{completed,failed});
   }
   return app.handler(req,res);
  }catch(error){json(res,503,{error:/^[A-Z_]{3,50}$/.test(error.code||'')?error.code:'PORTAL_OPERATION_FAILED'});}
 });
}
if(require.main===module){
 const server=createLivePortal({config:JSON.parse(process.env.PORTAL_CONFIG||'{}'),origin:process.env.PORTAL_ORIGIN});
 server.requestTimeout=60000;server.headersTimeout=10000;
 server.listen(Number(process.env.PORT||8080),'0.0.0.0');
}
module.exports={createLivePortal,createPilotRecordGuard,createCustomerRecordGuard,validateConfig};
