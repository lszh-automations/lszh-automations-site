'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {setTimeout:delay}=require('node:timers/promises');
const path=require('node:path');
const {validateOnboarding}=require('../onboardingValidation');
function fixture(suffix='0001'){return {
  project_code:'ob_aaaaaaaa-bbbb-cccc-dddd-00000000'+suffix,
  company:'LSZH MOCK "GmbH" <E2E>',project_name:'Offerten & Onboarding',
  project_contact:"Muster O'Neil",contact_email:'test@example.invalid',
  make_account_status:'Make-Organisation vorhanden',
  make_organization:'LSZH SYNTHETISCH – KEINE ECHTE ORG',
  make_invitation_status:'Einladung versendet',sensitive_data:'Unsicher',
  approver:'Muster Freigabeperson',billing_email:'test@example.invalid',
  notes:'<img src=x onerror=alert(1)> & Test'
};}
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('Onboarding validation requires canonical UUID, fixed choices and rejects injected data',()=>{
  const f=fixture();
  const accepted=validateOnboarding({...f,make_invitation_status:'Einladung versendet',made_up_field:'NOT_ALLOWED'});
  assert.equal(accepted.make_invitation_status,'Einladung versendet');
  assert.equal(accepted.made_up_field,undefined);
  assert.equal(accepted.notes,f.notes);
  assert.equal(accepted.source,'LSZH Kunden-Onboarding');
  for(const data of [
    {...f,project_code:'ob_------------------------------------'},
    {...f,project_code:'ob_aaaaaaaa-bbbb-cccc-dddd-xxxxxxxxxxxx'},
    {...f,company:''},
    {...f,contact_email:'invalid-address'},
    {...f,make_account_status:'Administrator'},
    {...f,make_invitation_status:'Einladung bestätigt'},
    {...f,sensitive_data:'Unknown'},
    {...f,notes:'x'.repeat(4000)}
  ])assert.throws(()=>validateOnboarding(data));
});
test('Local website server: confirmed / pending / duplicate / invalid, no real Make request',async t=>{
  let mode='confirmed';
  const received=[];
  const mock=http.createServer((req,res)=>{
    const buf=[];req.on('data',x=>buf.push(x));req.on('end',()=>{
      received.push(JSON.parse(Buffer.concat(buf).toString()));
      res.setHeader('Content-Type','application/json');
      if(mode==='confirmed')return res.end(JSON.stringify({ok:true,record_id:'recABC12345678901'}));
      if(mode==='pending')return res.end(JSON.stringify({ok:true}));
      if(mode==='duplicate'){res.statusCode=409;return res.end(JSON.stringify({error:'already_submitted'}));}
      res.statusCode=502;res.end(JSON.stringify({error:'test_upstream_error'}));
    });
  });
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>mock.close(r)));
  const webPort=await port(), base='http://127.0.0.1:'+webPort;
  const child=spawn(process.execPath,['server.js'],{
    cwd:path.resolve(__dirname,'..'),
    env:{...process.env,PORT:String(webPort),SITE_PRIVATE:'false',
      MAKE_ONBOARDING_WEBHOOK:'http://127.0.0.1:'+mock.address().port+'/mock',
      OFFER_ACCEPTANCE_ENABLED:'false'},
    stdio:['ignore','pipe','pipe']
  });
  t.after(()=>child.kill('SIGTERM'));
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base+'/onboarding/')).ok){ready=true;break;}}catch{}await delay(70);}
  assert.equal(ready,true);
  const post=x=>fetch(base+'/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(x)});
  let response=await post(fixture('0001'));
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,confirmed:true});
  assert.equal(received[0].make_invitation_status,'Einladung versendet');
  assert.equal(received[0].source,'LSZH Kunden-Onboarding');
  response=await post(fixture('0001'));assert.equal(response.status,409);
  mode='pending';response=await post(fixture('0002'));assert.equal(response.status,202);
  assert.deepEqual(await response.json(),{ok:true,pending:true});
  mode='duplicate';response=await post(fixture('0003'));assert.equal(response.status,409);
  assert.equal((await response.json()).error,'already_submitted_or_invalid');
  mode='failed';response=await post(fixture('0004'));assert.equal(response.status,502);
  const receivedBefore=received.length;
  response=await post(fixture('0004'));assert.equal(response.status,409);
  assert.equal(received.length,receivedBefore,'ambiguous Make failure must not immediately retry');
  response=await post({...fixture('0005'),project_code:'ob_abc----'});assert.equal(response.status,400);
  response=await post({...fixture('0006'),make_invitation_status:'Zugriff bestätigt'});assert.equal(response.status,400);
});
