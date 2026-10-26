'use strict';
// C3.7.1 Windows-only, single-version writer. Never prints any provider data.
// Secret Manager receives UTF-8 bytes on the gcloud child's stdin only.
const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const {readSecretEnvelope}=require('./contract-gmail-c37-backend-staging');
const exec=promisify(execFile);
const PROJECT='lszh-automations';
const SECRET='lszh-crm-c37-gmail-readonly';
const LIST='gcloud.cmd secrets versions list '+SECRET+
  ' --project='+PROJECT+' --format=value(name)';
const ADD='gcloud.cmd secrets versions add '+SECRET+
  ' --project='+PROJECT+' --data-file=- --quiet';
function fail(){throw Error('C3.7.1 protected secret storage blocked');}
async function listVersions(){
  if(process.platform!=='win32')return fail();
  try{
    const result=await exec('cmd.exe',['/d','/s','/c',LIST],{
      windowsHide:true,timeout:20000,maxBuffer:8192,encoding:'utf8'
    });
    return result.stdout.trim();
  }catch{return fail()}
}
async function addVersion(bytes){
  if(process.platform!=='win32')return fail();
  return new Promise((resolve,reject)=>{
    const child=spawn('cmd.exe',['/d','/s','/c',ADD],{
      windowsHide:true,stdio:['pipe','ignore','ignore'],shell:false
    });
    let finished=false;
    const finish=(error)=>{
      if(finished)return;
      finished=true;
      if(error)reject(Error('C3.7.1 protected secret storage blocked'));
      else resolve();
    };
    child.on('error',finish);
    child.on('close',code=>finish(code===0?null:Error('store failed')));
    child.stdin.on('error',finish);
    child.stdin.end(bytes);
  });
}
function createC371SecretWriter({
  readVersions=listVersions,writeVersion=addVersion
}={}){
  if(typeof readVersions!=='function'||typeof writeVersion!=='function')
    return fail();
  let consumed=false;
  async function assertEmpty(){
    let listed;
    try{listed=await readVersions()}catch{return fail()}
    if(typeof listed!=='string'||listed.trim()!=='')return fail();
  }
  async function store(bytes){
    if(consumed)return fail();
    consumed=true; // Even provider failures never silently retry a write.
    if(!Buffer.isBuffer(bytes)||bytes.length<80||bytes.length>16384)
      return fail();
    try{readSecretEnvelope(bytes.toString('utf8'))}
    catch{return fail()}
    // A second list immediately before add reduces accidental duplicate writes.
    await assertEmpty();
    try{await writeVersion(bytes)}catch{return fail()}
    return true;
  }
  return Object.freeze({assertEmpty,store});
}
module.exports={PROJECT,SECRET,LIST,ADD,createC371SecretWriter};
