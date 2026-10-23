# LSZH CRM V2: safe synthetic webhook learning with no production data.
# Run ONLY while scenario 8144117 is in webhook learning mode.
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $hook=Read-Host 'Paste the private Make offer webhook URL (not stored)'
  if($hook -notmatch '^https://hook\.eu1\.make\.com\/[A-Za-z0-9]+$'){
    throw 'Invalid Make webhook URL'
  }
  $js=@'
const {makePdf}=require('./crm-v2/offer-pdf');
const {renderOfferEmail}=require('./crm-v2/offer-mail');
const offer={
  number:'999999',title:'TEST_ONLY LSZH Muster-Offerte',status:'Bereit',
  validUntil:'2026-12-31',createdAt:'2026-10-23T12:00:00Z',description:'',
  items:[{title:'TEST_ONLY Demo-Position',qty:1,unitPriceCHF:1,mode:'einmalig'}]
};
const person={
  company:'TEST_ONLY Beispiel AG',email:'lars.schulthess@outlook.com',
  name:'TEST_ONLY',city:'Wohlen',country:'Schweiz'
};
const pdf=makePdf(offer,person);
const mail=renderOfferEmail(offer,person);
process.stdout.write(JSON.stringify({
  kind:'offer_send',eventId:'offer_send_TEST_ONLY_learning_20261023',
  offerId:'test-offer-999999',to:'lars.schulthess@outlook.com',
  subject:'[TEST_ONLY] '+mail.subject,
  html:'<p>[TEST_ONLY] Webhook field learning, synthetic PDF only.</p>',
  pdfFilename:mail.filename,pdfBase64:pdf.toString('base64')
}));
'@
  $payload=(& node -e $js) -join [Environment]::NewLine
  if($LASTEXITCODE -ne 0 -or !$payload){throw 'Synthetic attachment creation failed'}
  $response=Invoke-WebRequest -Uri $hook -Method POST -ContentType 'application/json' -Body ([Text.Encoding]::UTF8.GetBytes($payload)) -UseBasicParsing -TimeoutSec 30
  if([int]$response.StatusCode -ne 200){throw 'Webhook learning request was not accepted'}
  Write-Host 'TEST_ONLY webhook POST accepted. Verify capture in Make before activating.'
  Write-Host 'No production CRM record was read or modified.'
} finally {
  $hook=$null
  $payload=$null
  Pop-Location
}
