const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 10000;
const MAX_BODY = 64 * 1024;
const AI_MAX_BODY = 6 * 1024 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 12;
const AI_MAX_REQUESTS = 8;
const buckets = new Map();
const aiBuckets = new Map();

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
function rateLimitedIn(map, req, max) {
  const now = Date.now(), ip = clientIp(req);
  const b = map.get(ip);
  if (!b || now - b.start > WINDOW_MS) { map.set(ip, {start: now, count: 1}); return false; }
  b.count += 1;
  return b.count > max;
}
function rateLimited(req) { return rateLimitedIn(buckets, req, MAX_REQUESTS); }
function aiRateLimited(req) { return rateLimitedIn(aiBuckets, req, AI_MAX_REQUESTS); }

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function send(res, code, body, type='application/json; charset=utf-8') {
  res.writeHead(code, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cache-Control': type.startsWith('application/json') ? 'no-store' : 'public, max-age=300'
  });
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
    let result=await callOpenAI([{type:'input_text',text}],promptFor(mode));
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
    if(!process.env.OPENAI_API_KEY){
      return send(res,200,JSON.stringify({ok:true,result:{
        type:'document',title:'Dokument erkannt',summary:'Die Live-Demo kann Rechnungen, Belege und ähnliche Geschäftsdokumente strukturiert auslesen.',
        fields:[
          {label:'Datei',value:name},{label:'Dokumenttyp',value:type==='application/pdf'?'PDF':'Bild'},
          {label:'Mögliche Extraktion',value:'Firma, Datum, Betrag, Referenz, Fälligkeit und weitere Felder'}
        ],
        actions:['Daten prüfen','Buchhaltung/CRM automatisch befüllen','Dokument regelbasiert ablegen'],
        note:'Demo-Modus: Für die echte Dokumentanalyse wird vor der Veröffentlichung ein serverseitiger KI-Zugang aktiviert.'
      }}));
    }
    const instructions=`Du bist die Dokument-Demo von LSZH Automations für Schweizer KMU. Extrahiere nur klar erkennbare Daten. Keine erfundenen Werte. Antworte ausschliesslich als gültiges JSON ohne Markdown im Schema {"type":"document","title":"...","summary":"...","fields":[{"label":"...","value":"..."}],"actions":["maximal 4 sinnvolle Automationsschritte"],"warning":"optional, falls etwas unklar ist"}.`;
    const filePart=type==='application/pdf'
      ? {type:'input_file',file_data:data.split(',')[1],filename:name}
      : {type:'input_image',image_url:data,detail:'auto'};
    const content=[{type:'input_text',text:'Analysiere dieses Geschäftsdokument und zeige, welche Daten automatisch weiterverarbeitet werden könnten.'},filePart];
    const result=await callOpenAI(content,instructions);
    return send(res,200,JSON.stringify({ok:true,result}));
  }catch(e){
    if(e.message==='too_large') return send(res,413,JSON.stringify({error:'payload_too_large'}));
    if(e.message==='bad_json') return send(res,400,JSON.stringify({error:'invalid_json'}));
    return send(res,502,JSON.stringify({error:'ai_temporary_failure'}));
  }
}

function staticFile(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); } catch { return send(res,400,'Bad request','text/plain'); }
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/onboarding' || pathname === '/onboarding/') pathname = '/onboarding/index.html';
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
  if (String(process.env.SITE_PRIVATE || '').toLowerCase() === 'true') {
    return send(res, 503, 'LSZH Automations ist vorübergehend nicht öffentlich verfügbar.', 'text/plain; charset=utf-8');
  }
  if (req.method==='POST' && req.url==='/api/lead') return proxy(req,res,'MAKE_LEAD_WEBHOOK');
  if (req.method==='POST' && req.url==='/api/onboarding') return proxy(req,res,'MAKE_ONBOARDING_WEBHOOK');
  if (req.method==='POST' && req.url==='/api/ai-demo') return handleAiDemo(req,res);
  if (req.method==='POST' && req.url==='/api/ai-document') return handleAiDocument(req,res);
  if (req.method==='GET' || req.method==='HEAD') return staticFile(req,res);
  return send(res,405,JSON.stringify({error:'method_not_allowed'}));
});
server.listen(PORT, ()=>console.log(`LSZH Automations listening on ${PORT}`));
