const test=require('node:test'),assert=require('node:assert/strict'),{buildCustomerDispatchScenario}=require('../scripts/customer-dispatch-make-plan.cjs');
test('customer blueprint remains inactive with independent search/mail gates and confirmed publication order',()=>{
 const p=buildCustomerDispatchScenario(),m=id=>p.modules.find(x=>x.id===id);assert.equal(p.autoActivate,false);assert.equal(m(1).config.mapper.formulaField,'formula');assert(m(1).config.mapper.formula.includes('0=1'));assert(m(23).filter.conditions[0].some(x=>x.a==='0'&&x.b===1));assert.equal(m(23).module,'google-email:makeAnApiCall');assert.equal(m(23).config.parameters.__IMTCONN__,11904991);
 assert.equal(m(25).follows,24);assert.equal(m(26).follows,25);assert.equal(m(31).follows,30);assert.equal(m(32).follows,31);assert(m(19).config.mapper.url.includes('/databases/lszh-offers/'));assert(m(28).config.mapper.url.includes('lszh_customer_offers_v1'));assert(m(29).config.mapper.url.includes('lszh_customer_source_index_v1'));
 for(const id of[5,20])assert.equal(m(id).config.mapper.overwrite,false);
 for(const id of[3,18,22,24,30])assert.doesNotThrow(()=>new Function('input',m(id).config.mapper.codeEditorJavascript));
 for(const [stage,handler]of[[23,33],[25,35],[26,37],[31,39]]){assert.equal(m(handler).parent.moduleId,stage);assert.equal(m(handler+1).module,'builtin:Commit');assert.equal(m(handler+1).follows,handler);}
});
