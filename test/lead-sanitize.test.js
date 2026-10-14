'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const script=fs.readFileSync(path.resolve(__dirname,'../scripts/lead-sanitize.make.js'),'utf8');
const sanitize=new Function('input',script);
function fixture(){
  return {
    name:"Léa O'Brian",company:'"Test", AG <Sanitär>',
    email:"lea@example.ch",
    message:'<img src=x onerror="alert(1)">\nKosten & Nutzen: "gross"',
    current_process:'Heute: Excel\nMorgen: E-Mail',systems:'Excel & Gmail',
    main_problem:'Hoher Zeitaufwand',frequency:'Wöchentlich',
    desired_result:'Ergebnis < 24h',
    submitted_at:'2026-10-14T12:34:56.000Z'
  };
}
test('safe JSON and original Airtable values survive punctuation and line breaks',()=>{
  const input=fixture(),out=sanitize(input);
  const fields=JSON.parse(out.airtableJson).fields;
  assert.equal(fields.Firma,input.company);
  assert.equal(fields.Nachricht,input.message);
  assert.equal(fields['Heutiger Ablauf'],input.current_process);
  assert.equal(fields.Quelle,'LSZH Automations Website');
  assert.deepEqual(fields['CRM Dashboard'],['recducv1Ym0fcbDqr']);
});
test('HTML mail data escapes unsafe input',()=>{
  const out=sanitize(fixture());
  assert.ok(out.messageHtml.includes('&lt;img'));
  assert.ok(!out.messageHtml.includes('<img'));
  assert.ok(out.nameHtml.includes('&#39;'));
  assert.ok(out.companyHtml.includes('&quot;'));
  assert.ok(out.messageHtml.includes('<br>'));
  assert.equal(out.email,'lea@example.ch');
});
test('invalid inputs cannot pass to Make Airtable or Gmail',()=>{
  assert.throws(()=>sanitize({...fixture(),email:'not-an-email'}),/INVALID_LEAD_EMAIL/);
  assert.throws(()=>sanitize({...fixture(),message:' '}),/INVALID_LEAD_FIELD_message/);
  assert.throws(()=>sanitize({...fixture(),message:'z'.repeat(2501)}),/INVALID_LEAD_FIELD_message/);
  assert.throws(()=>sanitize({...fixture(),submitted_at:'yesterday'}),/INVALID_TIMESTAMP/);
});
test('subject fields cannot inject line breaks',()=>{
  const out=sanitize({...fixture(),company:'Company\r\nBcc: victim@example.test',name:'Léa\nTEST'});
  assert.doesNotMatch(out.companySubject,/[\r\n]/);
  assert.doesNotMatch(out.nameSubject,/[\r\n]/);
});
