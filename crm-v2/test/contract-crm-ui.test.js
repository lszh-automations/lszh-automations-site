'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const source=html.slice(html.indexOf('async function renderContractWorkflow('),html.indexOf('function renderOfferWorkflow('));
function setup(value,enabled=true){
 const calls=[],area={children:[],dataset:{},hidden:true,replaceChildren(){this.children=[];},append(...items){this.children.push(...items);}};
 const state={contractActionsEnabled:enabled};let confirm=true;
 const context={state,$:()=>area,el:(tag,css,text)=>({tag,textContent:text,value:'',style:{},children:[],append(...items){this.children.push(...items);},addEventListener(name,fn){this[name]=fn;}}),
  api:async(url,options)=>{calls.push({url,options});return options?{state:'sent',url:'https://portal.example/#private_token'}:value;},
  window:{confirm:()=>confirm,prompt:()=> 'synthetic_message_123'},reopenSavedOffer:async()=>{}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,area,calls,setConfirm:v=>{confirm=v;},render:(status='Versendet')=>context.renderContractWorkflow({id:'offer_1101',status})};
}
test('contract controls remain hidden without release and do not request package data',async()=>{
 const f=setup({},false);await f.render();assert.equal(f.area.hidden,true);assert.equal(f.calls.length,0);
});
test('prepared package sends only after an explicit operator click and confirmation',async()=>{
 const f=setup({state:'prepared'});await f.render();const button=f.area.children.find(x=>x.tag==='button');
 assert.match(button.textContent,/einmalig versenden/);assert.equal(f.calls.length,1);
 f.setConfirm(false);await button.click();assert.equal(f.calls.length,1);
 f.setConfirm(true);await button.click();assert.equal(f.calls.length,2);assert.equal(f.calls[1].url.endsWith('/dispatch'),true);assert.equal(f.calls[1].options.body,'{}');
});
test('uncertain sends offer reconciliation and never a resend action',async()=>{
 const f=setup({state:'delivery_review'});await f.render();const buttons=f.area.children.filter(x=>x.tag==='button');
 assert.equal(buttons.length,1);assert.match(buttons[0].textContent,/Postfach nachweisen/);
 const label=f.area.children.find(x=>x.tag==='label');assert.ok(label);await buttons[0].click();assert.equal(f.calls.length,1);label.children[0].value='synthetic_message_123';await buttons[0].click();assert.equal(f.calls[1].url.endsWith('/reconcile'),true);
});
test('private links are created only on explicit request and stay in the current editor',async()=>{
 const f=setup({state:'sent'});await f.render();assert.equal(f.area.children.some(x=>x.tag==='a'),false);
 await f.area.children.find(x=>x.tag==='button').click();const link=f.area.children.find(x=>x.tag==='a');
 assert.equal(link.href,'https://portal.example/#private_token');assert.equal(link.rel,'noopener noreferrer');
});

test('general package preparation needs AVV classification and both explicit reviews',async()=>{
 const f=setup({state:'missing_package',mayCreateDraft:true});await f.render();
 const labels=f.area.children.filter(x=>x.tag==='label'),select=labels[0].children[0],button=f.area.children.find(x=>x.tag==='button');
 select.value='review';await button.click();assert.equal(f.calls.length,1);
 select.value='no';labels[1].children[0].checked=true;await button.click();assert.equal(f.calls.length,1);
 labels[2].children[0].checked=true;await button.click();assert.equal(f.calls.length,2);
 assert.equal(f.calls[1].url.endsWith('/draft'),true);assert.deepEqual(JSON.parse(f.calls[1].options.body),{avvRequired:'no',documentsReviewed:true,retentionApproved:true});
});
test('internal review controls honour the backend capability',async()=>{
 const f=setup({state:'customer_response_recorded',archiveState:'complete',reviewEnabled:false});await f.render();assert.equal(f.area.children.some(x=>x.tag==='button'),false);
});

test('simplified send shows recipient and documents and requires deliberate review',async()=>{
 const f=setup({state:'missing_package',simpleSendEnabled:true,mayCreateDraft:true});
 f.context.api=async(url,options)=>{f.calls.push({url,options});return url.endsWith('/preview')?{recipient:'client@example.com',offerNumber:'1201',title:'Synthetic',documents:['Offerte_1201.pdf','Terms.pdf'],offerSnapshotSha256:'b'.repeat(64),avvReady:false}:options?{state:'sent',invitationState:'sent'}:{state:'missing_package',simpleSendEnabled:true,mayCreateDraft:true};};
 await f.render();assert.ok(f.area.children.some(x=>x.textContent==='Empfänger: client@example.com'));
 const button=f.area.children.find(x=>x.textContent==='Prüfen und senden');assert.ok(button);
 await button.click();assert.equal(f.calls.filter(x=>x.options).length,0);
 const labels=f.area.children.filter(x=>x.tag==='label');labels[0].children[0].value='no';labels[1].children[0].checked=true;labels[2].children[0].checked=true;
 await button.click();const writes=f.calls.filter(x=>x.options);assert.equal(writes.length,1);assert.ok(writes[0].url.endsWith('/send'));assert.equal(JSON.parse(writes[0].options.body).offerSnapshotSha256,'b'.repeat(64));
 assert.equal(f.area.children.some(x=>/Dokumentpaket erstellen|Vertragspaket prüfen und vorbereiten/.test(x.textContent||'')),false);
});
test('uncertain invitation never exposes a resend control',async()=>{
 const f=setup({state:'sent',simpleSendEnabled:true,invitationState:'delivery_review'});await f.render();assert.equal(f.area.children.some(x=>x.tag==='button'),false);
});
test('known send receipt offers readonly status checking without a message-ID field',async()=>{
 const f=setup({state:'delivery_review',simpleSendEnabled:true,hasSendReceipt:true});await f.render();const button=f.area.children.find(x=>x.tag==='button');assert.equal(button.textContent,'Versandstatus prüfen');assert.equal(f.area.children.some(x=>x.tag==='label'),false);await button.click();assert.ok(f.calls[1].url.endsWith('/check'));
});

test('confirmation requires preview review and deliberate click; no Gmail-ID input',async()=>{
 const value={state:'awaiting_lszh_confirmation',simpleSendEnabled:true,reviewEnabled:true,confirmationEnabled:true},f=setup(value);
 f.context.api=async(url,options)=>{f.calls.push({url,options});return url.endsWith('/confirmation-preview')?{recipient:'client@example.com',subject:'Ihre Auftragsbestätigung',text:'Geprüfte Bestätigung',sha256:'a'.repeat(64),data:'JVBERi0='}:options?{state:'confirmed'}:value;};
 await f.render();const button=f.area.children.find(x=>x.textContent==='Auftragsbestätigung senden');assert.ok(button);
 assert.equal(f.area.children.some(x=>/Nachrichten-ID/.test(x.textContent||'')),false);
 await button.click();assert.equal(f.calls.filter(x=>x.options).length,0);
 f.area.children.find(x=>x.tag==='label').children[0].checked=true;
 f.setConfirm(false);await button.click();assert.equal(f.calls.filter(x=>x.options).length,0);
 f.setConfirm(true);await button.click();const request=f.calls.find(x=>x.options);assert.ok(request.url.endsWith('/confirmation-send'));assert.deepEqual(JSON.parse(request.options.body),{documentReviewed:true,sha256:'a'.repeat(64)});
});
test('uncertain confirmation offers only receipt checking and no resend control',async()=>{
 for(const hasConfirmationReceipt of [true,false]){
  const f=setup({state:'awaiting_lszh_confirmation',simpleSendEnabled:true,reviewEnabled:true,confirmationEnabled:true,confirmationDeliveryState:'manual_review',hasConfirmationReceipt});await f.render();
  const buttons=f.area.children.filter(x=>x.tag==='button');assert.equal(buttons.length,hasConfirmationReceipt?1:0);
  assert.equal(f.area.children.some(x=>x.tag==='input'||x.tag==='label'),false);
  if(hasConfirmationReceipt){await buttons[0].click();assert.ok(f.calls.at(-1).url.endsWith('/confirmation-check'));}
 }
});

test('verified online confirmation exposes the missing acceptance action and preserves explicit approval',async()=>{
 for(const simpleSendEnabled of [true,false]){
  const f=setup({state:'confirmed',simpleSendEnabled});await f.render();
  const button=f.area.children.find(x=>x.textContent==='Auftrag übernehmen und Projekt anlegen');assert.ok(button);
  assert.equal(f.calls.filter(x=>x.options).length,0);f.setConfirm(false);await button.click();assert.equal(f.calls.filter(x=>x.options).length,0);
  f.setConfirm(true);await Promise.all([button.click(),button.click()]);const writes=f.calls.filter(x=>x.options);assert.equal(writes.length,1);assert.equal(writes[0].url,'/api/records/offerten/offer_1101');assert.equal(writes[0].options.method,'PATCH');assert.deepEqual(JSON.parse(writes[0].options.body),{status:'Angenommen'});
 }
});
test('already accepted offer never offers another project creation action',async()=>{
 const f=setup({state:'confirmed',simpleSendEnabled:true});await f.render('Angenommen');assert.equal(f.area.children.some(x=>x.tag==='button'),false);assert.ok(f.area.children.some(x=>/Auftrag übernommen/.test(x.textContent||'')));
});
test('pending confirmation cannot expose acceptance action',async()=>{
 const f=setup({state:'awaiting_lszh_confirmation',simpleSendEnabled:true,reviewEnabled:false});await f.render();assert.equal(f.area.children.some(x=>/Auftrag übernehmen/.test(x.textContent||'')),false);
});
