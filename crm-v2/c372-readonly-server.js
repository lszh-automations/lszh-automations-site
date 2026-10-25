'use strict';
// C3.7.2: DEDICATED PRIVATE Cloud Run reader, NEVER a CRM route.
// Only checks the already approved business mailbox. No messages, PDF,
// customer identifiers, Firestore, Make, Gmail SEND or secret output.
const http=require('node:http');
const {createC37MountedSecretBackend,requireIsolatedStaging}=
  require('./contract-gmail-c37-backend-staging');

const SERVICE='lszh-crm-v2-c37-readonly-staging';
const CHECK='/internal/gmail-readonly-check';
const HEALTH='/healthz';
const SAFE_HEADERS=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
  'X-Frame-Options':'DENY'
});
function createC372Handler({runtime=process.env,backend}={}){
  requireIsolatedStaging(runtime);
  if(!backend||typeof backend.inspectAuthorisedMailbox!=='function')
    throw Error('C3.7.2 read-only staging backend unavailable');
  let pending=false;
  return async function handler(req,res){
    const write=(status,data)=>{
      res.writeHead(status,SAFE_HEADERS);
      res.end(JSON.stringify(data));
    };
    if(!req||!res||typeof req.url!=='string'||req.url.length>128||
       req.url.includes('?')||req.url.includes('#')||
       (req.headers?.['content-length']!==undefined&&
        req.headers['content-length']!=='0')||
       req.headers?.['transfer-encoding']!==undefined){
      return write(404,{status:'NOT_FOUND'});
    }
    if(req.method==='GET'&&req.url===HEALTH){
      // No secrets read during Cloud Run startup, probe, or health check.
      return write(200,{status:'STAGING_READY',readPerformed:false});
    }
    if(req.method!=='POST'||req.url!==CHECK)
      return write(404,{status:'NOT_FOUND'});
    if(pending)return write(429,{status:'BLOCKED'});
    pending=true;
    try{
      const checked=await backend.inspectAuthorisedMailbox();
      if(checked?.verified!==true||
         checked.status!=='READONLY_MAILBOX_VERIFIED')
        return write(503,{status:'BLOCKED'});
      return write(200,{
        status:'READONLY_MAILBOX_VERIFIED',verified:true,
        mailSent:false,messageRead:false
      });
    }catch{
      return write(503,{status:'BLOCKED'});
    }finally{pending=false}
  };
}
function createC372Server({runtime=process.env,backend}={}){
  requireIsolatedStaging(runtime);
  const trusted=backend||createC37MountedSecretBackend({runtime});
  const handler=createC372Handler({runtime,backend:trusted});
  return http.createServer((req,res)=>{void handler(req,res).catch(()=>{
    if(!res.headersSent){
      res.writeHead(503,SAFE_HEADERS);
      res.end('{"status":"BLOCKED"}');
    }else res.destroy();
  })});
}
function main(){
  requireIsolatedStaging(process.env);
  const port=Number(process.env.PORT);
  if(!Number.isSafeInteger(port)||port<1024||port>65535)
    throw Error('C3.7.2 restricted Cloud Run port required');
  const server=createC372Server();
  server.listen(port,'0.0.0.0');
  server.on('error',()=>{process.exitCode=1});
  return server;
}
if(require.main===module){
  try{main()}catch{process.stderr.write('C3.7.2 BLOCKED: staging configuration unavailable.\n');process.exitCode=1;}
}
module.exports={SERVICE,CHECK,HEALTH,createC372Handler,createC372Server,main};
