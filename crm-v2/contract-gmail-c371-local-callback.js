'use strict';
// Fixed loopback-only browser consent callback, not a deployable HTTP service.
const {createServer}=require('node:http');
const {HOST,PORT,CALLBACK,parseOAuthCallbackParameters}=
  require('./contract-gmail-c36-local-oauth');
function startC371LocalCallback({session,onDone}={}){
  if(!session||typeof session.authUrl!=='string'||
     typeof session.complete!=='function'||typeof onDone!=='function')
    throw Error('C3.7.1 invalid local callback setup');
  let completed=false;
  const server=createServer(async(req,res)=>{
    const reply=(status,value,type='text/plain; charset=utf-8')=>{
      res.writeHead(status,{
        'Content-Type':type,'Cache-Control':'no-store, max-age=0',
        'Referrer-Policy':'no-referrer',
        'Content-Security-Policy':
          "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'X-Content-Type-Options':'nosniff'
      });
      res.end(value);
    };
    if(req.method!=='GET'||req.headers.host!==HOST+':'+PORT||
       typeof req.url!=='string'||req.url.length>3500){
      reply(400,'Ungueltige lokale Anfrage.');return;
    }
    const url=new URL(req.url,'http://'+HOST+':'+PORT);
    if(url.pathname==='/'&&url.search===''){
      const link=session.authUrl.replace(/&/g,'&amp;')
        .replace(/"/g,'&quot;');
      reply(200,'<!doctype html><html lang="de"><meta charset="utf-8">'+
        '<title>LSZH C3.7.1 nur lesen</title>'+
        '<h1>LSZH Gmail – dauerhafte Leseberechtigung</h1>'+
        '<p>Nach ausdruecklicher Google-Einwilligung wird ein Lese-Refresh-Token '+
        'nur in das dedizierte Google Secret Manager Secret uebertragen. '+
        'Es werden keine Nachrichten gesendet.</p>'+
        '<a rel="noreferrer" href="'+link+'">Mit Google fortfahren</a></html>',
        'text/html; charset=utf-8');
      return;
    }
    if(url.pathname!==CALLBACK||completed){
      reply(404,'Nicht verfuegbar.');return;
    }
    completed=true;
    try{
      const result=await session.complete(
        parseOAuthCallbackParameters(url.searchParams)
      );
      reply(200,'LSZH C3.7.1 PASS: Readonly-Konto verifiziert, '+
        'Secret-Version gespeichert. Kein Versand.');
      onDone(null,result);
    }catch(e){
      const code=/^[A-Z_]{5,40}$/.test(e?.safeCode||'')?
        e.safeCode:/^[A-Z_]{5,40}$/.test(e?.c36SafeCode||'')?
        e.c36SafeCode:'OAUTH_CHECK_FAILED';
      reply(400,'LSZH C3.7.1 BLOCKED: '+code+'. Kein Versand.');
      const safe=new Error('C3.7.1 blocked');
      safe.safeCode=code;
      onDone(safe);
    }finally{server.close()}
  });
  server.listen(PORT,HOST);
  return server;
}
module.exports={startC371LocalCallback};
