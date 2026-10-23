'use strict';
// Swiss QR payment payload (SIX IG QR-bill 2.3; CHF / regular IBAN + NON).
// Does not issue/send invoices or fetch banking data. Never infer an IBAN.
const {invoiceTotals,invoiceLegacyItems}=require('./invoice-pricing');
function fail(message){throw Object.assign(new Error(message),{status:422});}
function field(value,max,label,{required=false}={}){
  const text=String(value??'').trim();
  if((required&&!text)||text.length>max||/[\r\n\x00-\x1f\x7f]/.test(text))
    fail('Swiss QR: ungueltiges Feld '+label);
  return text;
}
function ibanCheck(iban){
  const compact=String(iban||'').replace(/\s/g,'').toUpperCase();
  if(!/^(CH|LI)[0-9]{2}[A-Z0-9]{17}$/.test(compact))fail('Swiss QR: CH/LI-IBAN erforderlich');
  let checksum=0;
  for(const char of compact.slice(4)+compact.slice(0,4)){
    const n=char.charCodeAt(0);
    if(n>=48&&n<=57)checksum=(checksum*10+n-48)%97;
    else checksum=(checksum*100+n-55)%97;
  }
  if(checksum!==1)fail('Swiss QR: IBAN-Pruefziffer ungueltig');
  const iid=Number(compact.slice(4,9));
  if(iid>=30000&&iid<=31999)fail('Swiss QR: QR-IBAN erfordert QRR-Referenz; NON unzulaessig');
  return compact;
}
function countryCode(value){
  const raw=String(value||'CH').trim().toUpperCase();
  const aliases={'SCHWEIZ':'CH','SWITZERLAND':'CH','SUISSE':'CH','LIECHTENSTEIN':'LI','DEUTSCHLAND':'DE','GERMANY':'DE','OESTERREICH':'AT','ÖSTERREICH':'AT','AUSTRIA':'AT'};
  const result=aliases[raw]||raw;
  if(!/^[A-Z]{2}$/.test(result))fail('Swiss QR: ISO-Land erforderlich');
  return result;
}
function address(input,label){
  const name=field(input?.name,70,label+' Name',{required:true});
  const street=field(input?.street,70,label+' Strasse');
  const house=field(input?.houseNumber,16,label+' Hausnummer');
  const zip=field(input?.postalCode,16,label+' PLZ',{required:true});
  const city=field(input?.city,35,label+' Ort',{required:true});
  const country=countryCode(input?.country);
  return ['S',name,street,house,zip,city,country];
}
function debtorFromCustomer(customer){
  if(!customer||typeof customer!=='object')fail('Swiss QR: Rechnungsempfaenger fehlt');
  const combined=String(customer.street||'').trim();
  const match=/^(.*?)\s+(\d+[a-zA-Z]?(?:[-/]\d+)?)$/.exec(combined);
  if(!match)fail('Swiss QR: Kundenstrasse mit separierbarer Hausnummer erforderlich');
  return {
    name:customer.company||customer.contactName,
    street:match[1],houseNumber:match[2],
    postalCode:customer.postalCode,city:customer.city,country:customer.country||'CH'
  };
}
function prepareSwissQR(invoice,customer,config={}){
  if(!invoice||invoice.status!=='Offen')fail('Swiss QR: nur offene Rechnungen');
  if(!/^RE-\d+$/.test(String(invoice.number||'')))fail('Swiss QR: gueltige Rechnungsnummer erforderlich');
  const iban=ibanCheck(config.iban);
  const creditor=address(config.creditor||{
    name:'LSZH Invest GmbH',street:'Rummelmatt',houseNumber:'8',
    postalCode:'5610',city:'Wohlen',country:'CH'
  },'Glaeubiger');
  if(creditor[1]!=='LSZH Invest GmbH')fail('Swiss QR: Gläubiger muss der Firmenname LSZH Invest GmbH sein');
  const debtor=address(debtorFromCustomer(customer),'Schuldner');
  const calculated=invoiceTotals(invoiceLegacyItems(invoice));
  if(!(calculated.amountCHF>0)||
      Math.abs(calculated.amountCHF-Number(invoice.amountCHF))>0.00001)
    fail('Swiss QR: gespeicherter Rechnungsbetrag stimmt nicht mit Positionen ueberein');
  const amount=calculated.amountCHF.toFixed(2);
  const message=field('Rechnung '+invoice.number,140,'Mitteilung',{required:true});
  // 31 ordered data fields: 3 header + IBAN + 7 creditor + 7 empty
  // ultimate-creditor + 2 amount/currency + 7 debtor + 2 reference +
  // message + trailer. Optional billing info and AV fields are omitted.
  const lines=['SPC','0200','1',iban,...creditor,...Array(7).fill(''),
    amount,'CHF',...debtor,'NON','',message,'EPD'];
  if(lines.length!==31)throw Error('swiss_qr_internal_field_count');
  const payload=lines.join('\n');
  if([...payload].length>997||Buffer.byteLength(payload,'utf8')>997)
    fail('Swiss QR: Nutzdaten zu lang');
  return {iban,amountCHF:calculated.amountCHF,amount,payload,creditor,debtor,message,
    referenceType:'NON'};
}
module.exports={ibanCheck,address,debtorFromCustomer,prepareSwissQR};
