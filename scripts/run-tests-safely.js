'use strict';
// The same test runner is used in GitHub CI and the Render build environment.
// Never pass runtime secrets or live service settings into synthetic test cases.
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
const tests=fs.readdirSync(path.join(repo,'test'))
  .filter(name=>name.endsWith('.test.js')).sort()
  .map(name=>path.join('test',name));
if(!tests.length){console.error('No test files found');process.exit(2);}
const env={...process.env};
for(const key of Object.keys(env)){
  if(key.startsWith('OFFER_') || key.startsWith('MAKE_') ||
     key.includes('SECRET') || key.endsWith('_WEBHOOK') ||
     key==='PREVIEW_TOKEN' || key==='OPENAI_API_KEY')
    delete env[key];
}
env.SITE_PRIVATE='false';
env.NODE_ENV='test';

// Windows uses the installed Git Bash for shell syntax and fail-closed tests.
// Change only this test child's PATH; never the user's global environment.
if(process.platform==='win32'){
  const candidates=[
    path.join(process.env.ProgramFiles||'C:\\Program Files','Git','bin'),
    path.join(process.env.LOCALAPPDATA||'','Programs','Git','bin')
  ];
  const bashDir=candidates.find(dir=>fs.existsSync(path.join(dir,'bash.exe')));
  if(bashDir){
    const pathKey=Object.keys(env).find(key=>key.toLowerCase()==='path')||'PATH';
    env[pathKey]=bashDir+path.delimiter+(env[pathKey]||'');
  }
}

const result=spawnSync(process.execPath,['--test',...tests],{
  cwd:repo,env,stdio:'inherit',shell:false
});
if(result.error){console.error('Tests could not start');process.exit(2);}
process.exit(result.status===null?1:result.status);
