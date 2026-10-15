import {http} from '@google-cloud/functions-framework';
import {createHash,timingSafeEqual} from 'node:crypto';

// Read-only first live test for the SEPARATE staging portal service identity.
// No Firestore writes, no user contracts, no document content in HTTP response.
const EXPECTED_SERVICE='lszh-offer-portal-staging';
const EXPECTED_PRINCIPAL='lszh-offer-portal-staging@lszh-automations.iam.gserviceaccount.com';
const FOLDER='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const PDF='1W-ZB32pxV7R6EC928BU0iMIAFhSlTno8';
const PDF_SHA256='0e5e304feb775fc9ff45478970d6a1582542f58f84c5b03b1f5d8d94fdcea536';
const META='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
const DRIVE='https://www.googleapis.com/drive/v3/files/';
const FIRESTORE='https://firestore.europe-west6.rep.googleapis.com/v1/projects/lszh-automations/databases/lszh-offers-staging/documents/lszh_staging_offers_v1?pageSize=1';
const LIMIT=12*1024*1024;

async function query(url,headers={}){
  return fetch(url,{method:'GET',headers,signal:AbortSignal.timeout(15000)});
}
async function identity(){
  const response=await query(META+'/email',{'Metadata-Flavor':'Google'});
  if(!response.ok||(await response.text()).trim()!==EXPECTED_PRINCIPAL)
    throw Error('wrong_principal');
}
async function oauth(scope){
  const response=await query(META+'/token?scopes='+encodeURIComponent(scope),
    {'Metadata-Flavor':'Google'});
  if(!response.ok)throw Error('metadata_token_unavailable');
  const token=(await response.json()).access_token;
  if(typeof token!=='string'||token.length<20)throw Error('metadata_token_unavailable');
  return {Authorization:'Bearer '+token};
}
async function driveRead(){
  const headers=await oauth('https://www.googleapis.com/auth/drive.readonly');
  const fields=new URLSearchParams({fields:'id,mimeType,size,sha256Checksum,contentRestrictions,parents,trashed'});
  const response=await query(DRIVE+PDF+'?'+fields,headers);
  if(!response.ok)throw Error('drive_read_denied');
  const f=await response.json();
  const n=Number(f.size);
  if(f.id!==PDF || f.mimeType!=='application/pdf' || f.trashed===true ||
    !Array.isArray(f.parents)||!f.parents.includes(FOLDER)||
    !Array.isArray(f.contentRestrictions)||
    !f.contentRestrictions.some(v=>v?.readOnly===true)||
    f.sha256Checksum!==PDF_SHA256||!Number.isSafeInteger(n)||n<8||n>LIMIT)
    throw Error('drive_metadata_mismatch');
  const binary=await query(DRIVE+PDF+'?alt=media',headers);
  if(!binary.ok)throw Error('drive_download_denied');
  const sizeHeader=Number(binary.headers.get('content-length')||0);
  if(sizeHeader>LIMIT)throw Error('drive_size_mismatch');
  const bytes=Buffer.from(await binary.arrayBuffer());
  if(bytes.length!==n||bytes.length>LIMIT||
     bytes.subarray(0,5).toString('ascii')!=='%PDF-')
    throw Error('drive_size_mismatch');
  if(!timingSafeEqual(createHash('sha256').update(bytes).digest(),
      Buffer.from(PDF_SHA256,'hex')))throw Error('drive_digest_mismatch');
}
async function firestoreRead(){
  const headers=await oauth('https://www.googleapis.com/auth/datastore');
  // GET listDocuments on named staging DB, even if the collection is empty.
  // HTTP 200 proves IAM-authorized database-level list access. Never process
  // or log any returned documents. No collection or document is created.
  const response=await query(FIRESTORE,headers);
  if(response.status===200)return;
  if(response.status===403||response.status===401)throw Error('firestore_iam_denied');
  throw Error('firestore_unexpected_status');
}
const errorCodes=new Set(['wrong_principal','metadata_token_unavailable',
  'drive_read_denied','drive_metadata_mismatch','drive_download_denied',
  'drive_size_mismatch','drive_digest_mismatch','firestore_iam_denied',
  'firestore_unexpected_status']);
async function preflight(){
  console.info('LSZH_PORTAL_PREFLIGHT: START');
  try{
    await identity();
    console.info('LSZH_PORTAL_PREFLIGHT: IDENTITY_PASS');
    await driveRead();
    console.info('LSZH_PORTAL_PREFLIGHT: DRIVE_PASS');
    await firestoreRead();
    console.info('LSZH_PORTAL_PREFLIGHT: FIRESTORE_READ_PASS');
    console.info('LSZH_PORTAL_PREFLIGHT: PASS');
  }catch(e){
    const code=errorCodes.has(e?.message)?e.message:'unexpected';
    console.error('LSZH_PORTAL_PREFLIGHT: FAIL ('+code+')');
  }
}
// Important: await during module startup, not an unawaited background task.
if(process.env.K_SERVICE===EXPECTED_SERVICE && process.env.K_REVISION){
  await preflight();
}
http('lszhPortalPreflight',(req,res)=>{
  res.set('Cache-Control','no-store');
  // Even with a working deployment, no offer endpoints or documents exist.
  res.status(503).json({error:'staging_disabled'});
});
