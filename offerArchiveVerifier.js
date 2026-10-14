'use strict';
const crypto = require('crypto');

// Google Drive archives are private: only the configured service account may
// read the designated PDFs. Drive's content restriction is reversible by an
// authorised owner and is NOT a WORM/legal-retention archive.
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const ID_RE=/^[A-Za-z0-9_-]{20,100}$/;
const HASH_RE=/^[a-f0-9]{64}$/;
const API='https://www.googleapis.com/drive/v3/files/';
const TOKEN_URL='https://oauth2.googleapis.com/token';

function safeEqualHash(a,b){
  if(!HASH_RE.test(String(a||''))||!HASH_RE.test(String(b||'')))return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function decodeCredentials(encoded){
  if(!encoded || encoded.length>16*1024)throw Error('archive_credentials_missing');
  const obj=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
  if(!obj || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.client_email||'') ||
      !String(obj.private_key||'').startsWith('-----BEGIN PRIVATE KEY-----'))
    throw Error('archive_credentials_invalid');
  return obj;
}
module.exports=function createOfferArchiveVerifier(options={}){
  const fetcher=options.fetcher||fetch;
  let cached=null;
  let pending=null;
  async function accessToken(){
    if(cached && cached.expires>Date.now()+60000)return cached.token;
    if(pending)return pending;
    pending=(async()=>{
    const creds=decodeCredentials(process.env.OFFER_DRIVE_SA_B64||'');
    const now=Math.floor(Date.now()/1000);
    const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})).toString('base64url');
    const payload=Buffer.from(JSON.stringify({
      iss:creds.client_email,scope:'https://www.googleapis.com/auth/drive.readonly',
      aud:TOKEN_URL,iat:now,exp:now+3300
    })).toString('base64url');
    const unsigned=header+'.'+payload;
    const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),creds.private_key).toString('base64url');
    const form=new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:unsigned+'.'+signature
    });
    const r=await fetcher(TOKEN_URL,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:form.toString(),signal:AbortSignal.timeout(15000)
    });
    if(!r.ok)throw Error('archive_auth_unavailable');
    const v=await r.json();
    if(!v.access_token||!Number.isFinite(Number(v.expires_in)))throw Error('archive_auth_invalid');
    cached={token:v.access_token,expires:Date.now()+Math.min(3300,Number(v.expires_in))*1000};
    return cached.token;
    })();
    try {return await pending;} finally {pending=null;}
  }
  async function driveGet(id,query){
    if(!ID_RE.test(String(id||'')))throw Error('archive_id_invalid');
    const token=await accessToken();
    const url=API+encodeURIComponent(id)+'?'+new URLSearchParams(query).toString();
    const response=await fetcher(url,{
      headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(20000)
    });
    if(!response.ok)throw Error('archive_drive_unavailable');
    return response;
  }
  function details(fields,which){
    if(!['quote','terms','avv'].includes(which))throw Error('invalid_document');
    const prefix=which==='quote'?'Offerten':which==='terms'?'Bedingungen':'AVV';
    const id=fields['Online-Annahme '+prefix+' Drive ID'];
    const digest=fields['Online-Annahme '+prefix+'-SHA256'];
    if(!ID_RE.test(String(id||''))||!HASH_RE.test(String(digest||'')))throw Error('archive_fields_missing');
    return {id,digest};
  }
  async function inspectOne(fields,which){
    const expected=details(fields,which);
    const response=await driveGet(expected.id,{
      fields:'id,name,mimeType,size,sha256Checksum,contentRestrictions,parents,trashed'
    });
    const data=await response.json();
    const locked=Array.isArray(data.contentRestrictions)
      && data.contentRestrictions.some(x=>x.readOnly===true);
    const archiveFolder=String(process.env.OFFER_DRIVE_ARCHIVE_FOLDER_ID||'');
    const inBusinessArchive=ID_RE.test(archiveFolder) &&
      Array.isArray(data.parents) && data.parents.includes(archiveFolder);
    const valid=data.id===expected.id && data.mimeType==='application/pdf'
      && data.trashed!==true && locked && inBusinessArchive
      && Number(data.size)>0 && Number(data.size)<=MAX_PDF_BYTES
      && safeEqualHash(data.sha256Checksum,expected.digest);
    return {valid,id:expected.id,hash:expected.digest,size:Number(data.size)};
  }
  async function verify(fields){
    if(fields['Online-Annahme Offerten-Archivstatus']!=='VERIFIZIERT' ||
       !fields['Online-Annahme Offerten-Archivprüfung am'])
      return false;
    const mode=fields['AVV erforderlich'];
    if(mode!=='Ja' && mode!=='Nein')return false;
    if(mode==='Ja' && (!String(fields['Online-Annahme AVV-Version']||'').trim() ||
        !ID_RE.test(String(fields['Online-Annahme AVV Drive ID']||'')) ||
        !HASH_RE.test(String(fields['Online-Annahme AVV-SHA256']||''))))return false;
    if(mode==='Nein' && (fields['Online-Annahme AVV Drive ID'] ||
       fields['Online-Annahme AVV-SHA256'] || fields['Online-Annahme AVV-Version'] ||
       fields['Online-Annahme AVV ausdrücklich akzeptiert']===true))return false;
    const kinds=mode==='Ja'?['quote','terms','avv']:['quote','terms'];
    const checks=await Promise.all(kinds.map(which=>inspectOne(fields,which)));
    return checks.every(check=>check.valid);
  }
  async function pdf(fields,which){
    if(!['quote','terms','avv'].includes(which))throw Error('invalid_document');
    if(which==='avv' && fields['AVV erforderlich']!=='Ja')throw Error('invalid_document');
    const check=await inspectOne(fields,which);
    if(!check.valid)throw Error('archive_changed');
    const response=await driveGet(check.id,{alt:'media'});
    const advertised=Number(response.headers.get('content-length')||0);
    if(advertised>MAX_PDF_BYTES)throw Error('archive_too_large');
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length<8||bytes.length>MAX_PDF_BYTES ||
       bytes.subarray(0,5).toString('ascii')!=='%PDF-' ||
       !safeEqualHash(crypto.createHash('sha256').update(bytes).digest('hex'),check.hash))
      throw Error('archive_changed');
    return bytes;
  }
  return {verify,pdf};
};
