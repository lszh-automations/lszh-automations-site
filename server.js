const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 10000;
const MAX_BODY = 64 * 1024;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 12;
const buckets = new Map();

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
function rateLimited(req) {
  const now = Date.now(), ip = clientIp(req);
  const b = buckets.get(ip);
  if (!b || now - b.start > WINDOW_MS) { buckets.set(ip, {start: now, count: 1}); return false; }
  b.count += 1; return b.count > MAX_REQUESTS;
}
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
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
  });
  res.end(body);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size=0, chunks=[];
    req.on('data', c => { size += c.length; if(size > MAX_BODY){ reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad_json')); } });
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
  if (req.method==='GET' || req.method==='HEAD') return staticFile(req,res);
  return send(res,405,JSON.stringify({error:'method_not_allowed'}));
});
server.listen(PORT, ()=>console.log(`LSZH Automations listening on ${PORT}`));
