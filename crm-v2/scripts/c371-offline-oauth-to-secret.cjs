'use strict';
// EXPLICIT operator-only command: no customer mail, no live CRM integration.
const {OAuth2Client}=require('google-auth-library');
const {HOST,PORT,REDIRECT_URI}=
  require('../contract-gmail-c36-local-oauth');
const {readLocalCredentials}=
  require('./c36-local-oauth-probe.cjs');
const {createC371Consent}=
  require('../contract-gmail-c371-offline-consent');
const {startC371LocalCallback}=
  require('../contract-gmail-c371-local-callback');
const {SECRET,createC371SecretWriter}=
  require('../contract-gmail-c371-secret-writer');

function options(args){
  if(!Array.isArray(args))throw Error('invalid args');
  const found={};
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(flag==='--enable-offline-readonly-secret-store'){
      if(found.enabled)throw Error('duplicate opt-in');
      found.enabled=true;continue;
    }
    if(!['--credentials','--confirm-secret'].includes(flag)||
       found[flag]||!args[i+1]||args[i+1].startsWith('--'))
      throw Error('invalid option');
    found[flag]=args[++i];
  }
  if(!found.enabled||!found['--credentials']||
     found['--confirm-secret']!==SECRET)
    throw Error('explicit secret storage opt-in required');
  return Object.freeze(found);
}
async function main(args){
  const opts=options(args);
  const creds=readLocalCredentials(opts['--credentials']);
  const writer=createC371SecretWriter();
  // Preflight: no Google login when an existing version is present.
  await writer.assertEmpty();
  const oauthClient=new OAuth2Client(
    creds.clientId,creds.clientSecret,REDIRECT_URI
  );
  const session=createC371Consent({
    oauthClient,clientId:creds.clientId,
    clientSecret:creds.clientSecret,
    storeEnvelope:writer.store
  });
  let timer,done=false;
  const server=startC371LocalCallback({
    session,onDone:(err)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      if(err){
        const code=/^[A-Z_]{5,40}$/.test(err.safeCode||'')?
          err.safeCode:'OAUTH_CHECK_FAILED';
        process.stderr.write('LSZH C3.7.1 BLOCKED: '+code+
          '. Keine Version bestaetigt, kein Versand.\n');
        process.exitCode=1;
      }else{
        process.stdout.write('LSZH C3.7.1 PASS: Gmail readonly verifiziert, '+
          'Secret-Version im dedizierten Secret gespeichert; kein Versand.\n');
      }
    }
  });
  server.on('error',()=>{
    if(done)return;
    done=true;
    clearTimeout(timer);
    process.stderr.write('LSZH C3.7.1 BLOCKED: LOCAL_PORT_BUSY. Kein Versand.\n');
    process.exitCode=1;
  });
  timer=setTimeout(()=>{
    if(done)return;
    done=true;
    server.close();
    process.stderr.write('LSZH C3.7.1 BLOCKED: TIMEOUT. Kein Versand.\n');
    process.exitCode=1;
  },300000);
  process.stdout.write(
    'C3.7.1 explizite Gmail-Readonly-Dauerfreigabe\n'+
    'Im eigenen Browser oeffnen: http://'+HOST+':'+PORT+'/\n'+
    'Ziel: dediziertes Google Secret Manager Secret, ohne Versand.\n'
  );
}
if(require.main===module){
  main(process.argv.slice(2)).catch(()=>{
    process.stderr.write(
      'LSZH C3.7.1 BLOCKED: CONFIG_OR_SECRET_PREFLIGHT. Kein Versand.\n');
    process.exitCode=1;
  });
}
module.exports={options,main};
