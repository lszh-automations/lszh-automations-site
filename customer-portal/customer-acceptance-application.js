'use strict';
// Composition only. Not imported by the existing live CRM server.
const {createContractAcceptance,fault}=require('./contract-acceptance-staging');
const {createDurableAcceptance}=require('./contract-acceptance-durable');
const {createCustomerLogin}=require('./customer-login');
const {createAcceptanceHandler}=require('./contract-acceptance-http-staging');
function createCustomerAcceptanceApplication({db,projectId,databaseId,prefix,origin,archive,
  csrfSecret,loginSecret,sendCode,verifySentPackage,authorizeIssue,verifyRepresentative,now=Date.now,emulator=false,mode='customer',acceptanceRecordGuard}={}){
  if(!archive||typeof archive.readArchivedPdf!=='function')throw fault('ARCHIVE_NOT_CONFIGURED',503);
  const persistence=createDurableAcceptance({db,projectId,databaseId,prefix,now,emulator});
  const store=acceptanceRecordGuard?{...persistence.store,resolve:async(...args)=>{
    const record=await persistence.store.resolve(...args);
    if(await acceptanceRecordGuard(record)!==true)throw fault('PILOT_BINDING_REJECTED',403);
    return record;
  }}:persistence.store;
  const login=createCustomerLogin({transaction:persistence.transaction,acceptanceStore:store,sendCode,secret:loginSecret,now});
  const service=createContractAcceptance({store,readArchivedPdf:archive.readArchivedPdf,
    verifySentPackage,authorizeIssue,verifyRepresentative,csrfSecret,now,mode,
    resolveIdentity:async req=>{
      const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];
      const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith('__Host-lszh_customer='));
      if(cookies.length!==1)throw fault('IDENTITY_REQUIRED',401);
      return login.identity(token,cookies[0].slice('__Host-lszh_customer='.length));
    }});
  return Object.freeze({service,handler:createAcceptanceHandler({service,origin,login,customerMode:mode==='customer',realLogin:true}),
    archiveResponse:responseId=>persistence.archiveResponse(responseId,archive)});
}
module.exports={createCustomerAcceptanceApplication};
