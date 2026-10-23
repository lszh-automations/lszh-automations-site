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
  const linked=await call('GET','/api/records/offerten');
  assert.equal(linked.body.records.filter(x=>x.leadId===id).length,1);
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
    fixture.projekte[0].offerId='test-offer-1';
    fixture.projekte[0].title='TEST: Musterprojekt';
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
    assert.equal(migrated.projekte[0].offerId,'');
    assert.equal(migrated.projekte[0].customerId,'test-customer-1');
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

test('qualification creates exactly one offer and blocks further duplicates',async()=>{
  const invalid=await call('POST','/api/records/offerten',{
    leadId:'test-lead-1',title:'Zu frühe Offerte'
  });
  assert.equal(invalid.status,400);
  assert.match(invalid.body.error,/zuerst qualifizieren/);
  const upgraded=await call('PATCH','/api/records/leads/test-lead-2',{status:'Qualifiziert'});
  assert.equal(upgraded.status,200);
  const first=await call('GET','/api/records/offerten');
  const matching=first.body.records.filter(o=>o.leadId==='test-lead-2');
  assert.equal(matching.length,1);
  assert.equal(matching[0].status,'Entwurf');
  const repeated=await call('PATCH','/api/records/leads/test-lead-2',{status:'Qualifiziert'});
  assert.equal(repeated.status,200);
  const second=await call('GET','/api/records/offerten');
  assert.equal(second.body.records.filter(o=>o.leadId==='test-lead-2').length,1);
  const duplicate=await call('POST','/api/records/offerten',{
    leadId:'test-lead-2',title:'Zweite Offerte'
  });
  assert.equal(duplicate.status,400);
  assert.match(duplicate.body.error,/bereits eine Offerte/);
});
test('Won lead produces customer, linked accepted offer and project atomically',async()=>{
  const step=await call('PATCH','/api/records/leads/test-lead-1',{status:'Qualifiziert'});
  assert.equal(step.status,200);
  const won=await call('PATCH','/api/records/leads/test-lead-1',{status:'Gewonnen'});
  assert.equal(won.status,200);
  const leads=await call('GET','/api/records/leads');
  const offers=await call('GET','/api/records/offerten');
  const customers=await call('GET','/api/records/kunden');
  const projects=await call('GET','/api/records/projekte');
  const offer=offers.body.records.find(o=>o.leadId==='test-lead-1');
  assert.equal(leads.body.records.find(x=>x.id==='test-lead-1').status,'Gewonnen');
  assert.equal(offer.status,'Angenommen');
  assert.equal(customers.body.records.filter(x=>x.company==='Muster Sanitär AG').length,1);
  assert.equal(projects.body.records.filter(x=>x.offerId===offer.id).length,1);
  const repeat=await call('PATCH','/api/records/leads/test-lead-1',{status:'Gewonnen'});
  assert.equal(repeat.status,200);
  const after=await call('GET','/api/records/projekte');
  assert.equal(after.body.records.filter(x=>x.offerId===offer.id).length,1);
});

test('quote line items persist their calculated one-time and monthly totals',async()=>{
  const created=await call('POST','/api/records/offerten',{
    title:'TEST: Positionen',customerId:'test-customer-1',description:'Für interne Vorschau.',
    validUntil:'2026-11-30',status:'Entwurf',items:[
      {title:'Einmalige Einrichtung',mode:'einmalig',qty:2,unitPriceCHF:249.95},
      {title:'Monatlicher Support',mode:'monatlich',qty:1,unitPriceCHF:99}
    ]
  });
  assert.equal(created.status,201);
  assert.equal(created.body.record.oneTimeCHF,499.90);
  assert.equal(created.body.record.monthlyCHF,99);
  assert.equal(created.body.record.items.length,2);
  const id=created.body.record.id;
  const updated=await call('PATCH','/api/records/offerten/'+id,{
    items:[{title:'Korrigierte Umsetzung',mode:'einmalig',qty:3,unitPriceCHF:200}]
  });
  assert.equal(updated.status,200);
  assert.equal(updated.body.record.oneTimeCHF,600);
  assert.equal(updated.body.record.monthlyCHF,0);
  const data=JSON.parse(fs.readFileSync(path.join(tmp,'data.json'),'utf8'));
  assert.equal(data.offerten.find(x=>x.id===id).oneTimeCHF,600);
  assert.equal(data.offerten.find(x=>x.id===id).items[0].qty,3);
  const printable=await call('GET','/preview/offerte/'+id);
  assert.equal(printable.status,200);
  assert.match(printable.body,/Korrigierte Umsetzung/);
  assert.match(printable.body,/CHF 600.00/);
  assert.match(printable.body,/Demo Büro AG/);
  assert.match(printable.body,/NICHT AN KUNDEN VERSENDEN/);
});
test('quote API rejects negative or malformed line items without saving changes',async()=>{
  const created=await call('POST','/api/records/offerten',{
    title:'TEST: Ungültig',items:[{title:'Position',mode:'einmalig',qty:1,unitPriceCHF:-5}]
  });
  assert.equal(created.status,400);
  assert.match(created.body.error,/Ungültiger Betrag/);
  const missing=await call('GET','/preview/offerte/not-a-record');
  assert.equal(missing.status,404);
});
