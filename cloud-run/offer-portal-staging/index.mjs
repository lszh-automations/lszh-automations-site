import {http} from '@google-cloud/functions-framework';
import {Firestore} from '@google-cloud/firestore';
import {GoogleAuth} from 'google-auth-library';
import {readFileSync} from 'node:fs';
import {stagingConfig,STAGING} from './stagingConfig.mjs';
import {createFirestoreOfferStore} from './firestoreOfferStore.mjs';
import {createOfferPortal} from './portalCore.mjs';
import {createOfferPortalHttp} from './portalHttp.mjs';
import {tempBrowserDemoConfig,createTemporaryBrowserDemoHttp,
  verifyTemporaryBrowserIdentity} from './temporaryBrowserDemo.mjs';
import {verifyArchiveBundle,readVerifiedArchivePdf} from '../archive-reader-staging/archiveBundleVerifier.mjs';

// The full offer API remains NOT DEPLOYED. Only the separately authorized
// temporary STATIC browser demonstration may be deployed; it must not access
// Drive, Firestore, personal offer data, or any acceptance API.
// Service MUST have its own runtime identity. Never reuse archive-reader
// (that principal has no Firestore write access). Never use JSON keys.
const config=stagingConfig(process.env);
const tempConfig=tempBrowserDemoConfig(process.env);
const tempDemo=tempConfig.enabled?createTemporaryBrowserDemoHttp({
  enabled:true,
  pageHtml:readFileSync(new URL('./offerte-annehmen.html',import.meta.url),'utf8')
}):null;
let tempIdentityPromise;
const disabled=createOfferPortalHttp({
  portal:{preview:async()=>{},accept:async()=>{}},enabled:false
});

async function startupIdentityCheck(){
  const url='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email';
  const r=await fetch(url,{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)});
  if(!r.ok || (await r.text()).trim()!==STAGING.serviceEmail)
    throw Error('staging_identity_mismatch');
}

let handlerPromise;
function activeHandler(){
  if(!handlerPromise){
    handlerPromise=(async()=>{
      await startupIdentityCheck();
      const db=new Firestore({
        projectId:STAGING.projectId,
        databaseId:STAGING.databaseId,
        host:STAGING.firestoreHost
      });
      const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']});
      const archiveOptions=async()=>{
        const token=await auth.getAccessToken();
        if(!token)throw Error('staging_drive_auth_unavailable');
        return {accessToken:token,archiveFolderId:STAGING.archiveFolderId};
      };
      const verifyBundle=async bundle=>verifyArchiveBundle(bundle,await archiveOptions());
      const readPdf=async(bundle,which)=>readVerifiedArchivePdf(bundle,which,await archiveOptions());
      const pageHtml=readFileSync(new URL('./offerte-annehmen.html',import.meta.url),'utf8');
      return createOfferPortalHttp({
        portal:createOfferPortal({
          store:createFirestoreOfferStore(db),verifyBundle,readPdf,
          approvedVersion:STAGING.termsVersion,proofSalt:config.proofSalt,
          // Deployment must never process a real customer offer.
          syntheticOnly:true
        }),
        enabled:true,acceptEnabled:false,
        allowedOrigin:config.origin,pageHtml
      });
    })();
  }
  return handlerPromise;
}
http('lszhOfferPortalStaging',async(req,res)=>{
  if(tempConfig.enabled){
    try{
      tempIdentityPromise ??= verifyTemporaryBrowserIdentity();
      await tempIdentityPromise;
      return tempDemo(req,res);
    }catch{
      // Failed metadata identity validation is always a closed 503.
      return disabled(req,res);
    }
  }
  if(!config.enabled)return disabled(req,res);
  try{
    const handler=await activeHandler();
    await handler(req,res);
  }catch{
    // Never log tokens, cookies, raw Google exception text or PDFs.
    if(!res.headersSent){
      res.writeHead(503,{
        'Content-Type':'application/json','Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      });
      res.end(JSON.stringify({error:'temporarily_unavailable'}));
    }else res.end();
  }
});
