'use strict';
// Run existing isolated portal regressions against the exact deployed portal copy.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-portal-test-'));
// contract-acceptance-http also asserts the separate CRM server and runs in the CRM suite.
const tests=['customer-login','customer-portal-gateways','customer-portal-live-runtime','contract-acceptance','contract-acceptance-drive','contract-acceptance-client'];
try{
 fs.cpSync(path.join(root,'crm-v2/customer-portal'),temp,{recursive:true});
 fs.mkdirSync(path.join(temp,'test'),{recursive:true});
 fs.cpSync(path.join(root,'crm-v2/test/helpers'),path.join(temp,'test/helpers'),{recursive:true});
 for(const name of tests)fs.copyFileSync(path.join(root,'crm-v2/test',name+'.test.js'),path.join(temp,'test',name+'.test.js'));
 const env={...process.env,NODE_PATH:path.join(root,'crm-v2/node_modules')};
 for(const key of Object.keys(env))if(/^(GOOGLE_APPLICATION_CREDENTIALS|CRM_|PORTAL_CONFIG|MAKE_|OPENAI_)/.test(key))delete env[key];
 const result=spawnSync(process.execPath,['--test',...tests.map(n=>path.join(temp,'test',n+'.test.js'))],{env,stdio:'inherit'});
 process.exitCode=result.status??1;
}finally{fs.rmSync(temp,{recursive:true,force:true});}
