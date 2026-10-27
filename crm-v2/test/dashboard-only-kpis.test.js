'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','public','index.html'),'utf8');
const begin=html.indexOf('function renderKpis(){');
const end=html.indexOf('function renderDashboard(){',begin);
assert.ok(begin>=0 && end>begin,'Dashboard KPI renderer must exist');
const source=html.slice(begin,end);

function fakeEl(tag,className='',text=''){
  return {
    tag,className,text,children:[],attributes:{},listeners:{},
    append(...items){this.children.push(...items);},
    setAttribute(key,value){this.attributes[key]=value;},
    addEventListener(key,callback){this.listeners[key]=callback;}
  };
}
function createHarness(){
  const kpis={hidden:false,children:[],replaceChildren(){this.children=[];},append(card){this.children.push(card);}};
  const state={tab:'dashboard',records:{
    leads:[{id:'lead1'}],kunden:[],offerten:[],rechnungen:[],projekte:[]
  }};
  let statsCalls=0;
  const navigation=[];
  const context={
    state,
    reportContext:()=>{statsCalls++;return {report:{current:{customers:1}},selected:{customers:0,paidCents:0,offers:0,projects:0},previous:null};},
    reportComparison:()=>'Gesamter Zeitraum',
    $:name=>{
      return name==='kpis'?kpis:{scrollIntoView:()=>navigation.push(name)};
    },
    dashboardStats:()=>{
      statsCalls++;
      return {newLeads:1,openOffers:0,openInvoices:0,openInvoiceAmount:0,
        activeProjects:0,paidAmount:0};
    },
    formatCHF:n=>'CHF '+n,
    invoiceCHF:n=>'CHF '+Number(n).toFixed(2),
    el:fakeEl,
    definitions:{leads:{title:'Website Leads'},offerten:{title:'Offerten'},
      rechnungen:{title:'Rechnungen'},projekte:{title:'Projekte'}},
    navigateTo:tab=>navigation.push(tab)
  };
  const renderKpis=vm.runInNewContext(source+'\nrenderKpis',context);
  return {renderKpis,state,kpis,navigation,getStatsCalls:()=>statsCalls};
}

test('Overview KPI cards exist only on dashboard, not in the five working tabs',()=>{
  const h=createHarness();
  h.renderKpis();
  assert.equal(h.kpis.hidden,false);
  assert.equal(h.kpis.children.length,4);
  assert.equal(h.getStatsCalls(),1);
  const first=h.kpis.children[0];
  assert.equal(first.tag,'button');
  first.onclick();
  assert.deepEqual(h.navigation,['reportCustomers']);

  for(const tab of ['leads','kunden','offerten','rechnungen','projekte']){
    h.state.tab=tab;
    h.renderKpis();
    assert.equal(h.kpis.hidden,true,tab);
    assert.equal(h.kpis.children.length,0,tab);
  }
  assert.equal(h.getStatsCalls(),1,'No stats calculation outside dashboard');
  h.state.tab='dashboard';
  h.renderKpis();
  assert.equal(h.kpis.hidden,false,'Dashboard KPIs return when navigating back');
  assert.equal(h.kpis.children.length,4);
  assert.equal(h.getStatsCalls(),2);
});

test('Hidden KPI container does not leave blank CSS grid space',()=>{
  assert.match(html,/<div class="kpis" id="kpis"><\/div>/);
  assert.match(html,/#kpis\[hidden\]\s*\{\s*display\s*:\s*none\s*\}/);
  assert.doesNotMatch(source,/for\s*\(\s*const table of order\s*\)/);
});
