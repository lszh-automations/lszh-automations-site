'use strict';
// Windows-only smoke test: synthetic secret bytes, fake gcloud.cmd on PATH.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createC371SecretWriter}=require('../contract-gmail-c371-secret-writer');
const {readSecretEnvelope,SECRET_PURPOSE,EXPECTED_MAILBOX}=
  require('../contract-gmail-c37-backend-staging');

test('C3.7.1 real Windows stdin piping with mock gcloud.cmd, zero live traffic',async()=>{
  if(process.platform!=='win32')return;
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-c371-synthetic-'));
  const originalPath=process.env.PATH;
  const oldScript=process.env.C371_TEST_SCRIPT;
  const oldDir=process.env.C371_TEST_DIR;
  const cid='470613067122-testonlyc371transport.apps.googleusercontent.com';
  const secret=Buffer.from(JSON.stringify({
    version:1,purpose:SECRET_PURPOSE,expectedMailbox:EXPECTED_MAILBOX,
    clientId:cid,clientSecret:'TEST_ONLY_NO_REAL_SECRET_123456',
    refreshToken:'TEST_ONLY_NO_REAL_REFRESH_TOKEN_123456',
    approvedSenders:['info@lszh-automations.ch'],
    allowedRecipients:[EXPECTED_MAILBOX]
  }));
  const mockFile=path.join(dir,'fake-gcloud.js');
  const batFile=path.join(dir,'gcloud.cmd');
  const mock=[
    "'use strict';",
    "const fs=require('node:fs');",
    "const path=require('node:path');",
    "const a=process.argv.slice(2);",
    "if(a[0]!=='secrets'||a[1]!=='versions'||",
    "  a[3]!=='lszh-crm-c37-gmail-readonly'||",
    "  !a.includes('--project=lszh-automations'))process.exit(21);",
    "const out=path.join(process.env.C371_TEST_DIR,'captured.bin');",
    "if(a[2]==='list'){",
    "  if(!a.includes('--format=value(name)'))process.exit(22);",
    "  if(fs.existsSync(out))process.stdout.write('versions/1');",
    "}else if(a[2]==='add'){",
    "  if(!a.includes('--data-file=-'))process.exit(23);",
    "  const bufs=[];",
    "  process.stdin.on('data',b=>bufs.push(b));",
    "  process.stdin.on('end',()=>fs.writeFileSync(out,Buffer.concat(bufs)));",
    "}else process.exit(24);"
  ].join('\n');
  try{
    fs.writeFileSync(mockFile,mock);
    fs.writeFileSync(batFile,'@echo off\r\nnode "%C371_TEST_SCRIPT%" %*\r\n');
    process.env.PATH=dir+path.delimiter+originalPath;
    process.env.C371_TEST_SCRIPT=mockFile;
    process.env.C371_TEST_DIR=dir;
    const writer=createC371SecretWriter();
    await writer.assertEmpty();
    assert.equal(await writer.store(secret),true);
    const captured=fs.readFileSync(path.join(dir,'captured.bin'));
    assert.deepEqual(captured,secret);
    assert.equal(readSecretEnvelope(captured.toString('utf8')).clientId,cid);
    await assert.rejects(writer.assertEmpty());
    await assert.rejects(writer.store(secret));
  }finally{
    secret.fill(0);
    process.env.PATH=originalPath;
    if(oldScript===undefined)delete process.env.C371_TEST_SCRIPT;
    else process.env.C371_TEST_SCRIPT=oldScript;
    if(oldDir===undefined)delete process.env.C371_TEST_DIR;
    else process.env.C371_TEST_DIR=oldDir;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
