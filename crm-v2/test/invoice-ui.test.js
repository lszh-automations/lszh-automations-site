'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const script=html.match(/<script>\s*('use strict';[\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Invoice UI JavaScript available');
class Node {
  constructor(tag){
    this.tag=tag;this.children=[];this.listeners={};this.name='';this.value='';
    this.textContent='';this.checked=false;this.disabled=false;this.hidden=false;
    this.className='';this.dataset={};this.style={};this.open=false;this.parent=null;
    this.classList={toggle(){}};
  }
  append(...elements){for(const e of elements){this.children.push(e);if(e&&typeof e==='object')e.parent=this;}}
  replaceChildren(...elements){this.children=[];this.append(...elements);}
  addEventListener(name,fn){this.listeners[name]=fn;}
  setAttribute(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
  querySelector(selector){
    if(selector==='input,select,textarea'&&['input','select','textarea'].includes(this.tag))return this;
    for(const item of this.children){const hit=item.querySelector?.(selector);if(hit)return hit;}
    return null;
  }
}
function setup(){
  const nodes={},get=id=>nodes[id]??=new Node('div');
  const nav=['dashboard','leads','kunden','offerten','rechnungen','projekte'].map(tab=>{
    const n=new Node('button');n.dataset.tab=tab;return n;
  });
  const doc={createElement:tag=>new Node(tag),getElementById:get,querySelectorAll:()=>nav};
  const records={
    leads:[],
    kunden:[{id:'c1',company:'Kunde AG'}],
    offerten:[{id:'o1',title:'Projektquote',status:'Angenommen'}],
    projekte:[{id:'p1',title:'Webseite',customerId:'c1',offerId:'o1',status:'Geplant',tasks:[]}],
    rechnungen:[{id:'r1',number:'RE-1000',description:'Testrechnung',customerId:'c1',projectId:'p1',
      status:'Entwurf',amountCHF:199,invoiceDate:'2026-10-23',dueDate:'2026-11-15'}]
  };
  const requests=[],printed=[];
  const fetchMock=async(url,options={})=>{
    if(url==='/api/reminders')return {ok:true,json:async()=>({reminders:[]})};
    const match=url.match(/^\/api\/records\/(leads|kunden|offerten|rechnungen|projekte)(?:\/(.+))?$/);
    assert.ok(match);
    const [,table,id]=match;
    if(!options.method||options.method==='GET')return {ok:true,json:async()=>({records:records[table]})};
    const changes=JSON.parse(options.body);
    const amount=Array.isArray(changes.items)?
      changes.items.reduce((a,i)=>a+Math.round(i.qty*Math.round(i.unitPriceCHF*100)),0)/100:undefined;
    if(amount!==undefined)changes.amountCHF=amount;
    requests.push({url,changes});
    const rec=id?records[table].find(x=>x.id===id):{id:'r2',number:'RE-1001'};
    Object.assign(rec,changes);
    if(!id)records[table].push(rec);
    return {ok:true,json:async()=>({record:rec})};
  };
  const app=vm.runInNewContext(script.replace(/\binitialise\(\);\s*$/,'')+
    '\n({state,navigateTo,openInvoiceEditor});',{
      document:doc,window:{open:(...args)=>printed.push(args),alert:msg=>{throw Error(msg)}},
      fetch:fetchMock,Intl,Date,console,setTimeout
    });
  app.state.records=records;
  get('invoiceForm').elements={namedItem:key=>{
    const matches=[];const walk=node=>{
      if(node.name===key)matches.push(node);
      for(const child of node.children)walk(child);
    };
    walk(get('invoiceFields'));walk(get('invoiceLines'));
    return matches.length>1?{value:''}:matches[0]||null;
  }};
  return {app,records,get,requests,printed};
}
test('invoice editor shows inherited legacy CHF amount as an editable line',()=>{
  const {app,records,get}=setup();
  app.navigateTo('rechnungen',records.rechnungen[0]);
  assert.equal(get('invoiceEditor').open,true);
  assert.equal(get('invoiceLines').children.length,1);
  assert.match(get('invoiceTotal').textContent,/199/);
  assert.equal(get('invoiceForm').elements.namedItem('description').value,'Testrechnung');
  assert.equal(get('invoicePrint').disabled,false);
});
test('invoice edit recalculates and saves positions without name collisions',async()=>{
  const {app,records,get,requests,printed}=setup();
  app.navigateTo('rechnungen',records.rechnungen[0]);
  const fields=get('invoiceLines').children[0]._invoiceFields;
  fields.qty.value='2';
  fields.qty.listeners.input();
  assert.match(get('invoiceTotal').textContent,/398/);
  assert.equal(get('invoicePrint').disabled,true);
  await get('invoiceForm').listeners.submit({preventDefault(){}});
  assert.equal(requests.length,1);
  assert.equal(requests[0].changes.description,'Testrechnung');
  assert.equal(requests[0].changes.items[0].title,'Testrechnung');
  assert.equal(records.rechnungen[0].amountCHF,398);
  assert.equal(get('invoicePrint').disabled,false);
  get('invoicePrint').listeners.click();
  assert.equal(printed[0][0],'/preview/rechnung/r1');
});
test('paid invoice disables all inputs and refuses UI save requests',async()=>{
  const {app,records,get,requests,printed}=setup();
  records.rechnungen[0].status='Bezahlt';
  app.navigateTo('rechnungen',records.rechnungen[0]);
  assert.equal(get('invoiceLocked').hidden,false);
  assert.equal(get('invoiceSave').hidden,true);
  assert.equal(get('invoiceAddLine').hidden,true);
  assert.equal(get('invoicePrint').disabled,false);
  for(const field of get('invoiceFields').children)
    assert.equal(field.querySelector('input,select,textarea').disabled,true);
  const line=get('invoiceLines').children[0]._invoiceFields;
  assert.equal(line.title.disabled,true);
  assert.equal(line.qty.disabled,true);
  assert.equal(line.unitPriceCHF.disabled,true);
  await get('invoiceForm').listeners.submit({preventDefault(){}});
  assert.equal(requests.length,0);
  get('invoicePrint').listeners.click();
  assert.equal(printed[0][0],'/preview/rechnung/r1');
});
test('project shortcut creates prefilled but unsaved invoice',()=>{
  const {app,records,get,requests}=setup();
  app.navigateTo('projekte',records.projekte[0]);
  assert.equal(get('projectCreateInvoice').hidden,false);
  get('projectCreateInvoice').onclick();
  assert.equal(app.state.tab,'rechnungen');
  assert.equal(get('invoiceEditor').open,true);
  assert.equal(get('invoiceForm').elements.namedItem('customerId').value,'c1');
  assert.equal(get('invoiceForm').elements.namedItem('projectId').value,'p1');
  assert.equal(get('invoicePrint').disabled,true);
  assert.equal(requests.length,0);
});
