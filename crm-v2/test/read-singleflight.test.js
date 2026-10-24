'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {singleflight}=require('../read-singleflight');

test('concurrent dashboard reads share precisely one Firestore scan, with no persistent cache',async()=>{
  let executions=0,release;
  const gate=new Promise(resolve=>{release=resolve;});
  const summary=singleflight(async()=>{
    executions++;
    await gate;
    return {openInvoices:4,openInvoiceCents:12000};
  });
  const requests=Array.from({length:25},()=>summary());
  assert.ok(requests.every(x=>x===requests[0]));
  await Promise.resolve();
  assert.equal(executions,1);
  release();
  const result=await Promise.all(requests);
  assert.ok(result.every(x=>x.openInvoices===4));
  await Promise.resolve();
  assert.deepEqual(await summary(),{openInvoices:4,openInvoiceCents:12000});
  assert.equal(executions,2,'a later request must compute a new live financial snapshot');
});

test('a failed dashboard scan does not poison later authorized requests',async()=>{
  let calls=0;
  const summary=singleflight(async()=>{
    if(++calls===1)throw new Error('firestore temporarily unavailable');
    return {leadCount:12};
  });
  const first=await Promise.allSettled([summary(),summary(),summary()]);
  assert.ok(first.every(x=>x.status==='rejected'));
  assert.equal(calls,1);
  assert.deepEqual(await summary(),{leadCount:12});
  assert.equal(calls,2);
});

test('singleflight never starts work on module import and rejects invalid computations',()=>{
  assert.throws(()=>singleflight(null),{name:'TypeError'});
});
