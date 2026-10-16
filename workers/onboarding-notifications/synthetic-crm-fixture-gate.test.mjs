import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {buildPlan,validateBeforeWrite,isRealFreshToken}=require('./synthetic-crm-fixture-gate');
const token='ob_92f84f12-25cc-4552-9f80-93d33a77f61b';
const customerId='rec'+'C'.repeat(14);
const orderId='rec'+'B'.repeat(14);
const args={projectCode:token,customerId,orderId};
const copy=x=>structuredClone(x);
const valid=()=>buildPlan(args);

test('strict fixture contains exactly three isolated synthetic records, no live contacts',()=>{
 const fixture=valid();
 assert.equal(validateBeforeWrite({...args,proposed:fixture}),true);
 assert.equal(fixture.order['Leistung'],'Beratung');
 assert.equal(fixture.order['Status'],'Pausiert');
 assert.equal(fixture.order['Abrechnungsmodell'],'Individuell');
 assert.equal(fixture.order['Nächste Fakturierung'],null);
 assert.equal(fixture.order['Einmalig CHF'],0);
 assert.equal(fixture.order['Monatlich CHF'],0);
 assert.equal(fixture.order['Standardaufgaben erstellt'],true);
 assert.equal(fixture.order['Projektabschluss durchgeführt'],false);
 assert.equal(fixture.order['AVV erforderlich'],'Prüfen');
 assert.equal(fixture.order['Verbindungen erforderlich'],true);
 assert.equal(fixture.order['Make-Zugriff bestätigt'],false);
 assert.deepEqual(fixture.order.Kunde,[customerId]);
 assert.deepEqual(fixture.onboarding.Auftrag,[orderId]);
 assert.deepEqual(fixture.onboarding.Kunde,[customerId]);
 assert.equal(fixture.onboarding.Status,'Eingegangen');
 assert.equal(fixture.onboarding['Sensible Daten'],'Nein');
 for(const record of Object.values(fixture))
   for(const [name,value] of Object.entries(record))
     if(/E-Mail/.test(name))assert.equal(value,'synthetisch@example.invalid');
});

test('predictable all-zero test token and non-v4 project codes prohibited in LIVE CRM plan',()=>{
 for(const value of [
  'ob_00000000-0000-4000-8000-000000000000',
  'ob_00000000-0000-0000-0000-000000000001',
  'ob_f5c71326-7ceb-5555-9500-93d33a77f61b',
  'not-a-code',null
 ]) {
  assert.equal(isRealFreshToken(value),false);
  assert.throws(()=>buildPlan({...args,projectCode:value}),/unsafe_fixture_project_code/);
 }
});

test('missing real synthetic linked Airtable IDs fails before writing',()=>{
 for (const tweak of [{customerId:''},{orderId:'rec123'},{customerId:orderId}])
  assert.throws(()=>buildPlan({...args,...tweak}));
});

test('active task-generator trigger cannot match altered Leistung',()=>{
 const p=valid();p.order.Leistung='Automation-Projekt';
 assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_order_field/);
});

test('invoice due/recurrence, positive values or next invoice date are blocked',()=>{
 for(const [field,bad] of [
  ['Abrechnungsmodell','Einmalig'],
  ['Abrechnungsmodell','Monatlich'],
  ['Nächste Fakturierung','2026-10-17'],
  ['Einmalig CHF',100],
  ['Monatlich CHF',499],
  ['Status','Aktiv']
 ]) {
  const p=valid();p.order[field]=bad;
  assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_order_field/);
 }
});

test('project completion and standard-task gate must remain safe',()=>{
 for(const [field,bad] of [['Projektabschluss durchgeführt',true],['Standardaufgaben erstellt',false]]){
  const p=valid();p.order[field]=bad;
  assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_order_field/);
 }
});

test('no accidental real recipients, extra attachments, connected live resources',()=>{
 for(const key of ['customer','order','onboarding']){
  const p=valid();p[key].UnerwarteterEintrag='nicht erlaubt';
  assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unexpected_/);
 }
 const p=valid();p.customer['Rechnungs-E-Mail']='real@company.example';
 assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_customer_field/);
});

test('no Make confirmation or invite, AVV unchanged, synthetic status only',()=>{
 for(const [record,field,bad] of [
  ['order','Make-Zugriff bestätigt',true],
  ['order','Make-Einladungsstatus','Einladung versendet'],
  ['order','AVV erforderlich','Nein'],
  ['onboarding','Status','Vollständig'],
  ['onboarding','Sensible Daten','Unsicher']
 ]) {
  const p=valid();p[record][field]=bad;
  assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_/);
 }
});

test('must remain impossible to substitute another customer or order relation',()=>{
 let p=valid();p.order.Kunde=['rec'+'Z'.repeat(14)];
 assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_order_field/);
 p=valid();p.onboarding.Auftrag=[];
 assert.throws(()=>validateBeforeWrite({...args,proposed:p}),/unsafe_onboarding_field/);
});
