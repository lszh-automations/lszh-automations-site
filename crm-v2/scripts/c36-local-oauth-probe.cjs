'use strict';
// Operator-only local Gmail OAuth read-only identity/scope probe.
// Explicit opt-in, no send routes, no refresh token and no disk token persistence.
const fs=require('node:fs');
const path=require('node:path');
const {OAuth2Client}=require('google-auth-library');
const {
  HOST,PORT,REDIRECT_URI,createC36OAuthSession,startC36LocalCallback
}=require('../contract-gmail-c36-local-oauth');

function options(argv){
  const found={};
  for(let i=0;i<argv.length;i++){
    if(argv[i]==='--enable-live-readonly-probe'){
      if(found.enabled)throw Error('duplicate opt in');
      found.enabled=true;continue;
    }
    if(!['--credentials','--expected-mailbox'].includes(argv[i])||
       !argv[i+1]||argv[i+1].startsWith('--')||found[argv[i]])
      throw Error('invalid argument');
    found[argv[i]]=argv[++i];
  }
  if(!found.enabled||!found['--credentials']||!found['--expected-mailbox'])
    throw Error('read only probe opt in missing');
  return found;
}
function readLocalCredentials(location){
  if(typeof location!=='string'||!path.isAbsolute(location))
    throw Error('credentials must be an absolute local path');
  const file=fs.realpathSync(location);
  const root=path.resolve(__dirname,'../..');
  const relative=path.relative(root,file);
  if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&
     !path.isAbsolute(relative)))
    throw Error('secrets must remain outside git checkout');
  if(!fs.statSync(file).isFile()||fs.statSync(file).size>10000)
    throw Error('unsafe credentials file');
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  const web=data?.web;
  if(!web||typeof web.client_id!=='string'||
     typeof web.client_secret!=='string'||web.client_secret.length<8||
     web.auth_uri!=='https://accounts.google.com/o/oauth2/auth'&&
     web.auth_uri!=='https://accounts.google.com/o/oauth2/v2/auth'||
     web.token_uri!=='https://oauth2.googleapis.com/token')
    throw Error('this is not a Google web OAuth client JSON');
  return {clientId:web.client_id,clientSecret:web.client_secret};
}
function main(argv){
  const opts=options(argv);
  const config=readLocalCredentials(opts['--credentials']);
  const client=new OAuth2Client(config.clientId,config.clientSecret,REDIRECT_URI);
  const session=createC36OAuthSession({
    oauthClient:client,clientId:config.clientId,
    expectedMailbox:opts['--expected-mailbox']
  });
  let timer;
  const server=startC36LocalCallback({
    session,
    onDone:(error,result)=>{
      clearTimeout(timer);
      if(error){
        process.stderr.write('LSZH C3.6: OAuth-Konto/Scope nicht bestätigt. Kein Versand.\n');
        process.exitCode=1;
      }else{
        process.stdout.write('LSZH C3.6 PASS: Konto='+result.mailbox+
          ', gmail.readonly bestätigt; keine Tokens gespeichert, kein Versand.\n');
      }
    }
  });
  server.on('error',()=>{
    clearTimeout(timer);
    process.stderr.write('LSZH C3.6: Lokaler Callback-Port nicht verfügbar.\n');
    process.exitCode=1;
  });
  timer=setTimeout(()=>{
    server.close();
    process.stderr.write('LSZH C3.6: Anmeldung abgelaufen. Kein Token gespeichert.\n');
    process.exitCode=1;
  },300000);
  // The OAuth URL contains one-time state and must stay on the local Surface.
  process.stdout.write('C3.6 lokaler, einmaliger Readonly-Check:\n'+
    'Im Browser öffnen: http://'+HOST+':'+PORT+'/\n'+
    'Keine Nachrichten oder Anhänge werden gelesen; nur Gmail-Profil und OAuth-Scopes.\n');
}
if(require.main===module){
  try{main(process.argv.slice(2))}
  catch{
    // Never print the contents/path of the confidential OAuth JSON.
    process.stderr.write('C3.6 lokale Konfiguration ungültig. Kein Netzwerkaufruf.\n');
    process.exitCode=1;
  }
}
module.exports={options,readLocalCredentials};
