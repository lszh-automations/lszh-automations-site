import contract from './dispatchContract.cjs';
import {createOfferPortal} from '../offer-portal-staging/portalCore.mjs';
import {createOfferPortalHttp} from '../offer-portal-staging/portalHttp.mjs';
export const LINK_SERVICE={project:'lszh-automations',service:'lszh-crm-offer-links',origin:'https://lszh-crm-offer-links-ozx7mp2bka-oa.a.run.app',identity:'lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com'};
export function linkConfig(env={}){
 if(env.LSZH_CRM_LINKS_ENABLED!=='true')return{enabled:false};
 if(env.K_SERVICE!==LINK_SERVICE.service||!/^lszh-crm-offer-links-\d{5}-[a-z0-9]+$/.test(env.K_REVISION||'')||env.GOOGLE_CLOUD_PROJECT!==LINK_SERVICE.project||env.LSZH_CRM_LINK_ORIGIN!==LINK_SERVICE.origin||!/^rec[A-Za-z0-9]{14}$/.test(env.LSZH_CRM_PILOT_RECORD_ID||'')||env.FIRESTORE_EMULATOR_HOST||env.GOOGLE_APPLICATION_CREDENTIALS||['LSZH_PORTAL_PRODUCTION_ENABLED','LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED'].some(k=>env[k]==='true'))throw Error('crm_link_config_rejected');
 return{enabled:true,origin:LINK_SERVICE.origin,recordId:env.LSZH_CRM_PILOT_RECORD_ID};
}
export async function readLinkSnapshot(hash,fetcher=fetch){
 if(!/^[a-f0-9]{64}$/.test(hash||''))return null;
 const base='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
 const request=(url,headers)=>fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});
 const email=await request(base+'email',{'Metadata-Flavor':'Google'});if(!email.ok||(await email.text()).trim()!==LINK_SERVICE.identity)throw Error('crm_link_identity_rejected');
 const t=await request(base+'token',{'Metadata-Flavor':'Google'});if(!t.ok)throw Error('crm_link_identity_unavailable');const token=(await t.json()).access_token;
 const r=await request('https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_crm_cloud_links/'+hash,{Authorization:'Bearer '+token});if(r.status===404)return null;if(!r.ok)throw Error('crm_link_storage_unavailable');
 const raw=(await r.json()).fields?.snapshotJSON?.stringValue;if(typeof raw!=='string'||raw.length>700000)throw Error('crm_link_snapshot_rejected');return JSON.parse(raw);
}
export function createLinkHandler({config,pageHtml,readSnapshot=readLinkSnapshot,clock=()=>new Date(),validateSnapshot=contract.validateSnapshot}={}){
 const unavailable=(_,res)=>{res.writeHead(503,{'Cache-Control':'no-store'});res.end();};if(config?.enabled!==true)return unavailable;
 // Per-request state: no unbounded cache and no cross-request PDF or token leakage.
 return async(req,res)=>{
  let snapshot;
  const store={get:async hash=>{const value=await readSnapshot(hash);if(!value)return null;try{snapshot=validateSnapshot(value,hash,config.recordId,clock());return snapshot.offer;}catch{return null;}},claim:async()=>{throw Error('crm_link_accept_forbidden');}};
  const portal=createOfferPortal({store,verifyBundle:async()=>Boolean(snapshot),readPdf:async(_,which)=>Buffer.from(snapshot.documents[which].base64,'base64'),clock,approvedVersion:'TEST_v1.0_RC1',proofSalt:'INTERNAL_CRM_PREVIEW_NO_ACCEPTANCE',syntheticOnly:true});
  return createOfferPortalHttp({portal,enabled:true,acceptEnabled:false,allowedOrigin:config.origin,pageHtml})(req,res);
 };
}
