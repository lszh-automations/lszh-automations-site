'use strict';
// Isolated STAGING only. This gateway NEVER reads CRM/Drive/Firestore and NEVER
// accepts offers. No production routes, secrets, API keys or write adapters.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {URL}=require('node:url');

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
function createGateway({htmlPath=DOC_PATH}={}){
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
