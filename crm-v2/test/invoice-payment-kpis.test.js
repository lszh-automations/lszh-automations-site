'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
function renderInvoice(invoice){
  // Do not split on exact newline sequences: Git on Windows may checkout CRLF.
  const first=html.indexOf('function renderInvoicePayments(invoice){');
  const next=html.indexOf('function renderInvoiceDispatch(invoice){',first);
  assert.ok(first>=0&&next>first,'payment renderer found');
  const fragment=html.slice(first,next).trim();
  const elements=new Map();
  function get(id){
    if(!elements.has(id)){
      const node={
        value:'',textContent:'',hidden:false,dataset:{},style:{},
        children:[],replaceChildren(){this.children=[];},
        append(...items){this.children.push(...items);},
        addEventListener(){},
      };
      elements.set(id,node);
    }
    return elements.get(id);
  }
  const context={
    $:get,
    el:(type,klass,text)=>({
      type,klass,textContent:text??'',style:{},dataset:{},children:[],
      append(...items){this.children.push(...items);},
      addEventListener(){}
    }),
    invoiceCHF:value=>new Intl.NumberFormat('de-CH',{
      style:'currency',currency:'CHF',minimumFractionDigits:2,maximumFractionDigits:2
    }).format(value||0),
    localDateKey:()=> '2026-10-24',
    window:{},
    state:{},
  };
  vm.runInNewContext('('+fragment+')',context,{timeout:2000})(invoice);
  return get;
}
const money=value=>new Intl.NumberFormat('de-CH',{
  style:'currency',currency:'CHF',minimumFractionDigits:2,maximumFractionDigits:2
}).format(value);
const base={status:'Teilbezahlt',invoiceDispatchState:'confirmed',
  dueDate:'2026-10-31',amountCHF:100};
function payment(amount,voidedAt){
  return {paymentId:'abc',paidOn:'2026-10-24',method:'Banküberweisung',
    amountCHF:amount,...(voidedAt?{voidedAt}: {})};
}

test('payment overview exposes three amount KPIs and native accessible progress',()=>{
  for(const id of ['invoicePaymentTotal','invoicePaymentReceived','invoicePaymentOpen',
    'invoicePaymentPercent','invoicePaymentProgress','invoicePaymentSummary']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/invoice-payment-kpi--open/);
  assert.match(html,/<progress id="invoicePaymentProgress"[^>]+max="100"[^>]+aria-label=/);
  assert.match(html,/@media\(max-width:740px\)[^{]*\{[^}]*invoice-payments-entry/);
  assert.match(html,/invoice-payment-kpi--open\{grid-column:1\/-1\}/);
});
test('RE-1002 with CHF 50 partial payment shows CHF 50 due, 50% progress and same default next payment',()=>{
  const get=renderInvoice({...base,paymentHistory:[payment(50)]});
  assert.equal(get('invoicePaymentTotal').textContent,money(100));
  assert.equal(get('invoicePaymentReceived').textContent,money(50));
  assert.equal(get('invoicePaymentOpen').textContent,money(50));
  assert.equal(get('invoicePaymentPercent').textContent,'50 % bezahlt');
  assert.equal(get('invoicePaymentProgress').value,50);
  assert.equal(get('invoicePaymentStatus').textContent,'Teilbezahlt');
  assert.equal(get('invoicePaymentSummary').textContent,'Fällig am 31.10.2026');
  assert.equal(get('invoicePaymentAmount').value,'50.00');
  assert.equal(get('invoicePaymentEntry').hidden,false);
});
test('fully paid invoices show zero outstanding and hide payment entry',()=>{
  const get=renderInvoice({...base,status:'Bezahlt',paymentHistory:[payment(100)]});
  assert.equal(get('invoicePaymentReceived').textContent,money(100));
  assert.equal(get('invoicePaymentOpen').textContent,money(0));
  assert.equal(get('invoicePaymentPercent').textContent,'100 % bezahlt');
  assert.equal(get('invoicePaymentProgress').value,100);
  assert.equal(get('invoicePaymentEntry').hidden,true);
});
test('corrected payment recalculates 0% and ignores voided transactions',()=>{
  const get=renderInvoice({...base,status:'Offen',
    paymentHistory:[payment(50,'2026-10-24T12:10:00Z')]});
  assert.equal(get('invoicePaymentReceived').textContent,money(0));
  assert.equal(get('invoicePaymentOpen').textContent,money(100));
  assert.equal(get('invoicePaymentPercent').textContent,'0 % bezahlt');
  assert.equal(get('invoicePaymentAmount').value,'100.00');
});
test('legacy paid invoice without payment entries renders 100% paid',()=>{
  const get=renderInvoice({...base,status:'Bezahlt',paymentHistory:[]});
  assert.equal(get('invoicePaymentReceived').textContent,money(100));
  assert.equal(get('invoicePaymentOpen').textContent,money(0));
  assert.equal(get('invoicePaymentProgress').value,100);
});
