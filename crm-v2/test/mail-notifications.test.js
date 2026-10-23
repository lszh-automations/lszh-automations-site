'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EVENT_TYPES,isEligible,renderMail,eventId}=require('../mail-templates');
const {makeDispatcher}=require('../mail-dispatcher');
const T0=Date.parse('2026-10-23T12:00:00Z');
const oneDay=24*60*60*1000;
const lead=()=>({id:'web_012345678901234567890123456789ab',name:'Clara <Test>',
  company:'Muster GmbH',email:'clara@firma.ch',message:'Anfrage <script>alert(1)</script>',
  status:'Neu',createdAt:new Date(T0).toISOString()});
function fakeDB(data=lead()){
  const mailEvents=new Map();
  const leads=new Map([[data.id,{...data}]]);
  const snap=(id,value)=>({exists:Boolean(value),id,data:()=>value});
  return {
    leads,mailEvents,
    collection(name){
      if(name.endsWith('_mail_events')){
        return {doc(id){
          return {
            async create(value){
              if(mailEvents.has(id)){
                const error=Error('duplicate');error.code=6;throw error;
              }
              mailEvents.set(id,{...value});
            },
            async update(value){Object.assign(mailEvents.get(id),value);}
          };
        }};
      }
      if(name.endsWith('_leads')){
        return {
          doc(id){return {async get(){return snap(id,leads.get(id));}};},
          orderBy(){return {
            limit(){return {
              async get(){return {docs:[...leads.entries()].map(([id,value])=>snap(id,value))};}
            };}
          };}
        };
      }
      throw Error('unexpected collection '+name);
    }
  };
}
test('all three Swiss German mail types have correct destinations and escaped HTML',()=>{
  const l=lead();
  for(const kind of Object.values(EVENT_TYPES)){
    const msg=renderMail(kind,l);
    assert.match(msg.subject,/LSZH|Ihre Anfrage/);
    assert.match(msg.html,/LSZH Automations/);
    assert.doesNotMatch(msg.html,/<script>/);
    if(kind!==EVENT_TYPES.CUSTOMER_ACK)assert.match(msg.html,/&lt;script&gt;/);
    if(kind===EVENT_TYPES.CUSTOMER_ACK)assert.equal(msg.to,l.email);
    else assert.equal(msg.to,'lars@lszh-automations.ch');
    assert.equal(eventId(kind,l.id),kind+'__'+l.id);
  }
});
test('24h reminder is due only after 24h and while status Neu',()=>{
  const l=lead();
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_24H,T0+oneDay-1,T0),false);
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_24H,T0+oneDay,T0),true);
  l.status='Kontaktiert';
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_24H,T0+oneDay+1,T0),false);
  assert.equal(isEligible(l,EVENT_TYPES.CUSTOMER_ACK,T0+100,T0),true);
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_NEW,T0+100,T0),true);
});
test('old leads and TEST_ONLY leads never receive newly enabled automated messages',()=>{
  const l=lead();
  assert.equal(isEligible(l,EVENT_TYPES.CUSTOMER_ACK,T0+100,T0+1),false);
  l.company='TEST_ONLY test';
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_NEW,T0+100,T0),false);
  l.company='Firma';l.email='tester@example.com';
  assert.equal(isEligible(l,EVENT_TYPES.CUSTOMER_ACK,T0+100,T0),false);
});
test('mail integration defaults to disabled and never calls the provider',async()=>{
  const db=fakeDB(), sent=[];
  const dispatcher=makeDispatcher(db,'lszh_crm_v2_',{
    fetchImpl:async(...args)=>{sent.push(args);throw Error('must_not_call')},now:()=>T0+100
  });
  assert.deepEqual((await dispatcher.tick()).results,[]);
  assert.equal(sent.length,0);
  assert.equal(db.mailEvents.size,0);
});
test('business Gmail gateway receipt is necessary; repeated ticks do not resend',async()=>{
  const db=fakeDB(), sent=[];
  const dispatcher=makeDispatcher(db,'lszh_crm_v2_',{
    enabled:true,activeFrom:new Date(T0).toISOString(),
    webhookUrl:'https://hook.eu1.make.com/abcdefghijklmnopqrstuvwxyz',
    now:()=>T0+5000,
    fetchImpl:async(url,opts)=>{
      sent.push({url,payload:JSON.parse(opts.body)});
      return {ok:true,status:200,json:async()=>({ok:true,messageId:'gmail-test-id-'+sent.length})};
    }
  });
  const one=await dispatcher.tick();
  assert.equal(one.results.length,2);
  assert.equal(db.mailEvents.size,2);
  assert.equal(sent.length,2);
  assert.equal(db.mailEvents.get(eventId(EVENT_TYPES.CUSTOMER_ACK,lead().id)).status,'confirmed');
  const two=await dispatcher.tick();
  assert.equal(two.results.length,0);
  assert.equal(sent.length,2);
});
test('24h follow-up is queued exactly once if still Neu, not if contacted',async()=>{
  let current=T0+60*1000;
  const db=fakeDB(),sent=[];
  const dispatcher=makeDispatcher(db,'lszh_crm_v2_',{
    enabled:true,activeFrom:new Date(T0).toISOString(),
    webhookUrl:'https://hook.eu1.make.com/abcdefghijklmnopqrstuvwxyz',
    now:()=>current,
    fetchImpl:async(url,opts)=>{
      sent.push(JSON.parse(opts.body).kind);
      return {ok:true,status:200,json:async()=>({ok:true,messageId:'msg_'+sent.length})};
    }
  });
  await dispatcher.tick();assert.equal(sent.length,2);
  current=T0+oneDay+1000;
  db.leads.get(lead().id).status='Kontaktiert';
  await dispatcher.tick();assert.equal(sent.length,2);
  db.leads.get(lead().id).status='Neu';
  await dispatcher.tick();assert.equal(sent.length,3);
  assert.equal(sent[2],EVENT_TYPES.INTERNAL_24H);
  await dispatcher.tick();assert.equal(sent.length,3);
});
test('gateway 200 Accepted is NOT treated as sent; ambiguous results are never retried',async()=>{
  const db=fakeDB(),sent=[];
  const dispatcher=makeDispatcher(db,'lszh_crm_v2_',{
    enabled:true,activeFrom:new Date(T0).toISOString(),
    webhookUrl:'https://hook.eu1.make.com/abcdefghijklmnopqrstuvwxyz',
    now:()=>T0+1000,
    fetchImpl:async()=>{sent.push(1);return{ok:true,status:200,json:async()=>({message:'Accepted'})};}
  });
  await dispatcher.tick();
  assert.equal(sent.length,2);
  assert.equal(db.mailEvents.get(eventId(EVENT_TYPES.INTERNAL_NEW,lead().id)).status,'manual_review');
  await dispatcher.tick();
  assert.equal(sent.length,2);
});
