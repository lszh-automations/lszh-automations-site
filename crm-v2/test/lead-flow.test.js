'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {seedData}=require('../local-preview');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'CRM inline JavaScript exists');

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
function findField(node,name){
  if(node.name===name)return node;
  for(const child of node.children||[]){
    const found=findField(child,name);
    if(found)return found;
  }
}
function start(){
  const nodes={};
  const byId=id=>nodes[id]??=new Node('div');
  const nav=['dashboard','leads','kunden','offerten','rechnungen','projekte'].map(tab=>{
    const node=new Node('button');node.dataset={tab};return node;
  });
  const doc={
    createElement:tag=>new Node(tag),
    getElementById:byId,
    querySelectorAll:()=>nav
  };
  const records=seedData();
  let customerCreates=0,offerCreates=0,leadPatches=0;
  const api=async(url,opt={})=>{
    const match=url.match(/^\/api\/records\/(leads|kunden|offerten|rechnungen|projekte)(?:\/(.+))?$/);
    assert.ok(match,'Expected local API route: '+url);
    const [,table,id]=match;
    const method=opt.method||'GET';
    if(method==='GET')return {ok:true,json:async()=>({records:records[table]})};
    const data=JSON.parse(opt.body||'{}');
    if(method==='PATCH'){
      const existing=records[table].find(x=>x.id===id);
      assert.ok(existing,'record exists');
      Object.assign(existing,data);
      if(table==='leads')leadPatches++;
      return {ok:true,json:async()=>({record:existing})};
    }
    if(method==='POST'){
      const created={...data,id:'created-'+(records[table].length+1),createdAt:new Date().toISOString()};
      if(table==='kunden')customerCreates++;
      if(table==='offerten')offerCreates++;
      records[table].push(created);
      return {ok:true,json:async()=>({record:created})};
    }
    throw Error('Unexpected mock method '+method);
  };
  // The local-preview server already authenticates with local demo mode;
  // bypass only the automatic initial login while verifying rendered actions.
  const code=script.replace(/\binitialise\(\);\s*$/,'');
  const app=vm.runInNewContext(code+
    '\n({state,render,loadAll,navigateTo,openLeadDetail,openEditor,leadOffers,leadCustomer});',
    {document:doc,window:{alert:message=>{throw Error(message)}},fetch:api,
      Intl,Date,console,setTimeout});
  return {app,records,nodes,byId,counts:()=>({customerCreates,offerCreates,leadPatches})};
}
test('Opening a new Lead shows one qualification action, not a cluttered editor',()=>{
  const {app,records,byId}=start();
  app.state.records=records;
  app.navigateTo('leads',records.leads[0]);
  assert.equal(byId('leadDetail').open,true);
  assert.equal(byId('editor').open,false);
  const buttons=byId('leadDetailActions').children.map(x=>x.textContent);
  assert.deepEqual(buttons,['Qualifizieren','Bearbeiten']);
  assert.equal(byId('leadDetailTitle').textContent,'Muster Sanitär AG');
});
test('One click qualifies lead and offers a prefilled draft, without saving it',async()=>{
  const {app,records,byId,counts}=start();
  app.state.records=records;
  app.navigateTo('leads',records.leads[0]);
  await byId('leadDetailActions').children.find(b=>b.textContent==='Qualifizieren').press();
  assert.equal(records.leads[0].status,'Qualifiziert');
  assert.equal(counts().leadPatches,1);
  const draft=byId('leadDetailActions').children.find(b=>b.textContent==='Offerte vorbereiten');
  assert.ok(draft,'qualified lead offers next action');
  await draft.press();
  assert.equal(byId('leadDetail').open,false);
  assert.equal(byId('editor').open,true);
  assert.equal(app.state.tab,'offerten');
  assert.equal(findField(byId('editorForm'),'leadId').value,records.leads[0].id);
  assert.match(findField(byId('editorForm'),'title').value,/Muster Sanitär AG/);
  assert.equal(counts().offerCreates,0,'draft not saved without user action');
});
test('Accepted offer lets user convert one lead into one customer',async()=>{
  const {app,records,byId,counts}=start();
  records.offerten.push({id:'offer2',leadId:'test-lead-2',status:'Angenommen',number:'1001',createdAt:'2026-10-23T00:00:00Z'});
  app.state.records=records;
  app.navigateTo('leads',records.leads[1]);
  const button=byId('leadDetailActions').children.find(b=>b.textContent==='Als Kunde übernehmen');
  assert.ok(button);
  await button.press();
  assert.equal(counts().customerCreates,1);
  assert.equal(app.state.tab,'kunden');
  assert.equal(records.kunden.find(c=>c.email==='anna@example.com').street,'Beispielweg 4');
  app.navigateTo('leads',records.leads[1]);
  const after=byId('leadDetailActions').children.map(x=>x.textContent);
  assert.ok(after.includes('Kunde öffnen'));
  assert.ok(!after.includes('Als Kunde übernehmen'));
});
test('Accepted offer for an existing customer does not create duplicates',()=>{
  const {app,records,byId,counts}=start();
  records.offerten[0].status='Angenommen';
  app.state.records=records;
  app.navigateTo('leads',records.leads[0]);
  assert.ok(byId('leadDetailActions').children.some(x=>x.textContent==='Kunde öffnen'));
  assert.equal(counts().customerCreates,0);
});
test('No accepted offer means no premature conversion action',()=>{
  const {app,records,byId}=start();
  app.state.records=records;
  app.navigateTo('leads',records.leads[1]);
  const names=byId('leadDetailActions').children.map(x=>x.textContent);
  assert.ok(!names.includes('Als Kunde übernehmen'));
  assert.ok(names.includes('Offerte vorbereiten'));
});
