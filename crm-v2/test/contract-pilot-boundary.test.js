'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCrmContractActions,draftKey}=require('../contract-crm-actions');
const {pubKey}=require('../contract-package-publisher');
function fixture(){
 const rows=new Map(),calls=[],reads=[];
 const pilot={offerId:'pilot_offer',recipient:'lars.schulthess@outlook.com'};
 rows.set('crmOffer:pilot_offer',{number:'1002',status:'Bereit'});
 const pkg={offerId:'pilot_offer',packageId:'pkg_pilot_offer_r1',documents:[{},{}]};
 rows.set(draftKey('pilot_offer'),{package:pkg,recipient:pilot.recipient});
 const api=createCrmContractActions({pilot,portalOrigin:'https://portal.example.com',transaction:fn=>fn({get:async id=>{reads.push(id);return rows.get(id)||null;}}),publisher:{prepare:async(...v)=>{calls.push(v);return {state:'prepared'};}},review:{}});
 return {api,rows,calls,reads,pilot,pkg};
}
test('pilot cannot read or act on another offer, even before loading its records',async()=>{
 const f=fixture();await assert.rejects(f.api.status('other_offer'),{code:'PILOT_OFFER_REJECTED'});
 await assert.rejects(f.api.act('other_offer','dispatch',{},{}),{code:'PILOT_OFFER_REJECTED'});assert.equal(f.reads.length,0);assert.equal(f.calls.length,0);
});
test('pilot rejects changed recipients or cross-offer packages in stored drafts and publications',async()=>{
 for(const row of [{recipient:'other@example.com',package:{offerId:'pilot_offer'}},{recipient:'lars.schulthess@outlook.com',package:{offerId:'other_offer'}}]){
  const f=fixture();f.rows.set(draftKey('pilot_offer'),row);await assert.rejects(f.api.act('pilot_offer','prepare',{},{}),{code:'PILOT_BINDING_REJECTED'});assert.equal(f.calls.length,0);
 }
 const f=fixture();f.rows.set(pubKey(f.pkg.packageId),{package:f.pkg,recipient:'other@example.com'});await assert.rejects(f.api.status('pilot_offer'),{code:'PILOT_BINDING_REJECTED'});
});
test('pilot prepares only its stored package for the approved recipient',async()=>{
 const f=fixture();assert.equal((await f.api.status('pilot_offer')).mayPrepare,true);
 await f.api.act('pilot_offer','prepare',{}, {email:'operator@example.com'});assert.equal(f.calls.length,1);assert.equal(f.calls[0][1],f.pilot.recipient);
});
