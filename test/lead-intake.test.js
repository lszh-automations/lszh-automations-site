'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');

async function freePort(){
  const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));
  const p=s.address().port;await new Promise(r=>s.close(r));return p;
}
function payload(){
  return {name:'Max Muster',company:'Muster AG',email:'max@beispiel.ch',
    message:'Wir wollen unsere Angebote automatisieren.',current_process:'Manuell per E-Mail',
    systems:'Excel',main_problem:'Hoher Zeitaufwand',frequency:'Wöchentlich',
    desired_result:'Automatisch erfassen'};
}
test('Website lead proxy distinguishes Airtable receipt, pending and errors',async t=>{
  let mode='confirmed',received=null;
  const upstream=http.createServer((req,res)=>{
    const chunks=[];req.on('data',x=>chunks.push(x));req.on('end',()=>{
      received=JSON.parse(Buffer.concat(chunks).toString());
      res.setHeader('Content-Type','application/json');
      if(mode==='confirmed'){res.statusCode=200;res.end(JSON.stringify({ok:true,record_id:'recABC12345678901'}));}
      else if(mode==='pending'){res.statusCode=200;res.end(JSON.stringify({ok:true}));}
      else{res.statusCode=502;res.end(JSON.stringify({error:'upstream_failed'}));}
    });
  });
  await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>upstream.close(r)));
  const port=await freePort();
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.resolve(__dirname,'..'),
    env:{...process.env,PORT:String(port),SITE_PRIVATE:'false',
      MAKE_LEAD_WEBHOOK:'http://127.0.0.1:'+upstream.address().port+'/lead'},
    stdio:['ignore','pipe','pipe']
  });
  t.after(()=>{child.kill('SIGTERM');});
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<50;i++){
    try{const response=await fetch(base+'/');if(response.status===200){ready=true;break;}}catch{}
    await delay(60);
  }
  assert.equal(ready,true,'Local website server should start');
  const submit=async data=>fetch(base+'/api/lead',{method:'POST',
    headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify(data)});
  mode='confirmed';
  let r=await submit(payload());
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,confirmed:true});
  assert.equal(received.company,'Muster AG');assert.equal(received.source,'LSZH Automations Website');
  mode='pending';
  r=await submit(payload());assert.equal(r.status,202);
  assert.deepEqual(await r.json(),{ok:true,pending:true});
  mode='failed';
  r=await submit(payload());assert.equal(r.status,502);
  mode='confirmed';
  r=await submit({...payload(),email:'not-an-email'});
  assert.equal(r.status,400);
  r=await submit({...payload(),message:''});
  assert.equal(r.status,400);
  r=await submit({...payload(),message:'X'.repeat(3000)});
  assert.equal(r.status,400);
  r=await fetch(base+'/api/lead',{method:'POST',
    headers:{'Content-Type':'application/json','Origin':'https://not-the-site.example'},
    body:JSON.stringify(payload())});
  assert.equal(r.status,403);
});
