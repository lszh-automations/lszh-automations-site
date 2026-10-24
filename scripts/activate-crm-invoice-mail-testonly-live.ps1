# LSZH CRM V2 - Live cutover to strictly allowlisted invoice TEST_ONLY sender.
# The script sends NO messages and writes NO invoice/customer/Firestore data.
# Production customer invoice mail is NEVER enabled by this release.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='lszh-crm-v2-00046-faj'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$branch='feature/crm-v2-invoice-settlement-20261024'
$tag='crm-invoice-testonly-qa'
$testTo='lars.schulthess@outlook.com'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailJob='lszh-crm-v2-mail-tick'
$schedulerSA='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$mailCutoff='2026-10-23T16:15:28Z'
$exceptions=@('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED',
  'CRM_INVOICE_MAIL_MODE','CRM_INVOICE_MAIL_TEST_TO')
$switched=$false
$verified=$false

function Check([string]$reason) {
  if($LASTEXITCODE -ne 0) { throw "$reason (exit $LASTEXITCODE)" }
}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cloud Run service unavailable'
  return ($raw | ConvertFrom-Json)
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ('Cloud Run revision unavailable: '+$name)
  return ($raw | ConvertFrom-Json)
}
function Live($svc) {
  $active=@($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) {
    throw 'Unexpected traffic split'
  }
  return [string]$active[0].revisionName
}
function Env($rev,[string]$name) {
  $entries=@(@($rev.spec.containers)[0].env | Where-Object { $_.name -eq $name })
  if($entries.Count -gt 1) { throw ('Duplicate variable '+$name) }
  if($entries.Count -eq 0) { return $null }
  return $entries[0]
}
function RequireEnv($rev,[string]$key,[string]$value) {
  $entry=Env $rev $key
  if(!$entry -or [string]$entry.value -cne $value) {
    throw ('Unexpected protected setting '+$key)
  }
}
function Signature($rev,[string[]]$omit) {
  $items=@(@($rev.spec.containers)[0].env |
    Where-Object { $_.name -notin $omit } |
    Sort-Object name |
    ForEach-Object {
      [pscustomobject]@{name=$_.name;value=$_.value;
        valueFrom=($_.valueFrom | ConvertTo-Json -Depth 12 -Compress)}
    })
  return (ConvertTo-Json -InputObject $items -Depth 16 -Compress)
}
function CheckScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe $mailJob "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  Check 'Existing mail Scheduler job not readable'
  $job=$raw | ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
    $job.httpTarget.uri -cne ($base+'/api/internal/mail/tick') -or
    $job.httpTarget.httpMethod -ne 'POST' -or
    $job.httpTarget.oidcToken.serviceAccountEmail -cne $schedulerSA -or
    $job.httpTarget.oidcToken.audience -cne $base) {
    throw 'Existing lead mail scheduler changed'
  }
}
function Http([string]$url) {
  try{
    return Invoke-WebRequest -Uri $url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [pscustomobject]@{StatusCode=[int]$_.Exception.Response.StatusCode;Content=''}
    }
    throw
  }
}
function CheckWeb([string]$url,[bool]$isTestOnly) {
  $pageResponse=Http ($url.TrimEnd('/')+'/')
  if([int]$pageResponse.StatusCode -ne 200 -or
    [string]$pageResponse.Content -notmatch 'id="invoiceSend"' -or
    [string]$pageResponse.Content -notmatch 'id="invoicePaymentsPanel"') {
    throw ('CRM invoice UI missing at '+$url)
  }
  $config=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($config.offerMailEnabled -ne $true -or $config.offerMailMode -cne 'production' -or
    $config.offerMailTestTo) { throw 'Existing offer mail settings changed' }
  if($isTestOnly) {
    if($config.invoiceMailEnabled -ne $true -or
      $config.invoiceMailMode -cne 'test_only' -or $config.invoiceMailTestTo) {
      throw 'TEST_ONLY config mismatch or public private mailbox leak'
    }
  }else{
    if($config.invoiceMailEnabled -ne $false -or $config.invoiceMailTestTo) {
      throw 'Existing LIVE invoice mail unexpectedly enabled'
    }
  }
  if([int](Http ($url.TrimEnd('/')+'/api/records/rechnungen')).StatusCode -ne 401) {
    throw 'Unauthenticated invoice data access'
  }
  if([int](Http ($url.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NOT_REAL/send')).StatusCode -ne 401) {
    throw 'Unauthenticated invoice send access'
  }
}
function Rollback {
  Write-Warning ('ROLLBACK to '+$expectedLive+' (100 percent)')
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$expectedLive+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'CRITICAL: traffic rollback command failed!'
  if((Live (Service)) -cne $expectedLive) {
    throw 'CRITICAL: rollback to old revision could not be confirmed!'
  }
  Write-Host ('ROLLBACK PASS: '+$expectedLive+' (100 percent)')
}
foreach($name in @('git','gcloud.cmd')) {
  if(!(Get-Command $name -ErrorAction SilentlyContinue)) { throw ('Missing '+$name) }
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $here=((& git branch --show-current)-join '').Trim(); Check 'Cannot read branch'
  if($here -cne $branch) { throw ('Wrong release branch: '+$here) }
  $dirty=((& git status --porcelain)-join '').Trim(); Check 'Cannot read local Git state'
  if($dirty) { throw 'Uncommitted local changes; no release' }
  $head=((& git rev-parse HEAD)-join '').Trim(); Check 'Cannot read HEAD'
  $remote=((& git rev-parse "origin/$branch")-join '').Trim(); Check 'Remote branch not fetched'
  if($head -cne $remote) { throw 'Git checkout differs from fetched origin' }
}finally{Pop-Location}

Write-Host '1/4: Validate LIVE revision, candidate, settings and Scheduler'
$before=Service
if((Live $before) -cne $expectedLive) { throw 'Live revision drift, no release' }
$old=Revision $expectedLive
if([string]$old.spec.serviceAccountName -cne $serviceAccount) {
  throw 'Live CRM service identity drift'
}
foreach($gate in @('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED')) {
  $entry=Env $old $gate
  if($entry -and [string]$entry.value -ceq 'true') {
    throw 'Live CRM invoice mail was already enabled, no TEST_ONLY cutover'
  }
}
$qa=@($before.status.traffic | Where-Object {
  $_.tag -eq $tag -and [int]$_.percent -eq 0
})
if($qa.Count -ne 1) { throw 'Expected unique TEST_ONLY 0%-candidate not found' }
$candidate=[string]$qa[0].revisionName
if(!$candidate -or $candidate -ceq $expectedLive -or
  [string]$before.status.latestReadyRevisionName -cne $candidate) {
  throw 'Tagged candidate is not the latest ready revision'
}
$new=Revision $candidate
if([string]$new.spec.serviceAccountName -cne $serviceAccount -or
  (Signature $old $exceptions) -cne (Signature $new $exceptions)) {
  throw 'TEST_ONLY candidate changed service identity, existing secrets, leads or offer mail'
}
foreach($pair in @(
  @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
  @('CRM_WEBSITE_INTAKE_ENABLED','true'),
  @('CRM_MAIL_ENABLED','true'),
  @('CRM_OFFER_MAIL_ENABLED','true'),
  @('CRM_OFFER_MAIL_MODE','production'),
  @('CRM_MAIL_ACTIVE_FROM',$mailCutoff),
  @('CRM_INVOICE_QR_ENABLED','true'),
  @('CRM_INVOICE_PRODUCTION_APPROVED','true')
)){
  RequireEnv $old ([string]$pair[0]) ([string]$pair[1])
  RequireEnv $new ([string]$pair[0]) ([string]$pair[1])
}
RequireEnv $new 'CRM_INVOICE_MAIL_ENABLED' 'true'
RequireEnv $new 'CRM_INVOICE_MAIL_PRODUCTION_APPROVED' 'true'
RequireEnv $new 'CRM_INVOICE_MAIL_MODE' 'test_only'
RequireEnv $new 'CRM_INVOICE_MAIL_TEST_TO' $testTo
foreach($rev in @($old,$new)) {
  $iban=Env $rev 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
    [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
    [string]$iban.valueFrom.secretKeyRef.key -cne '1') {
    throw 'CRM IBAN Secret Manager pin must remain v1'
  }
}
CheckScheduler
Write-Host '2/4: Anonymous web/config/API smoke of old Live and candidate'
CheckWeb $base $false
$candidateUrl=[string]$qa[0].url
if(!$candidateUrl -or !$candidateUrl.StartsWith('https://')) {
  throw 'TEST_ONLY candidate URL not available'
}
CheckWeb $candidateUrl $true
Write-Host ('CURRENT LIVE: '+$expectedLive+' (100 percent)')
Write-Host ('TEST_ONLY CANDIDATE: '+$candidate+' (0 percent)')
Write-Host 'This releases ONLY CRM manual sending to the allowlisted internal test mailbox.'
Write-Host 'Real customer invoice delivery remains blocked server-side. NO SEND performed.'
$approval=Read-Host 'Nur internen TEST_ONLY-Rechnungsversand aktivieren? Exakt LIVE TEST_ONLY RECHNUNG eingeben'
if($approval -cne 'LIVE TEST_ONLY RECHNUNG') {
  throw 'No explicit operator cutover approval. Traffic unchanged.'
}
try{
  Write-Host '3/4: Route existing CRM URL to TEST_ONLY candidate (100 percent)'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$candidate+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'TEST_ONLY CRM cutover failed'
  if((Live (Service)) -cne $candidate) { throw 'Candidate not receiving exactly 100% traffic' }
  Write-Host '4/4: Post-switch check website, auth, mode, unchanged mail Scheduler'
  CheckWeb $base $true
  CheckScheduler
  if((Live (Service)) -cne $candidate) { throw 'CRM traffic drifted during verification' }
  $verified=$true
  Write-Host 'CRM INVOICE MAIL TEST_ONLY LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$mailCutoff)
  Write-Host ('LOGIN: '+$base)
  Write-Host 'NO MESSAGE SENT. Real customer invoicing still DISABLED. Manual TEST_ONLY CRM click only.'
}finally{
  if($switched -and !$verified) { Rollback }
}
