'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('offerte-annehmen/index.html','utf8');
const js=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(js.length,1);

function fakeElement(){
  const classes=new Set(['hidden']), listeners=new Map();
  return {classes,listeners,textContent:'',value:'',checked:false,required:false,
    disabled:false,style:{}, attributes:{},
    classList:{add(x){classes.add(x)},remove(x){classes.delete(x)},contains(x){return classes.has(x)},toggle(x,force){if(force)classes.add(x);else classes.delete(x);}},
    addEventListener(event,fn){listeners.set(event,fn)},
    setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k]},
    reportValidity(){return true}
  };
}
async function start({avvRequired=false,demo=false,syntheticPreview=false,search,hash=''}={}){
  const nodes=new Map(), calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,fakeElement());return nodes.get(id);};
  const code='A'.repeat(40);
  const location={search:search??(demo?'?demo=1':('?code='+code)),hash,pathname:'/offerte-annehmen/'};
  const redactions=[];
  const offer={number:'TEST-2026',test_only:syntheticPreview,
    company:'Muster GmbH',service:'Automations-Test',
    once:1000,monthly:99,payment_model:'Test',valid_until:'2099-12-31',
    terms_version:'v1.0',quote_sha256:'a'.repeat(64),terms_sha256:'b'.repeat(64),
    avv_required:avvRequired,avv_version:avvRequired?'AVV_v1.0':null,
    avv_sha256:avvRequired?'c'.repeat(64):null};
  const fetcher=async(path,opt)=>{
    const payload=JSON.parse(opt.body);
    calls.push({path,payload});
    if(path.endsWith('preview'))return {ok:true,json:async()=>({ok:true,offer})};
    if(path.endsWith('accept'))return {ok:true,json:async()=>({ok:true,offer_number:'TEST-2026',confirmation_email_pending:true})};
    throw Error('Unexpected request '+path);
  };
  const context={document:{getElementById:node},
    location,history:{replaceState(...args){redactions.push(args)}},URLSearchParams,
    Intl,Number,String,Array,JSON,Promise,
    fetch:fetcher,console,setTimeout,URL,
    Blob};
  vm.runInNewContext(js[0][1],context,{filename:'offerte-annehmen/index.html'});
  await new Promise(resolve=>setImmediate(resolve));
  return {node,calls,offer,redactions};
}
test('demo mode reveals optional AVV but cannot accept or download',async()=>{
  const s=await start({demo:true,avvRequired:true});
  assert.equal(s.node('avvSection').classes.has('hidden'),false);
  assert.equal(s.node('avvConsent').required,true);
  assert.equal(s.node('avvConsent').checked,false);
  assert.equal(s.node('submit').disabled,true);
  assert.equal(s.calls.length,0);
});
test('synthetic cloud preview clearly disables binding consent and POST even for direct submit',async()=>{
 const s=await start({avvRequired:true,syntheticPreview:true});
 assert.equal(s.node('submit').disabled,true);
 assert.match(s.node('submit').textContent,/deaktiviert/);
 assert.match(s.node('acceptanceHeading').textContent,/Testvorschau/);
 assert.match(s.node('message').textContent,/kein Vertrag/);
 assert.equal(s.node('legalNote').classes.has('hidden'),true);
 s.node('person').value='Fiktive Person';s.node('email').value='test@example.invalid';
 s.node('authorized').checked=true;s.node('quoteConsent').checked=true;s.node('terms').checked=true;
 s.node('avvConsent').checked=true;
 await s.node('acceptForm').listeners.get('submit')({preventDefault(){}});
 assert.equal(s.calls.length,1,'preview request only, no POST accept');
});
test('AVV Ja: third PDF and separate unchecked, required consent',async()=>{
  const s=await start({avvRequired:true});
  assert.equal(s.calls.length,1);
  assert.equal(s.node('avvSection').classes.has('hidden'),false);
  assert.equal(s.node('avvConsentSection').classes.has('hidden'),false);
  assert.equal(s.node('avvConsent').required,true);
  assert.equal(s.node('avvConsent').checked,false);
  assert.match(s.node('avvVersion').textContent,/AVV_v1.0/);
  s.node('person').value='Fiktive Person';s.node('email').value='test@example.invalid';
  s.node('authorized').checked=true;s.node('quoteConsent').checked=true;s.node('terms').checked=true;s.node('avvConsent').checked=true;
  await s.node('acceptForm').listeners.get('submit')({preventDefault(){}});
  const submitted=s.calls.at(-1);
  assert.equal(submitted.path,'/api/offer/accept');
  assert.equal(submitted.payload.accept_quote,true);
  assert.equal(submitted.payload.accept_terms,true);
  assert.equal(submitted.payload.accept_avv,true);
  assert.equal(submitted.payload.avv_sha256,'c'.repeat(64));
  assert.equal(submitted.payload.avv_version,'AVV_v1.0');
});
test('AVV Nein: third PDF hidden; consent optional and payload unasserted',async()=>{
  const s=await start({avvRequired:false});
  assert.equal(s.node('avvSection').classes.has('hidden'),true);
  assert.equal(s.node('avvConsentSection').classes.has('hidden'),true);
  assert.equal(s.node('avvConsent').required,false);
  s.node('person').value='Fiktive Person';s.node('email').value='test@example.invalid';
  s.node('authorized').checked=true;s.node('quoteConsent').checked=true;s.node('terms').checked=true;
  await s.node('acceptForm').listeners.get('submit')({preventDefault(){}});
  const submitted=s.calls.at(-1);
  assert.equal(submitted.payload.accept_quote,true);
  assert.equal(submitted.payload.accept_terms,true);
  assert.equal(submitted.payload.accept_avv,false);
  assert.equal(submitted.payload.avv_sha256,null);
  assert.equal(submitted.payload.avv_version,null);
});


test('fragment invitation reaches preview by POST and removes bearer from browser history',async()=>{
 const code='F'.repeat(43),s=await start({search:'',hash:'#code='+code});
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].path,'/api/offer/preview');
 assert.equal(s.calls[0].payload.code,code);
 assert.deepEqual(s.redactions[0],[null,'','/offerte-annehmen/']);
});
test('ambiguous invitations never select one bearer or enter demo mode',async()=>{
 for(const [search,hash] of [['?code='+ 'A'.repeat(40),'#code='+ 'B'.repeat(40)],
  ['?code='+ 'A'.repeat(40)+'&code='+ 'B'.repeat(40),''],
  ['?demo=1','#code='+ 'A'.repeat(40)+'&code='+ 'B'.repeat(40)]]){
  const s=await start({search,hash});assert.equal(s.calls.length,0);assert.equal(s.redactions.length,1);
 }
});
test('fragment invitation cannot be diverted into a demo with query parameters',async()=>{
 const s=await start({search:'?demo=1',hash:'#code='+ 'F'.repeat(43)});
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].path,'/api/offer/preview');
 assert.equal(s.redactions.length,1);
});
