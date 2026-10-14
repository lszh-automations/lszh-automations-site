'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const path=require('node:path');

const debtor={name:'Beispielkunde AG',street:'Teststrasse',number:'7',postal:'5610',city:'Wohlen',country:'CH'};
const invoice={invoiceNumber:'TEST-QR-2026-001',amountCHF:'0.00',test:true,description:'Technischer Test, nicht zahlbar',debtor};
test('private website stays locked; only authenticated 0.00 QR can render', {timeout:25000}, async()=>{
 const apiKey=crypto.randomBytes(48).toString('hex');
 const port=16000+crypto.randomInt(15000);
 const url='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,[path.join(__dirname,'../server.js')],{
  env:{...process.env,PORT:String(port),SITE_PRIVATE:'true',PREVIEW_TOKEN:'',
   SWISS_QR_BILL_ENABLED:'true',SWISS_QR_BILL_API_KEY:apiKey,
   SWISS_QR_REAL_INVOICES_ENABLED:'false',OFFER_ACCEPTANCE_ENABLED:'false'},
  stdio:['ignore','pipe','pipe']
 });
 try{
  let ready=false;
  for(let tries=0;tries<100;tries++){
   if(child.exitCode!==null)throw Error('server exited');
   try{const r=await fetch(url+'/',{signal:AbortSignal.timeout(250)});if(r.status===503){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,70));
  }
  assert.ok(ready,'private website should respond 503');
  assert.equal((await fetch(url+'/api/internal/invoices/qr-pdf',{method:'POST'})).status,401);
  const headers={'Content-Type':'application/json','X-LSZH-Invoice-Key':apiKey};
  const post=body=>fetch(url+'/api/internal/invoices/qr-pdf',{method:'POST',headers,body:JSON.stringify(body)});
  const blocked=await post({...invoice,test:false,amountCHF:'123.00'});
  assert.equal(blocked.status,403,'production invoices must stay blocked');
  const blocked2=await post({...invoice,amountCHF:'123.00'});
  assert.equal(blocked2.status,403,'nonzero fake test must stay blocked');
  const ok=await post(invoice);
  assert.equal(ok.status,200);
  assert.match(ok.headers.get('content-type'),/application\/pdf/i);
  assert.match(ok.headers.get('x-lszh-scor-reference'),/^RF\d{2}LSZH[A-F0-9]{16}$/);
  assert.match(ok.headers.get('cache-control'),/no-store/);
  const pdf=Buffer.from(await ok.arrayBuffer());
  assert.equal(pdf.subarray(0,5).toString(),'%PDF-');
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length,2);
  assert.equal((await fetch(url+'/api/internal/invoices/qr-pdf',{method:'POST',headers:{...headers,'X-LSZH-Invoice-Key':'wrong'},body:JSON.stringify(invoice)})).status,401);
 }finally{child.kill('SIGTERM');}
});
