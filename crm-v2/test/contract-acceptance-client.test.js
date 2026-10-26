'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../acceptance-public/contract-acceptance.js'),'utf8');
const {MAKE_REQUIREMENTS_VERSION,makeRequirements}=require('../make-requirements');
for(const version of [undefined,MAKE_REQUIREMENTS_VERSION])for(const testOnly of [false,true])test('acceptance page renders '+(testOnly?'test mode with notice':'customer mode without removed test notice')+' after successful login, prerequisites '+(version||'legacy'),async()=>{
 const nodes=new Map();const node=()=>({hidden:false,checked:false,disabled:false,textContent:'',children:[],events:{},addEventListener(k,f){this.events[k]=f;},append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},querySelector(){return node();}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
 get('package').hidden=true;get('error').hidden=true;
 const badge=node(),notice=testOnly?node():null;
 const pkg={makeRequirements:makeRequirements(version),testOnly,offerNumber:'1002',revision:1,recipient:'pilot@example.invalid',expiresAt:'2026-10-27T21:00:00Z',avvRequired:false,
  declarations:{terms:'Terms',representative:'Representative',avv:'AVV'},documents:[{kind:'offer',bytes:3735,filename:'Offer.pdf'},{kind:'terms',bytes:95511,filename:'Terms.pdf'}]};
 const requests=[];const context={document:{getElementById:get,querySelector:s=>s==='.badge'?badge:s==='.notice'?notice:null,createElement:()=>node(),body:node()},location:{hash:'#'+'a'.repeat(43),hostname:'portal.example.invalid',pathname:'/'},history:{replaceState(){}},window:{scrollTo(){}},Intl,URL,setTimeout,
  fetch:async(url)=>{requests.push(url);return {ok:true,json:async()=>pkg};}};
 vm.createContext(context);vm.runInContext(source,context);await new Promise(setImmediate);
 assert.deepEqual(requests,['/api/acceptance']);assert.equal(get('error').hidden,true);assert.equal(get('package').hidden,false);assert.equal(get('login').hidden,true);
 assert.equal(get('documents').children.length,2);assert.equal(get('avv-row').hidden,true);assert.equal(get('submit').disabled,true);
 assert.equal(get('make-requirements').hidden,!version);if(version){assert.equal(get('make-requirements-title').textContent,makeRequirements(version).title);assert.equal(get('make-requirements-text').children.length,3);}
 if(!testOnly)assert.equal(badge.textContent,'KUNDENPORTAL');
 get('terms').checked=true;get('representative').checked=true;get('terms').events.change();assert.equal(get('submit').disabled,false);
});
