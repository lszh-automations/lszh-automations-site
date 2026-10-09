const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = process.env.PORT || 10000;
const MAX_BODY = 64 * 1024;
const AI_MAX_BODY = 6 * 1024 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 12;
const AI_MAX_REQUESTS = 8;
const buckets = new Map();
const aiBuckets = new Map();
const secureBuckets = new Map();
const secureConsumedLocal = new Map();
const SECURE_SECRET_MAX = 24 * 1024;
const SECURE_ADMIN_TTL_MS = 20 * 60 * 1000;

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
};

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  return (Array.isArray(xf) ? xf[0] : (xf || '')).split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}
function rateLimitedIn(map, req, max, namespace='') {
  const now = Date.now(), ip = namespace+'|'+clientIp(req);
  const b = map.get(ip);
  if (!b || now - b.start > WINDOW_MS) { map.set(ip, {start: now, count: 1}); return false; }
  b.count += 1;
  return b.count > max;
}
function rateLimited(req) { return rateLimitedIn(buckets, req, MAX_REQUESTS); }
function aiRateLimited(req) { return rateLimitedIn(aiBuckets, req, AI_MAX_REQUESTS); }
function secureRateLimited(req, max=8) { return rateLimitedIn(secureBuckets, req, max, String(req.url||'').split('?')[0]); }

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function safeEqual(a,b) {
  const aa=Buffer.from(String(a||'')), bb=Buffer.from(String(b||''));
  return aa.length===bb.length && aa.length>0 && crypto.timingSafeEqual(aa,bb);
}
function parseCookies(req) {
  const out={};
  for (const part of String(req.headers.cookie||'').split(';')) {
    const i=part.indexOf('=');
    if(i>0) out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function hasPreviewAccess(req,res,urlObj) {
  const expected=String(process.env.PREVIEW_TOKEN||'');
  if(!expected) return false;
  const supplied=urlObj.searchParams.get('preview');
  if(supplied && safeEqual(supplied,expected)) {
    res.setHeader('Set-Cookie',`lszh_preview=${encodeURIComponent(expected)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
    return true;
  }
  return safeEqual(parseCookies(req).lszh_preview,expected);
}
function send(res, code, body, type='application/json; charset=utf-8') {
  const headers={
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  };
  if(!res.hasHeader('Cache-Control')) {
    headers['Cache-Control']=type.startsWith('application/json') ? 'no-store' : 'public, max-age=300';
  }
  res.writeHead(code, headers);
  res.end(body);
}
function readJson(req, maxBytes=MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size=0, chunks=[], failed=false;
    req.on('data', c => {
      if (failed) return;
      size += c.length;
      if(size > maxBytes){
        failed=true;
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('bad_json')); }
    });
    req.on('error', reject);
  });
}
async function proxy(req, res, envName) {
  if (!sameOrigin(req)) return send(res, 403, JSON.stringify({error:'forbidden'}));
  if (rateLimited(req)) return send(res, 429, JSON.stringify({error:'rate_limited'}));
  const target = process.env[envName];
  if (!target) return send(res, 503, JSON.stringify({error:'not_configured'}));
  try {
    const payload = await readJson(req);
    if (payload.website) return send(res, 204, '');
    delete payload.website;
    const r = await fetch(target, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload), signal:AbortSignal.timeout(15000)});
    if (!r.ok) return send(res, 502, JSON.stringify({error:'upstream_failed'}));
    return send(res, 200, JSON.stringify({ok:true}));
  } catch (e) {
    if (e.message === 'too_large') return send(res, 413, JSON.stringify({error:'payload_too_large'}));
    if (e.message === 'bad_json') return send(res, 400, JSON.stringify({error:'invalid_json'}));
    return send(res, 502, JSON.stringify({error:'temporary_failure'}));
  }
}

function cleanJsonText(text='') {
  const trimmed=String(text).trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  const start=trimmed.indexOf('{'), end=trimmed.lastIndexOf('}');
  if(start<0 || end<start) throw new Error('bad_ai_json');
  return JSON.parse(trimmed.slice(start,end+1));
}
function outputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts=[];
  for (const item of (data?.output || [])) {
    for (const c of (item?.content || [])) if (c?.type === 'output_text' && c?.text) parts.push(c.text);
  }
  return parts.join('\n');
}
async function callMakeJson(target,payload,timeoutMs=35000) {
  if(!target) return null;
  const r=await fetch(target,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(timeoutMs)
  });
  const raw=await r.text();
  if(!r.ok) throw new Error('make_upstream_'+r.status);
  return cleanJsonText(raw);
}

async function callOpenAI(content, instructions) {
  const key=process.env.OPENAI_API_KEY;
  if(!key) return null;
  const payload={
    model: process.env.OPENAI_MODEL || 'gpt-6-luna',
    instructions,
    input:[{role:'user',content}],
    max_output_tokens:900
  };
  const r=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(payload),
    signal:AbortSignal.timeout(30000)
  });
  if(!r.ok) throw new Error('ai_upstream_'+r.status);
  const data=await r.json();
  return cleanJsonText(outputText(data));
}
function demoFallback(mode, text='') {
  const compact=String(text).replace(/\s+/g,' ').trim();
  if(mode==='email') return {
    type:'email',
    title:'Anfrage automatisch verstanden',
    summary: compact ? compact.slice(0,150) : 'Die Nachricht wird analysiert, strukturiert und dem richtigen nächsten Schritt zugeordnet.',
    fields:[
      {label:'Anliegen',value:'Kundenanfrage / Offerte'},
      {label:'Priorität',value:'Normal'},
      {label:'Nächster Schritt',value:'Erfassen, zuweisen, Antwort vorbereiten'}
    ],
    actions:['Kontakt im CRM prüfen oder anlegen','Aufgabe dem passenden Mitarbeiter zuweisen','Antwortentwurf erstellen','Follow-up automatisch vormerken'],
    note:'Demo-Modus: Die echte Live-KI wird vor der Veröffentlichung mit einem serverseitigen API-Zugang aktiviert.'
  };
  if(mode==='workflow') return {
    type:'workflow',
    title:'Ihr möglicher automatisierter Ablauf',
    summary:'Aus Ihrer Beschreibung lässt sich ein klarer, automatisierbarer Prozess ableiten.',
    steps:['Auslöser erkennen','Informationen mit KI strukturieren','Daten im Zielsystem prüfen','Aktion automatisch ausführen','Bestätigung & Follow-up'],
    note:'Demo-Modus: Die echte Live-KI wird vor der Veröffentlichung mit einem serverseitigen API-Zugang aktiviert.'
  };
  return {
    type:'task',
    title:'Hohes Automationspotenzial',
    summary:'Die Aufgabe enthält wiederkehrende Schritte, Datentransfer oder feste Entscheidungen und eignet sich daher wahrscheinlich gut für Automation.',
    score:88,
    complexity:'Niedrig bis mittel',
    savings:'Je nach Häufigkeit mehrere Stunden pro Monat möglich',
    steps:['Auslöser digital erfassen','Daten automatisch erkennen und strukturieren','Regeln oder KI-Entscheidung anwenden','Ergebnis ins bestehende System übertragen'],
    note:'Demo-Modus: Die echte Live-KI wird vor der Veröffentlichung mit einem serverseitigen API-Zugang aktiviert.'
  };
}
function promptFor(mode) {
  const base=`Du bist die Live-Demo von LSZH Automations für Schweizer KMU. Analysiere knapp, seriös und konkret. Keine übertriebenen Versprechen. Antworte ausschliesslich als gültiges JSON ohne Markdown.`;
  if(mode==='email') return base+` Schema: {"type":"email","title":"...","summary":"...","fields":[{"label":"...","value":"..."}],"actions":["..."],"reply":"kurzer professioneller Antwortentwurf"}. Extrahiere nur Informationen, die tatsächlich oder plausibel aus der Nachricht ableitbar sind; Unsicheres als "nicht angegeben" markieren.`;
  if(mode==='workflow') return base+` Schema: {"type":"workflow","title":"...","summary":"...","steps":["maximal 6 kurze Prozessschritte"],"systems":["mögliche beteiligte Systeme, nur wenn sinnvoll"],"benefit":"konkreter Nutzen"}. Erzeuge einen verständlichen Ablauf für Nicht-Techniker.`;
  return base+` Schema: {"type":"task","title":"...","summary":"...","score":Zahl 0-100,"complexity":"Niedrig|Mittel|Hoch","savings":"vorsichtige qualitative Einschätzung","steps":["maximal 5 kurze Schritte"],"questions":["maximal 3 Rückfragen"]}. Der Score bewertet Automatisierbarkeit, nicht Geschäftswert.`;
}
async function handleAiDemo(req,res){
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(aiRateLimited(req)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  try{
    const body=await readJson(req);
    const mode=['task','email','workflow'].includes(body.mode)?body.mode:'task';
    const text=String(body.text||'').trim().slice(0,6000);
    if(text.length<8) return send(res,400,JSON.stringify({error:'too_short'}));
    let result=null;
    if(process.env.MAKE_AI_TEXT_WEBHOOK) {
      result=await callMakeJson(process.env.MAKE_AI_TEXT_WEBHOOK,{mode,text});
    } else {
      result=await callOpenAI([{type:'input_text',text}],promptFor(mode));
    }
    if(!result) result=demoFallback(mode,text);
    return send(res,200,JSON.stringify({ok:true,result}));
  }catch(e){
    if(e.message==='too_large') return send(res,413,JSON.stringify({error:'payload_too_large'}));
    if(e.message==='bad_json') return send(res,400,JSON.stringify({error:'invalid_json'}));
    return send(res,502,JSON.stringify({error:'ai_temporary_failure'}));
  }
}
async function handleAiDocument(req,res){
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(aiRateLimited(req)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  try{
    const body=await readJson(req,AI_MAX_BODY);
    const name=String(body.name||'Dokument').slice(0,120);
    const type=String(body.type||'');
    const data=String(body.data||'');
    const allowed=['image/png','image/jpeg','application/pdf'];
    if(!allowed.includes(type) || !data.startsWith('data:')) return send(res,400,JSON.stringify({error:'unsupported_file'}));
    const base64=data.includes(',')?data.slice(data.indexOf(',')+1):'';
    if(!base64) return send(res,400,JSON.stringify({error:'invalid_file'}));

    const makeTarget=type==='application/pdf'
      ? process.env.MAKE_AI_PDF_WEBHOOK
      : process.env.MAKE_AI_IMAGE_WEBHOOK;

    let result=null;
    if(makeTarget) {
      result=await callMakeJson(makeTarget,{name,type,data:base64},45000);
    } else if(process.env.OPENAI_API_KEY) {
      const instructions=`Du bist die Dokument-Demo von LSZH Automations für Schweizer KMU. Extrahiere nur klar erkennbare Daten. Keine erfundenen Werte. Antworte ausschliesslich als gültiges JSON ohne Markdown im Schema {"type":"document","title":"...","summary":"...","fields":[{"label":"...","value":"..."}],"actions":["maximal 4 sinnvolle Automationsschritte"],"warning":"optional, falls etwas unklar ist"}.`;
      const filePart=type==='application/pdf'
        ? {type:'input_file',file_data:base64,filename:name}
        : {type:'input_image',image_url:data,detail:'auto'};
      result=await callOpenAI([{type:'input_text',text:'Analysiere dieses Geschäftsdokument und zeige, welche Daten automatisch weiterverarbeitet werden könnten.'},filePart],instructions);
    }

    if(!result) {
      result={
        type:'document',title:'Dokument erkannt',
        summary:'Die Live-Demo kann Rechnungen, Belege und ähnliche Geschäftsdokumente strukturiert auslesen.',
        fields:[{label:'Datei',value:name},{label:'Dokumenttyp',value:type==='application/pdf'?'PDF':'Bild'}],
        actions:['Daten prüfen','Buchhaltung/CRM automatisch befüllen','Dokument regelbasiert ablegen'],
        note:'Demo-Modus: Die Live-KI ist vorübergehend nicht verbunden.'
      };
    }
    return send(res,200,JSON.stringify({ok:true,result}));
  }catch(e){
    if(e.message==='too_large') return send(res,413,JSON.stringify({error:'payload_too_large'}));
    if(e.message==='bad_json') return send(res,400,JSON.stringify({error:'invalid_json'}));
    return send(res,502,JSON.stringify({error:'ai_temporary_failure'}));
  }
}


function secureConfigured() {
  return Boolean(
    process.env.SECURE_TRANSFER_KEY_B64URL &&
    process.env.SECURE_ADMIN_AUTH_KEY &&
    process.env.SECURE_ADMIN_EMAIL &&
    process.env.MAKE_SECURE_ADMIN_WEBHOOK &&
    process.env.MAKE_SECURE_PUBLIC_WEBHOOK
  );
}
function secureTransferKey() {
  const key=Buffer.from(String(process.env.SECURE_TRANSFER_KEY_B64URL||''),'base64url');
  if(key.length!==32) throw new Error('secure_key_invalid');
  return key;
}
function secureTokenHash(token) {
  return crypto.createHash('sha256').update(String(token),'utf8').digest('hex');
}
function validTransferToken(token) {
  return typeof token==='string' && token.length>=32 && token.length<=180 && /^[A-Za-z0-9_-]+$/.test(token);
}
function validTransferId(id) {
  return typeof id==='string' && id.length>=8 && id.length<=80 && /^[A-Z0-9_-]+$/i.test(id);
}
function encryptSecureValue(value, tokenHash) {
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',secureTransferKey(),iv);
  cipher.setAAD(Buffer.from(String(tokenHash),'utf8'));
  const ciphertext=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return {
    ciphertext:ciphertext.toString('base64url'),
    iv:iv.toString('base64url'),
    auth_tag:cipher.getAuthTag().toString('base64url')
  };
}
function decryptSecureValue(payload) {
  const decipher=crypto.createDecipheriv(
    'aes-256-gcm',
    secureTransferKey(),
    Buffer.from(String(payload.iv||''),'base64url')
  );
  decipher.setAAD(Buffer.from(String(payload.token_hash||''),'utf8'));
  decipher.setAuthTag(Buffer.from(String(payload.auth_tag||''),'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(String(payload.ciphertext||''),'base64url')),
    decipher.final()
  ]).toString('utf8');
}
function createSecureAdminToken() {
  const body=Buffer.from(JSON.stringify({
    sub:String(process.env.SECURE_ADMIN_EMAIL||'').toLowerCase(),
    exp:Date.now()+SECURE_ADMIN_TTL_MS,
    nonce:crypto.randomBytes(12).toString('base64url')
  })).toString('base64url');
  const sig=crypto.createHmac('sha256',String(process.env.SECURE_ADMIN_AUTH_KEY||''))
    .update(body).digest('base64url');
  return body+'.'+sig;
}
function verifySecureAdminToken(token) {
  try {
    const parts=String(token||'').split('.');
    if(parts.length!==2) return false;
    const expected=crypto.createHmac('sha256',String(process.env.SECURE_ADMIN_AUTH_KEY||''))
      .update(parts[0]).digest('base64url');
    if(!safeEqual(parts[1],expected)) return false;
    const data=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
    return data &&
      String(data.sub||'').toLowerCase()===String(process.env.SECURE_ADMIN_EMAIL||'').toLowerCase() &&
      Number(data.exp)>Date.now() &&
      Number(data.exp)<Date.now()+(SECURE_ADMIN_TTL_MS+60*1000);
  } catch { return false; }
}
function secureAdminAuthorized(req) {
  return verifySecureAdminToken(req.headers['x-lszh-admin-token']);
}
function sleep(ms){ return new Promise(resolve=>setTimeout(resolve,ms)); }
async function callSecureMake(envName,payload,{expectJson=false,retries=0}={}) {
  const target=process.env[envName];
  if(!target) throw new Error('secure_not_configured');
  let last='';
  for(let attempt=0;attempt<=retries;attempt++){
    const r=await fetch(target,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload),
      signal:AbortSignal.timeout(15000)
    });
    last=await r.text();
    if(!r.ok) throw new Error('secure_upstream_'+r.status);
    if(!expectJson) {
      try { return cleanJsonText(last); } catch { return {accepted:true}; }
    }
    try { return cleanJsonText(last); } catch {}
    if(attempt<retries) await sleep(250*(attempt+1));
  }
  throw new Error('secure_upstream_not_ready');
}
function secureRecords(data) {
  if(Array.isArray(data?.records)) return data.records;
  if(Array.isArray(data?.body?.records)) return data.body.records;
  return [];
}
async function secureStatusByHash(tokenHash,retries=2) {
  const data=await callSecureMake('MAKE_SECURE_PUBLIC_WEBHOOK',
    {action:'status',token_hash:tokenHash},{expectJson:true,retries});
  return secureRecords(data)[0] || null;
}
function secureField(record,name) {
  return record?.fields?.[name] ?? record?.cellValuesByFieldId?.[name] ?? null;
}
async function handleSecureAdminLogin(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(secureRateLimited(req,3)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  if(!secureConfigured()) return send(res,503,JSON.stringify({error:'not_configured'}));
  try {
    const token=createSecureAdminToken();
    const base='https://www.lszh-automations.ch/secure-admin/#'+token;
    await callSecureMake('MAKE_SECURE_ADMIN_WEBHOOK',{
      action:'login_email',
      email:String(process.env.SECURE_ADMIN_EMAIL),
      link:base
    });
    return send(res,200,JSON.stringify({ok:true}));
  } catch {
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}
async function handleSecureAdminCreate(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(!secureAdminAuthorized(req)) return send(res,401,JSON.stringify({error:'unauthorized'}));
  if(secureRateLimited(req,10)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  if(!secureConfigured()) return send(res,503,JSON.stringify({error:'not_configured'}));
  try { secureTransferKey(); }
  catch { return send(res,503,JSON.stringify({error:'invalid_encryption_key'})); }
  try {
    const body=await readJson(req);
    const company=String(body.company||'').trim().slice(0,160);
    const system=String(body.system||'').trim().slice(0,120);
    const email=String(body.email||'').trim().slice(0,180);
    const note=String(body.note||'').trim().slice(0,1200);
    const ttl=Math.min(72,Math.max(1,Number(body.ttl_hours)||24));
    if(!company || !system || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return send(res,400,JSON.stringify({error:'invalid_fields'}));

    const rawToken=crypto.randomBytes(32).toString('base64url');
    const tokenHash=secureTokenHash(rawToken);
    const transferId='ST-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
    const expiresAt=new Date(Date.now()+ttl*60*60*1000).toISOString();

    await callSecureMake('MAKE_SECURE_ADMIN_WEBHOOK',{
      action:'create',
      transfer_id:transferId,
      company,system,email,
      token_hash:tokenHash,
      expires_at:expiresAt,
      note
    });

    // The Make webhook may acknowledge before its Airtable write is visible.
    // A short read-only poll makes the generated link less likely to be opened too early.
    let ready=false;
    for(let i=0;i<4;i++){
      try {
        const r=await secureStatusByHash(tokenHash,1);
        if(r){ ready=true; break; }
      } catch {}
      await sleep(250*(i+1));
    }

    return send(res,200,JSON.stringify({
      ok:true,
      transfer_id:transferId,
      expires_at:expiresAt,
      ready,
      link:'https://www.lszh-automations.ch/secure/#'+rawToken
    }));
  } catch(e) {
    const code=String(e?.message||'unknown');
    // Only log coarse failure categories. Never log customer data, tokens or secret values.
    console.error('[secure-transfer-create]', /^secure_upstream_\d{3}$/.test(code) ? code : (e?.name==='TimeoutError' ? 'timeout' : 'server_or_network_error'));
    if(code==='too_large') return send(res,413,JSON.stringify({error:'payload_too_large'}));
    if(code==='bad_json') return send(res,400,JSON.stringify({error:'invalid_json'}));
    const upstream=/^secure_upstream_(\d{3})$/.exec(code);
    if(upstream) return send(res,502,JSON.stringify({error:'make_gateway_failed',upstream_status:Number(upstream[1])}));
    if(code==='secure_not_configured') return send(res,503,JSON.stringify({error:'not_configured'}));
    if(code==='secure_upstream_not_ready') return send(res,502,JSON.stringify({error:'make_invalid_response'}));
    if(e?.name==='TimeoutError'||e?.name==='AbortError') return send(res,504,JSON.stringify({error:'make_timeout'}));
    if(code==='fetch failed') return send(res,502,JSON.stringify({error:'make_unreachable'}));
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}
async function handleSecureAdminList(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(!secureAdminAuthorized(req)) return send(res,401,JSON.stringify({error:'unauthorized'}));
  try {
    const data=await callSecureMake('MAKE_SECURE_ADMIN_WEBHOOK',{action:'list'},{expectJson:true,retries:3});
    const records=secureRecords(data).map(r=>{
      const f=r.fields||{};
      const expires=f['Läuft ab']||null;
      let status=f.Status||'';
      if(status==='Offen' && expires && new Date(expires).getTime()<=Date.now()) status='Abgelaufen';
      return {
        transfer_id:f['Transfer-ID']||'',
        company:f.Firma||'',
        system:f.System||'',
        email:f['E-Mail']||'',
        status,
        expires_at:expires,
        created_at:f['Erstellt am']||null,
        submitted_at:f['Übermittelt am']||null,
        retrieved_at:f['Abgerufen am']||null,
        note:f.Hinweis||''
      };
    });
    return send(res,200,JSON.stringify({ok:true,records}));
  } catch {
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}
async function handleSecureAdminRetrieve(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(!secureAdminAuthorized(req)) return send(res,401,JSON.stringify({error:'unauthorized'}));
  if(secureRateLimited(req,10)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  try {
    const body=await readJson(req);
    const transferId=String(body.transfer_id||'').trim();
    if(!validTransferId(transferId)) return send(res,400,JSON.stringify({error:'invalid_transfer'}));
    const localUntil=secureConsumedLocal.get(transferId)||0;
    if(localUntil>Date.now()) return send(res,410,JSON.stringify({error:'already_retrieved'}));

    const data=await callSecureMake('MAKE_SECURE_ADMIN_WEBHOOK',
      {action:'retrieve',transfer_id:transferId},{expectJson:true,retries:3});
    if(!data?.ciphertext || !data?.iv || !data?.auth_tag || !data?.token_hash)
      return send(res,404,JSON.stringify({error:'not_available'}));

    const secret=decryptSecureValue(data);
    secureConsumedLocal.set(transferId,Date.now()+15*60*1000);

    // Delete the encrypted payload immediately after a successful decrypt.
    // This call carries metadata only; plaintext never leaves this server.
    await callSecureMake('MAKE_SECURE_ADMIN_WEBHOOK',{action:'consume',transfer_id:transferId});

    return send(res,200,JSON.stringify({ok:true,transfer_id:transferId,secret}));
  } catch(e) {
    if(e.message==='bad_json') return send(res,400,JSON.stringify({error:'invalid_json'}));
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}
async function handleSecureAdminRevoke(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(!secureAdminAuthorized(req)) return send(res,401,JSON.stringify({error:'unauthorized'}));
  try {
    const body=await readJson(req);
    const transferId=String(body.transfer_id||'').trim();
    if(!validTransferId(transferId)) return send(res,400,JSON.stringify({error:'invalid_transfer'}));
    await callSecureMake('MAKE_SECURE_ADMIN_WEBHOOK',{action:'revoke',transfer_id:transferId});
    return send(res,200,JSON.stringify({ok:true}));
  } catch {
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}
async function handleSecureStatus(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(secureRateLimited(req,12)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  try {
    const body=await readJson(req);
    const token=String(body.token||'');
    if(!validTransferToken(token)) return send(res,404,JSON.stringify({error:'invalid_or_expired'}));
    const record=await secureStatusByHash(secureTokenHash(token),3);
    if(!record) return send(res,404,JSON.stringify({error:'invalid_or_expired'}));
    const f=record.fields||{};
    return send(res,200,JSON.stringify({
      ok:true,
      transfer_id:f['Transfer-ID']||'',
      company:f.Firma||'',
      system:f.System||'',
      expires_at:f['Läuft ab']||null
    }));
  } catch {
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}
async function handleSecureSubmit(req,res) {
  if(!sameOrigin(req)) return send(res,403,JSON.stringify({error:'forbidden'}));
  if(secureRateLimited(req,6)) return send(res,429,JSON.stringify({error:'rate_limited'}));
  try {
    const body=await readJson(req,SECURE_SECRET_MAX+8192);
    const token=String(body.token||'');
    let secret=String(body.secret||'');
    if(!validTransferToken(token)) return send(res,404,JSON.stringify({error:'invalid_or_expired'}));
    if(!secret || Buffer.byteLength(secret,'utf8')>SECURE_SECRET_MAX)
      return send(res,400,JSON.stringify({error:'invalid_secret'}));

    const tokenHash=secureTokenHash(token);
    const record=await secureStatusByHash(tokenHash,3);
    if(!record) return send(res,404,JSON.stringify({error:'invalid_or_expired'}));

    const encrypted=encryptSecureValue(secret,tokenHash);
    secret='';
    body.secret='';

    await callSecureMake('MAKE_SECURE_PUBLIC_WEBHOOK',{
      action:'submit',
      token_hash:tokenHash,
      ciphertext:encrypted.ciphertext,
      iv:encrypted.iv,
      auth_tag:encrypted.auth_tag,
      submitted_at:new Date().toISOString()
    });

    return send(res,200,JSON.stringify({ok:true}));
  } catch(e) {
    if(e.message==='too_large') return send(res,413,JSON.stringify({error:'payload_too_large'}));
    if(e.message==='bad_json') return send(res,400,JSON.stringify({error:'invalid_json'}));
    return send(res,502,JSON.stringify({error:'temporary_failure'}));
  }
}

function staticFile(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { return send(res,400,'Bad request','text/plain'); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/onboarding' || pathname === '/onboarding/') pathname = '/onboarding/index.html';
  if (pathname === '/secure' || pathname === '/secure/') pathname = '/secure/index.html';
  if (pathname === '/secure-admin' || pathname === '/secure-admin/') pathname = '/secure-admin/index.html';
  if (pathname.startsWith('/secure/')) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  }
  if (pathname.startsWith('/secure-admin/')) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  }
  let file = path.normalize(path.join(ROOT, pathname));
  if (!file.startsWith(ROOT)) return send(res,403,'Forbidden','text/plain');
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) file = path.join(file,'index.html');
    fs.readFile(file, (e, data) => {
      if (e) return send(res,404,'Not found','text/plain');
      send(res,200,data,mime[path.extname(file).toLowerCase()] || 'application/octet-stream');
    });
  });
}
const server=http.createServer(async (req,res)=>{
  let urlObj;
  try { urlObj=new URL(req.url,'http://local'); }
  catch { return send(res,400,'Bad request','text/plain; charset=utf-8'); }
  const pathname=urlObj.pathname;
  const sitePrivate=String(process.env.SITE_PRIVATE || '').toLowerCase()==='true';

  if(sitePrivate) {
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Cache-Control','no-store');
    if(!hasPreviewAccess(req,res,urlObj)) {
      return send(res,503,'LSZH Automations ist vorübergehend nicht öffentlich verfügbar.','text/plain; charset=utf-8');
    }
  }

  if (req.method==='POST' && pathname==='/api/lead') return proxy(req,res,'MAKE_LEAD_WEBHOOK');
  if (req.method==='POST' && pathname==='/api/onboarding') return proxy(req,res,'MAKE_ONBOARDING_WEBHOOK');
  if (req.method==='POST' && pathname==='/api/ai-demo') return handleAiDemo(req,res);
  if (req.method==='POST' && pathname==='/api/ai-document') return handleAiDocument(req,res);
  if (req.method==='POST' && pathname==='/api/secure/status') return handleSecureStatus(req,res);
  if (req.method==='POST' && pathname==='/api/secure/submit') return handleSecureSubmit(req,res);
  if (req.method==='POST' && pathname==='/api/secure/admin/request-login') return handleSecureAdminLogin(req,res);
  if (req.method==='POST' && pathname==='/api/secure/admin/create') return handleSecureAdminCreate(req,res);
  if (req.method==='POST' && pathname==='/api/secure/admin/list') return handleSecureAdminList(req,res);
  if (req.method==='POST' && pathname==='/api/secure/admin/retrieve') return handleSecureAdminRetrieve(req,res);
  if (req.method==='POST' && pathname==='/api/secure/admin/revoke') return handleSecureAdminRevoke(req,res);
  if (req.method==='GET' || req.method==='HEAD') return staticFile(req,res);
  return send(res,405,JSON.stringify({error:'method_not_allowed'}));
});
server.listen(PORT, ()=>console.log(`LSZH Automations listening on ${PORT}`));
