# LSZH CRM V2 – Live cutover of the already verified global search release.
# This script changes Cloud Run traffic ONLY. No build, email, CRM writes or payments.
# If post-cutover verification fails, restore exact former 100%-traffic revision.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-server-search-20261024'
$oldLive='lszh-crm-v2-00061-tol'
$candidate='lszh-crm-v2-00063-baz'
$tag='crm-search-qa'
$identity='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailCutoff='2026-10-23T16:15:28Z'
$switched=$false
$verified=$false

function Check([string]$reason) {
  if($LASTEXITCODE -ne 0) { throw "$reason (exit $LASTEXITCODE)" }
}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cloud Run service cannot be read'
  return $raw|ConvertFrom-Json
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ('Cloud Run revision cannot be read: '+$name)
  return $raw|ConvertFrom-Json
}
function Live($svc) {
  $routes=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($routes.Count -ne 1 -or [int]$routes[0].percent -ne 100) {
    throw 'Unexpected live traffic split; no cutover allowed'
  }
  return [string]$routes[0].revisionName
}
function Env($rev,[string]$name) {
  $values=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $name})
  if($values.Count -gt 1) { throw ('Duplicate env '+$name) }
  if($values.Count -eq 0) { return $null }
  return $values[0]
}
function RequireEnv($rev,[string]$name,[string]$expected) {
  $x=Env $rev $name
  if(!$x -or [string]$x.value -cne $expected) { throw ('Unexpected env '+$name) }
}
function Signature($rev) {
  $envs=@(@($rev.spec.containers)[0].env|Sort-Object name|ForEach-Object {
    [pscustomobject]@{
      name=[string]$_.name
      value=[string]$_.value
      valueFrom=($_.valueFrom|ConvertTo-Json -Depth 12 -Compress)
    }
  })
  return ConvertTo-Json -InputObject $envs -Depth 16 -Compress
}
function Status([string]$url) {
  try { return [int](Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop).StatusCode }
  catch {
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}
function CheckScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe 'lszh-crm-v2-mail-tick' "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cloud Scheduler job cannot be read'
  $job=$raw|ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or
     $job.schedule -ne '* * * * *' -or
     $job.httpTarget.uri -cne ($base+'/api/internal/mail/tick') -or
     $job.httpTarget.httpMethod -ne 'POST' -or
     $job.httpTarget.oidcToken.serviceAccountEmail -cne 'lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com' -or
     $job.httpTarget.oidcToken.audience -cne $base) {
    throw 'Lead email scheduler settings drifted'
  }
}
function CheckWeb([string]$url,[bool]$hasSearch) {
  $url=$url.TrimEnd('/')
  $page=Invoke-WebRequest -Uri ($url+'/') -UseBasicParsing -TimeoutSec 30
  if([int]$page.StatusCode -ne 200) { throw 'CRM UI is unavailable' }
  $html=[string]$page.Content
  if($html -notmatch 'function renderPageMore\(' -or
     $html -notmatch 'pageSize=50' -or
     $html -notmatch 'id="invoiceSend"' -or
     $html -notmatch 'id="invoicePaymentsPanel"' -or
     $html -notmatch 'id="invoiceReminderPanel"') {
    throw 'Existing pagination, invoices, payments or reminders UI missing'
  }
  $search=($html -match 'id="statusFilter"' -and
    $html -match 'function filteredSearchUrl\(' -and
    $html -match 'function loadFilteredRows\(')
  if($search -ne $hasSearch) { throw 'CRM search UI differs from expected revision' }
  if($html -notmatch 'Rechnung wirklich senden|RECHNUNG WIRKLICH SENDEN' -or
     $html -notmatch 'Dies protokolliert nur den bereits erfolgten Versand') {
    throw 'Manual invoice and reminder confirmation UI changed'
  }
  foreach($path in @('/api/records/kunden?q=TEST_ONLY',
     '/api/records/rechnungen', '/api/cockpit/summary',
     '/api/records/rechnungen/TEST_ONLY_NOT_REAL/payments',
     '/api/records/rechnungen/TEST_ONLY_NOT_REAL/send')) {
    if((Status ($url+$path)) -ne 401) { throw ('Unauthenticated CRM route exposed: '+$path) }
  }
  $config=Invoke-RestMethod -Uri ($url+'/api/config') -Method GET -TimeoutSec 30
  if($config.offerMailEnabled -ne $true -or $config.offerMailMode -cne 'production' -or
     $config.offerMailTestTo -or
     $config.invoiceMailEnabled -ne $true -or $config.invoiceMailMode -cne 'production' -or
     $config.invoiceMailTestTo) {
    throw 'Existing offer or invoice mail configuration changed'
  }
}
function Rollback {
  Write-Warning ('Rolling back to '+$oldLive+' at 100 percent')
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$oldLive+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'CRITICAL: rollback failed; inspect Cloud Run traffic NOW'
  if((Live (Service)) -cne $oldLive) { throw 'CRITICAL: cannot verify rollback; inspect Cloud Run NOW' }
  Write-Host ('CRM SEARCH ROLLBACK PASS: '+$oldLive+' (100 percent)')
}

foreach($tool in @('git','gcloud.cmd')) {
  if(!(Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw ('Missing required tool: '+$tool)
  }
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $actual=((& git branch --show-current)-join '').Trim();Check 'Cannot read Git branch'
  if($actual -cne $branch){throw 'Wrong checkout branch'}
  $dirty=((& git status --porcelain)-join '').Trim();Check 'Cannot read Git status'
  if($dirty){throw 'Uncommitted files present; release blocked'}
  $head=((& git rev-parse HEAD)-join '').Trim();Check 'Cannot read Git HEAD'
  $origin=((& git rev-parse "origin/$branch")-join '').Trim();Check 'Cannot read origin branch'
  if($head -cne $origin){throw 'Local checkout is not in sync with origin; git pull --ff-only first'}
} finally { Pop-Location }

Write-Host '1/4: Verify existing 100% live revision and 0% release candidate'
$svc=Service
if((Live $svc) -cne $oldLive){throw 'Live revision differs from release baseline; do not switch'}
$routes=@($svc.status.traffic|Where-Object {
  $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
})
if($routes.Count -ne 1){throw 'Expected tagged zero-traffic candidate is missing'}
$candidateUrl=[string]$routes[0].url
if(!$candidateUrl -or !$candidateUrl.StartsWith('https://')){throw 'Candidate URL missing'}

$old=Revision $oldLive
$new=Revision $candidate
if([string]$old.spec.serviceAccountName -cne $identity -or
   [string]$new.spec.serviceAccountName -cne $identity) {
  throw 'CRM identity changed'
}
if((Signature $old) -cne (Signature $new)) {
  throw 'Candidate differs from production environment or secret bindings'
}
foreach($rev in @($old,$new)) {
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM',$mailCutoff),
    @('CRM_INVOICE_QR_ENABLED','true'),
    @('CRM_INVOICE_PRODUCTION_APPROVED','true'),
    @('CRM_INVOICE_MAIL_ENABLED','true'),
    @('CRM_INVOICE_MAIL_PRODUCTION_APPROVED','true'),
    @('CRM_INVOICE_MAIL_MODE','production')
  )) { RequireEnv $rev ([string]$pair[0]) ([string]$pair[1]) }
  if(Env $rev 'CRM_INVOICE_MAIL_TEST_TO') { throw 'Unexpected TEST_ONLY invoice recipient' }
  $iban=Env $rev 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
     [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
     [string]$iban.valueFrom.secretKeyRef.key -cne '1') {throw 'IBAN secret binding changed'}
  $hook=Env $rev 'CRM_OFFER_MAIL_WEBHOOK_URL'
  if(!$hook -or $hook.value -or
     [string]$hook.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-offer-make-hook') {
    throw 'Make/Gmail gateway secret binding changed'
  }
}
CheckScheduler

Write-Host '2/4: Verify candidate search, OAuth denial and manual mail safeguards'
CheckWeb $candidateUrl $true
CheckWeb $base $false
Write-Host ('CANDIDATE PASS: '+$candidate+' (0 percent)')
Write-Host ('LIVE BASELINE PASS: '+$oldLive+' (100 percent)')

try {
  Write-Host '3/4: Route live CRM traffic to already tested candidate'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$candidate+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'Production traffic update failed'
  if((Live (Service)) -cne $candidate) {throw 'Candidate is not receiving 100% traffic'}
  Write-Host '4/4: Recheck live CRM, search, auth, mail safeguards and scheduler'
  CheckWeb $base $true
  CheckScheduler
  if((Live (Service)) -cne $candidate){throw 'Post-release traffic drift'}
  $verified=$true
  Write-Host 'CRM SEARCH LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$oldLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$mailCutoff)
  Write-Host ('CRM URL: '+$base)
  Write-Host 'Release switched traffic only; no invoice, reminder, payment or Firestore write executed by script.'
} finally {
  if($switched -and !$verified){Rollback}
}
