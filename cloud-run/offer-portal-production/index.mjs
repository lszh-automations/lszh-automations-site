import {http} from '@google-cloud/functions-framework';
import {Firestore} from '@google-cloud/firestore';
import {GoogleAuth} from 'google-auth-library';
import {readFileSync} from 'node:fs';
import {CUSTOMER_RUNTIME,productionConfig} from './productionConfig.mjs';
import {createCustomerOfferStore} from './customerFirestoreStore.mjs';
import {createCustomerAirtableCallback} from './productionAirtableRuntime.mjs';
import {createOfferPortal} from '../offer-portal-staging/portalCore.mjs';
import {createOfferPortalHttp} from '../offer-portal-staging/portalHttp.mjs';
import {verifyArchiveBundle,readVerifiedArchivePdf}
  from '../archive-reader-staging/archiveBundleVerifier.mjs';

// Inactive unless all explicit production values and identity are supplied.
const config=productionConfig(process.env);
const disabled=createOfferPortalHttp({
  portal:{preview:async()=>{},accept:async()=>{}},enabled:false
});
let handlerPromise;
async function createHandler(){
  const I=CUSTOMER_RUNTIME;
  const response=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',{
    headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)
  });
  if(!response.ok||(await response.text()).trim()!==I.serviceEmail)
    throw Error('customer_identity_mismatch');
  const db=new Firestore({
    projectId:I.projectId,databaseId:I.databaseId,host:I.firestoreHost
  });
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']});
  async function archiveOptions(){
    const accessToken=await auth.getAccessToken();
    if(!accessToken)throw Error('customer_archive_auth_missing');
    return {accessToken,archiveFolderId:I.archiveFolderId};
  }
  const portal=createOfferPortal({
    store:createCustomerOfferStore(db),
    verifyBundle:async bundle=>verifyArchiveBundle(bundle,await archiveOptions()),
    readPdf:async(bundle,which)=>readVerifiedArchivePdf(bundle,which,await archiveOptions()),
    approvedVersion:config.termsVersion,proofSalt:config.proofSalt,
    productionOnly:true,
    onAccepted:config.acceptEnabled?createCustomerAirtableCallback({config,fetcher:fetch}):
      async()=>{throw Error('customer_acceptance_disabled');}
  });
  const pageHtml=readFileSync(new URL('./offerte-annehmen.html',import.meta.url),'utf8');
  return createOfferPortalHttp({
    portal,enabled:true,acceptEnabled:config.acceptEnabled===true,allowedOrigin:config.origin,pageHtml
  });
}
http('lszhOfferPortalProduction',async(req,res)=>{
  if(!config.enabled)return disabled(req,res);
  try{
    handlerPromise??=createHandler();
    const handler=await handlerPromise;
    return await handler(req,res);
  }catch{
    if(!res.headersSent){
      res.writeHead(503,{
        'Content-Type':'application/json','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      });
      res.end(JSON.stringify({error:'temporarily_unavailable'}));
    }else res.end();
  }
});
