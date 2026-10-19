'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..','hosting','customer-portal');
const hosting=JSON.parse(fs.readFileSync(path.join(root,'firebase.json'),'utf8')).hosting;

test('customer portal hosting is isolated and never changes existing company website',()=>{
 assert.equal(hosting.site,'lszh-automations-portal');
 assert.equal(hosting.public,'public');
 assert.ok(fs.existsSync(path.join(root,hosting.public,'404.html')));
 assert.equal(hosting.rewrites.length,2);
 assert.deepEqual(hosting.rewrites.map(x=>x.source),[
   '/offerte-annehmen/**','/api/offer/**'
 ]);
 for(const rule of hosting.rewrites){
   assert.deepEqual(rule.run,{serviceId:'lszh-offer-portal',region:'europe-west6'});
   assert.equal(rule.destination,undefined);
 }
 const text=JSON.stringify(hosting);
 for(const field of ['accessToken','apiKey','tokenHash','privateKey','lars@','/offerte-annehmen/?code='])
   assert.ok(!text.includes(field),'no secrets or personal links in Hosting configuration: '+field);
});

test('Firebase site serves only generic 404 outside the token portal route',()=>{
 const html=fs.readFileSync(path.join(root,hosting.public,'404.html'),'utf8');
 assert.match(html,/Seite nicht verfügbar/);
 assert.match(html,/noindex/);
 assert.doesNotMatch(html,/firebase|script|<form|Kunde:|Vertrag akzeptieren/i);
 assert.ok(hosting.headers.some(h=>h.source==='**' &&
   h.headers.some(x=>x.key==='X-Robots-Tag'&&/noindex/.test(x.value))));
});
