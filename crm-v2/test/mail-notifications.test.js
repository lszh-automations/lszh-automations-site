'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {EVENT_TYPES,isEligible,renderMail,eventId}=require('../mail-templates');
const {makeDispatcher}=require('../mail-dispatcher');
const T0=Date.parse('2026-10-23T12:00:00Z');
const oneDay=24*60*60*1000;
const lead=()=>({id:'web_012345678901234567890123456789ab',name:'Clara <Test>',
  company:'Muster GmbH',email:'clara@firma.ch',message:'Anfrage <script>alert(1)</script>',
  status:'Neu',source:'LSZH Automations Website',createdAt:new Date(T0).toISOString()});
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
test('customer confirmation follows LSZH website brand and works without remote assets',()=>{
  const l=lead();
  const mail=renderMail(EVENT_TYPES.CUSTOMER_ACK,l);
  assert.equal(mail.to,'clara@firma.ch');
  assert.equal(mail.subject,'Ihre Anfrage bei LSZH Automations ist eingegangen');
  assert.match(mail.html,/role="presentation"/);
  assert.match(mail.html,/background-color:#06101d/);
  assert.match(mail.html,/background-color:#74d8ff/);
  assert.match(mail.html,/background-color:#5b8cff/);
  assert.match(mail.html,/background-color:#8e72ff/);
  assert.match(mail.html,/AUTOMATION FÜR SCHWEIZER KMU/);
  assert.match(mail.html,/Ihre Anfrage ist bei uns eingegangen/);
  assert.match(mail.html,/Wie geht es weiter/);
  assert.match(mail.html,/Rummelmatt 8/);
  assert.match(mail.html,/LSZH Invest GmbH/);
  assert.match(mail.html,/https:\/\/lszh-automations\.ch\//);
  assert.match(mail.html,/mailto:info@lszh-automations\.ch/);
  assert.match(mail.html,/Guten Tag Clara &lt;Test&gt;/);
  assert.doesNotMatch(mail.html,/<script|<img|<svg|<iframe|<link\b/i);
  assert.doesNotMatch(mail.html,/Anfrage &lt;script&gt;/);
  assert.doesNotMatch(mail.html,/Live-CRM öffnen|lszh-crm-v2-ozx7mp2bka/);
  assert.doesNotMatch(mail.html,/<style\b/i);
  const missingName=renderMail(EVENT_TYPES.CUSTOMER_ACK,{...l,name:''});
  assert.match(missingName.html,/>Guten Tag<\/p>/);
  assert.doesNotMatch(missingName.html,/Guten Tag Guten Tag/);
});
test('internal lead and reminder emails use LSZH branding, maintain recipients and action',()=>{
  const l=lead();
  const newMail=renderMail(EVENT_TYPES.INTERNAL_NEW,l);
  const reminder=renderMail(EVENT_TYPES.INTERNAL_24H,l);
  assert.equal(newMail.to,'lars@lszh-automations.ch');
  assert.equal(reminder.to,'lars@lszh-automations.ch');
  assert.equal(newMail.subject,'[LSZH CRM] Neuer Website-Lead: Muster GmbH');
  assert.equal(reminder.subject,'[LSZH CRM] 24h-Erinnerung: Muster GmbH – weiterhin Neu');
  for(const html of [newMail.html,reminder.html]){
    assert.match(html,/role="presentation"/);
    assert.match(html,/background-color:#06101d/);
    assert.match(html,/background-color:#0a1728/);
    assert.match(html,/background-color:#74d8ff/);
    assert.match(html,/background-color:#5b8cff/);
    assert.match(html,/background-color:#8e72ff/);
    assert.match(html,/INTERNES CRM/);
    assert.match(html,/INTERNER CRM-HINWEIS/);
    assert.match(html,/LSZH Invest GmbH/);
    assert.match(html,/Rummelmatt 8/);
    assert.match(html,/Live-CRM öffnen/);
    assert.match(html,/href="https:\/\/lszh-crm-v2-ozx7mp2bka-oa\.a\.run\.app"/);
    assert.match(html,/Kontakt/);
    assert.match(html,/Unternehmen/);
    assert.match(html,/E-Mail/);
    assert.match(html,/Lead-ID:/);
    assert.match(html,/Clara &lt;Test&gt;/);
    assert.match(html,/Anfrage &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html,/<script|<img|<svg|<iframe|<link\b|<style\b/i);
    assert.doesNotMatch(html,/Diese Nachricht bestätigt nur den Eingang Ihrer Anfrage/);
    assert.doesNotMatch(html,/#f7f9fc/);
  }
  assert.match(newMail.html,/Neue Website-Anfrage eingegangen/);
  assert.match(newMail.html,/NEUER WEBSITE-LEAD/);
  assert.match(reminder.html,/Lead nach 24 Stunden noch auf «Neu»/);
  assert.match(reminder.html,/24H-ERINNERUNG/);
  assert.match(reminder.html,/Bitte prüfen und bearbeiten/);
});
test('internal HTML treats customer-controlled input only as text',()=>{
  const l={...lead(),
    name:'" <img src=x onerror=alert(1)>',
    company:'Firma & Co. <iframe>',
    email:'mail+test@firma.ch',
    message:'Zeile 1\n<script>alert("x")</script>\nhttps://example.org?x=<unsafe>'};
  for(const kind of [EVENT_TYPES.INTERNAL_NEW,EVENT_TYPES.INTERNAL_24H]){
    const html=renderMail(kind,l).html;
    assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html,/Firma &amp; Co. &lt;iframe&gt;/);
    assert.match(html,/Zeile 1<br>&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    assert.match(html,/https:\/\/example.org\?x=&lt;unsafe&gt;/);
    assert.doesNotMatch(html,/<img|<iframe|<script/i);
    const links=[...html.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);
    assert.deepEqual(links,['https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app']);
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
test('manual CRM leads do not trigger website auto-mails',()=>{
  const l=lead();
  l.source='Manuell';
  assert.equal(isEligible(l,EVENT_TYPES.CUSTOMER_ACK,T0+1000,T0),false);
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_NEW,T0+1000,T0),false);
  l.source='LSZH Automations Website';l.id='manual-123';
  assert.equal(isEligible(l,EVENT_TYPES.INTERNAL_24H,T0+oneDay,T0),false);
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
