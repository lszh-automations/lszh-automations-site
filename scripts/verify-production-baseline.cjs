'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const ref=process.argv[2]==='--ref'?process.argv[3]:null;
if(ref&&!/^[A-Za-z0-9._/-]+$/.test(ref))throw Error('Invalid Git ref');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'releases/production-20261026.json'),'utf8'));
let count=0;
for(const service of manifest.services){
 for(const file of service.files){
  const full=path.resolve(root,service.sourceDirectory,file.path);
  if(!full.startsWith(path.resolve(root,service.sourceDirectory)+path.sep))throw Error('Invalid manifest path');
  let bytes;
  if(ref){
   const result=spawnSync('git',['show',ref+':'+service.sourceDirectory+'/'+file.path],{cwd:root,maxBuffer:2000000});
   if(result.status!==0)throw Error('Historical source unavailable: '+file.path);
   bytes=result.stdout;
  }else bytes=fs.readFileSync(full);
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(hash!==file.sha256||bytes.length!==file.bytes)throw Error('Deployed source differs: '+service.name+'/'+file.path);
  if(/\.(?:js|cjs)$/.test(file.path)){
   const result=spawnSync(process.execPath,['--check','--input-type=commonjs'],{input:bytes,encoding:'utf8'});
   if(result.status!==0)throw Error(result.stderr);
  }
  count++;
 }
}
console.log('PRODUCTION BASELINE PASS: '+count+' exact deployed files; JavaScript syntax valid. No cloud calls.');
