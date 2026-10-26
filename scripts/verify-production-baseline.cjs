'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'releases/production-20261026.json'),'utf8'));
let count=0;
for(const service of manifest.services){
 for(const file of service.files){
  const full=path.resolve(root,service.sourceDirectory,file.path);
  if(!full.startsWith(path.resolve(root,service.sourceDirectory)+path.sep))throw Error('Invalid manifest path');
  const bytes=fs.readFileSync(full),hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(hash!==file.sha256||bytes.length!==file.bytes)throw Error('Deployed source differs: '+service.name+'/'+file.path);
  if(/\.(?:js|cjs)$/.test(file.path)){
   const result=spawnSync(process.execPath,['--check',full],{encoding:'utf8'});
   if(result.status!==0)throw Error(result.stderr);
  }
  count++;
 }
}
console.log('PRODUCTION BASELINE PASS: '+count+' exact deployed files; JavaScript syntax valid. No cloud calls.');
