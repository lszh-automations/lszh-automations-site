// Explicitly isolated HTTP adapter; NOT deployed. Same-origin token-bound POSTs
// only. No unauthenticated document enumeration or public archive paths.
const LIMIT=12*1024;
function send(res,status,obj){
  res.writeHead(status,{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'no-store',
    'Pragma':'no-cache',
    'X-Content-Type-Options':'nosniff',
    'X-Robots-Tag':'noindex, nofollow, noarchive',
    'Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy':'same-origin'
  });
  res.end(JSON.stringify(obj));
}
async function json(req){
  const contentType=String(req.headers['content-type']||'').toLowerCase();
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/.test(contentType))
    throw Error('bad_content_type');
  if(req.headers['content-encoding'])throw Error('bad_encoding');
  const contentLength=req.headers['content-length'];
  if(contentLength && (!/^\d+$/.test(contentLength)||Number(contentLength)>LIMIT))
    throw Error('oversized');
  const chunks=[];let size=0;
  for await(const part of req){
    size+=part.length;
    if(size>LIMIT)throw Error('oversized');
    chunks.push(part);
  }
  if(!size)throw Error('empty');
  const obj=JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
  if(!obj || typeof obj!=='object'||Array.isArray(obj))throw Error('invalid_body');
  return obj;
}
const ERRORS={
  unavailable:404,invalid_request:400,invalid_identity:400,consent_required:400,
  avv_consent_required:400,unexpected_avv_consent:400,
  document_changed:409,archive_changed:409,offer_changed:409,
  already_accepted:409
};
export function createOfferPortalHttp({portal,enabled=false,allowedOrigin}={}){
  if(!portal || typeof portal.preview!=='function' || typeof portal.accept!=='function')
    throw Error('portal_missing');
  if(enabled===true){
    const url=new URL(String(allowedOrigin||''));
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||
       url.pathname!=='/'||url.search||url.hash)throw Error('portal_origin_invalid');
  }
  return async function handle(req,res){
    // Hard off by default even if network ingress becomes public accidentally.
    if(enabled!==true)return send(res,503,{error:'not_available'});
    let path;
    try{path=new URL(req.url,'https://local.invalid').pathname;}
    catch{return send(res,404,{error:'not_found'});}
    if(req.method!=='POST' ||
       !['/api/offer/preview','/api/offer/accept','/api/offer/document'].includes(path))
      return send(res,404,{error:'not_found'});
    // Origin is a CSRF barrier, not proof of identity. Token is still required.
    if(req.headers.origin!==allowedOrigin)
      return send(res,403,{error:'forbidden'});
    try{
      const b=await json(req);
      if(path==='/api/offer/document'){
        if(typeof portal.document!=='function')return send(res,503,{error:'temporarily_unavailable'});
        const doc=await portal.document(b.code,b.which);
        // Do not stream partially verified content. The portal guarantees
        // exact bounded bytes and independently verifies SHA-256 before return.
        if(!doc||!Buffer.isBuffer(doc.bytes)||doc.bytes.length<8||
           doc.bytes.length>12*1024*1024)throw Error('archive_unavailable');
        const label=doc.which==='quote'?'Offerte':doc.which==='terms'?'Projektbedingungen':'AVV';
        const filename=('LSZH_'+label+'_'+doc.number+'_'+doc.version)
          .replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,140)+'.pdf';
        res.writeHead(200,{
          'Content-Type':'application/pdf',
          'Content-Length':String(doc.bytes.length),
          'Content-Disposition':'attachment; filename="'+filename+'"',
          'Cache-Control':'no-store','Pragma':'no-cache',
          'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
          'X-Robots-Tag':'noindex, nofollow, noarchive',
          'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
          'Cross-Origin-Resource-Policy':'same-origin'
        });
        return res.end(doc.bytes);
      }
      const result=path.endsWith('/preview')?
        await portal.preview(b.code):
        await portal.accept(b.code,b);
      return send(res,200,{ok:true,...(path.endsWith('/preview')?{offer:result}:result)});
    }catch(err){
      if(['bad_content_type','bad_encoding','oversized','empty','invalid_body'].includes(err.message)
         ||err instanceof SyntaxError)return send(res,400,{error:'invalid_request'});
      const status=ERRORS[err.code] || 503;
      return send(res,status,{error:status===503?'temporarily_unavailable':err.code});
    }
  };
}
