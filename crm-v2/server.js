'use strict';

// Secure Cloud Run CRM. Website intake stays isolated from the authenticated
// CRM application and MUST NOT be enabled on the separate staging service.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {OAuth2Client}=require('google-auth-library');
const {Firestore}=require('@google-cloud/firestore');
const {saveWebsiteLead}=require('./lead-ingest');
const {makeDispatcher}=require('./mail-dispatcher');
const {buildStore}=require('./cloud-records');
const {renderOfferPreview}=require('./offer-preview');
const {createOfferSender}=require('./offer-send');
const {renderInvoicePreview}=require('./invoice-preview');
const {makeInvoicePdf}=require('./invoice-pdf');

const PORT=Number(process.env.PORT||8080);
const CLIENT_ID=String(process.env.GOOGLE_OAUTH_CLIENT_ID||'').trim();
const ALLOWED=new Set(String(process.env.CRM_ALLOWED_EMAILS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean));
const PREFIX=String(process.env.CRM_RECORD_PREFIX||'lszh_crm_v2_staging_');
const INTAKE_ENABLED=process.env.CRM_WEBSITE_INTAKE_ENABLED==='true';
const authClient=new OAuth2Client(CLIENT_ID);
const db=new Firestore();
const store=buildStore(db,PREFIX);
const mailDispatcher=makeDispatcher(db,PREFIX,{
  enabled:process.env.CRM_MAIL_ENABLED==='true',
  activeFrom:process.env.CRM_MAIL_ACTIVE_FROM,
  webhookUrl:process.env.CRM_MAIL_WEBHOOK_URL
});
const offerSender=createOfferSender(store,{
  enabled:process.env.CRM_OFFER_MAIL_ENABLED==='true',
  webhookUrl:process.env.CRM_OFFER_MAIL_WEBHOOK_URL,
  testTo:process.env.CRM_OFFER_MAIL_TEST_TO,
  mode:process.env.CRM_OFFER_MAIL_MODE
});
const MAIL_SCHEDULER_EMAIL=String(process.env.CRM_MAIL_SCHEDULER_EMAIL||'').trim().toLowerCase();
const MAIL_SCHEDULER_AUDIENCE=String(process.env.CRM_MAIL_SCHEDULER_AUDIENCE||'').trim();
const MAX_BODY=100*1024;
const headers={
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer','Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data: https://accounts.google.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
};
function reply(res,status,body,type='application/json; charset=utf-8'){
  res.writeHead(status,{...headers,'Content-Type':type});
  res.end(type.startsWith('application/json')?JSON.stringify(body):body);
}
function configured(){return CLIENT_ID.length>10&&ALLOWED.size>0;}
function sameOrigin(req){
  if(!req.headers.origin)return true;
  try{
    const scheme=String(req.headers['x-forwarded-proto']||(req.socket.encrypted?'https':'http')).split(',')[0].trim();
    return new URL(req.headers.origin).origin===scheme+'://'+String(req.headers.host||'');
  }catch{return false;}
}
async function userFrom(req){
  const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers.authorization||''));
  if(!configured()||!match)return null;
  try{
    const verified=await authClient.verifyIdToken({idToken:match[1],audience:CLIENT_ID});
    const payload=verified.getPayload();
    const email=String(payload?.email||'').toLowerCase();
    const domain=email.split('@')[1];
    if(!payload?.email_verified||!ALLOWED.has(email)||(domain!=='gmail.com'&&payload.hd!==domain))return null;
    return {email};
  }catch{return null;}
}
async function json(req){
  let chunks=[],total=0;
  for await(const chunk of req){
    total+=chunk.length;
    if(total>MAX_BODY)throw Object.assign(new Error('payload_too_large'),{status:413});
    chunks.push(chunk);
  }
  let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch{throw Object.assign(new Error('invalid_json'),{status:400});}
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Object.assign(new Error('invalid_body'),{status:400});
  return value;
}
async function handler(req,res){
  const url=new URL(req.url,'http://localhost'),pathname=url.pathname;
  if(req.method==='GET'&&(pathname==='/'||pathname==='/index.html'))
    return reply(res,200,fs.readFileSync(path.join(__dirname,'public','index.html'),'utf8'),'text/html; charset=utf-8');
  if(req.method==='GET'&&pathname==='/api/config')
    return reply(res,configured()?200:503,configured()?{clientId:CLIENT_ID,offerMailEnabled:offerSender.stats().enabled,offerMailMode:offerSender.stats().mode,offerMailTestTo:offerSender.stats().testTo}:{error:'not_configured'});
  if(req.method==='POST'&&pathname==='/api/internal/website-leads'){
    if(!INTAKE_ENABLED)return reply(res,404,{error:'intake_disabled_on_staging'});
    const secret=String(process.env.CRM_INGEST_SECRET||'');
    if(secret.length<32)return reply(res,503,{error:'intake_not_configured'});
    const supplied=String(req.headers.authorization||'').replace(/^Bearer /,'');
    const a=Buffer.from(secret),b=Buffer.from(supplied);
    if(a.length!==b.length||!crypto.timingSafeEqual(a,b))
      return reply(res,401,{error:'unauthorized'});
    const result=await saveWebsiteLead(db,await json(req),new Date().toISOString(),PREFIX+'leads');
    return reply(res,result.created?201:200,{ok:true,confirmed:true,recordId:result.id,created:result.created});
  }
  // Cloud Scheduler uses a Google-signed OIDC ID token for this private mail job.
  // No generic API key, no arbitrary cron callers and no anonymous access.
  if(req.method==='POST'&&pathname==='/api/internal/mail/tick'){
    if(!mailDispatcher.stats().enabled||!MAIL_SCHEDULER_EMAIL||!MAIL_SCHEDULER_AUDIENCE)
      return reply(res,404,{error:'mail_not_configured'});
    const bearer=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers.authorization||''));
    if(!bearer)return reply(res,401,{error:'unauthorized'});
    let claims=null;
    try{
      const identity=await authClient.verifyIdToken({idToken:bearer[1],audience:MAIL_SCHEDULER_AUDIENCE});
      claims=identity.getPayload();
    }catch{return reply(res,401,{error:'unauthorized'});}
    if(!claims?.email_verified||String(claims.email||'').toLowerCase()!==MAIL_SCHEDULER_EMAIL)
      return reply(res,403,{error:'forbidden'});
    return reply(res,200,await mailDispatcher.tick());
  }
  if(!pathname.startsWith('/api/'))return reply(res,404,{error:'not_found'});
  if(!configured())return reply(res,503,{error:'not_configured'});
  const user=await userFrom(req);
  if(!user)return reply(res,401,{error:'unauthorized'});
  if(req.method==='GET'&&pathname==='/api/me')return reply(res,200,{email:user.email});
  if(req.method==='GET'&&pathname==='/api/reminders'){
    const reminders=await store.reminders();
    return reply(res,200,{reminders,mode:'preview_only_not_sent'});
  }
  // Download is disabled by default; never generates a payable document
  // without configured business IBAN and explicit production approval.
  const invoicePdf=pathname.match(/^\/api\/pdf\/rechnung\/([A-Za-z0-9_-]{1,100})$/);
  if(req.method==='GET'&&invoicePdf){
    if(process.env.CRM_INVOICE_QR_ENABLED!=='true'||
       (PREFIX==='lszh_crm_v2_'&&process.env.CRM_INVOICE_PRODUCTION_APPROVED!=='true'))
      return reply(res,503,{error:'Rechnungs-PDF mit Swiss QR noch nicht freigegeben'});
    const iban=String(process.env.CRM_INVOICE_IBAN||'');
    if(!iban)return reply(res,503,{error:'Firmen-IBAN noch nicht konfiguriert'});
    const invoice=await store.get('rechnungen',invoicePdf[1]);
    if(!invoice)return reply(res,404,{error:'record_not_found'});
    const customer=invoice.customerId?await store.get('kunden',invoice.customerId):null;
    const project=invoice.projectId?await store.get('projekte',invoice.projectId):null;
    const pdf=await makeInvoicePdf(invoice,customer,project,{iban});
    res.writeHead(200,{...headers,'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="LSZH_Rechnung_'+invoice.number+'.pdf"'});
    return res.end(pdf);
  }
  const print=pathname.match(/^\/api\/print\/(offerte|rechnung)\/([A-Za-z0-9_-]{1,100})$/);
  if(req.method==='GET'&&print){
    const [_,type,id]=print;
    if(type==='offerte'){
      const offer=await store.get('offerten',id);
      if(!offer)return reply(res,404,{error:'record_not_found'});
      const lead=offer.leadId?await store.get('leads',offer.leadId):null;
      const customer=offer.customerId?await store.get('kunden',offer.customerId):null;
      return reply(res,200,renderOfferPreview(offer,lead,customer),'text/html; charset=utf-8');
    }
    const invoice=await store.get('rechnungen',id);
    if(!invoice)return reply(res,404,{error:'record_not_found'});
    const customer=invoice.customerId?await store.get('kunden',invoice.customerId):null;
    const project=invoice.projectId?await store.get('projekte',invoice.projectId):null;
    return reply(res,200,renderInvoicePreview(invoice,customer,project),'text/html; charset=utf-8');
  }
  // All contact entries require the existing Google-authenticated CRM session.
  const contactPath=pathname.match(/^\/api\/records\/leads\/([A-Za-z0-9_-]{1,100})\/contacts$/);
  if(contactPath){
    if(req.method!=='POST')return reply(res,405,{error:'method_not_allowed'});
    if(!sameOrigin(req))return reply(res,403,{error:'origin_mismatch'});
    return reply(res,201,{contact:await store.addContact(contactPath[1],await json(req),user)});
  }
  // Explicit one-click offer send, never called from the website or scheduler.
  const sendAction=pathname.match(/^\/api\/records\/offerten\/([A-Za-z0-9_-]{1,100})\/send(?:\/(resolve))?$/);
  if(sendAction){
    if(req.method!=='POST')return reply(res,405,{error:'method_not_allowed'});
    if(!sameOrigin(req))return reply(res,403,{error:'origin_mismatch'});
    const [_,id,resolve]=sendAction;
    const payload=await json(req);
    if(resolve){
      const allowed=['confirmed','not_sent'];
      if(!allowed.includes(payload.resolution)||Object.keys(payload).some(k=>k!=='resolution'))
        return reply(res,400,{error:'invalid_resolution'});
      return reply(res,200,{record:await store.resolveOfferSend(id,payload.resolution,user)});
    }
    return reply(res,200,await offerSender.send(id,payload,user));
  }
  // Manual offer dispatch/follow-up bookkeeping. Does not send an email.
  const offerAction=pathname.match(/^\/api\/records\/offerten\/([A-Za-z0-9_-]{1,100})\/(dispatch|followup)$/);
  if(offerAction){
    if(req.method!=='POST')return reply(res,405,{error:'method_not_allowed'});
    if(!sameOrigin(req))return reply(res,403,{error:'origin_mismatch'});
    const [_,id,action]=offerAction;
    const payload=await json(req);
    const record=action==='dispatch'
      ?await store.recordOfferDispatch(id,payload,user)
      :await store.recordOfferFollowUp(id,payload,user);
    return reply(res,200,{record});
  }
  const parts=pathname.split('/').filter(Boolean);
  if(parts[0]!=='api'||parts[1]!=='records'||!store.TABLES.includes(parts[2])||parts.length>4)
    return reply(res,404,{error:'not_found'});
  const table=parts[2],id=parts[3];
  if(req.method==='GET'&&!id)
    return reply(res,200,{records:await store.list(table,url.searchParams.get('limit')||200)});
  if((req.method==='POST'||req.method==='PATCH'||req.method==='DELETE')&&!sameOrigin(req))
    return reply(res,403,{error:'origin_mismatch'});
  if(req.method==='POST'&&!id)
    return reply(res,201,{record:await store.create(table,await json(req),user)});
  if(req.method==='PATCH'&&id&&/^[A-Za-z0-9_-]{1,100}$/.test(id))
    return reply(res,200,{record:await store.update(table,id,await json(req),user)});
  if(req.method==='DELETE'&&table==='leads'&&id&&/^[A-Za-z0-9_-]{1,100}$/.test(id))
    return reply(res,200,await store.remove(table,id));
  return reply(res,405,{error:'method_not_allowed'});
}
function createApp(){
  return http.createServer((req,res)=>{
    handler(req,res).catch(error=>{
      const code=error.status||500;
      if(code===500)console.error('crm_cloud_error',error.message);
      reply(res,code,{error:code===500?'server_error':error.message});
    });
  });
}
if(require.main===module)createApp().listen(PORT,'0.0.0.0',()=>console.log('LSZH CRM V2 Cloud listening on',PORT));
module.exports={createApp,handler,configured};
