import {createHash, timingSafeEqual} from 'node:crypto';

// Innerer, schluesselloser Cloud-Run-Archivprüfer. Keine echten Kundendaten im Test.
// Drive contentRestrictions sind widerrufbar, kein rechtssicheres WORM-Archiv.
const DRIVE='https://www.googleapis.com/drive/v3/files/';
const ID=/^[A-Za-z0-9_-]{20,100}$/;
const SHA=/^[0-9a-f]{64}$/;
const MAX_BYTES=12*1024*1024;
const META_FIELDS='id,mimeType,size,sha256Checksum,contentRestrictions,parents,trashed';

function bundleShape(payload){
  if(!payload || typeof payload!=='object' || Array.isArray(payload))throw Error('invalid_bundle');
  if(!['Ja','Nein'].includes(payload.avv_required))throw Error('invalid_bundle');
  const wanted=payload.avv_required==='Ja'?
    ['avv','avv_required','quote','terms']:
    ['avv_required','quote','terms'];
  const found=Object.keys(payload).sort();
  if(JSON.stringify(found)!==JSON.stringify(wanted))throw Error('invalid_bundle');
  const parts=payload.avv_required==='Ja'?
    [payload.quote,payload.terms,payload.avv]:
    [payload.quote,payload.terms];
  const ids=new Set();
  for(const part of parts){
    if(!part || typeof part!=='object' || Array.isArray(part) ||
       JSON.stringify(Object.keys(part).sort())!==JSON.stringify(['id','sha256']) ||
       typeof part.id!=='string' || !ID.test(part.id) ||
       typeof part.sha256!=='string' || !SHA.test(part.sha256) ||
       ids.has(part.id))throw Error('invalid_bundle');
    ids.add(part.id);
  }
  return parts;
}

async function withTimeout(fetcher,url,token){
  const response=await fetcher(url,{
    method:'GET',
    headers:{Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)throw Error('archive_unavailable');
  return response;
}
async function readCapped(response){
  const advertised=response.headers.get('content-length');
  if(advertised!==null && (!/^\d+$/.test(advertised) || Number(advertised)>MAX_BYTES))
    throw Error('archive_unavailable');
  if(!response.body)throw Error('archive_unavailable');
  const chunks=[];let total=0;
  for await(const chunk of response.body){
    total+=chunk.byteLength;
    if(total>MAX_BYTES)throw Error('archive_unavailable');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks,total);
}

// Single implementation of the archival metadata + actual byte integrity
// check, reused by whole-bundle acceptance and by individual PDF downloads.
async function verifiedBytes(part,{fetcher,accessToken,archiveFolderId}){
  const path=DRIVE+encodeURIComponent(part.id);
  const response=await withTimeout(fetcher,path+'?'+new URLSearchParams({fields:META_FIELDS}),accessToken);
  const info=await response.json();
  const length=Number(info.size);
  const allowed=info.id===part.id &&
    info.mimeType==='application/pdf' && info.trashed!==true &&
    Array.isArray(info.parents) && info.parents.includes(archiveFolderId) &&
    Array.isArray(info.contentRestrictions) &&
    info.contentRestrictions.some(x=>x && x.readOnly===true) &&
    Number.isSafeInteger(length) && length>=8 && length<=MAX_BYTES &&
    info.sha256Checksum===part.sha256;
  if(!allowed)return null;
  const contents=await withTimeout(fetcher,path+'?alt=media',accessToken);
  const bytes=await readCapped(contents);
  if(bytes.length!==length || bytes.subarray(0,5).toString('ascii')!=='%PDF-')return null;
  const actual=createHash('sha256').update(bytes).digest();
  if(!timingSafeEqual(actual,Buffer.from(part.sha256,'hex')))return null;
  return bytes;
}
function optionsChecked(opts={}){
  const {fetcher=fetch,accessToken,archiveFolderId}=opts;
  if(typeof fetcher!=='function' || typeof accessToken!=='string' ||
    accessToken.length<8 || !ID.test(String(archiveFolderId||'')))
    throw Error('archive_unavailable');
  return {fetcher,accessToken,archiveFolderId};
}
export async function verifyArchiveBundle(payload,opts={}){
  const parts=bundleShape(payload);
  const options=optionsChecked(opts);
  for(const part of parts){
    if(!await verifiedBytes(part,options))return false;
  }
  return true;
}
// Never accept file IDs supplied by the browser. 'which' selects an archive
// item already bound to the validated, token-authorised offer.
export async function readVerifiedArchivePdf(payload,which,opts={}){
  bundleShape(payload);
  if(!['quote','terms','avv'].includes(which) ||
      (which==='avv' && payload.avv_required!=='Ja'))
    throw Error('invalid_document');
  const bytes=await verifiedBytes(payload[which],optionsChecked(opts));
  if(!bytes)throw Error('archive_changed');
  return bytes;
}
