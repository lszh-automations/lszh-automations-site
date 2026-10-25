'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'../..');
const suite=path.join(root,'crm-v2/emulator-tests/contract-dispatch-firestore.test.js');
const runner=path.join(root,'scripts/test-crm-contract-firestore-emulator.ps1');

test('C2 emulator configuration is localhost-only with no deployment sections',()=>{
  const config=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8'));
  assert.equal(config.emulators.firestore.host,'127.0.0.1');
  assert.equal(config.emulators.firestore.port,8788);
  assert.equal(config.emulators.ui.enabled,false);
  assert.deepEqual(Object.keys(config),['emulators']);
  assert.equal(Object.hasOwn(config,'firestore'),false);
  assert.equal(Object.hasOwn(config,'functions'),false);
});
test('C2 actual emulator integration suite refuses missing or hostile host, never connects to cloud',()=>{
  for(const host of ['', 'firestore.googleapis.com:443','10.10.1.1:8788']){
    const env={...process.env,FIRESTORE_EMULATOR_HOST:host};
    const result=spawnSync(process.execPath,[suite],{
      env,encoding:'utf8',timeout:12000,maxBuffer:250000
    });
    assert.notEqual(result.status,0,'must reject host '+host);
    assert.match(result.stderr+result.stdout,/REFUSED: Firestore emulator/);
  }
});
test('C2 emulator scripts guard demo project and contain no external sends or cloud deploy',()=>{
  const src=fs.readFileSync(suite,'utf8');
  const ps=fs.readFileSync(runner,'utf8');
  assert.match(src,/demo-lszha-c2-20261025/);
  assert.match(src,/FIRESTORE_EMULATOR_HOST/);
  assert.match(ps,/firebase-tools@15\.1\.0/);
  assert.match(ps,/Remove-Item Env:\\GOOGLE_APPLICATION_CREDENTIALS/);
  assert.match(ps,/emulators:exec --only firestore --project/);
  assert.doesNotMatch(src+ps,/\bgcloud(?:\.cmd)?\s+(?:run|deploy)|firebase deploy|hook\.eu1\.make\.com|gmail\.send/);
});
