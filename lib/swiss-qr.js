'use strict';
const crypto = require('crypto');
const ACCOUNT='CH5100761648607672002';
const CREDITOR={name:'LSZH Invest GmbH',street:'Rummelmatt',number:'8',postal:'5610',city:'Wohlen',country:'CH'};
const WARNING='NICHT ZUR ZAHLUNG VERWENDEN';
function mod97(s){let r=0;for(const ch of String(s).toUpperCase()){const x=/^[0-9]$/.test(ch)?ch:/^[A-Z]$/.test(ch)?String(ch.charCodeAt(0)-55):null;if(x===null)throw Error('invalid_character');for(const d of x)r=(r*10+Number(d))%97;}return r;}
function validIban(v){const x=String(v||'').replace(/\s/g,'').toUpperCase();return /^CH[A-Z0-9]{19}$/.test(x)&&mod97(x.slice(4)+x.slice(0,4))===1;}
function scor(id){id=String(id||'').trim();if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,64}$/.test(id))throw Error('invalid_invoice_number');const key='LSZH'+crypto.createHash('sha256').update('LSZH-SCOR-v1:'+id,'utf8').digest('hex').slice(0,16).toUpperCase();const ref='RF'+String(98-mod97(key+'RF00')).padStart(2,'0')+key;if(ref.length>25||mod97(ref.slice(4)+ref.slice(0,4))!==1)throw Error('invalid_scor');return ref;}
function address(a){if(!a||typeof a!=='object')throw Error('missing_address');const out=[];for(const [field,n,req] of [['name',70,true],['street',70,false],['number',16,false],['postal',16,true],['city',35,true],['country',2,true]]){const v=String(a[field]||'').trim();if(v.length>n||/[\r\n]/.test(v)||(req&&!v))throw Error('invalid_address_'+field);out.push(v);}if(!/^[A-Z]{2}$/.test(out[5]))throw Error('invalid_country');return ['S',...out];}
function buildSwissQr({invoiceNumber,amountCHF,debtor,test=false}){
if(!validIban(ACCOUNT))throw Error('invalid_iban');
if(typeof test!=='boolean')throw Error('invalid_test');
const amount=String(amountCHF||'').trim();
if(!/^(0|[1-9][0-9]{0,8})\.[0-9]{2}$/.test(amount)||Number(amount)>999999999.99||(test&&amount!=='0.00')||(!test&&Number(amount)<.01))throw Error('invalid_amount');
const ref=scor(invoiceNumber),msg=test?WARNING:'Rechnung '+invoiceNumber;
if(msg.length>140)throw Error('message_too_long');
const lines=['SPC','0200','1',ACCOUNT,...address(CREDITOR),'','','','','','','',amount,'CHF',...address(debtor),'SCOR',ref,msg,'EPD'];
if(lines.length!==31)throw Error('invalid_field_count');
const payload=lines.join('\n');if(Buffer.byteLength(payload,'utf8')>997)throw Error('payload_too_long');
return {payload,reference:ref,amount,debtor,message:msg,test};
}
module.exports={ACCOUNT,CREDITOR,WARNING,mod97,validIban,scor,buildSwissQr};