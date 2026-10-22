'use strict';

// LSZH CRM V2 live development preview.
// Starts the existing loopback-only local preview and periodically fast-forwards
// exactly the feature branch. Never runs npm install, modifies local test data,
// switches branches, discards edits or deploys anything to production.
const {spawn,execFile} = require('node:child_process');
const path=require('node:path');
const {promisify}=require('node:util');
const run=promisify(execFile);
const ROOT=path.resolve(__dirname,'..');
const BRANCH='feature/crm-local-preview-20261023';
const REMOTE='refs/remotes/origin/'+BRANCH;
const INTERVAL_MS=20000;
let child=null;
let stopped=false;
let syncing=false;
let lastWarning='';

async function git(args) {
  const {stdout}=await run('git',args,{cwd:ROOT,timeout:18000,windowsHide:true,maxBuffer:1024*1024});
  return stdout.trim();
}
async function syncBranch(){
  if(syncing||stopped)return;
  syncing=true;
  try{
    const current=await git(['branch','--show-current']);
    if(current!==BRANCH){
      const message='Auto-Sync ausgesetzt: Git-Branch '+(current||'(unbekannt)')+
        '. Erwartet: '+BRANCH;
      if(message!==lastWarning){console.warn(message);lastWarning=message;}
      return;
    }
    await git(['fetch','--quiet','origin',BRANCH]);
    const upstream=await git(['rev-parse',REMOTE]);
    const currentCommit=await git(['rev-parse','HEAD']);
    if(upstream===currentCommit){lastWarning='';return;}
    // Never overwrite local changes. Untracked files that are not ignored also
    // cause a pause; tracked changes remain safe.
    const changed=await git(['status','--porcelain','--untracked-files=normal']);
    if(changed){
      const warning='Auto-Sync pausiert: Lokale Git-Änderungen vorhanden. '+
        'Prüfen mit "git status". Es wird nichts überschrieben.';
      if(lastWarning!==warning){console.warn(warning);lastWarning=warning;}
      return;
    }
    // Refuse force-pushes and diverging histories instead of resetting a branch.
    try{await git(['merge-base','--is-ancestor','HEAD',REMOTE]);}
    catch{
      const warning='Auto-Sync pausiert: Git-Historie weicht vom Remote-Branch ab. '+
        'Keine Dateien wurden zurückgesetzt.';
      if(lastWarning!==warning){console.warn(warning);lastWarning=warning;}
      return;
    }
    await git(['merge','--ff-only','--quiet',REMOTE]);
    console.log('[Live] Neue GitHub-Version übernommen: '+upstream.slice(0,8)+
      '. Der CRM-Tab aktualisiert sich automatisch.');
    lastWarning='';
  }catch(err){
    const why=String(err.stderr||err.message||err).trim().slice(0,300);
    const warning='[Live] GitHub-Synchronisierung derzeit nicht möglich: '+why+
      '. Die lokale Testversion bleibt verwendbar.';
    if(warning!==lastWarning){console.warn(warning);lastWarning=warning;}
  }finally{syncing=false;}
}
function startServer(){
  child=spawn(process.execPath,['--watch',path.join(__dirname,'local-preview.js')],{
    cwd:__dirname,env:{...process.env,LSZH_LIVE_PREVIEW:'1'},
    stdio:'inherit',windowsHide:false
  });
  child.on('error',err=>{
    console.error('[Live] Lokaler CRM-Server konnte nicht starten:',err.message);
  });
  child.on('exit',code=>{
    if(!stopped)console.error('[Live] Vorschau-Server beendet ('+code+'). '+
      'Bitte "node live-preview.js" erneut ausführen.');
  });
}
function shutdown(){
  if(stopped)return;
  stopped=true;
  clearInterval(timer);
  if(child && child.exitCode===null)child.kill();
}
console.log('LSZH CRM V2 – LIVE-VORSCHAU');
console.log('Im Browser öffnen: http://127.0.0.1:'+(process.env.LOCAL_CRM_PORT||8765));
console.log('GitHub-Branch: '+BRANCH);
console.log('Automatischer Git-Abgleich: alle '+INTERVAL_MS/1000+' Sekunden.');
console.log('Codeänderungen laden den Browser neu; lokale Testdaten bleiben erhalten.');
console.log('Bei eigenen Git-Änderungen wird Auto-Sync vorsichtshalber pausiert.');
console.log('Nur lokale Testdaten. Kein Firestore, keine produktiven APIs. Strg + C beendet.');
startServer();
const timer=setInterval(syncBranch,INTERVAL_MS);
void syncBranch();
process.on('SIGINT',()=>{shutdown();process.exit(0);});
process.on('SIGTERM',()=>{shutdown();process.exit(0);});
process.on('exit',()=>{if(child && child.exitCode===null)child.kill();});
