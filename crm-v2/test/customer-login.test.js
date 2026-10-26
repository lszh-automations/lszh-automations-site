'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCustomerLogin}=require('../customer-login');
const {tokenHash}=require('../contract-acceptance-staging');
function fixture(){
  let time=1000000,sent;const rows=new Map();let queue=Promise.resolve();
  const transaction=fn=>{const result=queue.then(async()=>{const staged=new Map();const value=await fn({get:async id=>structuredClone(rows.get(id)||null),set:(id,v)=>staged.set(id,structuredClone(v))});for(const [id,v] of staged)rows.set(id,v);return value;});queue=result.catch(()=>{});return result;};
  const token=Buffer.alloc(32,1).toString('base64url');
  const acceptanceStore={resolve:async hash=>{assert.equal(hash,tokenHash(token));return {invitation:{recipient:'test@example.com',expiresAt:time+600000}};}};
  const options={transaction,acceptanceStore,secret:Buffer.alloc(32,2),now:()=>time,sendCode:async value=>{sent=value;}};
  return {token,rows,options,login:createCustomerLogin(options),sent:()=>sent,advance:n=>{time+=n;}};
}
test('mailbox code creates a session bound to the exact invitation; no raw secrets persist',async()=>{
  const f=fixture(),c=await f.login.request(f.token),code=f.sent().code;
  assert.equal(code.length,8);assert.equal(f.sent().recipient,'test@example.com');
  const {session}=await f.login.verify(f.token,{challengeId:c.challengeId,code});
  assert.equal((await f.login.identity(f.token,session)).method,'verified_session');
  const data=JSON.stringify([...f.rows.values()]);assert.ok(!data.includes(code));assert.ok(!data.includes(session));
  await assert.rejects(f.login.verify(f.token,{challengeId:c.challengeId,code}),{code:'LOGIN_CODE_INVALID'});
  await assert.rejects(f.login.identity(Buffer.alloc(32,9).toString('base64url'),session),{code:'IDENTITY_REQUIRED'});
  f.advance(900000);await assert.rejects(f.login.identity(f.token,session),{code:'IDENTITY_REQUIRED'});
});
test('five bad guesses lock a challenge, concurrent code use produces one session',async()=>{
  const f=fixture(),c=await f.login.request(f.token),code=f.sent().code;
  const wrong=code==='00000000'?'11111111':'00000000';
  for(let i=0;i<5;i++)await assert.rejects(f.login.verify(f.token,{challengeId:c.challengeId,code:wrong}));
  await assert.rejects(f.login.verify(f.token,{challengeId:c.challengeId,code}),{code:'LOGIN_CODE_INVALID'});
  f.advance(60000);const next=await f.login.request(f.token),right=f.sent().code;
  const r=await Promise.allSettled([f.login.verify(f.token,{challengeId:next.challengeId,code:right}),f.login.verify(f.token,{challengeId:next.challengeId,code:right})]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
});
test('send rate limit survives new login instances and delivery failure never enables a code',async()=>{
  const f=fixture();await f.login.request(f.token);
  const other=createCustomerLogin(f.options);await assert.rejects(other.request(f.token),{code:'LOGIN_RATE_LIMITED'});
  for(let i=1;i<5;i++){f.advance(60000);await other.request(f.token);}
  f.advance(60000);await assert.rejects(other.request(f.token),{code:'LOGIN_RATE_LIMITED'});
  const g=fixture(),broken=createCustomerLogin({...g.options,sendCode:async()=>{throw Error('provider');}});
  await assert.rejects(broken.request(g.token),{code:'LOGIN_DELIVERY_FAILED'});
  assert.equal([...g.rows.values()][0].delivered,false);
});
