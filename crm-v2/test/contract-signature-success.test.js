'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const tick=()=>new Promise(setImmediate);
function page(source,{receipt,fail=false,reload=false,testOnly=false}={}){
 const nodes=new Map();
 const node=()=>({hidden:false,checked:false,disabled:false,textContent:'',children:[],events:{},attributes:{},
  setAttribute(k,v){this.attributes[k]=v;},focus(){this.focused=true;},addEventListener(k,f){this.events[k]=f;},
  append(...x){this.children.push(...x);},replaceChildren(){this.children=[];},querySelector(){return node();}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 get('success').hidden=true;get('package').hidden=true;get('error').hidden=true;
 const pkg={testOnly,offerNumber:'TEST_ONLY',revision:1,recipient:'test@example.invalid',expiresAt:'2030-01-01T00:00:00Z',
  csrf:'synthetic-csrf',packageSha256:'synthetic-hash',avvRequired:false,documents:[],declarations:{terms:'terms',avv:'avv',representative:'representative'}};
 let release;const pending=new Promise(resolve=>{release=resolve;});const requests=[];
 const context={document:{getElementById:get,querySelector:()=>node(),createElement:node},location:{hash:'#'+'a'.repeat(43),hostname:'example.invalid',pathname:'/'},
  history:{replaceState(){}},window:{scrollTo(){},matchMedia:()=>({matches:true})},Intl,URL,setTimeout,
  fetch:async(url,options={})=>{requests.push({url,options});if(options.method==='POST'){await pending;if(fail)throw Error('NETWORK_FAILURE');return {ok:true,json:async()=>receipt};}
   return reload?{ok:false,json:async()=>({error:'LINK_ALREADY_USED'})}:{ok:true,json:async()=>pkg};}};
 vm.runInNewContext(source,context);
 return {get,requests,release,submit:()=>get('accept-form').events.submit({preventDefault(){}}),async ready(){await tick();get('terms').checked=true;get('representative').checked=true;get('terms').events.change();}};
}
const valid={state:'customer_response_recorded',responseId:'response_test_only',acceptedAt:'2026-10-28T10:00:00Z'};
for(const directory of ['acceptance-public','customer-portal/acceptance-public']){
 const source=fs.readFileSync(path.join(__dirname,'..',directory,'contract-acceptance.js'),'utf8');
 test(directory+': waits for saved receipt, guards rapid and subsequent submissions, preserves payload',async()=>{
  const p=page(source,{receipt:valid});await p.ready();
  const first=p.submit();await p.submit();
  assert.equal(p.get('success').hidden,true);assert.equal(p.get('submit').disabled,true);
  assert.equal(p.get('accept-form').attributes['aria-busy'],'true');assert.match(p.get('submit').textContent,/gespeichert/);
  assert.equal(p.requests.filter(r=>r.options.method==='POST').length,1);
  p.release();await first;
  assert.equal(p.get('success').hidden,false);assert.equal(p.get('package').hidden,true);assert.equal(p.get('success-title').focused,true);
  assert.equal(p.get('response-id').textContent,valid.responseId);assert.equal(p.get('accept-form').attributes['aria-busy'],'false');
  await p.submit();assert.equal(p.requests.filter(r=>r.options.method==='POST').length,1);
  assert.deepEqual(JSON.parse(p.requests[1].options.body),{packageSha256:'synthetic-hash',revision:1,termsConsent:true,avvConsent:false,representativeDeclaration:true});
 });
 for(const receipt of [null,{}, {...valid,state:'pending'}, {...valid,acceptedAt:'invalid'}, {...valid,responseId:''}])
 test(directory+': unconfirmed or malformed acknowledgement never shows success '+JSON.stringify(receipt),async()=>{
  const p=page(source,{receipt});await p.ready();const work=p.submit();p.release();await work;
  assert.equal(p.get('success').hidden,true);assert.equal(p.get('error').hidden,false);assert.equal(p.get('package').hidden,false);assert.equal(p.get('submit').disabled,false);
 });
 test(directory+': network failure and reload never manufacture a saved receipt',async()=>{
  const p=page(source,{fail:true});await p.ready();const work=p.submit();p.release();await work;
  assert.equal(p.get('success').hidden,true);assert.equal(p.get('error').hidden,false);assert.equal(p.get('submit').disabled,false);
  const reloaded=page(source,{reload:true});await tick();assert.equal(reloaded.get('success').hidden,true);assert.equal(reloaded.get('package').hidden,true);
  assert.match(reloaded.get('error').textContent,/bereits gespeichert/);assert.equal(reloaded.requests.length,1);
 });
}
