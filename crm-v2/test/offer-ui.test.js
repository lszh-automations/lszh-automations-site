'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {quoteTotals}=require('../offer-pricing');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'CRM script exists');
class Node{
  constructor(tag){
    this.tag=tag;this.children=[];this.listeners={};this.value='';
    this.name='';this.textContent='';this.dataset={};this.style={};
    this.classList={toggle(){}};this.disabled=false;this.open=false;this.parent=null;
  }
  append(...nodes){for(const node of nodes){this.children.push(node);if(node&&typeof node==='object')node.parent=this;}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
}
function setup(){
  const nodes={};
  const get=id=>nodes[id]??=new Node('div');
  const nav=['dashboard','leads','kunden','offerten','rechnungen','projekte'].map(tab=>{
    const n=new Node('button');n.dataset.tab=tab;return n;
  });
  const document={createElement:tag=>new Node(tag),getElementById:get,querySelectorAll:()=>nav};
  const records={
    leads:[],kunden:[{id:'c1',company:'Demo Büro AG'}],
    offerten:[{id:'q1',number:'1000',title:'TEST: Büroautomation',
      description:'Musterarbeit',oneTimeCHF:1200,monthlyCHF:199,
      customerId:'c1',leadId:'',status:'Entwurf'}],
    rechnungen:[],projekte:[]
  };
  const writes=[],printed=[];
  const request=async(uri,opt={})=>{
    if(uri==='/api/reminders')return {ok:true,json:async()=>({reminders:[]})};
    const match=uri.match(/^\/api\/records\/(leads|kunden|offerten|rechnungen|projekte)(?:\/(.+))?$/);
    assert.ok(match);
    const [,table,id]=match;
    if(!opt.method||opt.method==='GET')return {ok:true,json:async()=>({records:records[table]})};
    const updates=JSON.parse(opt.body);
    if(updates.items)Object.assign(updates,quoteTotals(updates.items));
    writes.push({uri,updates});
    const rec=id?records[table].find(x=>x.id===id):{id:'created',number:'1001'};
    assert.ok(rec);
    Object.assign(rec,updates);
    if(!id)records[table].push(rec);
    return {ok:true,json:async()=>({record:rec})};
  };
  const code=script.replace(/\binitialise\(\);\s*$/,'');
  const app=vm.runInNewContext(code+'\n({state,navigateTo,openOfferEditor});',{
    document,window:{open:(...args)=>printed.push(args),alert:msg=>{throw Error(msg)}},
    fetch:request,Intl,Date,console,setTimeout
  });
  get('offerForm').elements={namedItem:key=>{
    const find=node=>{
      if(node.name===key)return node;
      for(const child of node.children){
        const found=find(child);if(found)return found;
      }
    };
    return find(get('offerFields'));
  }};
  app.state.records=records;
  return {app,records,get,writes,printed};
}
test('old quote prices appear as editable one-time and monthly positions',()=>{
  const {app,records,get}=setup();
  app.navigateTo('offerten',records.offerten[0]);
  assert.equal(get('offerEditor').open,true);
  assert.equal(get('offerLines').children.length,2);
  assert.match(get('offerOnce').textContent,/1.200|1'200|1’200/);
  assert.match(get('offerMonthly').textContent,/199/);
  assert.equal(get('offerPrint').disabled,false);
});
test('editing a quote recalculates CHF immediately and disables stale print',async()=>{
  const {app,records,get,writes,printed}=setup();
  app.navigateTo('offerten',records.offerten[0]);
  const line=get('offerLines').children[0]._quoteFields;
  line.qty.value='3';line.qty.listeners.input();
  assert.equal(get('offerPrint').disabled,true);
  assert.match(get('offerOnce').textContent,/3.600|3'600|3’600/);
  await get('offerForm').listeners.submit({preventDefault(){}});
  assert.equal(records.offerten[0].oneTimeCHF,3600);
  assert.equal(records.offerten[0].monthlyCHF,199);
  assert.equal(records.offerten[0].items.length,2);
  assert.equal(get('offerPrint').disabled,false);
  assert.equal(writes.length,1);
  get('offerPrint').listeners.click();
  assert.equal(printed[0][0],'/preview/offerte/q1');
});
test('quote preview is disabled for a new unsaved quote',()=>{
  const {app,get,printed}=setup();
  app.navigateTo('offerten');
  app.openOfferEditor();
  assert.equal(get('offerPrint').disabled,true);
  get('offerPrint').listeners.click();
  assert.equal(printed.length,0);
});
