// Static, nonbinding browser demo for the explicitly authorised TEMP Cloud Run
// service only. No Firestore, Drive, offer tokens, forms or PDF endpoints.
const SERVICE='lszh-offer-browser-staging';
const SA='lszh-offer-browser-tmp@lszh-automations.iam.gserviceaccount.com';
const PROJECT='lszh-automations';
const REV=/^lszh-offer-browser-staging-\d{5}-[a-z0-9]+$/;
const DEMO_PATH='/offerte-annehmen/';

export function tempBrowserDemoConfig(env={}){
 if(env.LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED!=='true')
   return {enabled:false};
 // Mutual exclusion is critical: enabling the full contract-capable stack is
 // never a side effect of turning on this public-facing static demo.
 if(env.LSZH_PORTAL_STAGING_ENABLED!=='false'||
    env.K_SERVICE!==SERVICE || !REV.test(String(env.K_REVISION||''))||
    String(env.GOOGLE_CLOUD_PROJECT||env.GCLOUD_PROJECT||'')!==PROJECT ||
    env.FIRESTORE_EMULATOR_HOST||env.GOOGLE_APPLICATION_CREDENTIALS||
    env.OFFER_DRIVE_SA_B64||env.OFFER_DRIVE_SA_FILE)
   throw Error('temporary_demo_runtime_mismatch');
 return {enabled:true};
}
function locked(res){
 res.writeHead(503,{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':'no-store','Pragma':'no-cache',
   'X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive',
   'Referrer-Policy':'no-referrer'});
 res.end('{"error":"not_available"}');
}
export function createTemporaryBrowserDemoHttp({pageHtml,enabled=false}={}){
 // Validate once at setup, not on every request. No template interpolation.
 if(enabled===true && (typeof pageHtml!=='string'||
     !pageHtml.startsWith('<!DOCTYPE html>') ||
     !pageHtml.includes("const demo=params.get('demo')==='1'") ||
     Buffer.byteLength(pageHtml)>200*1024))
   throw Error('temporary_demo_html_invalid');
 return function(req,res){
   if(enabled!==true || req.method!=='GET')return locked(res);
   let u;
   try{u=new URL(req.url,'https://local.invalid');}
   catch{return locked(res);}
   // The ONLY permitted route is the existing client-side design preview.
   // Reject tokens, extra query params, percent-encoded variants and ALL APIs.
   if(u.pathname!==DEMO_PATH || u.search!=='?demo=1' ||
      !req.url.startsWith(DEMO_PATH+'?demo=1'))
     return locked(res);
   const size=Buffer.byteLength(pageHtml);
   res.writeHead(200,{
     'Content-Type':'text/html; charset=utf-8',
     'Content-Length':String(size),
     'Cache-Control':'no-store','Pragma':'no-cache',
     'Referrer-Policy':'no-referrer',
     'X-Robots-Tag':'noindex, nofollow, noarchive',
     'X-Content-Type-Options':'nosniff',
     'X-Frame-Options':'DENY',
     'Cross-Origin-Resource-Policy':'same-origin',
     'Content-Security-Policy':"default-src 'none'; base-uri 'none'; frame-ancestors 'none'; connect-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'none'"
   });
   res.end(pageHtml);
 };
}
export async function verifyTemporaryBrowserIdentity(fetcher=fetch){
 const r=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',{
   headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(5000)
 });
 if(!r.ok || (await r.text()).trim()!==SA)
   throw Error('temporary_demo_identity_mismatch');
 return true;
}
