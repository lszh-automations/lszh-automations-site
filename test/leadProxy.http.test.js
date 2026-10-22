'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');

async function freePort(){
  const sock=net.createServer();
  await new Promise((ok,fail)=>sock.once('error',fail).listen(0,'127.0.0.1',ok));
  const port=sock.address().port;
  await new Promise(ok=>sock.close(ok));
  return port;
}

test('Website lead returns success only after Make confirms a saved Airtable record', {timeout:30000}, async t=>{
  let upstreamStatus=200;
  let upstreamBody=JSON.stringify({ok:true,record_id:'recABCDEFGHIJKLMN'});
  const upstream=http.createServer((req,res)=>{
    req.resume();
    req.on('end',()=>{
      res.writeHead(upstreamStatus,{'Content-Type':'application/json'});
      res.end(upstreamBody);
    });
  });
  await new Promise((ok,fail)=>upstream.once('error',fail).listen(0,'127.0.0.1',ok));
  t.after(()=>new Promise(ok=>upstream.close(ok)));
  const port=await freePort();
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.resolve(__dirname,'..'),
    env:{...process.env,PORT:String(port),NODE_ENV:'test',SITE_PRIVATE:'false',
      MAKE_LEAD_WEBHOOK:'http://127.0.0.1:'+upstream.address().port},
    stdio:['ignore','pipe','pipe']
  });
  let out='';
  child.stdout.on('data',d=>{out+=String(d);});
  child.stderr.on('data',d=>{out+=String(d);});
  t.after(async()=>{
    child.kill('SIGTERM');
    if(child.exitCode===null && child.signalCode===null)
      await Promise.race([new Promise(ok=>child.once('exit',ok)),new Promise(ok=>setTimeout(ok,3000))]);
  });
  const until=Date.now()+10000;
  while(!out.includes('LSZH Automations listening on ') && child.exitCode===null && Date.now()<until)
    await new Promise(ok=>setTimeout(ok,25));
  assert.match(out,/LSZH Automations listening on /);
  async function submit(){
    const r=await fetch('http://127.0.0.1:'+port+'/api/lead',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:'TEST_ONLY',company:'TEST_ONLY GmbH',email:'test@example.invalid',
        message:'Synthetic local test',submitted_at:'2026-10-22T03:30:00.000Z'}),
      signal:AbortSignal.timeout(5000)
    });
    return {status:r.status,body:await r.json()};
  }
  let r=await submit();
  assert.equal(r.status,200);
  assert.deepEqual(r.body,{ok:true});

  upstreamBody='Accepted'; // inactive Make webhook can acknowledge without creating a row
  r=await submit();
  assert.equal(r.status,502);
  assert.equal(r.body.error,'storage_not_confirmed');

  upstreamBody=JSON.stringify({ok:true}); // no Airtable record ID
  r=await submit();
  assert.equal(r.status,502);
  assert.equal(r.body.error,'storage_not_confirmed');

  upstreamStatus=500;
  r=await submit();
  assert.equal(r.status,502);
  assert.equal(r.body.error,'upstream_failed');
});
