'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {seedData}=require('../local-preview');
const {setLeadStatus,setOfferStatus,queueReminderPreviews}=require('../lead-lifecycle');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'CRM UI inline script exists');
class Node {
  constructor(tag){
    this.tag=tag;this.children=[];this.listeners={};this.classList={toggle(){}};
    this.dataset={};this.attributes={};this.style={};this.textContent='';
    this.hidden=false;this.value='';this.open=false;
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];}
  addEventListener(type,callback){this.listeners[type]=callback;}
  setAttribute(k,v){this.attributes[k]=v;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  async press(){return this.listeners.click?.();}
}
function start(){
  const nodes={};
  const byId=id=>nodes[id]??=new Node('div');
  const nav=['dashboard','leads','kunden','offerten','rechnungen','projekte'].map(tab=>{
    const node=new Node('button');node.dataset={tab};return node;
  });
  const doc={createElement:tag=>new Node(tag),getElementById:byId,querySelectorAll:()=>nav};
  const records=seedData();
  const calls=[];
  const now='2026-10-23T00:00:00Z';
  const request=async(url,opt={})=>{
    if(url==='/api/reminders')return {ok:true,json:async()=>({reminders:[]})};
    const match=url.match(/^\/api\/records\/(leads|kunden|offerten|rechnungen|projekte)(?:\/(.+))?$/);
    assert.ok(match,'Expected local API route: '+url);
    const [,table,id]=match;
    const method=opt.method||'GET';
    if(method==='GET')return {ok:true,json:async()=>({records:records[table]})};
    const data=JSON.parse(opt.body||'{}');
    calls.push({method,table,id,data});
    if(method==='PATCH'){
      const existing=records[table].find(x=>x.id===id);
      assert.ok(existing,'Record exists');
      const requestedStatus=data.status;delete data.status;
      Object.assign(existing,data);
      if(requestedStatus){
        if(table==='leads')setLeadStatus(records,existing,requestedStatus,now);
        else if(table==='offerten')setOfferStatus(records,existing,requestedStatus,now);
        else existing.status=requestedStatus;
      }
      return {ok:true,json:async()=>({record:existing})};
    }
    if(method==='POST'){
      const created={...data,id:'test-created-'+(records[table].length+1),createdAt:now};
      records[table].push(created);
      return {ok:true,json:async()=>({record:created})};
    }
    throw Error('Unrecognized method: '+method);
  };
  const code=script.replace(/\binitialise\(\);\s*$/,'');
  const app=vm.runInNewContext(code+
    '\n({state,render,loadAll,navigateTo,openLeadDetail,openEditor,leadOffers,leadCustomer});',
    {document:doc,window:{alert:msg=>{throw Error(msg)}},fetch:request,Intl,Date,console,setTimeout});
  app.state.records=records;
  return {app,records,nodes,byId,calls};
}
function statusSelect(byId){
  return byId('leadDetailBody').children[0].children[0].children.find(x=>x.tag==='select');
}
function actions(byId){return byId('leadDetailActions').children.map(x=>x.textContent);}
test('New lead shows five status choices and a single next step',()=>{
  const {app,records,byId}=start();
  app.navigateTo('leads',records.leads[0]);
  assert.equal(byId('leadDetail').open,true);
  assert.equal(byId('editor').open,false);
  assert.equal(statusSelect(byId).value,'Neu');
  assert.equal(statusSelect(byId).children.map(x=>x.value).join(','),
    'Neu,Kontaktiert,Qualifiziert,Gewonnen,Verloren');
  assert.equal(actions(byId).join(','),'Als kontaktiert markieren,Bearbeiten');
});
test('Contacted lead has no offer; qualification automatically creates one editable draft',async()=>{
  const {app,records,byId,calls}=start();
  app.navigateTo('leads',records.leads[0]);
  await byId('leadDetailActions').children.find(x=>x.textContent==='Als kontaktiert markieren').press();
  assert.equal(records.leads[0].status,'Kontaktiert');
  assert.equal(records.offerten.filter(x=>x.leadId==='test-lead-1').length,0);
  await byId('leadDetailActions').children.find(x=>x.textContent==='Qualifizieren').press();
  assert.equal(records.leads[0].status,'Qualifiziert');
  assert.equal(records.offerten.filter(x=>x.leadId==='test-lead-1').length,1);
  const offer=records.offerten.find(x=>x.leadId==='test-lead-1');
  assert.equal(offer.status,'Entwurf');
  assert.match(offer.number,/^\d+$/);
  assert.ok(actions(byId).includes('Offerte öffnen'));
  assert.equal(calls.filter(x=>x.table==='offerten'&&x.method==='POST').length,0,
    'Offer creation must happen on backend, not through an extra frontend POST');
  await byId('leadDetailActions').children.find(x=>x.textContent==='Offerte öffnen').press();
  assert.equal(byId('offerEditor').open,true);
  assert.equal(byId('editor').open,false);
  assert.equal(app.state.tab,'offerten');
});
test('Changing status dropdown to Gewonnen creates customer and project from accepted offer',async()=>{
  const {app,records,byId}=start();
  const lead=records.leads[0];
  setLeadStatus(records,lead,'Qualifiziert','2026-10-23T00:00:00Z');
  app.navigateTo('leads',lead);
  const select=statusSelect(byId);
  select.value='Gewonnen';
  await select.listeners.change();
  const offer=records.offerten.find(x=>x.leadId===lead.id);
  assert.equal(lead.status,'Gewonnen');
  assert.equal(offer.status,'Angenommen');
  assert.equal(records.kunden.filter(x=>x.company===lead.company).length,1);
  assert.equal(records.projekte.filter(x=>x.offerId===offer.id).length,1);
  assert.ok(actions(byId).includes('Kunde öffnen'));
  assert.ok(actions(byId).includes('Projekt öffnen'));
});
test('Marking an offer Angenommen also updates the lead and creates both records once',()=>{
  const {records}=start();
  const lead=records.leads[0];
  setLeadStatus(records,lead,'Qualifiziert','2026-10-23T00:00:00Z');
  const offer=records.offerten.find(x=>x.leadId===lead.id);
  setOfferStatus(records,offer,'Angenommen','2026-10-23T00:01:00Z');
  setOfferStatus(records,offer,'Angenommen','2026-10-23T00:02:00Z');
  assert.equal(lead.status,'Gewonnen');
  assert.equal(records.kunden.filter(x=>x.company===lead.company).length,1);
  assert.equal(records.projekte.filter(x=>x.offerId===offer.id).length,1);
});
test('Verloren closes an existing draft without creating customer or project',()=>{
  const {records}=start();
  const lead=records.leads[0];
  setLeadStatus(records,lead,'Qualifiziert','2026-10-23T00:00:00Z');
  const offer=records.offerten.find(x=>x.leadId===lead.id);
  setLeadStatus(records,lead,'Verloren','2026-10-23T00:03:00Z');
  assert.equal(offer.status,'Abgelehnt');
  assert.equal(records.kunden.some(x=>x.company===lead.company),false);
  assert.equal(records.projekte.some(x=>x.offerId===offer.id),false);
});
test('24-hour reminder is queued only once and no mail is sent',()=>{
  const records=seedData();
  records.leads[0].createdAt='2026-10-21T21:00:00Z';
  assert.equal(queueReminderPreviews(records,'2026-10-22T20:59:59Z'),0);
  assert.equal(queueReminderPreviews(records,'2026-10-22T21:00:00Z'),1);
  assert.equal(queueReminderPreviews(records,'2026-10-23T23:00:00Z'),0);
  assert.equal(records.reminderPreviews.length,1);
  assert.equal(records.reminderPreviews[0].delivery,'preview_only_not_sent');
});
