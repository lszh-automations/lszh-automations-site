'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cockpitSummary}=require('../cockpit-summary');
const tables=['leads','kunden','offerten','rechnungen','projekte'];
const base=()=>Object.fromEntries(tables.map(t=>[t,[]]));
const storeFor=data=>({
  async *scan(t){for(const row of data[t]||[])yield row;}
});
test('global CRM financial and lead counts include all 235 records even though each list page is 50',async()=>{
  const data=base();
  for(let i=0;i<235;i++){
    data.rechnungen.push({
      id:'r'+i,status:'Offen',createdAt:'2026-01-01T00:00:00Z',
      dueDate:'2026-10-20',amountCHF:100.01,
      paymentHistory:i===234?[{amountCHF:50,paidOn:'2026-10-21'}]:[]
    });
    data.leads.push({id:'l'+i,status:i%2?'Neu':'Qualifiziert',
      createdAt:'2026-10-10T09:00:00Z'});
  }
  data.offerten.push({status:'Versendet',oneTimeCHF:201.01,followUpDate:'2026-10-22'});
  data.offerten.push({status:'Angenommen',monthlyCHF:499.99});
  data.projekte.push({status:'Wartet auf Kunde',dueDate:'2026-10-23',tasks:[{done:true},{done:false}]});
  const sum=await cockpitSummary(storeFor(data),{today:'2026-10-24',nowMs:Date.parse('2026-10-24T12:00:00Z')});
  assert.equal(sum.counts.rechnungen,235);
  assert.equal(sum.counts.leads,235);
  assert.equal(sum.overdueCount,235);
  assert.equal(sum.overdueCents,235*10001-5000);
  assert.equal(sum.openInvoiceCents,235*10001-5000);
  assert.equal(sum.paidCents,5000);
  assert.equal(sum.legacyPaidCount,0);
  assert.equal(sum.receivables.length,6);
  assert.equal(sum.openOfferCents,20101);
  assert.equal(sum.acceptedMonthlyCents,49999);
  assert.equal(sum.dueOfferCount,1);
  assert.equal(sum.projectOverdue,1);
  assert.equal(sum.activeProjects,1);
  assert.equal(sum.tasksDone,1);
  assert.equal(sum.tasksTotal,2);
  assert.equal(sum.leadStages.Neu,117);
  assert.equal(sum.leadStages.Qualifiziert,118);
});
test('corrections and legacy paid flags cannot inflate actual booked payments',async()=>{
  const d=base();
  d.rechnungen=[
    {status:'Bezahlt',amountCHF:1000},
    {status:'Bezahlt',amountCHF:99.99,paymentHistory:[{amountCHF:99.99}]},
    {status:'Teilbezahlt',amountCHF:200,dueDate:'2026-10-24',paymentHistory:[
      {amountCHF:49.95},{amountCHF:90,voidedAt:'2026-10-23T10:00:00Z'}]},
    {status:'Storniert',amountCHF:10000}
  ];
  const s=await cockpitSummary(storeFor(d),{today:'2026-10-24'});
  assert.equal(s.legacyPaidCount,1);
  assert.equal(s.paidCents,14994);
  assert.equal(s.openInvoiceCents,15005);
  assert.equal(s.soonCents,15005);
  assert.equal(s.overdueCents,0);
});
test('no Firestore mutation or outside API calls in summary service',()=>{
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../cockpit-summary.js'),'utf8');
  assert.doesNotMatch(src,/\.(create|update|delete|set|add|patch)\s*\(/);
  assert.match(src,/for await\(const r of store\.scan\(table\)\)/);
});

test('online customer acceptance leaves open and followup totals and exposes confirmation/adoption separately',async()=>{
  const d=base();
  d.offerten=[
    {id:'waiting',status:'Versendet',oneTimeCHF:100,followUpDate:'2026-10-20'},
    ...['customer_response_recorded','awaiting_lszh_confirmation','confirmed'].map((state,i)=>({
      id:state,status:'Versendet',oneTimeCHF:200,monthlyCHF:10+i,followUpDate:'2026-10-20',onlineAcceptance:{state}
    })),
    {id:'adopted',status:'Angenommen',monthlyCHF:20,onlineAcceptance:{state:'confirmed'}},
    {id:'declined',status:'Abgelehnt',oneTimeCHF:500,onlineAcceptance:{state:'confirmed'}}
  ];
  const s=await cockpitSummary(storeFor(d),{today:'2026-10-27'});
  assert.equal(s.openOffers,1);assert.equal(s.openOfferCents,10000);
  assert.equal(s.dueOfferCount,1);assert.deepEqual(s.dueOffers.map(x=>x.id),['waiting']);
  assert.equal(s.pendingConfirmationCount,2);assert.equal(s.pendingAdoptionCount,1);
  assert.deepEqual(s.pendingConfirmations.map(x=>x.id).sort(),['awaiting_lszh_confirmation','customer_response_recorded']);
  assert.deepEqual(s.pendingAdoptions.map(x=>x.id),['confirmed']);
  assert.equal(s.acceptedMonthlyCents,3200);
  assert.equal(d.offerten[1].status,'Versendet','Read-only projection preserves stored commercial status');
  const many=base();many.offerten=Array.from({length:25},(_,i)=>({id:'pending-'+i,status:'Versendet',onlineAcceptance:{state:'customer_response_recorded'}}));
  const bounded=await cockpitSummary(storeFor(many),{today:'2026-10-27'});
  assert.equal(bounded.pendingConfirmationCount,25,'All accepted offers counted beyond bounded preview');
  assert.equal(bounded.pendingConfirmations.length,8,'Preview remains bounded');

});
