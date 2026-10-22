'use strict';

// Separate CRM V2 service. No secrets in source or browser.
// Google Identity Services verifies sign-in; Firestore is only accessed server-side.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {OAuth2Client} = require('google-auth-library');
const {Firestore} = require('@google-cloud/firestore');

const PORT = Number(process.env.PORT || 8080);
const CLIENT_ID = String(process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const ALLOWED = new Set(String(process.env.CRM_ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const PREFIX = 'lszh_crm_v2_';
const authClient = new OAuth2Client(CLIENT_ID);
const db = new Firestore();
const MAX_BODY = 32 * 1024;
const defs = {
  leads: {
    fields: ['name','company','email','street','postalCode','city','country','message','currentProcess','systems','mainProblem','frequency','desiredResult','status'],
    required: ['name','company','email'], statuses: ['Neu','In Prüfung','Qualifiziert','Verloren']
  },
  kunden: {
    fields: ['company','contactName','email','street','postalCode','city','country','notes','status'],
    required: ['company'], statuses: ['Aktiv','Inaktiv']
  },
  offerten: {
    fields: ['leadId','customerId','title','description','oneTimeCHF','monthlyCHF','validUntil','status'],
    required: ['title'], statuses: ['Entwurf','Bereit','Versendet','Angenommen','Abgelehnt']
  },
  rechnungen: {
    fields: ['customerId','projectId','description','amountCHF','dueDate','status'],
    required: ['description'], statuses: ['Entwurf','Offen','Bezahlt','Storniert']
  },
  projekte: {
    fields: ['customerId','offerId','title','description','dueDate','status'],
    required: ['title'], statuses: ['Geplant','In Arbeit','Wartet auf Kunde','Abgeschlossen']
  }
};
const numericFields = new Set(['oneTimeCHF','monthlyCHF','amountCHF']);
const emailFields = new Set(['email']);
const headers = {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data: https://accounts.google.com; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'"
};
function response(res,status,body,type='application/json; charset=utf-8') {
  res.writeHead(status,{...headers,'Content-Type':type});
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function ready() { return CLIENT_ID.length > 10 && ALLOWED.size > 0; }
function originAllowed(req) {
  const origin=req.headers.origin;
  if(!origin) return true;
  try {
    const host=String(req.headers.host || '');
    const scheme=String(req.headers['x-forwarded-proto'] || (req.socket.encrypted ? 'https' : 'http')).split(',')[0].trim();
    return new URL(origin).origin === scheme+'://'+host;
  } catch { return false; }
}
async function getUser(req) {
  const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers.authorization || ''));
  if(!match || !ready()) return null;
  try {
    const ticket=await authClient.verifyIdToken({idToken:match[1],audience:CLIENT_ID});
    const p=ticket.getPayload();
    const email=String(p?.email || '').toLowerCase();
    if(!p?.email_verified || !ALLOWED.has(email)) return null;
    return {email};
  } catch { return null; }
}
async function readBody(req) {
  let raw='',size=0;
  for await(const chunk of req) {
    size += chunk.length;
    if(size>MAX_BODY) { const e=new Error('payload_too_large');e.status=413;throw e; }
    raw += chunk.toString('utf8');
  }
  let data;
  try { data=JSON.parse(raw); } catch { const e=new Error('invalid_json');e.status=400;throw e; }
  if(!data || typeof data!=='object' || Array.isArray(data)) {const e=new Error('invalid_body');e.status=400;throw e;}
  return data;
}
function clean(collection,source) {
  const def=defs[collection],out={};
  for(const key of def.fields) {
    if(!Object.prototype.hasOwnProperty.call(source,key)) continue;
    let v=source[key];
    if(numericFields.has(key)) {
      if(v==='' || v===null) {out[key]=null;continue;}
      v=Number(v);
      if(!Number.isFinite(v) || v<0 || v>100000000) throw Object.assign(new Error('invalid_'+key),{status:400});
    } else {
      if(typeof v!=='string') throw Object.assign(new Error('invalid_'+key),{status:400});
      v=v.trim();
      if(v.length>5000) throw Object.assign(new Error('too_long_'+key),{status:400});
      if(emailFields.has(key) && v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw Object.assign(new Error('invalid_email'),{status:400});
      if(key==='status' && v && !def.statuses.includes(v)) throw Object.assign(new Error('invalid_status'),{status:400});
    }
    out[key]=v;
  }
  return out;
}
function requireFields(collection,record) {
  const missing=defs[collection].required.filter(key => !String(record[key] ?? '').trim());
  if(missing.length) throw Object.assign(new Error('missing_'+missing.join('_')),{status:400});
}
function collectionRef(name) {return db.collection(PREFIX+name);}
async function createRecord(collection,data,user) {
  const values=clean(collection,data);
  requireFields(collection,values);
  values.status=values.status || defs[collection].statuses[0];
  const now=new Date().toISOString();
  values.createdAt=now; values.updatedAt=now; values.createdBy=user.email;
  const col=collectionRef(collection), ref=col.doc();
  if(collection==='offerten' || collection==='rechnungen') {
    const key=collection==='offerten' ? 'offer' : 'invoice';
    const counter=db.collection(PREFIX+'_meta').doc(key+'_sequence');
    await db.runTransaction(async tx=>{
      const snap=await tx.get(counter);
      const next=snap.exists && Number.isSafeInteger(snap.data().next) ? snap.data().next : 1000;
      if(next>99999999) throw new Error('sequence_exhausted');
      tx.set(counter,{next:next+1},{merge:true});
      values.number=(collection==='offerten' ? 'OFF-' : 'RE-')+String(next);
      tx.create(ref,values);
    });
  } else await ref.create(values);
  return {id:ref.id,...values};
}
async function handle(req,res) {
  const url=new URL(req.url,'http://localhost');
  const pathname=url.pathname;
  if(req.method==='GET' && (pathname==='/' || pathname==='/index.html')) {
    return response(res,200,fs.readFileSync(path.join(__dirname,'public','index.html')),'text/html; charset=utf-8');
  }
  if(req.method==='GET' && pathname==='/api/config') {
    return response(res,ready()?200:503,ready()?{clientId:CLIENT_ID}:{error:'not_configured'});
  }
  if(!pathname.startsWith('/api/')) return response(res,404,{error:'not_found'});
  if(!ready()) return response(res,503,{error:'not_configured'});
  const user=await getUser(req);
  if(!user) return response(res,401,{error:'unauthorized'});
  if(req.method==='GET' && pathname==='/api/me') return response(res,200,{email:user.email});
  const parts=pathname.split('/').filter(Boolean);
  if(parts[0]!=='api' || parts[1]!=='records' || !defs[parts[2]] || parts.length>4)
    return response(res,404,{error:'not_found'});
  const table=parts[2],id=parts[3],col=collectionRef(table);
  if(req.method==='GET' && !id) {
    const limit=Math.min(Math.max(Number(url.searchParams.get('limit')) || 100,1),200);
    const snap=await col.orderBy('createdAt','desc').limit(limit).get();
    return response(res,200,{records:snap.docs.map(doc=>({id:doc.id,...doc.data()}))});
  }
  if(['POST','PATCH'].includes(req.method) && !originAllowed(req))
    return response(res,403,{error:'origin_mismatch'});
  if(req.method==='POST' && !id) {
    const data=await readBody(req);
    return response(res,201,{record:await createRecord(table,data,user)});
  }
  if(req.method==='PATCH' && id && /^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    const payload=await readBody(req);
    const update=clean(table,payload);
    if(!Object.keys(update).length) return response(res,400,{error:'empty_update'});
    const ref=col.doc(id);
    const snap=await ref.get();
    if(!snap.exists) return response(res,404,{error:'record_not_found'});
    const merged={...snap.data(),...update};
    requireFields(table,merged);
    update.updatedAt=new Date().toISOString();
    update.updatedBy=user.email;
    await ref.update(update);
    return response(res,200,{record:{id,...merged,...update}});
  }
  return response(res,405,{error:'method_not_allowed'});
}
http.createServer((req,res)=>{
  handle(req,res).catch(err=>{
    const status=err.status || 500;
    if(status===500) console.error('crm_v2_error',err.message);
    response(res,status,{error:status===500?'server_error':err.message});
  });
}).listen(PORT,'0.0.0.0',()=>console.log('LSZH CRM V2 listening on',PORT));
