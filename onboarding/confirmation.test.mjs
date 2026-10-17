import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {verifyOnboardingState} = require('./confirmation.js');
const projectCode = 'ob_00000000-0000-4000-8000-000000000000';
const onbId='rec'+'A'.repeat(14), orderId='rec'+'B'.repeat(14), customerId='rec'+'C'.repeat(14), taskId='rec'+'D'.repeat(14);
const onboarding={
  id:onbId,fields:{
    Projektcode:projectCode,Auftrag:[orderId],Status:'Eingegangen',
    'Sensible Daten':'Nein','Make-Konto Status':'Noch kein Make-Konto',
    'Make-Organisation':'','Make-Einladung Status':'Noch nicht eingeladen',
    'Rechnungsstrasse':'Testweg 1','Rechnungs-PLZ':'5610','Rechnungsort':'Wohlen',
    'Rechnungsland':'Schweiz','Rechnungs-E-Mail':'synthetisch@example.invalid'
  }
};
const order={id:orderId,fields:{
  'Onboarding-Token':projectCode,'Kunden-Onboarding':[onbId],Kunde:[customerId],
  'Verbindungen erforderlich':true,'AVV erforderlich':'Prüfen',
  'Make-Kontostatus':'Noch kein Make-Konto','Make-Organisation':'',
  'Make-Einladungsstatus':'Noch nicht eingeladen'
}};
const customer={id:customerId,fields:{
  'Rechnungsstrasse':'Testweg 1','Rechnungs-PLZ':'5610','Rechnungsort':'Wohlen',
  'Rechnungsland':'Schweiz','Rechnungs-E-Mail':'synthetisch@example.invalid'
}};
const task={id:taskId,fields:{Aufgabencode:orderId+'-DSG-01',Auftrag:[orderId]}};
function clone(x){return structuredClone(x);}
function transport(overrides={}) {
  const state={
    onboarding:[clone(onboarding)],order:clone(order),customer:clone(customer),
    tasks:[clone(task)],...overrides
  };
  let calls=0;
  const fetchImpl=async (address,options)=>{
    calls++;
    assert.equal(options.method,'GET','Status reader must NEVER write');
    assert.equal(options.headers.Authorization,'Bearer SYNTHETIC_READ_TOKEN');
    const url=new URL(address);
    assert.equal(url.hostname,'api.airtable.com');
    const p=url.pathname;
    let payload;
    if(p.endsWith('/tblWIY4l4VASz8Vse')) {
      assert.equal(url.searchParams.get('filterByFormula'),"{Projektcode}='"+projectCode+"'");
      payload={records:state.onboarding};
    } else if(p.endsWith('/tblXUogIvWbulxfnN/'+orderId))payload=state.order;
    else if(p.endsWith('/tbl8cUUfFVqsjj2Z0/'+customerId))payload=state.customer;
    else if(p.endsWith('/tblwbAszWFlFJGmgQ')){
      assert.equal(url.searchParams.get('filterByFormula'),"{Aufgabencode}='"+orderId+"-DSG-01'");
      payload={records:state.tasks};
    } else throw Error('Unexpected endpoint: '+p);
    if(state.status) return {ok:false,status:state.status};
    return {ok:true,json:async()=>payload};
  };
  return {fetchImpl,calls:()=>calls};
}
const check=async (t,fixture=transport()) => verifyOnboardingState(projectCode,'SYNTHETIC_READ_TOKEN',fixture.fetchImpl);
test('fully linked, mirrored and durable state => completed',async()=>{
 const api=transport();const result=await check(null,api);
 assert.deepEqual(result,{state:'completed',recordId:onbId});
 assert.equal(api.calls(),3);
});
test('no onboarding record means processing, not completed',async()=>{
 const api=transport({onboarding:[]});
 assert.deepEqual(await check(null,api),{state:'processing'});
 assert.equal(api.calls(),1);
});
test('two records for a token => requires manual review',async()=>{
 const api=transport({onboarding:[clone(onboarding),{...clone(onboarding),id:taskId}]});
 assert.deepEqual(await check(null,api),{state:'requires_review'});
});
test('cannot complete without successful order linkage',async()=>{
 const o=clone(onboarding);o.fields.Auftrag=[];
 assert.deepEqual(await check(null,transport({onboarding:[o]})),{state:'processing'});
});
test('wrong owner token => review, never completion',async()=>{
 const o=clone(order);o.fields['Onboarding-Token']='ob_11111111-1111-4111-8111-111111111111';
 assert.deepEqual(await check(null,transport({order:o})),{state:'requires_review'});
});
test('incomplete order make-status copy => processing',async()=>{
 const o=clone(order);o.fields['Make-Kontostatus']='Noch nicht erledigt';
 assert.deepEqual(await check(null,transport({order:o})),{state:'processing'});
});
test('invoice details not copied to customer => processing',async()=>{
 const c=clone(customer);c.fields['Rechnungsort']='Anderswo';
 assert.deepEqual(await check(null,transport({customer:c})),{state:'processing'});
});
test('sensitive data needs exactly one verified DSG task',async()=>{
 const x=clone(onboarding);x.fields['Sensible Daten']='Unsicher';
 const good=transport({onboarding:[x]});const result=await check(null,good);
 assert.equal(result.state,'completed');assert.equal(good.calls(),4);
 assert.equal((await check(null,transport({onboarding:[x],tasks:[]}))).state,'processing');
 assert.equal((await check(null,transport({onboarding:[x],tasks:[clone(task),clone(task)]}))).state,'requires_review');
 const bad=clone(task);bad.fields.Auftrag=[customerId];
 assert.equal((await check(null,transport({onboarding:[x],tasks:[bad]}))).state,'processing');
});
test('API outage fails closed; no false confirmation',async()=>{
 await assert.rejects(check(null,transport({status:503})),/status_unavailable/);
});
test('reject invalid codes and missing token before network',async()=>{
 const t=transport();
 await assert.rejects(verifyOnboardingState("ob_';DROP", 'SYNTHETIC_READ_TOKEN',t.fetchImpl),/invalid_project_link/);
 await assert.rejects(verifyOnboardingState(projectCode, '',t.fetchImpl),/status_not_configured/);
 assert.equal(t.calls(),0);
});

test('order may link exactly one onboarding; extra backlink requires processing',async()=>{
 const o=clone(order);o.fields['Kunden-Onboarding']=[onbId,taskId];
 const api=transport({order:o});
 assert.deepEqual(await check(null,api),{state:'processing'});
 assert.equal(api.calls(),2);
});
test('sensitive-data task may link exactly one order; extra linkage is not complete',async()=>{
 const x=clone(onboarding);x.fields['Sensible Daten']='Ja';
 const t=clone(task);t.fields['Auftrag']=[orderId,customerId];
 const api=transport({onboarding:[x],tasks:[t]});
 assert.deepEqual(await check(null,api),{state:'processing'});
 assert.equal(api.calls(),4);
});

test('DSG task without a valid Airtable record ID is not a completed evidence',async()=>{
 const x=clone(onboarding);x.fields['Sensible Daten']='Ja';
 const t=clone(task);t.id='malformed_synthetic_id';
 const api=transport({onboarding:[x],tasks:[t]});
 assert.deepEqual(await check(null,api),{state:'processing'});
 assert.equal(api.calls(),4);
});
