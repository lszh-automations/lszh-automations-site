'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../public/index.html'),'utf8');
const source=html.slice(html.indexOf('function invoiceDeliveryInfo('),html.indexOf('function resetInvoiceReview('));
const {invoiceDeliveryInfo}=vm.runInNewContext(source+'\n({invoiceDeliveryInfo})');
test('payment state never implies invoice delivery; missing proof remains explicit',()=>{
 for(const status of ['Entwurf','Offen','Teilbezahlt','Bezahlt','Storniert'])assert.equal(invoiceDeliveryInfo({status}).label,'Kein Versandnachweis');
 assert.equal(invoiceDeliveryInfo({status:'Offen',invoiceDispatchState:'confirmed'}).label,'Versendet');
 assert.equal(invoiceDeliveryInfo({status:'Offen',invoiceSentAt:'2026-10-27T12:00:00Z'}).label,'Versendet');
});
test('active, uncertain and failed deliveries are distinct even with an old timestamp',()=>{
 for(const [state,label]of [['sending','Versand läuft'],['manual_review','Versand unklar'],['preparation_failed','Nicht versendet'],['not_sent','Nicht versendet']])assert.equal(invoiceDeliveryInfo({invoiceDispatchState:state}).label,label);
 assert.equal(invoiceDeliveryInfo({invoiceDispatchState:'manual_review',invoiceSentAt:'2026-10-27T12:00:00Z'}).label,'Versand unklar');
});
test('send availability explains PDF and checkbox prerequisites without bypassing them',()=>{
 const nodes=Object.fromEntries(['invoiceSend','invoiceSendBlocker','invoiceDeliverySummary','invoiceReviewAcknowledgement'].map(id=>[id,{checked:false}]));
 const state={invoiceEditing:{id:'i',status:'Offen'},invoiceReadiness:{canSend:true},records:{},invoiceMailEnabled:true,invoiceMailMode:'production',invoiceDirty:false,invoicePdfPreviewed:false};
 const text=html.slice(html.indexOf('function updateInvoiceSendAvailability('),html.indexOf('async function renderInvoiceReadiness('));
 const {updateInvoiceSendAvailability}=vm.runInNewContext(text+'\n({updateInvoiceSendAvailability})',{state,$:id=>nodes[id],invoiceDeliveryInfo});
 updateInvoiceSendAvailability();assert.equal(nodes.invoiceSend.disabled,true);assert.match(nodes.invoiceSendBlocker.textContent,/Schritt 1/);
 state.invoicePdfPreviewed=true;updateInvoiceSendAvailability();assert.equal(nodes.invoiceSend.disabled,true);assert.match(nodes.invoiceSendBlocker.textContent,/Schritt 2/);
 nodes.invoiceReviewAcknowledgement.checked=true;updateInvoiceSendAvailability();assert.equal(nodes.invoiceSend.disabled,false);assert.equal(nodes.invoiceSendBlocker.textContent,'');
 state.invoiceDirty=true;updateInvoiceSendAvailability();assert.equal(nodes.invoiceSend.disabled,true);assert.match(nodes.invoiceSendBlocker.textContent,/speichern/);
 state.invoiceDirty=false;state.invoiceReadiness={canSend:false,nextAction:'Kundenanschrift ergänzen'};updateInvoiceSendAvailability();assert.match(nodes.invoiceSendBlocker.textContent,/Kundenanschrift/);
});
