import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {server}=require('../../server.js');

test('website serves only known public routes, never private worker source or secrets',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 try {
  for(const path of ['/', '/onboarding/', '/make-start/', '/secure/', '/secure-admin/', '/robots.txt']){
    const r=await fetch(base+path);assert.equal(r.status,200,path);
  }
  for(const path of [
    '/server.js','/package.json','/workers/onboarding-notifications/server.js',
    '/workers/onboarding-notifications/firestore-store.js',
    '/onboarding/confirmation.js','/onboarding/response-contract.test.mjs',
    '/.env','/.github/workflows/onboarding-notification-outbox.yml',
    '/docs/LSZH_AUTOMATIONS_PROJEKTSTAND.md','/secrets.json'
  ]){
    const r=await fetch(base+path);assert.equal(r.status,404,path);
    const text=await r.text();assert.equal(text,'Not found');
  }
 } finally {await new Promise(resolve=>server.close(resolve));}
});
