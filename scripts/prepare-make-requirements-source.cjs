'use strict';
// Local packaging only: no cloud, credentials, deployment or provider requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
function prepareSource(service,output){
 if(!['crm','portal'].includes(service))throw Error('Use crm or portal');
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'releases/production-20261026.json'),'utf8'));
 const entry=manifest.services[service==='crm'?0:1],base=path.resolve(root,entry.sourceDirectory),out=path.resolve(output);
 if(out===root||out.startsWith(base+path.sep)||fs.existsSync(out))throw Error('Output must be a new directory outside the source');
 fs.mkdirSync(out);
 const files=[...entry.files.map(f=>f.path),'make-requirements.js','brand.js',...(service==='crm'?['order-confirmation.js','acceptance-notification.js','invoice-reminder.js','dashboard-reporting.js','monthly-billing.js']:[])];
 const hashes=[];
 for(const name of files){
  const src=path.resolve(base,name),dest=path.resolve(out,name);
  if(!src.startsWith(base+path.sep)||!dest.startsWith(out+path.sep))throw Error('Invalid source path');
  fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);
  const bytes=fs.readFileSync(dest);hashes.push({path:name,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
 }
 return {service,sourceDirectory:out,files:hashes};
}
if(require.main===module){
 const [service,output]=process.argv.slice(2);if(!output)throw Error('Usage: node scripts/prepare-make-requirements-source.cjs crm|portal NEW_OUTPUT_DIRECTORY');
 console.log(JSON.stringify(prepareSource(service,output),null,2));
}
module.exports={prepareSource};
