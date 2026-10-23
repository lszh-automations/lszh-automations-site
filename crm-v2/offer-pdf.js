'use strict';

// Server-side, dependency-free A4 PDF attachment. Only saved quote data is used.
const {existingLines,quoteTotals}=require('./offer-pricing');
const WIDTH=595.28, HEIGHT=841.89, LEFT=46, RIGHT=549;
function safe(value){
  return String(value??'').replace(/[\u2010-\u2015]/g,'-')
    .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g,'?');
}
function escaped(value){
  return '('+safe(value).replace(/\\/g,'\\\\').replace(/\(/g,'\\(')
    .replace(/\)/g,'\\)')+')';
}
function wrap(value,max=70){
  const lines=[];
  for(const part of safe(value).split('\n')){
    let line='';
    for(const word of part.split(/\s+/).filter(Boolean)){
      if(line && (line+' '+word).length>max){lines.push(line);line='';}
      if(word.length>max){
        if(line){lines.push(line);line='';}
        for(let j=0;j<word.length;j+=max)lines.push(word.slice(j,j+max));
      }else line=line?line+' '+word:word;
    }
    lines.push(line);
  }
  return lines;
}
function money(n){
  return 'CHF '+new Intl.NumberFormat('de-CH',{
    minimumFractionDigits:2,maximumFractionDigits:2
  }).format(n||0);
}
function dateCH(raw){
  const value=String(raw||'').slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ?value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4):'-';
}
function makePdf(offer,recipient={}){
  if(!offer||typeof offer!=='object')throw Error('offer_required');
  const items=existingLines(offer),totals=quoteTotals(items);
  const pages=[];
  let commands=[],y=0;
  const color=c=>c.join(' ');
  function rect(x,yy,w,h,c){
    commands.push(color(c)+' rg '+[x,yy,w,h].join(' ')+' re f');
  }
  function text(value,x,yy,size=10,bold=false,c=[.12,.17,.23]){
    commands.push(color(c)+' rg BT /'+(bold?'F2':'F1')+' '+size+
      ' Tf 1 0 0 1 '+x+' '+yy+' Tm '+escaped(value)+' Tj ET');
  }
  function page(){
    commands=[];pages.push(commands);
    rect(0,HEIGHT-103,WIDTH,103,[.05,.09,.15]);
    rect(LEFT,HEIGHT-105,85,3,[.42,.78,.96]);
    text('LSZH',LEFT,HEIGHT-52,24,true,[1,1,1]);
    text('AUTOMATIONS',LEFT+90,HEIGHT-52,11,true,[.47,.82,1]);
    text('LSZH Invest GmbH  |  Schweiz',LEFT,HEIGHT-76,9,false,[.72,.81,.9]);
    text('OFFERTEN',RIGHT-101,HEIGHT-50,11,true,[1,1,1]);
    text('LSZH Automations  |  LSZH Invest GmbH',LEFT,34,8,false,[.47,.53,.59]);
    y=HEIGHT-144;
  }
  function check(height){if(y-height<70)page();}
  function line(value,size=10,gap=16,bold=false){
    check(gap);text(value,LEFT,y,size,bold);y-=gap;
  }
  function headingRow(){
    check(49);
    rect(LEFT,y-23,RIGHT-LEFT,30,[.08,.15,.23]);
    text('POS.',LEFT+8,y-13,8,true,[1,1,1]);
    text('LEISTUNG',LEFT+52,y-13,8,true,[1,1,1]);
    text('MENGE',LEFT+283,y-13,8,true,[1,1,1]);
    text('PREIS',LEFT+335,y-13,8,true,[1,1,1]);
    text('ART',LEFT+441,y-13,8,true,[1,1,1]);
    y-=37;
  }
  page();
  line('Offerte Nr. '+safe(offer.number||'-'),19,34,true);
  line(offer.title||'Leistungsangebot',12,29,true);
  line('AN',9,18,true);
  const address=[
    recipient.company||'Empfänger',recipient.name||recipient.contactName||'',
    recipient.street||'',
    [recipient.postalCode,recipient.city].filter(Boolean).join(' '),
    recipient.country||''
  ].filter(Boolean);
  for(const v of address)for(const part of wrap(v,65))line(part,10,15,false);
  y-=10;
  line('Erstellt: '+dateCH(offer.createdAt)+'     Gültig bis: '+dateCH(offer.validUntil),10,29);
  if(offer.description&&String(offer.description).trim()){
    line('LEISTUNGSBESCHREIBUNG',10,20,true);
    for(const part of wrap(offer.description,93))line(part||' ',9,13);
    y-=16;
  }
  headingRow();
  for(let i=0;i<items.length;i++){
    const row=items[i],parts=wrap(row.title,44);
    const height=Math.max(30,parts.length*13+11);
    if(y-height<105){page();headingRow();}
    if(i%2===0)rect(LEFT,y-height+1,RIGHT-LEFT,height,[.94,.96,.98]);
    text(i+1,LEFT+8,y-14,9);
    for(let j=0;j<parts.length;j++)text(parts[j],LEFT+52,y-14-j*13,9);
    text(String(row.qty),LEFT+283,y-14,9);
    text(money(row.unitPriceCHF).replace('CHF ',''),LEFT+335,y-14,9);
    text(row.mode==='monatlich'?'Monatlich':'Einmalig',LEFT+441,y-14,8);
    y-=height;
    rect(LEFT,y,RIGHT-LEFT,.6,[.72,.80,.86]);
  }
  check(120);y-=26;
  rect(LEFT,y-56,RIGHT-LEFT,67,[.89,.94,.975]);
  text('Einmalig',LEFT+13,y-10,10);
  text(money(totals.oneTimeCHF),LEFT+13,y-37,15,true);
  text('Monatlich',LEFT+264,y-10,10);
  text(money(totals.monthlyCHF)+' / Monat',LEFT+264,y-37,15,true);
  y-=83;
  line('Diese Offerte ist bis '+dateCH(offer.validUntil)+' gültig.',9,20);
  line('Bei Fragen stehen wir Ihnen gerne zur Verfügung.',9,20);
  const objects=[null,'<< /Type /Catalog /Pages 2 0 R >>',null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
  const pageIds=[];
  for(const lines of pages){
    const data=Buffer.from(lines.join('\n')+'\n','latin1');
    const contentId=objects.length;
    objects.push(Buffer.concat([
      Buffer.from('<< /Length '+data.length+' >>\nstream\n','latin1'),
      data,Buffer.from('endstream','latin1')
    ]));
    const pageId=objects.length;
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+WIDTH+' '+HEIGHT+
      '] /Contents '+contentId+' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>');
    pageIds.push(pageId+' 0 R');
  }
  objects[2]='<< /Type /Pages /Kids ['+pageIds.join(' ')+'] /Count '+pageIds.length+' >>';
  const blocks=[Buffer.from('%PDF-1.4\n%\xf1\xf2\xf3\xf4\n','latin1')],offsets=[0];
  let length=blocks[0].length;
  for(let i=1;i<objects.length;i++){
    offsets[i]=length;
    const obj=Buffer.concat([
      Buffer.from(i+' 0 obj\n','latin1'),
      Buffer.isBuffer(objects[i])?objects[i]:Buffer.from(objects[i],'latin1'),
      Buffer.from('\nendobj\n','latin1')
    ]);
    blocks.push(obj);length+=obj.length;
  }
  let xref='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++)
    xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
  blocks.push(Buffer.from(xref+'trailer\n<< /Size '+objects.length+
    ' /Root 1 0 R >>\nstartxref\n'+length+'\n%%EOF\n','latin1'));
  return Buffer.concat(blocks);
}
module.exports={makePdf};
