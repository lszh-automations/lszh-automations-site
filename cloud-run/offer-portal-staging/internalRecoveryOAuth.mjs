// Local desktop OAuth only. No Make token export or plaintext token file.
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export const SCOPES=Object.freeze([
 'https://www.googleapis.com/auth/cloud-platform',
 'https://www.googleapis.com/auth/drive.readonly',
 'https://www.googleapis.com/auth/gmail.send',
 'https://www.googleapis.com/auth/gmail.metadata',
 'https://www.googleapis.com/auth/userinfo.email']);
const ACCOUNT='lars@lszh-automations.ch';
export class LocalOAuthError extends Error {}
const fail=s=>{throw new LocalOAuthError(s);};
export function parseDesktopClient(raw){
 const c=raw?.installed;
 if(!c||raw.web||c.project_id!=='lszh-automations'||
  !/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(c.client_id||'')||
  typeof c.client_secret!=='string'||c.client_secret.length<12||
  c.auth_uri!=='https://accounts.google.com/o/oauth2/auth'||c.token_uri!=='https://oauth2.googleapis.com/token')
  fail('expected_lszh_google_desktop_client');
 return {clientId:c.client_id,clientSecret:c.client_secret};
}
export function makeAuthorization(client,redirectUri){
 if(!/^http:\/\/127\.0\.0\.1:\d+\/callback$/.test(redirectUri))fail('loopback_redirect_required');
 const verifier=randomBytes(48).toString('base64url'),state=randomBytes(32).toString('base64url');
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v]of Object.entries({client_id:client.clientId,redirect_uri:redirectUri,response_type:'code',
  scope:SCOPES.join(' '),access_type:'offline',prompt:'consent',login_hint:ACCOUNT,
  code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',state}))url.searchParams.set(k,v);
 return{url:url.href,state,verifier};
}
export function verifyCallback(url,state){
 const values=url.searchParams.getAll('state'),codes=url.searchParams.getAll('code');
 const actual=Buffer.from(values[0]||''),expected=Buffer.from(state);
 if(values.length!==1||actual.length!==expected.length||!timingSafeEqual(actual,expected))fail('oauth_state_mismatch');
 if(url.pathname!=='/callback'||url.searchParams.has('error')||codes.length!==1||!codes[0]||codes[0].length>4096)
  fail('oauth_callback_rejected');
 return codes[0];
}
async function jsonRequest(fetcher,url,options){
 let r;try{r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(30000)});}catch{fail('oauth_network_failed');}
 if(!r.ok){
  const service=url.includes('oauth2.googleapis.com/token')?'token':url.includes('/userinfo')?'identity':'gmail_profile';
  const status=Number.isInteger(r.status)&&r.status>=100&&r.status<=599?r.status:0;
  fail('oauth_request_rejected_'+service+'_'+status);
 }
 try{return await r.json();}catch{fail('oauth_response_invalid');}
}
export function createTokenProvider({clientId,clientSecret,refreshToken},fetcher=fetch){
 if(typeof clientId!=='string'||typeof clientSecret!=='string'||typeof refreshToken!=='string'||!refreshToken)
  fail('oauth_credentials_missing');
 let cached=null,pending=null;
 return async()=>{
  if(cached&&cached.expiresAt>Date.now()+60000)return cached.token;
  if(pending)return pending;
  pending=(async()=>{
   const x=await jsonRequest(fetcher,'https://oauth2.googleapis.com/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
     client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
   if(typeof x.access_token!=='string'||x.access_token.length<12||!Number.isFinite(x.expires_in)||x.expires_in<120)
    fail('oauth_access_token_invalid');
   if(x.scope&&!SCOPES.every(s=>x.scope.split(' ').includes(s)))fail('oauth_required_scope_missing');
   cached={token:x.access_token,expiresAt:Date.now()+x.expires_in*1000};return cached.token;
  })();
  try{return await pending;}finally{pending=null;}
 };
}
export async function verifyAccount(token,fetcher=fetch){
 const headers={Authorization:'Bearer '+token};
 const user=await jsonRequest(fetcher,'https://www.googleapis.com/oauth2/v2/userinfo',{headers});
 if(user.email!==ACCOUNT||user.verified_email!==true)fail('wrong_google_runtime_account');
 const gmail=await jsonRequest(fetcher,'https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers});
 if(gmail.emailAddress!==ACCOUNT)fail('wrong_gmail_runtime_account');
 return ACCOUNT;
}
// PowerShell receives secrets only on stdin. The script and command line contain none.
export function windowsVault(mode,value){
 if(process.platform!=='win32'||!['prepare','save','load'].includes(mode))fail('windows_user_vault_required');
 const script=String.raw`$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$id=[Security.Principal.WindowsIdentity]::GetCurrent().User
$dir=Join-Path $env:LOCALAPPDATA 'LSZHAutomations'
$file=Join-Path $dir 'internal-recovery-oauth.dpapi'
$entropy=[Text.Encoding]::UTF8.GetBytes('LSZH_INTERNAL_RECOVERY_OAUTH_V1')
try {
 if ('MODE' -ne 'load') {
  [void][IO.Directory]::CreateDirectory($dir)
  $di=Get-Item -LiteralPath $dir -Force
  if (($di.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {throw 'reparse'}
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($id); $acl.SetAccessRuleProtection($true,$false)
  $rule=[Security.AccessControl.FileSystemAccessRule]::new($id,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule); $di.SetAccessControl($acl)
  if ([IO.File]::Exists($file)) {throw 'exists'}
  if ('MODE' -eq 'prepare') {
   $probe=[Text.Encoding]::UTF8.GetBytes('LSZH_FAKE_ONLY_VAULT_PROBE')
   $cipher=[Security.Cryptography.ProtectedData]::Protect($probe,$entropy,'CurrentUser')
   $back=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$entropy,'CurrentUser')
   if ([Text.Encoding]::UTF8.GetString($back) -ne 'LSZH_FAKE_ONLY_VAULT_PROBE') {throw 'probe'}
   exit 0
  }
  $plain=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())
  $cipher=[Security.Cryptography.ProtectedData]::Protect($plain,$entropy,'CurrentUser')
  $stream=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try {$stream.Write($cipher,0,$cipher.Length)} finally {$stream.Dispose(); [Array]::Clear($plain,0,$plain.Length)}
 } else {
  $fi=Get-Item -LiteralPath $file -Force
  if (($fi.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $fi.Length -gt 65536) {throw 'file'}
  $acl=$fi.GetAccessControl([Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner)
  if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $id.Value) {throw 'owner'}
  foreach($r in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
   if ($r.AccessControlType -eq 'Allow' -and $r.IdentityReference.Value -ne $id.Value) {throw 'acl'}
  }
  $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($file),$entropy,'CurrentUser')
  [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
  [Console]::Write([Text.Encoding]::UTF8.GetString($plain)); [Array]::Clear($plain,0,$plain.Length)
 }
} catch {exit 1}`.replaceAll('MODE',mode);
 try{
  const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],
   {input:mode==='save'?JSON.stringify(value):undefined,encoding:'utf8',stdio:['pipe','pipe','pipe'],timeout:20000,windowsHide:true});
  return mode==='load'?JSON.parse(out):undefined;
 }catch{fail('windows_private_vault_failed_no_secret_output');}
}
export async function authorizeDesktop(path){
 let raw;try{raw=JSON.parse(readFileSync(path,'utf8'));}catch{fail('desktop_client_file_unreadable');}
 const client=parseDesktopClient(raw);
 windowsVault('prepare');
 let resolveCode,rejectCode;
 const codePromise=new Promise((resolve,reject)=>{resolveCode=resolve;rejectCode=reject;});
 // Attach a handler before starting the browser, so early callback failure is handled.
 codePromise.catch(()=>{});
 let auth;
 const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/plain; charset=utf-8');
  if(req.method!=='GET'||req.headers.host!==`127.0.0.1:${server.address().port}`){res.writeHead(400);res.end('Abgewiesen.');return;}
  try{
   const url=new URL(req.url,'http://'+req.headers.host);
   if(url.pathname!=='/callback'){res.writeHead(404);res.end();return;}
   const code=verifyCallback(url,auth.state);res.end('Anmeldung empfangen. Ergebnis bitte im Terminal prüfen.');resolveCode(code);
  }catch{res.writeHead(400);res.end('Anmeldung abgewiesen.');rejectCode(new LocalOAuthError('oauth_callback_rejected'));}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const redirectUri=`http://127.0.0.1:${server.address().port}/callback`;
 auth=makeAuthorization(client,redirectUri);
 const timer=setTimeout(()=>rejectCode(new LocalOAuthError('oauth_login_timeout')),180000);
 try{
  const encoded=Buffer.from(auth.url).toString('base64');
  const ps="Start-Process ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+encoded+"')))";
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(ps,'utf16le').toString('base64')],{stdio:'ignore',windowsHide:true,timeout:15000});
  console.log('Google-Anmeldung im Browser geöffnet. Nur das Geschäftskonto bestätigen.');
  const code=await codePromise;
  console.log('AUTH: Google-Rückmeldung empfangen; prüfe Berechtigungen.');
  const token=await jsonRequest(fetch,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:client.clientId,client_secret:client.clientSecret,code,code_verifier:auth.verifier,redirect_uri:redirectUri,grant_type:'authorization_code'})});
  if(typeof token.refresh_token!=='string'||!token.refresh_token||!SCOPES.every(s=>(token.scope||'').split(' ').includes(s)))fail('oauth_offline_scopes_missing');
  await verifyAccount(token.access_token);
  console.log('AUTH: Geschäftskonto bestätigt; speichere verschlüsselt.');
  windowsVault('save',{...client,refreshToken:token.refresh_token,account:ACCOUNT,project:'lszh-automations',scopes:SCOPES});
  return{result:'LOCAL_RUNTIME_AUTHORIZED',account:ACCOUNT,encryptedForWindowsUser:true,mailSent:false};
 }finally{clearTimeout(timer);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
