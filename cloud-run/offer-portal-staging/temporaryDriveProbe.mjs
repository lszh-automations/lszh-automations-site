// One-time synthetic-only, READ-ONLY Cloud Run -> business Drive probe.
// Never fetches customer folders, never writes Drive, Firestore or offers,
// never exposes Drive file IDs, hashes or tokens in HTTP responses or logs.
import {verifyArchiveBundle} from '../archive-reader-staging/archiveBundleVerifier.mjs';

const ID=/^[a-zA-Z0-9_-]{20,100}$/;
const SHA=/^[0-9a-f]{64}$/;
const FOLDER_NAME='LSZH_SYNTHETIC_OFFER_PDFS_20261018_NO_CONTRACT';
const ROOT='1A9jx7DzCWHQJxvxxeWTj4HCh-hbVm0in';
const OWNER='lars@lszh-automations.ch';
const DRIVE='https://www.googleapis.com/drive/v3/files/';
const NAMES=Object.freeze([
 'TEST_ONLY_quote_AVV_JA_NO_CONTRACT.pdf',
 'TEST_ONLY_quote_AVV_NEIN_NO_CONTRACT.pdf',
 'TEST_ONLY_project_terms_NO_CONTRACT.pdf',
 'TEST_ONLY_avv_NO_CONTRACT.pdf'
]);

// Diagnose only: determine which exact structural check failed. This does
// NOT relax folder authorization/parent/ownership checks. In a shared-child
// folder, the temporary reader may not see parent/owner metadata; we must
// observe that separately before changing validation rules or access rights.
export function classifySyntheticFolderMetadata(meta,folder,{businessPrechecked=false}={}){
 // Only this synthetic temporary probe may rely on an independently
 // completed business-user GET-only preflight for owner/root evidence that
 // Google's API hides from the narrow service account. Visible values must
 // always match; null/empty/mismatched values are never bypassed.
 if(meta===null||typeof meta!=='object'||Array.isArray(meta))
   return 'FOLDER_STRUCTURE';
 if(meta.id!==folder)return 'FOLDER_ID';
 if(meta.name!==FOLDER_NAME)return 'FOLDER_NAME';
 if(meta.mimeType!=='application/vnd.google-apps.folder')
   return 'FOLDER_MIME';
 if(meta.trashed===true)return 'FOLDER_TRASHED';
 if(!Object.prototype.hasOwnProperty.call(meta,'parents')){
   if(!businessPrechecked)return 'FOLDER_PARENT_HIDDEN';
 }else if(meta.parents==null)return 'FOLDER_PARENT_MISMATCH';
 if(Object.prototype.hasOwnProperty.call(meta,'parents')&&
    JSON.stringify(meta.parents)!==JSON.stringify([ROOT]))
   return 'FOLDER_PARENT_MISMATCH';
 if(!Object.prototype.hasOwnProperty.call(meta,'owners')){
   if(!businessPrechecked)return 'FOLDER_OWNER_HIDDEN';
 }else if(!Array.isArray(meta.owners)||meta.owners.length!==1||
    meta.owners[0]?.emailAddress!==OWNER)
   return 'FOLDER_OWNER_MISMATCH';
 return null;
}

export function temporaryDriveProbeConfig(env={},tempConfig={enabled:false}){
 if(env.LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED==='true' &&
    env.LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED!=='true')
   throw Error('temporary_drive_diagnostics_requires_probe');
 if(env.LSZH_OFFER_TEMP_BUSINESS_FOLDER_PREFLIGHT==='true' &&
    (env.LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED!=='true' ||
     env.LSZH_OFFER_TEMP_DRIVE_DIAGNOSTICS_ENABLED!=='true'))
   throw Error('temporary_drive_business_preflight_gate_invalid');
 if(env.LSZH_OFFER_TEMP_DRIVE_PROBE_ENABLED!=='true')return {enabled:false};
 if(tempConfig.enabled!==true||env.LSZH_OFFER_TEMP_BROWSER_DEMO_ENABLED!=='true'||
    env.LSZH_PORTAL_STAGING_ENABLED!=='false')
   throw Error('temporary_drive_probe_not_isolated');
 const folder=String(env.LSZH_OFFER_TEMP_DRIVE_PROBE_FOLDER||'');
 const hashes=String(env.LSZH_OFFER_TEMP_DRIVE_PROBE_HASHES||'').split(',');
 if(!ID.test(folder)||folder===ROOT||hashes.length!==4||
    !hashes.every(x=>SHA.test(x))||new Set(hashes).size!==4)
   throw Error('temporary_drive_probe_inputs_invalid');
 return {enabled:true,folder,hashes,
   // This is set solely by a guarded operator-run TEMP deployment; it
   // delegates missing ancestor/owner metadata only to the business-user
   // checks run BEFORE deployment. Never available to the full offer API.
   businessPrechecked:env.LSZH_OFFER_TEMP_BUSINESS_FOLDER_PREFLIGHT==='true'};
}

async function readJson(url,fetcher,token){
 const r=await fetcher(url,{method:'GET',headers:{
  Authorization:'Bearer '+token,'Accept':'application/json'},
  signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('drive_unavailable');
 const raw=await r.text();
 if(raw.length>30000)throw Error('drive_response_too_large');
 return JSON.parse(raw);
}

export async function verifySyntheticDriveReadOnly({
 folder,hashes,accessToken,fetcher=fetch,onDiagnostic,
 businessPrechecked=false}){
 // Strict, fixed codes only. Never pass provider messages, URLs or tokens.
 // This callback is ONLY invoked after a failed check.
 let alreadyReported=false;
 const note=code=>{
   if(alreadyReported)return;
   alreadyReported=true;
   if(typeof onDiagnostic==='function')onDiagnostic(code);
 };
 const stage=async(code,job)=>{
   try{return await job();}
   catch{note(code);throw Error('probe_failed');}
 };
 if(!ID.test(String(folder||''))||!Array.isArray(hashes)||
   hashes.length!==4||!hashes.every(s=>typeof s==='string'&&SHA.test(s))||
   typeof accessToken!=='string'||accessToken.length<8)
  throw Error('probe_inputs_invalid');
 const meta=await stage('FOLDER_API',()=>readJson(DRIVE+encodeURIComponent(folder)+'?'+new URLSearchParams({
  fields:'id,name,mimeType,parents,owners(emailAddress),trashed',
  supportsAllDrives:'true'}),fetcher,accessToken));
 const folderError=classifySyntheticFolderMetadata(meta,folder,{
   businessPrechecked:businessPrechecked===true
 });
 if(folderError!==null){
   note(folderError);
   throw Error('probe_folder_invalid');
 }
 const query="'"+folder+"' in parents and trashed = false";
 const list=await stage('LIST_API',()=>readJson('https://www.googleapis.com/drive/v3/files?'+
   new URLSearchParams({q:query,fields:'nextPageToken,files(id,name,mimeType,parents,trashed)',
     pageSize:'10',supportsAllDrives:'true',includeItemsFromAllDrives:'true'}),
    fetcher,accessToken));
 if(list.nextPageToken||!Array.isArray(list.files)||list.files.length!==4)
   {note('LIST_VALIDATE');throw Error('probe_wrong_file_count');}
 const found=new Map();
 for(const f of list.files){
   if(!NAMES.includes(f.name)||!ID.test(String(f.id||''))||
      f.mimeType!=='application/pdf'||f.trashed===true||
      JSON.stringify(f.parents)!==JSON.stringify([folder])||found.has(f.name))
     {note('LIST_VALIDATE');throw Error('probe_unexpected_file');}
   found.set(f.name,f.id);
 }
 if(NAMES.some(name=>!found.has(name))){note('LIST_VALIDATE');throw Error('probe_files_missing');}
 const part=i=>({id:found.get(NAMES[i]),sha256:hashes[i]});
 // Reuse the production-shaped verifier: it checks metadata lock, immediate
 // parent, source SHA256 and the SHA256 of actual downloaded PDF bytes.
 const options={fetcher,accessToken,archiveFolderId:folder};
 const yes={avv_required:'Ja',quote:part(0),terms:part(2),avv:part(3)};
 const no={avv_required:'Nein',quote:part(1),terms:part(2)};
 const yesVerified=await stage('PDF_YES_API',()=>verifyArchiveBundle(yes,options));
 if(!yesVerified){note('PDF_YES_INTEGRITY');throw Error('probe_archive_integrity_failed');}
 const noVerified=await stage('PDF_NO_API',()=>verifyArchiveBundle(no,options));
 if(!noVerified){note('PDF_NO_INTEGRITY');throw Error('probe_archive_integrity_failed');}
 return {status:'PASS_SYNTHETIC_ARCHIVE_READ_ONLY',verifiedFiles:4};
}
