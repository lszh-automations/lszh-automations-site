'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lszh-crm-preview-'));
process.env.LSZH_LOCAL_PREVIEW_DIR=tmp;
const {createApp}=require('../local-preview');
const server=createApp();
let base='';

test.before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
test.after(async()=>{
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(tmp,{recursive:true,force:true});
});
async function call(method,route,data){
  const r=await fetch(base+route,{method,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});
  const contentType=r.headers.get('content-type')||'';
  return {status:r.status,body:contentType.includes('json')?await r.json():await r.text()};
}
test('serves the real CRM interface in a clearly separate offline preview',async()=>{
  const r=await call('GET','/');
  assert.equal(r.status,200);
  assert.match(r.body,/LOKALE TESTVERSION/);
  assert.match(r.body,/Geschäftliche Angaben|Website Leads/);
  assert.doesNotMatch(r.body,/script src="https:\/\/accounts\.google\.com\/gsi\/client"/);
  assert.match(r.body,/if\(config\.localDemo\)/);
});
test('starts with only explicitly marked synthetic data in five registers',async()=>{
  for(const table of ['leads','kunden','offerten','rechnungen','projekte']){
    const r=await call('GET','/api/records/'+table);
    assert.equal(r.status,200);
    assert.ok(r.body.records.length>0);
  }
  const r=await call('GET','/api/config');
  assert.deepEqual(r.body,{localDemo:true});
  assert.ok(fs.existsSync(path.join(tmp,'data.json')));
});
test('stores local changes without touching cloud services',async()=>{
  const input={
    name:'TEST Tester',company:'TEST GmbH',email:'tester@example.com',
    street:'Testweg 1',postalCode:'5000',city:'Aarau',country:'Schweiz',
    message:'Test',currentProcess:'Test',systems:'Excel',mainProblem:'Test',frequency:'Täglich'
  };
  const made=await call('POST','/api/records/leads',input);
  assert.equal(made.status,201);
  assert.equal(made.body.record.status,'Neu');
  const id=made.body.record.id;
  const patched=await call('PATCH','/api/records/leads/'+id,{status:'Qualifiziert'});
  assert.equal(patched.status,200);
  assert.equal(patched.body.record.status,'Qualifiziert');
  const saved=JSON.parse(fs.readFileSync(path.join(tmp,'data.json'),'utf8'));
  assert.equal(saved.leads.find(x=>x.id===id).status,'Qualifiziert');
});
test('requires address and avoids invalid CRM statuses',async()=>{
  const denied=await call('POST','/api/records/leads',{name:'Test',company:'TEST',email:'test@example.com'});
  assert.equal(denied.status,400);
  const invalid=await call('PATCH','/api/records/leads/test-lead-1',{status:'Ungueltig'});
  assert.equal(invalid.status,400);
});
test('continues local offer numbering from 1001',async()=>{
  const r=await call('POST','/api/records/offerten',{title:'TEST: Neue Offerte',status:'Entwurf'});
  assert.equal(r.status,201);
  assert.equal(r.body.record.number,'1001');
});

test('live mode exposes a version endpoint and browser self-reload, demo mode does not',async()=>{
  process.env.LSZH_LIVE_PREVIEW='1';
  try{
    const page=await call('GET','/');
    assert.equal(page.status,200);
    assert.match(page.body,/\/__live\/version/);
    assert.match(page.body,/window\.location\.reload\(\)/);
    const a=await call('GET','/__live/version');
    const b=await call('GET','/__live/version');
    assert.equal(a.status,200);
    assert.equal(b.status,200);
    assert.equal(a.body.version,b.body.version);
  }finally{
    delete process.env.LSZH_LIVE_PREVIEW;
  }
  const hidden=await call('GET','/__live/version');
  assert.equal(hidden.status,404);
});

test('repairs only untouched old demo fixtures and preserves user edits',async()=>{
  const file=path.join(tmp,'data.json');
  const saved=fs.readFileSync(file,'utf8');
  function previousFixture(){
    const fixture=require('../local-preview').seedData();
    const customer=fixture.kunden[0];
    Object.assign(customer,{
      company:'Muster Sanitär AG',contactName:'Max Muster',
      email:'max.muster@example.com',street:'Musterstrasse 12',
      postalCode:'5610',city:'Wohlen',country:'Schweiz'
    });
    fixture.offerten[0].leadId='test-lead-1';
    fixture.offerten[0].title='TEST: Offertenautomation';
    return fixture;
  }
  try{
    const legacy=previousFixture();
    fs.writeFileSync(file,JSON.stringify(legacy));
    const result=await call('GET','/api/records/offerten');
    assert.equal(result.status,200);
    assert.equal(result.body.records[0].leadId,'');
    const migrated=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.equal(migrated.demoFixtureRevision,2);
    assert.equal(migrated.kunden[0].company,'Demo Büro AG');
    assert.equal(migrated.leads[0].company,'Muster Sanitär AG');
    assert.equal(migrated.offerten.length,1);
    // A user-customized example must NOT be silently overwritten.
    const custom=previousFixture();
    custom.offerten[0].title='Kundenofferte – von mir bearbeitet';
    fs.writeFileSync(file,JSON.stringify(custom));
    const protectedResult=await call('GET','/api/records/offerten');
    assert.equal(protectedResult.status,200);
    assert.equal(protectedResult.body.records[0].title,custom.offerten[0].title);
    assert.equal(protectedResult.body.records[0].leadId,'test-lead-1');
    assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).demoFixtureRevision,undefined);
  }finally{
    fs.writeFileSync(file,saved);
  }
});
