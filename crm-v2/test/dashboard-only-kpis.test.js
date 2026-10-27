 'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
test('dashboard and registers leave no KPI cards or empty grid space',()=>{
 const source=html.slice(html.indexOf('function renderKpis(){'),html.indexOf('async function openDashboardTask('));
 const container={hidden:false,children:[1],replaceChildren(){this.children=[];}},context={$:()=>container};
 vm.runInNewContext(source+';renderKpis();',context);
 assert.equal(container.hidden,true);assert.deepEqual(container.children,[]);
 assert.match(html,/#kpis\[hidden\]\s*\{\s*display\s*:\s*none/);
});
