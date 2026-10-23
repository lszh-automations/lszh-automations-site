'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  checkReadyForDispatch,normalizeDispatchInput,normalizeFollowUpInput,
  dueOfferFollowUps,validDate
}=require('../offer-tracking');
const example={
  status:'Bereit',validUntil:'2026-11-30',number:'1000',title:'Automationsangebot',
  items:[{title:'Implementation',mode:'einmalig',qty:1,unitPriceCHF:500}]
};
test('ready check requires a valid unexpired quote and recipient',()=>{
  assert.equal(checkReadyForDispatch(example,{email:'Kunde@Example.CH'},'2026-10-23'),'kunde@example.ch');
  assert.throws(()=>checkReadyForDispatch({...example,status:'Entwurf'},{email:'kunde@example.ch'},'2026-10-23'),{status:409});
  assert.throws(()=>checkReadyForDispatch({...example,validUntil:'2026-09-01'},{email:'kunde@example.ch'},'2026-10-23'),{status:409});
  assert.throws(()=>checkReadyForDispatch({...example,items:[]},{email:'kunde@example.ch'},'2026-10-23'),{status:409});
  assert.throws(()=>checkReadyForDispatch(example,{email:''},'2026-10-23'),{status:409});
});
test('date and event validation reject past dates, malformed payloads and oversized notes',()=>{
  assert.equal(validDate('2026-10-23'),true);
  assert.equal(validDate('2026-02-30'),false);
  assert.equal(validDate(''),false);
  assert.deepEqual(normalizeDispatchInput({followUpDate:'2026-10-24'},'2026-10-23'),{followUpDate:'2026-10-24'});
  assert.throws(()=>normalizeDispatchInput({followUpDate:'2026-10-22'},'2026-10-23'),{status:400});
  assert.throws(()=>normalizeDispatchInput({followUpDate:'2026-10-24',sentAt:'spoof'},'2026-10-23'),{status:400});
  assert.deepEqual(normalizeFollowUpInput({followUpDate:'2026-10-25',note:'  Rückruf  '},'2026-10-23'),
    {followUpDate:'2026-10-25',note:'Rückruf'});
  assert.throws(()=>normalizeFollowUpInput({followUpDate:'2026-10-25',note:'x'.repeat(501)},'2026-10-23'),{status:400});
});
test('dashboard only shows sent offers that are actually due and orders oldest first',()=>{
  const offers=[
    {id:'future',status:'Versendet',followUpDate:'2026-10-24'},
    {id:'today',status:'Versendet',followUpDate:'2026-10-23'},
    {id:'overdue',status:'Versendet',followUpDate:'2026-10-20'},
    {id:'accepted',status:'Angenommen',followUpDate:'2026-10-21'},
    {id:'draft',status:'Entwurf',followUpDate:'2026-10-22'},
    {id:'invalid',status:'Versendet',followUpDate:'x'}
  ];
  assert.deepEqual(dueOfferFollowUps(offers,'2026-10-23').map(o=>o.id),['overdue','today']);
});
