// Executed ONLY by the ephemeral Cloud Run job as the production service identity.
// No customer operations, no token or document-content logs, no IAM impersonation.
const {createHash}=require('node:crypto');
const {GoogleAuth}=require('google-auth-library');

const EXPECTED_SA='lszh-offer-portal@lszh-automations.iam.gserviceaccount.com';
const FOLDER='10VD4xYIxfQBJ9Q5wpGq3iflK4MNJ1PHN';
const ITEMS=[
  {label:'Projektbedingungen v1.0',
   id:'1d-EEo4AjsZBWvlYPlZLxxXuXJDBz7hWX',
   sha:'b5421778dd88bdac6697cb4f258319fba6577a9b26cba75509ef4e55df4fc2aa'},
  {label:'AVV-Rahmenvorlage v1.0',
   id:'1MhQvRxB_OsiBhLXSkGeVL-jGutO3vM8x',
   sha:'bde130a9cacd693265521df144fa236e43077ad8ed55388fae079cc7fd97ecc1'}
];
const MAX=12*1024*1024;
async function main(){
  const i=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email',{
    headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(10000)
  });
  if(!i.ok || (await i.text()).trim()!==EXPECTED_SA)
    throw Error('service_identity_mismatch');
  console.log('PASS: Cloud Run Job verwendet das produktive Portal-Dienstkonto');

  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/drive.readonly']});
  const token=await auth.getAccessToken();
  if(!token)throw Error('runtime_drive_access_token_missing');

  async function request(url){
    const response=await fetch(url,{
      headers:{Authorization:'Bearer '+token},
      signal:AbortSignal.timeout(30000)
    });
    if(!response.ok)throw Error('drive_http_'+response.status);
    return response;
  }
  for(const part of ITEMS){
    const endpoint='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(part.id);
    const fields='id,mimeType,size,sha256Checksum,contentRestrictions,parents,trashed';
    let meta=await (await request(endpoint+'?fields='+encodeURIComponent(fields))).json();
    const size=Number(meta.size);
    if(meta.id!==part.id || meta.mimeType!=='application/pdf' ||
       meta.trashed===true || !Array.isArray(meta.parents) ||
       !meta.parents.includes(FOLDER) ||
       !Array.isArray(meta.contentRestrictions) ||
       !meta.contentRestrictions.some(x=>x?.readOnly===true) ||
       meta.sha256Checksum!==part.sha ||
       !Number.isSafeInteger(size)||size<8||size>MAX)
      throw Error(part.label+':_metadata_integrity_or_lock_missing');
    const content=await request(endpoint+'?alt=media');
    const declared=Number(content.headers.get('content-length'));
    if(Number.isFinite(declared)&&declared>MAX)
      throw Error(part.label+':_download_too_large');
    const bytes=Buffer.from(await content.arrayBuffer());
    if(bytes.length!==size || bytes.subarray(0,5).toString('ascii')!=='%PDF-' ||
       createHash('sha256').update(bytes).digest('hex')!==part.sha)
      throw Error(part.label+':_pdf_bytes_mismatch');
    console.log('PASS: '+part.label+' – Drive-Reader, Archivordner, Sperre und SHA-256');
  }
  console.log('PASS: 2/2 Geschäfts-PDFs verifiziert. Kein Vertrag oder Kunden-Writeback.');
}
main().catch(error=>{
  console.error('OFFEN: '+String(error?.message||'diagnostic_failed').slice(0,160));
  process.exitCode=1;
});
