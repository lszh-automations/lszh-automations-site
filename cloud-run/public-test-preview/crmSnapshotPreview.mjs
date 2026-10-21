// Read-only public view of ONE immutable TEST_ONLY CRM dispatch snapshot.
import {createHash} from 'node:crypto';
import {createOfferPortal} from '../offer-portal-staging/portalCore.mjs';
import {createOfferPortalHttp} from '../offer-portal-staging/portalHttp.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function readCrmSnapshot(config,recordId,fetcher=fetch){
 const base='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/';
 const get=async(url,headers)=>{const r=await fetcher(url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('snapshot_unavailable');return r;};
 const headers={'Metadata-Flavor':'Google'};
 if((await(await get(base+'email',headers)).text()).trim()!=='lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com')throw Error('snapshot_identity_mismatch');
 const token=await(await get(base+'token',headers)).json();
 const url='https://firestore.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_crm_dispatch_previews/'+config.tokenHash;
 const d=await(await get(url,{Authorization:'Bearer '+token.access_token})).json();
 const raw=d.fields?.snapshotJSON?.stringValue;if(typeof raw!=='string'||raw.length>700000)throw Error('snapshot_invalid');return JSON.parse(raw);
}
export function createCrmSnapshotPreview({config,recordId,pageHtml,clock=()=>new Date(),readSnapshot=readCrmSnapshot}={}){
 if(!/^rec[A-Za-z0-9]{14}$/.test(recordId||''))throw Error('snapshot_record_required');
 let cached;
 const load=async()=>{
  if(cached)return cached;
  const s=await readSnapshot(config,recordId);
  if(s?.purpose!=='TEST_ONLY_CRM_DISPATCH_20261021'||s.testOnly!==true||s.recordId!==recordId||s.previewExpiresAt!==config.expiresAt||s.offer?.tokenHash!==config.tokenHash||s.offer?.source?.recordId!==recordId||s.offer?.recipientEmail!=='synthetic@example.invalid'||s.offer?.bundle?.avv_required!=='Nein'||s.offer?.offerNumber!=='TEST_CRM_VERSAND_20261021_NO_CONTRACT')throw Error('snapshot_mismatch');
  const bytes={};for(const which of ['quote','terms']){bytes[which]=Buffer.from(s.documents?.[which]?.base64||'','base64');if(bytes[which].length<8||bytes[which].length>250000||sha(bytes[which])!==s.offer.bundle[which].sha256)throw Error('snapshot_document_mismatch');}
  cached={offer:s.offer,bytes};return cached;
 };
 const portal=createOfferPortal({store:{get:async h=>h===config.tokenHash?(await load()).offer:null,claim:async()=>{throw Error('snapshot_claim_forbidden');}},verifyBundle:async()=>{await load();return true;},readPdf:async(_,which)=>(await load()).bytes[which],clock,approvedVersion:'TEST_v1.0_RC1',proofSalt:'SYNTHETIC_SNAPSHOT_PREVIEW_NO_ACCEPTANCE',syntheticOnly:true});
 const handler=createOfferPortalHttp({portal,enabled:config.enabled===true,acceptEnabled:false,allowedOrigin:config.origin,pageHtml});
 return(req,res)=>{if(+clock()>=Date.parse(config.expiresAt)){res.writeHead(503,{'Cache-Control':'no-store'});return res.end('{"error":"not_available"}');}return handler(req,res);};
}
