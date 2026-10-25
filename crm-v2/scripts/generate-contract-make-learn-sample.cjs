'use strict';
// One synthetic payload for the *inactive* Make STAGING webhook learning mode.
// Writes JSON to stdout; does NOT perform network, Firestore or Gmail actions.
const {makePdf}=require('../offer-pdf');
const {digest,prepareOfferPackage}=require('../offer-contract-package');
const {buildStagingContractPreview}=require('../offer-contract-package-preview');
const {buildMakeContractMockEnvelope}=require('../offer-contract-package-make-mock');

const avv=String(process.argv[2]||'no');
if(!['yes','no'].includes(avv)){
  console.error('TEST_ONLY generator: use no or yes for AVV (no data sent).');
  process.exitCode=2;
}else{
  const kinds=avv==='yes'?['offer','terms','avv']:['offer','terms'];
  const binaries=new Map();
  const documents=kinds.map(kind=>{
    const pdf=makePdf({
      number:'9099999',
      title:'TEST_ONLY '+kind+' – keine rechtswirksamen Vertragsunterlagen',
      validUntil:'2026-12-31',
      items:[{
        title:'TEST_ONLY synthetische Musterleistung fuer '+kind,
        qty:1,unitPriceCHF:12,mode:'einmalig'
      }]
    },{
      company:'TEST_ONLY Musterfirma',name:'Max Muster',
      email:'preview@example.invalid',street:'Musterweg 12',
      postalCode:'5610',city:'Wohlen',country:'Schweiz'
    });
    binaries.set(kind,pdf);
    return {
      kind,version:'RC1_TEST_ONLY',
      archiveFileId:'test_archive_'+kind+'_20261025',
      sha256:digest(pdf),
      filename:'TEST_ONLY_'+kind+'.pdf',bytes:pdf.length
    };
  });
  const pkg=prepareOfferPackage({
    offerId:'TEST_ONLY_make_schema_20261025',
    offerNumber:'9099999',
    revision:avv==='yes'?2:1,
    offerSnapshotSha256:digest(Buffer.from('TEST_ONLY_LEARN_SNAPSHOT_'+avv)),
    avvRequired:avv,avvAnnexesConfirmed:avv==='yes',
    documents
  });
  const preview=buildStagingContractPreview(pkg,async(_id,doc)=>binaries.get(doc.kind));
  preview.then(data=>{
    const payload=buildMakeContractMockEnvelope(data);
    // No logging of PDFs, tokens, personal contact data or webhook URL.
    process.stdout.write(JSON.stringify(payload)+'\n');
  }).catch(error=>{
    console.error('TEST_ONLY document generation failed: '+error.code);
    process.exitCode=2;
  });
}
