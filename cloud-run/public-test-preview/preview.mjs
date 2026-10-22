// Isolated TEST_ONLY preview: immutable synthetic PDFs, no external data clients.
import {createHash} from 'node:crypto';
import {createOfferPortal} from '../offer-portal-staging/portalCore.mjs';
import {createOfferPortalHttp} from '../offer-portal-staging/portalHttp.mjs';
import {buildFixtures} from '../../scripts/offerSyntheticPdfFixtures.mjs';
export const PREVIEW=Object.freeze({service:'lszh-offer-link-preview',project:'lszh-automations',
 origin:'https://lszh-offer-link-preview-ozx7mp2bka-oa.a.run.app',number:'TEST_PDF_AVV_NEIN_NO_CONTRACT'});
const sha=b=>createHash('sha256').update(b).digest('hex');
export function previewConfig(env={},now=new Date()){
 if(env.LSZH_PUBLIC_TEST_PREVIEW_ENABLED!=='true')return {enabled:false};
 if(env.K_SERVICE!==PREVIEW.service||env.GOOGLE_CLOUD_PROJECT!==PREVIEW.project||
   !/^lszh-offer-link-preview-\d{5}-[a-z0-9]+$/.test(env.K_REVISION||'')||
   env.LSZH_PUBLIC_TEST_ORIGIN!==PREVIEW.origin||
   !/^[a-f0-9]{64}$/.test(env.LSZH_PUBLIC_TEST_TOKEN_HASH||'')||
   ['LSZH_PORTAL_PRODUCTION_ENABLED','LSZH_PORTAL_STAGING_ENABLED','LSZH_PORTAL_SYNTHETIC_ACCEPT_ENABLED','LSZH_SYNTHETIC_AIRTABLE_WRITEBACK_ENABLED'].some(k=>env[k]==='true'))
  throw Error('public_preview_config_rejected');
 const expires=Date.parse(env.LSZH_PUBLIC_TEST_EXPIRES_AT||'');
 if(!Number.isFinite(expires)||expires<=+now||expires>+now+2*60*60*1000)throw Error('public_preview_expiry_rejected');
 return {enabled:true,origin:PREVIEW.origin,tokenHash:env.LSZH_PUBLIC_TEST_TOKEN_HASH,expiresAt:new Date(expires).toISOString()};
}
export function createPublicPreview({config,pageHtml,clock=()=>new Date()}={}){
 const locked=(req,res)=>{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive'});res.end('{"error":"not_available"}');};
 if(config?.enabled!==true)return locked;
 const {files,manifest}=buildFixtures();
 const bundle={avv_required:'Nein',quote:{id:'1SYNTHETIC_PUBLIC_QUOTE_00001',sha256:sha(files.quoteNein)},terms:{id:'1SYNTHETIC_PUBLIC_TERMS_00001',sha256:sha(files.terms)}};
 const offer={tokenHash:config.tokenHash,status:'sent',approved:true,revision:1,termsVersion:'TEST_v1.0_RC1',expiresAt:config.expiresAt,
  recipientEmail:'synthetic@example.invalid',offerNumber:PREVIEW.number,
  details:{company:'Synthetic KMU AG (does not exist) – TEST_ONLY',service:'Test automation for imaginary requests',onceCHF:1490,monthlyCHF:149,paymentModel:'Fiktive Testwerte. Kein Vertrag, keine Zahlung.'},
  bundle,source:{kind:'LSZH_SYNTHETIC_ONLY',baseId:'appzJiskpAdaR1HEv',tableId:'tbljeIUoD7wwKuSmS',recordId:'rec12345678901235'},
  downstream:{airtable:'disabled',proofPdf:'disabled',email:'disabled'}};
 const portal=createOfferPortal({
  store:{get:async hash=>hash===config.tokenHash?structuredClone(offer):null,claim:async()=>{throw Error('public_preview_claim_forbidden');}},
  verifyBundle:async b=>JSON.stringify(b)===JSON.stringify(bundle)&&sha(files.quoteNein)===manifest.files.quoteNein.sha256&&sha(files.terms)===manifest.files.terms.sha256,
  readPdf:async(_,which)=>which==='quote'?files.quoteNein:files.terms,
  clock,approvedVersion:'TEST_v1.0_RC1',proofSalt:'SYNTHETIC_PREVIEW_NO_ACCEPTANCE_20261021',syntheticOnly:true});
 const handler=createOfferPortalHttp({portal,enabled:true,acceptEnabled:false,allowedOrigin:config.origin,pageHtml});
 return (req,res)=>+clock()>=Date.parse(config.expiresAt)?locked(req,res):handler(req,res);
}

