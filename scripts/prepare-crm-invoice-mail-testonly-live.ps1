# LSZH CRM V2 - enable strictly internal TEST_ONLY invoice email in a ZERO-TRAFFIC candidate.
# No production cutover. No invoice/customer/Firestore mutation or outgoing email.
# Real customer invoice mail stays disabled until a separate operator-approved release.
param([switch]$DeployCandidate)
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='lszh-crm-v2-00046-faj'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$branch='feature/crm-v2-invoice-settlement-20261024'
$testTo='lars.schulthess@outlook.com'
$tag='crm-invoice-testonly-qa'
$root=Split-Path $PSScriptRoot -Parent
$four=@('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED',
  'CRM_INVOICE_MAIL_MODE','CRM_INVOICE_MAIL_TEST_TO')

function Check([string]$message) {
  if($LASTEXITCODE -ne 0) { throw "$message (exit $LASTEXITCODE)" }
}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cloud Run service cannot be read'
  return ($raw | ConvertFrom-Json)
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ("Cloud Run revision cannot be read: "+$name)
  return ($raw | ConvertFrom-Json)
}
function Live($svc) {
  $active=@($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) {
    throw 'Unexpected active CRM traffic split'
  }
  return [string]$active[0].revisionName
}
function Env($rev,[string]$name) {
  $v=@(@($rev.spec.containers)[0].env | Where-Object { $_.name -eq $name })
  if($v.Count -gt 1) { throw ('Duplicate configuration '+$name) }
  if($v.Count -eq 0) { return $null }
  return $v[0]
}
function MustEqual($rev,[string]$name,[string]$value) {
  $v=Env $rev $name
  if(!$v -or [string]$v.value -cne $value) { throw ('Unexpected configuration '+$name) }
}
function Signature($rev,[string[]]$omit) {
  $list=@(@($rev.spec.containers)[0].env | Where-Object { $_.name -notin $omit } |
    Sort-Object name | ForEach-Object {
      [pscustomobject]@{
        name=[string]$_.name
        value=[string]$_.value
        valueFrom=($_.valueFrom | ConvertTo-Json -Depth 12 -Compress)
      }
    })
  return (ConvertTo-Json -InputObject $list -Depth 16 -Compress)
}
function Http([string]$url) {
  try {
    return Invoke-WebRequest -Uri $url -TimeoutSec 35 -UseBasicParsing -ErrorAction Stop
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [pscustomobject]@{StatusCode=[int]$_.Exception.Response.StatusCode;Content=''}
    }
    throw
  }
}
foreach($cmd in @('git','npm.cmd','gcloud.cmd')) {
  if(!(Get-Command $cmd -ErrorAction SilentlyContinue)) { throw ('Missing '+$cmd) }
}
Push-Location $root
try {
  $current=((& git branch --show-current)-join '').Trim(); Check 'Cannot read local branch'
  if($current -cne $branch) { throw ('Incorrect branch: '+$current) }
  $dirty=((& git status --porcelain)-join '').Trim(); Check 'Cannot read local Git state'
  if($dirty) { throw 'Uncommitted local files. No deployment.' }
  $head=((& git rev-parse HEAD)-join '').Trim(); Check 'Cannot read local commit'
  $remote=((& git rev-parse "origin/$branch")-join '').Trim(); Check 'Cannot read fetched origin branch'
  if($head -cne $remote) { throw 'Local source differs from fetched origin; git fetch/pull first' }

  Write-Host '1/4: Run invoice mail and payment regression checks'
  & npm.cmd ci '--prefix' '.\crm-v2' '--ignore-scripts' '--no-audit' '--no-fund'
  Check 'CRM npm clean install failed'
  & npm.cmd test '--prefix' '.\crm-v2'
  Check 'CRM tests failed'
  $dirtyAgain=((& git status --porcelain)-join '').Trim(); Check 'Cannot recheck Git state'
  if($dirtyAgain) { throw 'Tests changed repository files; deployment blocked' }

  Write-Host '2/4: Check the current live revision and protected Gmail/lead/QR gates'
  $before=Service
  if((Live $before) -cne $expectedLive) { throw 'Live CRM revision changed; STOP' }
  $old=Revision $expectedLive
  if([string]$old.spec.serviceAccountName -cne $serviceAccount) { throw 'Service identity changed' }
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM','2026-10-23T16:15:28Z'),
    @('CRM_INVOICE_QR_ENABLED','true'),
    @('CRM_INVOICE_PRODUCTION_APPROVED','true')
  )) { MustEqual $old ([string]$pair[0]) ([string]$pair[1]) }
  if(Env $old 'CRM_OFFER_MAIL_TEST_TO') { throw 'Production offer test override not expected' }
  foreach($key in $four) {
    $e=Env $old $key
    if($e -and [string]$e.value -ceq 'true') { throw ('Invoice send already approved: '+$key) }
  }
  $hook=Env $old 'CRM_OFFER_MAIL_WEBHOOK_URL'
  if(!$hook -or $hook.value -or
    [string]$hook.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-offer-make-hook') {
    throw 'Existing Make webhook must remain protected by approved Secret Manager binding'
  }
  $invoiceHook=Env $old 'CRM_INVOICE_MAIL_WEBHOOK_URL'
  if($invoiceHook -and ($invoiceHook.value -or
     [string]$invoiceHook.valueFrom.secretKeyRef.name -cne [string]$hook.valueFrom.secretKeyRef.name -or
     [string]$invoiceHook.valueFrom.secretKeyRef.key -cne [string]$hook.valueFrom.secretKeyRef.key)) {
    throw 'Invoice gateway differs from approved offer webhook'
  }
  $iban=Env $old 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
    [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
    [string]$iban.valueFrom.secretKeyRef.key -cne '1') {
    throw 'Pinned bank IBAN Secret Manager v1 not found'
  }
  Write-Host ('PRE-FLIGHT PASS: Live '+$expectedLive+' (100 percent)')
  Write-Host 'Only CRM invoice email TEST_ONLY can be enabled in a separate candidate'
  if(!$DeployCandidate) {
    Write-Host 'READ-ONLY PASS. No candidate created and no Live settings changed.'
    Write-Host 'Use -DeployCandidate after this preflight to create the 0% test revision.'
    return
  }

  Write-Host '3/4: Build a TEST_ONLY candidate at zero traffic'
  # --update-env-vars preserves existing non-invoice variables and ALL Secret Manager refs.
  # No production customer invoice send can pass server-side TEST_ONLY allowlist.
  $changes='CRM_INVOICE_MAIL_ENABLED=true,'+
    'CRM_INVOICE_MAIL_PRODUCTION_APPROVED=true,'+
    'CRM_INVOICE_MAIL_MODE=test_only,'+
    'CRM_INVOICE_MAIL_TEST_TO='+$testTo
  & gcloud.cmd run deploy $service '--source' '.\crm-v2' "--project=$project" "--region=$region" '--no-traffic' "--tag=$tag" "--update-env-vars=$changes" '--quiet'
  Check 'Cloud Run TEST_ONLY candidate deployment failed'
  $after=Service
  if((Live $after) -cne $expectedLive) { throw 'CRITICAL: Live traffic changed' }
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -ceq $expectedLive) { throw 'No separate candidate revision created' }
  $new=Revision $candidate
  if([string]$new.spec.serviceAccountName -cne $serviceAccount) {
    throw 'Candidate service identity drift'
  }
  if((Signature $new $four) -cne (Signature $old $four)) {
    throw 'Candidate changed existing CRM/Gmail/lead/QR secrets or settings'
  }
  MustEqual $new 'CRM_INVOICE_MAIL_ENABLED' 'true'
  MustEqual $new 'CRM_INVOICE_MAIL_PRODUCTION_APPROVED' 'true'
  MustEqual $new 'CRM_INVOICE_MAIL_MODE' 'test_only'
  MustEqual $new 'CRM_INVOICE_MAIL_TEST_TO' $testTo
  $qa=@($after.status.traffic | Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($qa.Count -ne 1) { throw 'Candidate is not uniquely tagged at 0% traffic' }

  Write-Host '4/4: Anonymous config must hide the private test address; auth required'
  $url=[string]$qa[0].url
  if(!$url -or !$url.StartsWith('https://')) { throw 'Candidate URL missing' }
  $config=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 35
  if($config.invoiceMailEnabled -ne $true -or $config.invoiceMailMode -cne 'test_only' -or
    $config.invoiceMailTestTo -or $config.offerMailEnabled -ne $true -or
    $config.offerMailMode -cne 'production' -or $config.offerMailTestTo) {
    throw 'TEST_ONLY or existing offer gateway HTTP configuration mismatch'
  }
  $homeResponse=Http ($url.TrimEnd('/')+'/')
  if([int]$homeResponse.StatusCode -ne 200 -or
    [string]$homeResponse.Content -notmatch 'id="invoiceSend"' -or
    [string]$homeResponse.Content -notmatch 'id="invoicePaymentsPanel"') {
    throw 'Candidate CRM invoice frontend unavailable'
  }
  if([int](Http ($url.TrimEnd('/')+'/api/records/rechnungen')).StatusCode -ne 401) {
    throw 'Unauthenticated invoice API exposed'
  }
  if([int](Http ($url.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NO_RECORD/send')).StatusCode -ne 401) {
    throw 'Unauthenticated invoice send API exposed'
  }
  if((Live (Service)) -cne $expectedLive) { throw 'Production traffic moved during QA' }

  Write-Host 'CRM INVOICE MAIL TEST_ONLY ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE REVISION: '+$candidate)
  Write-Host ('CANDIDATE URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$expectedLive+' (100 percent)')
  Write-Host 'TEST_ONLY recipient is allowlisted server-side and hidden from anonymous config.'
  Write-Host 'NO EMAIL, PAYMENT, BANK ACTION, CUSTOMER DATA OR MAKE CHANGE.'
  Write-Host 'STOP: separate verification/approval required before Live cutover.'
}finally{Pop-Location}
