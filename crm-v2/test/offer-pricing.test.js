'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {quoteTotals,sanitizeItems,existingLines}=require('../offer-pricing');
const {renderOfferPreview}=require('../offer-preview');

test('accurate independent one-time and monthly CHF line totals',()=>{
  const prices=quoteTotals([
    {title:'Einrichtung',qty:1,unitPriceCHF:1200.50,mode:'einmalig'},
    {title:'Arbeitsstunden',qty:2.5,unitPriceCHF:100.10,mode:'einmalig'},
    {title:'Betreuung',qty:3,unitPriceCHF:49.95,mode:'monatlich'}
  ]);
  assert.equal(prices.oneTimeCHF,1450.75);
  assert.equal(prices.monthlyCHF,149.85);
  assert.equal(prices.items.length,3);
});
test('quote line validation blocks invalid money, quantities, types and excessive rows',()=>{
  const standard={title:'Leistung',qty:1,unitPriceCHF:10,mode:'einmalig'};
  for(const row of [
    {...standard,title:''}, {...standard,qty:0}, {...standard,qty:-1},
    {...standard,qty:1.0001},{...standard,unitPriceCHF:-3},
    {...standard,unitPriceCHF:1.005},{...standard,mode:'jährlich'}
  ])assert.throws(()=>sanitizeItems([row]),/Position|Betrag|Menge|Bezeichnung|Art/);
  assert.throws(()=>sanitizeItems(Array.from({length:61},()=>({...standard}))),/Offertenpositionen/);
});
test('historical demo quote amounts become editable positions without losing prices',()=>{
  const previous={oneTimeCHF:1200,monthlyCHF:199};
  const lines=existingLines(previous);
  assert.equal(lines.length,2);
  const priced=quoteTotals(lines);
  assert.equal(priced.oneTimeCHF,1200);
  assert.equal(priced.monthlyCHF,199);
  assert.deepEqual(existingLines({items:[]}),[]);
});
test('printable A4 preview escapes input and shows the correct totals',()=>{
  const offer={
    number:'1007',status:'Entwurf',title:'Automatisierung <script>alert(1)</script>',
    description:'Erster Abschnitt\nZweiter Abschnitt',
    validUntil:'2026-11-30',createdAt:'2026-10-23T00:00:00Z',
    items:[
      {title:'Setup & Planung',qty:2,unitPriceCHF:249.90,mode:'einmalig'},
      {title:'Service',qty:1,unitPriceCHF:99.00,mode:'monatlich'}
    ]
  };
  const lead={
    company:'Test & Partner <AG>',name:'Mara Muster',
    street:'Teststrasse 1',postalCode:'5610',city:'Wohlen',country:'Schweiz'
  };
  const html=renderOfferPreview(offer,lead,null);
  assert.match(html,/size:A4/);
  assert.match(html,/INTERNE TESTVORSCHAU/);
  assert.match(html,/Offerten-Nr. 1007/);
  assert.match(html,/CHF 499.80/);
  assert.match(html,/CHF 99.00/);
  assert.match(html,/Test &amp; Partner &lt;AG&gt;/);
  assert.match(html,/Automatisierung &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.match(html,/30\.11\.2026/);
  assert.doesNotMatch(html,/\{\{(?:TITLE|NUMBER|COMPANY)\}\}/);
  assert.match(html,/Drucken \/ als PDF speichern/);
});
