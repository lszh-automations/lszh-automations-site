import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {listCandidateCodes}=require('./airtable-candidates');
const A='ob_00000000-0000-4000-8000-000000000000';
const B='ob_10000000-0000-4000-8000-000000000000';

test('only explicit, syntactically valid staging fixtures are eligible',()=>{
  assert.deepEqual(listCandidateCodes(A),[A]);
  assert.deepEqual(listCandidateCodes(' '+A+', '+B+' '),[A,B]);
});

test('no allowlist refuses to scan a CRM, fail closed',()=>{
  assert.throws(()=>listCandidateCodes(undefined),/fixture_allowlist_required/);
  assert.throws(()=>listCandidateCodes(''),/fixture_allowlist_required/);
});

test('invalid and duplicate codes fail closed, no broad Airtable enumeration',()=>{
  for(const codes of ['not-a-code',A+',',A+','+A,
    [A,B,A,B].join(','),A+';'+B,'*',A+' '.repeat(600)]){
    assert.throws(()=>listCandidateCodes(codes));
  }
});

test('fixture selector does not need Airtable credentials or network',()=>{
  assert.deepEqual(listCandidateCodes(B),[B]);
});
