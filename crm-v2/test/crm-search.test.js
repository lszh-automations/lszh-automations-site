'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildStore}=require('../cloud-records');

function fakeFirestore(seed={}){
  const collections=new Map(Object.entries(seed));
  const reads={};
  const count=table=>{reads[table]=(reads[table]||0)+1;};
  const snap=(id,row)=>({id,data:()=>structuredClone(row)});
  const collection=name=>{
    const table=name.replace(/^lszh_crm_v2_staging_/,'');
    const rows=collections.get(table)||[];
    const sorted=()=>rows.slice().sort((a,b)=>
      String(b.createdAt||'').localeCompare(String(a.createdAt||''))||
      String(b.id).localeCompare(String(a.id)));
    return {
      async *stream(){for(const row of rows){count(table);yield snap(row.id,row);}},
      where(field,operator,value){
        assert.equal(field,'status');
        assert.ok(operator==='=='||operator==='in');
        return {async *stream(){
          for(const row of rows){
            const match=operator==='=='?row[field]===value:value.includes(row[field]);
            if(match){count(table);yield snap(row.id,row);}
          }
        }};
      },
      orderBy(field,direction){
        assert.equal(field,'createdAt');
        assert.equal(direction,'desc');
        return {async *stream(){for(const row of sorted()){
          if(!Object.hasOwn(row,'createdAt'))continue;
          count(table);yield snap(row.id,row);
        }}};
      },
      doc(id){return {async get(){
        const row=rows.find(x=>x.id===id);
        return {exists:!!row,id,data:()=>row&&structuredClone(row)};
      }};}
    };
  };
  return {collection,reads};
}
const store=seed=>buildStore(fakeFirestore(seed),'lszh_crm_v2_staging_');
const stamp='2026-10-24T10:00:00.000Z';

test('server search covers every register page, counts ALL matches and uses stable ties',async()=>{
  const rows=Array.from({length:235},(_,i)=>({
    id:String(i).padStart(4,'0'),company:i<230?'Alpen Test AG':'Andere AG',
    contactName:'Frau Beispiel',email:'beispiel@example.ch',
    status:i%2?'Inaktiv':'Aktiv',createdAt:stamp
  }));
  const s=store({kunden:rows});
  let cursor='',found=[];
  for(let i=0;i<5;i++){
    const p=await s.searchPage('kunden',{q:'AlPeN',pageSize:50,cursor});
    assert.equal(p.totalMatches,230);
    found.push(...p.records.map(r=>r.id));
    assert.ok(p.records.length<=50);
    if(!p.hasMore){assert.equal(i,4);break;}
    cursor=p.nextCursor;
  }
  assert.equal(found.length,230);
  assert.equal(new Set(found).size,230);
  assert.equal(found[0],'0229');
  assert.equal(found.at(-1),'0000');
  assert.equal((await s.searchPage('kunden',{q:'Alpen',status:'Aktiv'})).totalMatches,115);
});

test('customer name matches linked invoices, offers and projects without exposing private notes',async()=>{
  const customers=[{id:'customer-1',company:'Müller Sanitär AG',contactName:'Eva Muster',email:'info@mueller.ch',createdAt:stamp}];
  const invoices=[{id:'bill-1',number:'1001',description:'Projektabrechnung',customerId:'customer-1',
    amountCHF:120,status:'Offen',dueDate:'2026-10-01',createdAt:stamp}];
  const offers=[{id:'offer-1',number:'1009',title:'Automationspaket',customerId:'customer-1',status:'Bereit',createdAt:stamp}];
  const projects=[{id:'project-1',title:'CRM Einführung',customerId:'customer-1',status:'In Arbeit',createdAt:stamp}];
  const s=store({kunden:customers,rechnungen:invoices,offerten:offers,projekte:projects});
  for(const t of ['rechnungen','offerten','projekte']){
    const p=await s.searchPage(t,{q:'muller'});
    assert.equal(p.totalMatches,1,t);
  }
  assert.equal((await s.searchPage('rechnungen',{q:'1001'})).totalMatches,1);
  assert.equal((await s.searchPage('rechnungen',{q:'abwesend'})).totalMatches,0);
  assert.equal((await s.searchPage('offerten',{q:'muller',status:'Versendet'})).totalMatches,0);
});

test('invoice due filters respect partial payment, overdue, settled and upcoming',async()=>{
  const rows=[
    {id:'late',status:'Teilbezahlt',amountCHF:100,paymentHistory:[{amountCHF:60}],
      dueDate:'2026-10-20',createdAt:stamp},
    {id:'soon',status:'Offen',amountCHF:75,paymentHistory:[],dueDate:'2026-10-27',createdAt:stamp},
    {id:'settled',status:'Bezahlt',amountCHF:200,paymentHistory:[],dueDate:'2026-10-10',createdAt:stamp},
    {id:'draft',status:'Entwurf',amountCHF:20,dueDate:'2026-10-10',createdAt:stamp}
  ];
  const s=store({rechnungen:rows});
  assert.deepEqual((await s.searchPage('rechnungen',{due:'overdue',today:'2026-10-24'})).records.map(x=>x.id),['late']);
  assert.deepEqual((await s.searchPage('rechnungen',{due:'soon',today:'2026-10-24'})).records.map(x=>x.id),['soon']);
  assert.equal((await s.searchPage('rechnungen',{due:'open',today:'2026-10-24'})).totalMatches,2);
});

test('search rejects invalid status, stale cursor, injection and unsupported filters',async()=>{
  const s=store({kunden:[{id:'c1',company:'Test AG',createdAt:stamp,status:'Aktiv'}]});
  await assert.rejects(s.searchPage('kunden',{pageSize:101}),{status:400});
  await assert.rejects(s.searchPage('kunden',{q:'x'.repeat(121)}),{status:400});
  await assert.rejects(s.searchPage('kunden',{q:'\u0000bad'}),{status:400});
  await assert.rejects(s.searchPage('kunden',{status:'Administrator'}),{status:400});
  await assert.rejects(s.searchPage('kunden',{due:'overdue'}),{status:400});
  await assert.rejects(s.searchPage('kunden',{cursor:'../../'}),{status:400});
  await assert.rejects(s.searchPage('kunden',{cursor:'c1',q:'does-not-match'}),{status:409});
});

test('status-index search reads only matching docs, not full register; sorting and cursors stay exact',async()=>{
  const customers=Array.from({length:1250},(_,i)=>({
    id:String(i).padStart(5,'0'),company:'LSZH TEST_ONLY '+i,
    status:i%25===0?'Aktiv':'Inaktiv',
    createdAt:i%7===0?'2026-10-23T12:00:00.000Z':'2026-10-24T12:00:00.000Z'
  }));
  const db=fakeFirestore({kunden:customers});
  const s=buildStore(db,'lszh_crm_v2_staging_');
  let cursor='',all=[];
  do{
    const p=await s.searchPage('kunden',{status:'Aktiv',pageSize:17,cursor});
    assert.equal(p.totalMatches,50);
    all.push(...p.records.map(x=>x.id));
    if(!p.hasMore)break;
    cursor=p.nextCursor;
  }while(all.length<100);
  const expected=customers.filter(x=>x.status==='Aktiv')
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))
    .map(x=>x.id);
  assert.deepEqual(all,expected);
  assert.equal(new Set(all).size,50);
  // Three status-index page queries, each reading only 50 matches, not 1250.
  assert.equal(db.reads.kunden,150);
  await assert.rejects(s.searchPage('kunden',{status:'Aktiv',cursor:'00001'}),{status:409});
});

test('due index scans only open/part-paid invoice statuses, no composite index',async()=>{
  const invoices=Array.from({length:600},(_,i)=>({
    id:'bill-'+i,number:'RE-'+i,description:'LSZH TEST_ONLY invoice',
    createdAt:'2026-10-24T11:00:00.000Z',dueDate:'2026-10-20',
    amountCHF:100,status:i%60===0?'Offen':i%60===1?'Teilbezahlt':'Bezahlt'
  }));
  const db=fakeFirestore({rechnungen:invoices});
  const s=buildStore(db,'lszh_crm_v2_staging_');
  const p=await s.searchPage('rechnungen',{due:'overdue',today:'2026-10-24'});
  assert.equal(p.totalMatches,20);
  assert.equal(db.reads.rechnungen,20);
  assert.ok(p.records.every(x=>x.status==='Offen'||x.status==='Teilbezahlt'));
  const combined=await s.searchPage('rechnungen',{due:'overdue',status:'Bezahlt',today:'2026-10-24'});
  assert.equal(combined.totalMatches,0);
});

test('status-only query preserves missing createdAt exclusion and stale cursor validation',async()=>{
  const customers=[
    {id:'a',company:'A',status:'Aktiv',createdAt:stamp},
    {id:'b',company:'B',status:'Aktiv'},
    {id:'c',company:'C',status:'Inaktiv',createdAt:stamp}
  ];
  const s=store({kunden:customers});
  assert.deepEqual((await s.searchPage('kunden',{status:'Aktiv'})).records.map(x=>x.id),['a']);
  await assert.rejects(s.searchPage('kunden',{status:'Aktiv',cursor:'c'}),{status:409});
  await assert.rejects(s.searchPage('kunden',{status:'Aktiv',cursor:'b'}),{status:409});
});
