'use strict';
// Isolated STAGING only. Production gateway NEVER reads CRM/Drive/Firestore,
// never accepts offers. Its optional localhost harness hook is only usable
// with explicit NODE_ENV=test, no Cloud Run identity and loopback HTTP.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {URL}=require('node:url');
const {PROBE_PATH,isReadProbeRuntime}=require('./stagingReadProbe');

const DOC_PATH=path.resolve(__dirname,'../../offerte-annehmen/index.html');
const BLOCKED_PATHS=new Set(['/api/offer/preview','/api/offer/document','/api/offer/accept']);
function headerHashes(html,tag){
  const re=new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','gi');
  return [...html.matchAll(re)].map(m=>"'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
}
function csp(html){
  const scripts=headerHashes(html,'script');
  const styles=headerHashes(html,'style');
  return ["default-src 'none'","base-uri 'none'","object-src 'none'","frame-ancestors 'none'",
    "form-action 'self'","connect-src 'self'","img-src 'self' data:",
    'script-src '+(scripts.length?scripts.join(' '):"'none'"),
    'style-src '+(styles.length?styles.join(' '):"'none'")].join('; ');
}
function commonHeaders(html){
  return {'Cache-Control':'no-store, max-age=0',Pragma:'no-cache',
    'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
    'X-Robots-Tag':'noindex, nofollow, noarchive','X-Frame-Options':'DENY',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Content-Security-Policy':csp(html)};
}
function write(res,status,content,type,headers){
  const body=Buffer.isBuffer(content)?content:Buffer.from(String(content));
  res.writeHead(status,{...headers,'Content-Type':type,'Content-Length':String(body.length)});
  res.end(body);
}
function json(res,status,data,headers){
  write(res,status,JSON.stringify(data),'application/json; charset=utf-8',headers);
}
function isLoopbackSocket(req){
  const local=String(req.socket?.localAddress||'');
  const remote=String(req.socket?.remoteAddress||'');
  const ok=x=>x==='127.0.0.1'||x==='::1'||x==='::ffff:127.0.0.1';
  return ok(local)&&ok(remote);
}
function createGateway({htmlPath=DOC_PATH,localFixtureClaim=null,stagingReadProbe=null}={}){
  // Loading locally is the only IO performed; no Firestore SDK initialization.
  const htmlPromise=fs.readFile(htmlPath,'utf8');
  const server=http.createServer(async(req,res)=>{
    try{
      const html=await htmlPromise;
      const headers=commonHeaders(html);
      const u=new URL(req.url||'/', 'http://staging.invalid');
      const pathname=u.pathname;
      // Bearer links MUST use #code=... (fragment never sent in HTTP).
      // Reject old query-shaped links without repeating tokens in responses.
      if(u.searchParams.has('code'))
        return json(res,400,{ok:false,error:'fragment_link_required'},headers);
      // Test-only integration seam. The deployed entrypoint never injects it.
      // Explicitly fail closed on Cloud Run, production Node and non-loopback peers.
      if(pathname==='/__local_fixture/claim'){
        if(process.env.NODE_ENV!=='test'||process.env.K_SERVICE||
          typeof localFixtureClaim!=='function'||!isLoopbackSocket(req))
          return json(res,404,{ok:false,error:'not_found'},headers);
        if(req.method!=='POST')return json(res,405,{ok:false,error:'method_not_allowed'},
          {...headers,Allow:'POST'});
        return await localFixtureClaim(req,res,{json,headers});
      }
      // Internal and opt-in: a fixed read-only Firestore SDK probe.
      // Cloud Run IAM/ingress must also deny unauthenticated callers.
      // A missing flag/service/revision/injected reader fails closed.
      if(pathname===PROBE_PATH){
        if(!isReadProbeRuntime(process.env)||
           typeof stagingReadProbe!=='function')
          return json(res,404,{ok:false,error:'not_found'},headers);
        if(req.method!=='GET')return json(res,405,{ok:false,error:'method_not_allowed'},
          {...headers,Allow:'GET'});
        if(u.searchParams.size!==0)return json(res,400,
          {ok:false,error:'query_not_supported'},headers);
        // Only two booleans escape; never return a record, path, ID or exception.
        const result=await stagingReadProbe();
        if(result?.reachable!==true||typeof result.fixtureExists!=='boolean')
          return json(res,503,{ok:false,error:'staging_unavailable'},headers);
        return json(res,200,{ok:true,mode:'staging_firestore_read_only',
          reachable:true,fixture_exists:result.fixtureExists,
          acceptanceEnabled:false,writeEnabled:false},headers);
      }
      if(pathname==='/healthz'){
        if(req.method!=='GET')return json(res,405,{ok:false,error:'method_not_allowed'},
          {...headers,Allow:'GET'});
        return json(res,200,{ok:true,mode:'staging',acceptanceEnabled:false},headers);
      }
      if(pathname==='/offerte-annehmen/'||pathname==='/offerte-annehmen'){
        if(req.method!=='GET')return json(res,405,{ok:false,error:'method_not_allowed'},
          {...headers,Allow:'GET'});
        return write(res,200,html,'text/html; charset=utf-8',headers);
      }
      if(BLOCKED_PATHS.has(pathname)){
        if(req.method!=='POST')return json(res,405,{ok:false,error:'method_not_allowed'},
          {...headers,Allow:'POST'});
        // Permanent draft gate; no runtime env switch can enable acceptance.
        return json(res,503,{ok:false,error:'not_available'},headers);
      }
      return json(res,404,{ok:false,error:'not_found'},headers);
    }catch{
      // Don't return source paths, tokens, exception messages or stack traces.
      return json(res,503,{ok:false,error:'staging_unavailable'},
        {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    }
  });
  return server;
}
module.exports={createGateway,csp};
