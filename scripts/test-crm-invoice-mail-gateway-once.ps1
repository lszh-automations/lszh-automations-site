# LSZH CRM V2 – exactly one synthetic Swiss QR invoice email via existing Make/Gmail.
# Explicit confirmation required. This command does NOT use live Firestore,
# does NOT deploy Cloud Run, does NOT change active mail automations.
# The test is limited to the previously approved private mailbox.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$live='lszh-crm-v2-00043-wur'
$candidate='lszh-crm-v2-00045-lec'
$branch='feature/crm-v2-cloud-staging-20261023'
$testTo='lars.schulthess@outlook.com'
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function Service {
  $r=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json')-join [Environment]::NewLine
  Check 'Cloud Run service not readable'
  return ($r|ConvertFrom-Json)
}
function Revision([string]$name){
  $r=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json')-join [Environment]::NewLine
  Check 'CRM revision not readable'
  return ($r|ConvertFrom-Json)
}
function GetEnvEntry($rev,[string]$key){
  $items=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $key})
  if($items.Count -gt 1){throw ('Duplicate env '+$key)}
  if($items.Count -eq 0){return $null}
  return $items[0]
}
foreach($bin in @('git','node.exe','npm.cmd','gcloud.cmd')){
  if(!(Get-Command $bin -ErrorAction SilentlyContinue)){throw ('Missing required command '+$bin)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $name=((& git branch --show-current)-join '').Trim()
  Check 'Cannot read local Git branch'
  if($name -cne $branch){throw ('Wrong branch '+$name)}
  $dirty=((& git status --porcelain)-join '').Trim()
  Check 'Cannot read Git status'
  if($dirty){throw 'Uncommitted work detected; stop'}
  Write-Host '1/4 Verify LSZH CRM tests and synthetic gateway script'
  & npm.cmd test --prefix '.\crm-v2'
  Check 'CRM regression suite failed'
  & node.exe --check '.\crm-v2\scripts\invoice-mail-make-synthetic-once.js'
  Check 'Synthetic test script syntax invalid'
  $marker='.\crm-v2\out\.TEST_ONLY_invoice_gateway_sent_or_pending.json'
  if(Test-Path -LiteralPath $marker){
    throw 'Previous test attempt recorded. Check Gmail Sent. Never silently retry.'
  }
  Write-Host '2/4 Verify existing LIVE and zero-traffic candidate unchanged'
  $svc=Service
  $active=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100 -or
     $active[0].revisionName -ne $live){
    throw 'Production CRM changed or traffic split. No test email.'
  }
  $qa=@($svc.status.traffic|Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq 'crm-invoice-mail-qa' -and [int]$_.percent -eq 0
  })
  if($qa.Count -ne 1){throw 'Expected zero-traffic invoice mail candidate not found'}
  $revision=Revision $live
  if((GetEnvEntry $revision 'CRM_RECORD_PREFIX').value -ne 'lszh_crm_v2_'){
    throw 'Unexpected production Firestore namespace'
  }
  $invoiceFlag=(GetEnvEntry $revision 'CRM_INVOICE_MAIL_ENABLED')
  if($invoiceFlag -and $invoiceFlag.value -eq 'true'){
    throw 'Invoice mail already enabled in production. Stop.'
  }
  $offerFlag=(GetEnvEntry $revision 'CRM_OFFER_MAIL_ENABLED')
  if(!$offerFlag -or $offerFlag.value -ne 'true'){throw 'Expected existing offer mail disabled or changed'}
  # The approved productive offer webhook is NOT plaintext in Cloud Run:
  # CRM_OFFER_MAIL_WEBHOOK_URL points to Secret Manager. Read only that exact
  # pre-existing reference locally; never show, log, rewrite, or commit its URL.
  $hookEntry=(GetEnvEntry $revision 'CRM_OFFER_MAIL_WEBHOOK_URL')
  $secretName='lszh-crm-v2-offer-make-hook'
  if(!$hookEntry -or $hookEntry.value -or
     !$hookEntry.valueFrom -or
     $hookEntry.valueFrom.secretKeyRef.name -cne $secretName){
    throw 'Unexpected offer webhook secret reference. No test email sent.'
  }
  $secretVersion=[string]$hookEntry.valueFrom.secretKeyRef.key
  if($secretVersion -cnotmatch '^(latest|[1-9][0-9]*)
  Write-Host '3/4 One-time synthetic test approval'
  Write-Host ('TEST ONLY recipient: '+$testTo)
  Write-Host 'Synthetic PDF: RE-9099999, public demo IBAN, CHF 79.90, NOT PAYABLE.'
  Write-Host 'No real CRM invoice, Firestore write, Cloud Run traffic change, or customer delivery.'
  Write-Host 'Once triggered, Gmail could send immediately; no automatic retry is permitted.'
  $consent=Read-Host 'Zur Freigabe exakt TEST MAIL SENDEN eingeben'
  if($consent -cne 'TEST MAIL SENDEN'){throw 'No explicit Gmail test approval. Nothing sent.'}
  Write-Host '4/4 Send exactly one TEST_ONLY Make/Gmail request to approved mailbox'
  try{
    $env:LSZH_TEST_MAKE_WEBHOOK=$hook
    $env:LSZH_TEST_MAIL_APPROVED=$consent
    & node.exe '.\crm-v2\scripts\invoice-mail-make-synthetic-once.js'
    Check 'Synthetic Make/Gmail test unconfirmed. Gmail Sent folder must be checked manually before any retry.'
  }finally{
    Remove-Item Env:\LSZH_TEST_MAKE_WEBHOOK -ErrorAction SilentlyContinue
    Remove-Item Env:\LSZH_TEST_MAIL_APPROVED -ErrorAction SilentlyContinue
    $hook=$null
  }
  $again=Service
  $positive=@($again.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($positive.Count -ne 1 -or [int]$positive[0].percent -ne 100 -or
     $positive[0].revisionName -ne $live){
    throw 'Live traffic drift after test. Inspect Cloud Run; no more sends.'
  }
  Write-Host 'CRM INVOICE MAIL GATEWAY TEST PASS (NO LIVE CRM CHANGES)'
}finally{Pop-Location}
){
    throw 'Unexpected offer webhook secret version. No test email sent.'
  }
  # Capture STDOUT silently; Secret Manager read never writes secret to console.
  # Use a complete --flag=value token for Windows PowerShell native argument passing.
  $secretOutput=@(& gcloud.cmd secrets versions access $secretVersion "--secret=$secretName" "--project=$project" 2>$null)
  Check 'Cannot securely read approved Make hook from Secret Manager. No test email sent.'
  $hook=($secretOutput -join '').Trim()
  $secretOutput=$null
  if($hook -cnotmatch '^https://hook[.]eu1[.]make[.]com/[A-Za-z0-9]+
  Write-Host '3/4 One-time synthetic test approval'
  Write-Host ('TEST ONLY recipient: '+$testTo)
  Write-Host 'Synthetic PDF: RE-9099999, public demo IBAN, CHF 79.90, NOT PAYABLE.'
  Write-Host 'No real CRM invoice, Firestore write, Cloud Run traffic change, or customer delivery.'
  Write-Host 'Once triggered, Gmail could send immediately; no automatic retry is permitted.'
  $consent=Read-Host 'Zur Freigabe exakt TEST MAIL SENDEN eingeben'
  if($consent -cne 'TEST MAIL SENDEN'){throw 'No explicit Gmail test approval. Nothing sent.'}
  Write-Host '4/4 Send exactly one TEST_ONLY Make/Gmail request to approved mailbox'
  try{
    $env:LSZH_TEST_MAKE_WEBHOOK=$hook
    $env:LSZH_TEST_MAIL_APPROVED=$consent
    & node.exe '.\crm-v2\scripts\invoice-mail-make-synthetic-once.js'
    Check 'Synthetic Make/Gmail test unconfirmed. Gmail Sent folder must be checked manually before any retry.'
  }finally{
    Remove-Item Env:\LSZH_TEST_MAKE_WEBHOOK -ErrorAction SilentlyContinue
    Remove-Item Env:\LSZH_TEST_MAIL_APPROVED -ErrorAction SilentlyContinue
    $hook=$null
  }
  $again=Service
  $positive=@($again.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($positive.Count -ne 1 -or [int]$positive[0].percent -ne 100 -or
     $positive[0].revisionName -ne $live){
    throw 'Live traffic drift after test. Inspect Cloud Run; no more sends.'
  }
  Write-Host 'CRM INVOICE MAIL GATEWAY TEST PASS (NO LIVE CRM CHANGES)'
}finally{Pop-Location}
){
    $hook=$null
    throw 'Approved Make webhook secret does not contain the expected eu1 URL. Nothing sent.'
  }
  Write-Host '3/4 One-time synthetic test approval'
  Write-Host ('TEST ONLY recipient: '+$testTo)
  Write-Host 'Synthetic PDF: RE-9099999, public demo IBAN, CHF 79.90, NOT PAYABLE.'
  Write-Host 'No real CRM invoice, Firestore write, Cloud Run traffic change, or customer delivery.'
  Write-Host 'Once triggered, Gmail could send immediately; no automatic retry is permitted.'
  $consent=Read-Host 'Zur Freigabe exakt TEST MAIL SENDEN eingeben'
  if($consent -cne 'TEST MAIL SENDEN'){throw 'No explicit Gmail test approval. Nothing sent.'}
  Write-Host '4/4 Send exactly one TEST_ONLY Make/Gmail request to approved mailbox'
  try{
    $env:LSZH_TEST_MAKE_WEBHOOK=$hook
    $env:LSZH_TEST_MAIL_APPROVED=$consent
    & node.exe '.\crm-v2\scripts\invoice-mail-make-synthetic-once.js'
    Check 'Synthetic Make/Gmail test unconfirmed. Gmail Sent folder must be checked manually before any retry.'
  }finally{
    Remove-Item Env:\LSZH_TEST_MAKE_WEBHOOK -ErrorAction SilentlyContinue
    Remove-Item Env:\LSZH_TEST_MAIL_APPROVED -ErrorAction SilentlyContinue
    $hook=$null
  }
  $again=Service
  $positive=@($again.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($positive.Count -ne 1 -or [int]$positive[0].percent -ne 100 -or
     $positive[0].revisionName -ne $live){
    throw 'Live traffic drift after test. Inspect Cloud Run; no more sends.'
  }
  Write-Host 'CRM INVOICE MAIL GATEWAY TEST PASS (NO LIVE CRM CHANGES)'
}finally{Pop-Location}
