'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {seedData}=require('../local-preview');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'CRM project JavaScript exists');

class Node {
  constructor(tag){
    this.tag=tag;this.children=[];this.listeners={};this.textContent='';
    this.value='';this.name='';this.disabled=false;this.checked=false;this.hidden=false;
    this.dataset={};this.style={};this.parent=null;this.open=false;this.className='';
    this.classList={toggle(){}};
  }
  append(...nodes){
    for(const node of nodes){
      this.children.push(node);
      if(node&&typeof node==='object')node.parent=this;
    }
  }
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  addEventListener(type,callback){this.listeners[type]=callback;}
  setAttribute(){}
  querySelector(selector){
    const tags=selector==='input,select,textarea'?['input','select','textarea']:null;
    if(tags&&tags.includes(this.tag))return this;
    for(const child of this.children){
      const match=child.querySelector?.(selector);if(match)return match;
    }
    return null;
  }
  focus(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function setup(){
  const nodes={},get=id=>nodes[id]??=new Node('div');
  const nav=['dashboard','leads','kunden','offerten','rechnungen','projekte'].map(tab=>{
    const node=new Node('button');node.dataset.tab=tab;return node;
  });
  const doc={createElement:tag=>new Node(tag),getElementById:get,querySelectorAll:()=>nav};
  const records=seedData();
  let lastPatch=null,postCount=0;
  const request=async(url,opt={})=>{
    if(url==='/api/reminders')return {ok:true,json:async()=>({reminders:[]})};
    const match=url.match(/^\/api\/records\/(leads|kunden|offerten|rechnungen|projekte)(?:\/(.+))?$/);
    assert.ok(match,'Unrecognized API URL '+url);
    const [,table,id]=match;
    if(!opt.method||opt.method==='GET')return {ok:true,json:async()=>({records:records[table]})};
    const data=JSON.parse(opt.body);
    if(opt.method==='PATCH'){
      const target=records[table].find(x=>x.id===id);
      Object.assign(target,data);lastPatch=data;
      return {ok:true,json:async()=>({record:target})};
    }
    if(opt.method==='POST'){
      const target={id:'new-project',...data,createdAt:'2026-10-23T00:00:00Z'};
      records[table].push(target);postCount++;
      return {ok:true,json:async()=>({record:target})};
    }
    throw Error('Unsupported API method');
  };
  const js=script.replace(/\binitialise\(\);\s*$/,'');
  const app=vm.runInNewContext(js+'\n({state,navigateTo,openProjectEditor,projectIsOverdue,projectDoneCount});',{
    document:doc,window:{alert:message=>{throw Error(message)}},
    fetch:request,Intl,Date,console,setTimeout
  });
  app.state.records=records;
  get('projectForm').elements={namedItem:key=>{
    const matches=[];
    const find=node=>{
      if(node.name===key)matches.push(node);
      for(const child of node.children)find(child);
    };
    find(get('projectFields'));find(get('projectTasks'));
    return matches[0]||null;
  }};
  return {app,get,records,last:()=>lastPatch,postCount:()=>postCount};
}
test('project dialog shows client, accepted quote, due date and progress',()=>{
  const {app,get,records}=setup();
  app.navigateTo('projekte',records.projekte[0]);
  assert.equal(get('projectEditor').open,true);
  assert.match(get('projectEditorTitle').textContent,/Projekt bearbeiten/);
  assert.equal(get('projectForm').elements.namedItem('title').value,'TEST: Bestehendes Kundenprojekt');
  assert.equal(get('projectCustomerOpen').hidden,false);
  assert.equal(get('projectOfferOpen').hidden,true);
  assert.equal(get('projectProgress').textContent,'0 von 0 erledigt');
});
test('tasks add, checkbox and save update project and progress',async()=>{
  const {app,get,records,last}=setup();
  app.navigateTo('projekte',records.projekte[0]);
  get('projectAddTask').listeners.click();
  const first=get('projectTasks').children[0]._taskFields;
  first.title.value='Anforderungen überprüfen';
  first.done.checked=true;
  first.done.listeners.change();
  assert.equal(get('projectProgress').textContent,'1 von 1 erledigt');
  get('projectAddTask').listeners.click();
  get('projectTasks').children[1]._taskFields.title.value='Testumgebung einrichten';
  assert.equal(get('projectProgress').textContent,'1 von 2 erledigt');
  get('projectForm').elements.namedItem('status').value='In Arbeit';
  get('projectForm').elements.namedItem('dueDate').value='2026-11-10';
  await get('projectForm').listeners.submit({preventDefault(){}});
  assert.equal(records.projekte[0].status,'In Arbeit');
  assert.equal(records.projekte[0].dueDate,'2026-11-10');
  assert.equal(last().tasks.length,2);
  assert.equal(last().tasks[0].done,true);
  assert.equal(get('projectProgress').textContent,'1 von 2 erledigt');
});
test('won project displays links but prevents reassigning accepted offer and customer',()=>{
  const {app,get,records}=setup();
  records.kunden.push({id:'won-customer',company:'Gewonnen GmbH'});
  records.offerten.push({id:'won-offer',number:'1001',title:'Gewonnene Offerte',status:'Angenommen',customerId:'won-customer'});
  records.projekte.push({id:'won-project',title:'Gewonnenes Projekt',status:'Geplant',offerId:'won-offer',customerId:'won-customer',tasks:[]});
  app.navigateTo('projekte',records.projekte.at(-1));
  assert.equal(get('projectOfferOpen').hidden,false);
  assert.equal(get('projectCustomerOpen').hidden,false);
  assert.equal(get('projectForm').elements.namedItem('offerId').disabled,true);
  assert.equal(get('projectForm').elements.namedItem('customerId').disabled,true);
  assert.equal(get('projectSave').hidden,false);
});
test('overdue helper skips completed projects and reads optional legacy tasks',()=>{
  const {app}=setup();
  assert.deepEqual(JSON.parse(JSON.stringify(app.projectDoneCount({}))),{total:0,done:0});
  assert.equal(app.projectIsOverdue({dueDate:'2000-01-01',status:'In Arbeit'}),true);
  assert.equal(app.projectIsOverdue({dueDate:'2000-01-01',status:'Abgeschlossen'}),false);
  assert.equal(app.projectIsOverdue({status:'Geplant'}),false);
});
