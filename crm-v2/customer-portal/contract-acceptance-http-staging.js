'use strict';
const fs=require('node:fs');const path=require('node:path');
const {fault}=require('./contract-acceptance-staging');
const HEADERS=Object.freeze({'Cache-Control':'no-store','Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});
function createAcceptanceHandler({service,origin,demoSession,login,customerMode=false,realLogin=false}={}){
  const trusted=new URL(origin);
  if(trusted.origin!==origin||trusted.protocol!=='https:'&&
    !(trusted.protocol==='http:'&&trusted.hostname==='127.0.0.1'))throw fault('INVALID_ORIGIN',503);
  if(!service)throw fault('BACKEND_NOT_CONFIGURED',503);
  const staticFiles={
    '/':['contract-acceptance.html','text/html; charset=utf-8'],
    '/acceptance.js':['contract-acceptance.js','text/javascript; charset=utf-8'],
    '/acceptance.css':['contract-acceptance.css','text/css; charset=utf-8']};
  const reply=(res,status,body,type='application/json; charset=utf-8',extra={})=>{
    res.writeHead(status,{...HEADERS,'Content-Type':type,...extra});
    res.end(type.startsWith('application/json')?JSON.stringify(body):body);
  };
  return async(req,res)=>{
    try{
      const url=new URL(req.url,origin);
      // Capability tokens are never accepted in paths or query strings.
      if(url.search)throw fault('INVALID_REQUEST');
      if(req.headers.host!==trusted.host)throw fault('ORIGIN_REJECTED',403);
      if(req.method==='GET'&&staticFiles[url.pathname]){
        const [file,type]=staticFiles[url.pathname];
        let bytes=fs.readFileSync(path.join(__dirname,'acceptance-public',file));
        if(realLogin&&file.endsWith('.html'))bytes=Buffer.from(bytes.toString('utf8').replace('Die Anmeldung ist in dieser lokalen Vorschau simuliert.','Die Anmeldung erfolgt mit einem echten E-Mail-Code; der Nachweis wird dauerhaft gespeichert.'));
        if(customerMode&&file.endsWith('.html'))bytes=Buffer.from(bytes.toString('utf8')
          .replace('INTERNE TESTVORSCHAU','KUNDENPORTAL')
          .replace(/<div class="notice">.*?<\/div>/s,'')
          .replace('Test-Annahme protokollieren','Annahme protokollieren')
          .replace('Ihre Test-Annahme ist erfasst.','Ihre Annahme ist erfasst.')
          .replace('Dieser Test löst keinen Auftrag, keine E-Mail und keine Zahlung aus.','Die schriftliche Auftragsbestätigung von LSZH folgt gesondert.'));
        return reply(res,200,bytes,type);
      }
      if(req.method==='GET'&&url.pathname==='/api/demo-session'&&demoSession&&trusted.hostname==='127.0.0.1')
        return reply(res,200,await demoSession());
      const token=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization||'')?.[1];
      if(!token)throw fault('LINK_INVALID',404);
      if(req.method==='POST'&&['/api/login/request','/api/login/verify'].includes(url.pathname)&&login){
        if(req.headers.origin!==origin)throw fault('ORIGIN_REJECTED',403);
        if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))throw fault('INVALID_CONTENT_TYPE',415);
        const parts=[];let size=0;
        for await(const part of req){size+=part.length;if(size>1024)throw fault('REQUEST_TOO_LARGE',413);parts.push(part);}
        let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw fault('INVALID_REQUEST');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw fault('INVALID_REQUEST');
        if(url.pathname.endsWith('/request')){
          if(Object.keys(body).length)throw fault('INVALID_REQUEST');
          return reply(res,200,await login.request(token));
        }
        if(Object.keys(body).some(k=>!['challengeId','code'].includes(k)))throw fault('INVALID_REQUEST');
        const result=await login.verify(token,body);
        return reply(res,200,{expiresInSeconds:result.expiresInSeconds},'application/json; charset=utf-8',{'Set-Cookie':'__Host-lszh_customer='+result.session+'; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=900'});
      }
      if(req.method==='GET'&&url.pathname==='/api/acceptance')
        return reply(res,200,await service.preview(token,req));
      const kind=/^\/api\/documents\/(offer|terms|avv)$/.exec(url.pathname)?.[1];
      if(req.method==='GET'&&kind){
        const doc=await service.download(token,kind,req);
        return reply(res,200,doc.bytes,'application/pdf',{
          'Content-Disposition':'attachment; filename="'+doc.filename+'"'});
      }
      if(req.method==='POST'&&url.pathname==='/api/acceptance'){
        if(req.headers.origin!==origin)throw fault('ORIGIN_REJECTED',403);
        if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type']||''))throw fault('INVALID_CONTENT_TYPE',415);
        const parts=[];let size=0;
        for await(const part of req){size+=part.length;if(size>4096)throw fault('REQUEST_TOO_LARGE',413);parts.push(part);}
        let body;try{body=JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw fault('INVALID_REQUEST');}
        return reply(res,200,await service.accept(token,body,req,req.headers['x-csrf-token']));
      }
      throw fault('NOT_FOUND',404);
    }catch(error){
      const safe=typeof error.code==='string'&&/^[A-Z_]{3,50}$/.test(error.code);
      reply(res,safe?error.status||400:500,{error:safe?error.code:'REQUEST_FAILED'});
    }
  };
}
module.exports={createAcceptanceHandler,HEADERS};
