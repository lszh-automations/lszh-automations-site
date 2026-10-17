// Local-only deterministic PDFs. No customer data, Google credentials, tokens,
// network, real contracts or legal approval. Do not commit generated PDFs.
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
const filenames={
 quoteJa:'TEST_ONLY_quote_AVV_JA_NO_CONTRACT.pdf',
 quoteNein:'TEST_ONLY_quote_AVV_NEIN_NO_CONTRACT.pdf',
 terms:'TEST_ONLY_project_terms_NO_CONTRACT.pdf',
 avv:'TEST_ONLY_avv_NO_CONTRACT.pdf'
};
const esc=s=>{
 if(typeof s!=='string'||/[^\x20-\x7e]/.test(s))throw Error('ascii_only');
 return s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
};
function pdf(title,lines){
 if(lines.length>18||lines.some(s=>s.length>89))throw Error('overlong_fixture');
 const text=(value,y,size,font)=>'BT /'+font+' '+size+' Tf 40 '+y+' Td ('+esc(value)+') Tj ET';
 const parts=['0.04 0.12 0.23 rg','0 744 595 98 re f','1 1 1 rg',
   text('LSZH AUTOMATIONS / SYNTHETIC TEST ONLY',807,12,'F1'),
   text('NO CONTRACT - NOT LEGALLY BINDING',765,26,'F2'),
   '0.08 0.16 0.30 rg',text(title,700,19,'F2'),
   '0.82 0.16 0.14 rg',
   text('TEST ONLY / NO CONTRACT / NO EMAIL',665,13,'F2'),
   '0.18 0.28 0.40 rg',
   ...lines.map((x,i)=>text(x,620-i*26,12,'F1')),
   '0.45 0.50 0.60 rg',
   text('Fictional LSZH test artefact; no signatures; no genuine contractual clauses.',75,10,'F1'),
   text('Recipient: synthetic@example.invalid - never send or accept this offer.',55,10,'F1')];
 const stream=Buffer.from(parts.join('\n')+'\n','latin1');
 const objects=[
   '<< /Type /Catalog /Pages 2 0 R >>',
   '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
   '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
   Buffer.concat([Buffer.from('<< /Length '+stream.length+' >>\nstream\n'),stream,Buffer.from('endstream')]),
   '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
   '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
 ];
 const buffers=[Buffer.from('%PDF-1.4\n% LSZH SYNTHETIC ONLY\n')];
 let position=buffers[0].length;const offsets=[];
 const add=x=>{const b=Buffer.isBuffer(x)?x:Buffer.from(x,'ascii');buffers.push(b);position+=b.length;};
 for(let i=0;i<objects.length;i++){
   offsets.push(position);add((i+1)+' 0 obj\n');add(objects[i]);add('\nendobj\n');
 }
 const xref=position;
 add('xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n');
 offsets.forEach(x=>add(String(x).padStart(10,'0')+' 00000 n \n'));
 add('trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return Buffer.concat(buffers);
}
export function buildFixtures(){
 const quoteJa='TEST_PDF_AVV_JA_NO_CONTRACT';
 const quoteNein='TEST_PDF_AVV_NEIN_NO_CONTRACT';
 const files={
  quoteJa:pdf('FICTITIOUS OFFER: AVV YES',[
   'Offer number: '+quoteJa,'Company: Synthetic KMU AG (does not exist)',
   'Service: Test automation for imaginary requests',
   'One-time example price: CHF 1490.00','Monthly example price: CHF 149.00',
   'AVV: required (separate synthetic AVV document)',
   'No commitment, acceptance, payment, delivery or performance is possible.'
  ]),
  quoteNein:pdf('FICTITIOUS OFFER: AVV NO',[
   'Offer number: '+quoteNein,'Company: Synthetic KMU AG (does not exist)',
   'Service: Test automation for imaginary requests',
   'One-time example price: CHF 1490.00','Monthly example price: CHF 149.00',
   'AVV: not required; no AVV PDF must be offered or downloaded',
   'No commitment, acceptance, payment, delivery or performance is possible.'
  ]),
  terms:pdf('SYNTHETIC PROJECT TERMS',[
   'Version: TEST_v1.0_RC1',
   'These are technical test sentences, not contractual conditions.',
   'No services are promised. No payment obligation may arise.',
   'No real person or business is invited to sign or accept anything.',
   'Never substitute this page for genuine project conditions.'
  ]),
  avv:pdf('SYNTHETIC DATA PROCESSING AGREEMENT',[
   'Version: TEST_ONLY_AVV_v1.0_RC1',
   'The names and obligations here are entirely imaginary.',
   'No real personal data is processed under this document.',
   'No service provider or controller is appointed by this test.',
   'This file exists only to verify optional third-document delivery.'
  ])
 };
 const fileMeta=Object.fromEntries(Object.entries(files).map(([k,b])=>[k,{
   file:filenames[k],sha256:sha(b),bytes:b.length,mimeType:'application/pdf',
   driveFileId:null,driveVerified:false,driveReadOnlyVerified:false
 }]));
 const offers=[
  {offerNumber:quoteJa,avvRequired:'Ja',recipientEmail:'synthetic@example.invalid',
   quote:'quoteJa',terms:'terms',avv:'avv',source:'LSZH_SYNTHETIC_ONLY',downstream:'disabled'},
  {offerNumber:quoteNein,avvRequired:'Nein',recipientEmail:'synthetic@example.invalid',
   quote:'quoteNein',terms:'terms',avv:null,source:'LSZH_SYNTHETIC_ONLY',downstream:'disabled'}
 ];
 return {files,manifest:{
  schemaVersion:1,fixtureId:'LSZH_SYNTHETIC_PDF_TEST_20261018',testOnly:true,
  legallyApproved:false,acceptanceEnabled:false,deliveryEnabled:false,
  cloudUploaded:false,archiveVerified:false,tokenConfigured:false,
  termsVersion:'TEST_v1.0_RC1',files:fileMeta,offers
 }};
}
export async function writeFixtures(directory){
 if(typeof directory!=='string'||!directory.trim())throw Error('output_required');
 const folder=resolve(directory);
 await mkdir(folder,{recursive:true});
 const {files,manifest}=buildFixtures();
 for(const [kind,bytes] of Object.entries(files))
  await writeFile(resolve(folder,filenames[kind]),bytes,{flag:'wx'});
 await writeFile(resolve(folder,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 if(process.argv.length!==4||process.argv[2]!=='--out'){
  console.error('Usage: node scripts/offerSyntheticPdfFixtures.mjs --out /absolute/new/directory');
  process.exitCode=2;
 }else{
  try{
   await writeFixtures(process.argv[3]);
   console.log('PASS: four synthetic PDFs + SHA256 manifest, no external operations.');
   console.log('NOTE: Google Drive IDs are null and no contract is authorised.');
  }catch(e){console.error('NO-GO: '+e.message);process.exitCode=1;}
 }
}
