'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const net=require('node:net');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const code='Z'.repeat(48);
async function openPort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function childApp(){
  const port=await openPort();
  const child=spawn(process.execPath,['--require',path.join(__dirname,'support','offer-http-mock.cjs'),'server.js'],{
    cwd:repo,
    env:{...process.env,PORT:String(port),SITE_PRIVATE:'false',NODE_ENV:'test'},
    stdio:['ignore','pipe','pipe','ipc']
  });
  const base='http://127.0.0.1:'+port;
  let log='',ready=false,seq=0;
  const waiting=new Map();
  child.stdout.on('data',c=>{
    log+=String(c);
    if(log.includes('LSZH Automations listening on '))ready=true;
  });
  child.stderr.on('data',c=>{log+=String(c)});
  child.on('message',m=>{
    const p=waiting.get(m.requestId);
    if(p){waiting.delete(m.requestId);p.resolve(m);}
  });
  child.on('exit',(code,signal)=>{
    for(const p of waiting.values())p.reject(new Error('test child exited '+code+' '+signal+' '+log));
    waiting.clear();
  });
  const deadline=Date.now()+10000;
  while(!ready && Date.now()<deadline && child.exitCode===null)
    await new Promise(r=>setTimeout(r,30));
  if(!ready){child.kill();throw new Error('Local synthetic server failed to start: '+log.slice(-1500));}
  function command(op,params={}){
    const requestId=++seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiting.delete(requestId);reject(new Error('Mock IPC timeout: '+op));},9000);
      waiting.set(requestId,{resolve:m=>{clearTimeout(timer);resolve(m)},reject:e=>{clearTimeout(timer);reject(e)}});
      child.send({op,requestId,...params});
    });
  }
  async function call(endpoint,body,{origin=base}={}){
    const r=await fetch(base+'/api/offer/'+endpoint,{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin},
      body:JSON.stringify(body),signal:AbortSignal.timeout(9000)
    });
    const contentType=r.headers.get('content-type')||'';
    const bytes=Buffer.from(await r.arrayBuffer());
    let json;
    if(contentType.includes('application/json'))json=JSON.parse(bytes.toString('utf8'));
    return {status:r.status,headers:r.headers,json,bytes};
  }
  return {base,child,command,call,close:async()=>{
    child.kill('SIGTERM');
    await new Promise(resolve=>{if(child.exitCode!==null || child.signalCode!==null)return resolve();child.once('exit',resolve);setTimeout(resolve,3000)});
  }};
}
const payload=(sha,mode='Ja')=>({
  code,name:'Synthetische Testperson',email:'user@example.invalid',
  authorized:true,accept_terms:true,
  quote_sha256:sha.offer,terms_sha256:sha.terms,
  ...(mode==='Ja'?{accept_avv:true,avv_sha256:sha.avv,avv_version:'TEST_ONLY_AVV_AB_C'}:{accept_avv:false})
});
test('HTTP full journey – browser route → synthetic Airtable → Drive JWT/PDF → stored evidence', {timeout:45000}, async t=>{
  const app=await childApp();
  t.after(()=>app.close());
  const start=await app.command('snapshot');
  const sha={offer:start.docs.quote.sha,terms:start.docs.terms.sha,avv:start.docs.avv.sha};
  await t.test('real HTTP serves the draft page',async()=>{
    const r=await fetch(app.base+'/offerte-annehmen/',{signal:AbortSignal.timeout(6000)});
    assert.equal(r.status,200);
    const page=await r.text();
    assert.match(page,/id="avvConsent"/);
    assert.match(page,/id="avvPdf"/);
  });
  await t.test('source files, configs and Render secret file names are never public',async()=>{
    for(const forbidden of [
      '/server.js', '/offerArchiveVerifier.js', '/offerAcceptance.js',
      '/package.json', '/README.txt', '/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md',
      '/test/offerAcceptance.http.test.js',
      '/.env', '/.github/workflows/offer-acceptance-check.yml',
      '/lszh-archive-reader.json', '/%2eenv', '/%2e%2e/server.js'
    ]){
      const r=await fetch(app.base+forbidden,{signal:AbortSignal.timeout(6000)});
      assert.equal(r.status,404,'forbidden static path '+forbidden);
    }
  });
  await t.test('AVV Ja previews 3 separately frozen files through JWT-mocked Drive metadata',async()=>{
    const r=await app.call('preview',{code});
    assert.equal(r.status,200);
    assert.equal(r.json.offer.avv_required,true);
    assert.equal(r.json.offer.avv_sha256,sha.avv);
    assert.equal(r.json.offer.terms_sha256,sha.terms);
  });
  await t.test('AVV offer, terms and AVV downloads have PDF binary and no-store policy',async()=>{
    for(const which of ['quote','terms','avv']){
      const d=await app.call('document',{code,which});
      assert.equal(d.status,200,which);
      assert.equal(d.headers.get('content-type'),'application/pdf');
      assert.equal(d.headers.get('cache-control'),'no-store');
      assert.ok(d.bytes.subarray(0,5).equals(Buffer.from('%PDF-')),which);
      assert.ok(d.bytes.length>100);
    }
  });
  await t.test('no separate AVV consent means no write',async()=>{
    const {accept_avv,...b}=payload(sha);
    const r=await app.call('accept',b);
    assert.equal(r.status,400);
    assert.equal(r.json.error,'avv_consent_required');
    assert.equal((await app.command('snapshot')).writes,0);
  });
  await t.test('document tampering stops at preview even if stored digest has not changed',async()=>{
    await app.command('tamper',{tamper:true});
    const p=await app.call('preview',{code});
    assert.equal(p.status,409);
    assert.equal(p.json.error,'archive_changed');
    assert.equal((await app.command('snapshot')).writes,0);
    await app.command('tamper',{tamper:false});
  });
  await t.test('synthetic third-PDF hash mismatch stops acceptance before write',async()=>{
    const r=await app.call('accept',{...payload(sha),avv_sha256:'0'.repeat(64)});
    assert.equal(r.status,409);
    assert.equal(r.json.error,'avv_document_changed');
    assert.equal((await app.command('snapshot')).writes,0);
  });
  await t.test('PATCH failure keeps offer unaccepted; response must not claim success',async()=>{
    await app.command('failPatch',{value:true});
    const r=await app.call('accept',payload(sha));
    assert.equal(r.status,502);
    assert.equal(r.json.error,'temporarily_unavailable');
    assert.equal((await app.command('snapshot')).writes,0);
    await app.command('failPatch',{value:false});
  });
  await t.test('explicitly accepted AVV stores versioned audit record exactly once',async()=>{
    const r=await app.call('accept',payload(sha));
    assert.equal(r.status,200);
    assert.equal(r.json.confirmation_email_pending,true);
    const snapshot=await app.command('snapshot');
    assert.equal(snapshot.writes,1);
    assert.equal(snapshot.fields.Status,'Angenommen');
    assert.equal(snapshot.fields['Online-Annahme AVV ausdrücklich akzeptiert'],true);
    const ev=JSON.parse(snapshot.fields['Online-Annahme Nachweis']);
    assert.equal(ev.avv_pdf_sha256,sha.avv);
    assert.equal(ev.terms_pdf_sha256,sha.terms);
    assert.equal(ev.quote_pdf_sha256,sha.offer);
    assert.equal(ev.avv_explicitly_confirmed,true);
    assert.equal(ev.terms_confirmed,true);
    assert.equal(ev.offer_number,'TEST-ONLY-HTTP-20261014');
  });
  await t.test('repeating accepted token does not create second acceptance',async()=>{
    const again=await app.call('accept',payload(sha));
    assert.equal(again.status,409);
    assert.equal((await app.command('snapshot')).writes,1);
  });
  const noAvvServer=await childApp();
  t.after(()=>noAvvServer.close());
  await t.test('AVV Nein is only two documents, third PDF 404, consent rejected',async()=>{
    await noAvvServer.command('mode',{mode:'Nein'});
    const p=await noAvvServer.call('preview',{code});
    assert.equal(p.status,200);assert.equal(p.json.offer.avv_required,false);
    const d=await noAvvServer.call('document',{code,which:'avv'});
    assert.equal(d.status,404);
    const unexpected=await noAvvServer.call('accept',{...payload(sha,'Nein'),accept_avv:true});
    assert.equal(unexpected.status,400);
    assert.equal((await noAvvServer.command('snapshot')).writes,0);
    const good=await noAvvServer.call('accept',payload(sha,'Nein'));
    assert.equal(good.status,200);
    const stored=await noAvvServer.command('snapshot');
    assert.equal(stored.writes,1);
    assert.equal(stored.fields['Online-Annahme AVV ausdrücklich akzeptiert'],false);
    assert.equal(JSON.parse(stored.fields['Online-Annahme Nachweis']).avv_required,false);
  });
  const undecidedServer=await childApp();
  t.after(()=>undecidedServer.close());
  await t.test('AVV Prüfen is blocked and cannot reach acceptance',async()=>{
    await undecidedServer.command('mode',{mode:'Prüfen'});
    const p=await undecidedServer.call('preview',{code});
    assert.equal(p.status,404);
    const result=await undecidedServer.call('accept',payload(sha,'Nein'));
    assert.equal(result.status,409);
    assert.equal((await undecidedServer.command('snapshot')).writes,0);
  });
  await t.test('untrusted origin cannot trigger offer operations',async()=>{
    const r=await app.call('preview',{code},{origin:'https://untrusted.invalid'});
    assert.equal(r.status,403);
  });
});
