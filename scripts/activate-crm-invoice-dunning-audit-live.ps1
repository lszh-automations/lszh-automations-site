# LSZH CRM V2 detailed manual dunning audit trail UI release.
# Operator-approved traffic-only cutover of exact verified 0%-traffic candidate.
# No outgoing mail, reminder record, payment, Firestore test data or bank action.
# Roll back to 00055-ved if any post-cutover check fails.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='lszh-crm-v2-00055-ved'
$candidate=''
$tag='crm-invoice-audit-qa'
$identity='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$crmUrl='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$expectedCutoff='2026-10-23T16:15:28Z'
$jobName='lszh-crm-v2-mail-tick'
$schedulerSA='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$branch='feature/crm-v2-invoice-settlement-20261024'
$switched=$false
$verified=$false

function Check([string]$message) {
  if($LASTEXITCODE -ne 0) { throw "$message (exit $LASTEXITCODE)" }
}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cloud Run service inaccessible'
  return ($raw | ConvertFrom-Json)
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ("Cloud Run revision inaccessible: " + $name)
  return ($raw | ConvertFrom-Json)
}
function Live($svc) {
  $active=@($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) { throw 'Unexpected traffic split' }
  return [string]$active[0].revisionName
}
function Env($rev,[string]$key) {
  $matches=@(@($rev.spec.containers)[0].env | Where-Object { $_.name -eq $key })
  if($matches.Count -gt 1) { throw "Duplicate env var: $key" }
  if($matches.Count -eq 0) { return $null }
  return $matches[0]
}
function RequireEnv($rev,[string]$name,[string]$expected) {
  $item=Env $rev $name
  if(!$item -or [string]$item.value -cne $expected) { throw "Unexpected env: $name" }
}
function EnvSignature($rev) {
  $envs=@(@($rev.spec.containers)[0].env | Sort-Object name | ForEach-Object {
    [pscustomobject]@{
      name=[string]$_.name
      value=[string]$_.value
      valueFrom=($_.valueFrom | ConvertTo-Json -Depth 12 -Compress)
    }
  })
  return (ConvertTo-Json -InputObject $envs -Depth 15 -Compress)
}
function CheckScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe $jobName "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  Check 'Mail Scheduler not readable'
  $job=$raw | ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
     $job.httpTarget.uri -cne ($crmUrl+'/api/internal/mail/tick') -or
     $job.httpTarget.httpMethod -ne 'POST' -or
     $job.httpTarget.oidcToken.serviceAccountEmail -cne $schedulerSA -or
     $job.httpTarget.oidcToken.audience -cne $crmUrl) {
    throw 'Existing lead mail scheduler contract drifted.'
  }
}
function Http([string]$url) {
  try {
    return Invoke-WebRequest -Uri $url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
  } catch {
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [pscustomobject]@{StatusCode=[int]$_.Exception.Response.StatusCode;Content=''}
    }
    throw
  }
}
function CheckFrontend([string]$base,[bool]$expectUnlocked) {
  $homepageResponse=Http ($base.TrimEnd('/')+'/')
  if([int]$homepageResponse.StatusCode -ne 200 -or [string]$homepageResponse.Content -notmatch 'id="invoicePaymentsPanel"' -or
    [string]$homepageResponse.Content -notmatch 'id="invoiceReminderPanel"' -or
    [string]$homepageResponse.Content -notmatch 'id="invoicePdf"') {
    throw ('Invoice payment/reminder/PDF frontend not available at '+$base)
  }
  $auditDetail=([string]$homepageResponse.Content -match 'invoice-reminder-record' -and
    [string]$homepageResponse.Content -match 'Protokoll-ID:' -and
    [string]$homepageResponse.Content -match 'Bestätigt von:')
  if($expectUnlocked -and !$auditDetail) {
    throw ('Detailed manual dunning audit UI missing at '+$base)
  }
  if(!$expectUnlocked -and $auditDetail) {
    throw ('Old live revision unexpectedly already has new audit rows at '+$base)
  }
  if([string]$homepageResponse.Content -notmatch 'Dies protokolliert nur den bereits erfolgten Versand' -or
    [string]$homepageResponse.Content -notmatch 'RECHNUNG WIRKLICH SENDEN') {
    throw ('Manual reminder/invoice operator confirmation missing at '+$base)
  }
  if([string]$homepageResponse.Content -notmatch "state.invoiceMailMode==='test_only'&&!allowedTest") {
    throw ('TEST_ONLY allowlist guard missing in invoice UI at '+$base)
  }
  $config=Invoke-RestMethod -Uri ($base.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($config.offerMailEnabled -ne $true -or $config.offerMailMode -cne 'production' -or
     $config.offerMailTestTo -or $config.invoiceMailEnabled -ne $true -or
     $config.invoiceMailMode -cne 'production' -or $config.invoiceMailTestTo) {
    throw ('Unexpected customer offer/invoice mail config at '+$base)
  }
  if([int](Http ($base.TrimEnd('/')+'/api/records/rechnungen')).StatusCode -ne 401) {
    throw ('Unauthenticated invoice collection accessible at '+$base)
  }
  if([int](Http ($base.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NOT_REAL/payments')).StatusCode -ne 401) {
    throw ('Unauthenticated payment endpoint not protected at '+$base)
  }
  if([int](Http ($base.TrimEnd('/')+'/api/pdf/rechnung/TEST_ONLY_NOT_REAL')).StatusCode -ne 401) {
    throw ('Unauthenticated QR PDF endpoint not protected at '+$base)
  }
}
function Rollback {
  Write-Warning ('ROLLBACK: restore '+$expectedLive+' (100%)')
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$expectedLive+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'CRITICAL: automatic rollback command failed; inspect live traffic immediately!'
  if((Live (Service)) -cne $expectedLive) {
    throw 'CRITICAL: rollback could not be verified; inspect Cloud Run immediately!'
  }
  Write-Host ('ROLLBACK PASS: '+$expectedLive+' (100 percent)')
}

if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)) { throw 'gcloud.cmd required' }
if(!(Get-Command git -ErrorAction SilentlyContinue)) { throw 'git required' }
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $actual=(( & git branch --show-current) -join '').Trim(); Check 'Git branch not readable'
  if($actual -cne $branch) { throw ('Unexpected release branch: '+$actual) }
  $dirty=(( & git status --porcelain) -join '').Trim(); Check 'Git status not readable'
  if($dirty) { throw 'Local tracked/untracked changes detected; release blocked' }
  $head=(( & git rev-parse HEAD) -join '').Trim(); Check 'Git HEAD missing'
  $remote=(( & git rev-parse "origin/$branch") -join '').Trim(); Check 'Remote branch not fetched'
  if($head -cne $remote) { throw 'Branch is not current with fetched origin; release blocked' }
} finally { Pop-Location }

Write-Host '1/4: Validate production release baseline and candidate settings'
$svc=Service
if((Live $svc) -cne $expectedLive) { throw 'Expected live CRM revision has changed; no cutover' }
$old=Revision $expectedLive
$routes=@($svc.status.traffic | Where-Object {
  $_.tag -eq $tag -and [int]$_.percent -eq 0
})
if($routes.Count -ne 1) { throw 'Expected exactly one 0%-traffic dunning-audit candidate' }
$candidate=[string]$routes[0].revisionName
if(!$candidate -or $candidate -ceq $expectedLive -or
   [string]$svc.status.latestReadyRevisionName -cne $candidate) {
  throw 'Candidate must be the latest ready 0%-traffic revision'
}
$new=Revision $candidate
if([string]$old.spec.serviceAccountName -cne $identity -or
   [string]$new.spec.serviceAccountName -cne $identity) {
  throw 'Production/candidate service account changed'
}
if((EnvSignature $old) -cne (EnvSignature $new)) {
  throw 'Candidate does not exactly preserve live environment and secrets.'
}
foreach($rev in @($old,$new)) {
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM',$expectedCutoff),
    @('CRM_INVOICE_QR_ENABLED','true'),
    @('CRM_INVOICE_PRODUCTION_APPROVED','true')
  )) { RequireEnv $rev ([string]$pair[0]) ([string]$pair[1]) }
  foreach($pair in @(
    @('CRM_INVOICE_MAIL_ENABLED','true'),
    @('CRM_INVOICE_MAIL_PRODUCTION_APPROVED','true'),
    @('CRM_INVOICE_MAIL_MODE','production')
  )) { RequireEnv $rev ([string]$pair[0]) ([string]$pair[1]) }
  if(Env $rev 'CRM_INVOICE_MAIL_TEST_TO') { throw 'Production sender must not have TEST_ONLY mailbox override' }
  $iban=Env $rev 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
     [string]$iban.valueFrom.secretKeyRef.key -cne '1') {
    throw 'Invoice IBAN must reference pinned Secret Manager v1.'
  }
}
CheckScheduler

Write-Host '2/4: Verify live baseline and detailed reminder audit candidate'
$candidateUrl=[string]$routes[0].url
if(!$candidateUrl -or !$candidateUrl.StartsWith('https://')) { throw 'Candidate URL invalid' }
CheckFrontend $crmUrl $false
CheckFrontend $candidateUrl $true
Write-Host ('CANDIDATE QA PASS: '+$candidate+' (0 percent)')
Write-Host ('CURRENT LIVE: '+$expectedLive+' (100 percent)')
Write-Host 'Reminder audit rows are in candidate only; invoice, payment and mail rules unchanged.'
Write-Host 'UI-only change: every actual booking still requires a verified payment and operator confirmation.'
$approval=Read-Host 'Zur Freigabe der erweiterten Mahndokumentation exakt LIVE MAHNPROTOKOLL eingeben'
if($approval -cne 'LIVE MAHNPROTOKOLL') { throw 'Cutover not authorised; no traffic changed.' }

try {
  Write-Host '3/4: Activate verified manual reminder audit view'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$candidate+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'Cloud Run traffic cutover failed'
  if((Live (Service)) -cne $candidate) { throw 'Candidate does not receive exactly 100% traffic' }
  Write-Host '4/4: Re-run HTTP auth, invoice UI, mail scheduler and traffic checks'
  CheckFrontend $crmUrl $true
  CheckScheduler
  if((Live (Service)) -cne $candidate) { throw 'Unexpected production traffic drift after cutover' }
  $verified=$true
  Write-Host 'CRM INVOICE DUNNING AUDIT LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$expectedCutoff)
  Write-Host ('CRM URL: '+$crmUrl)
  Write-Host 'No invoice mail, reminder, payment, Firestore seed or bank action executed by release.'
  Write-Host 'No automatic reminder. Manual reminder, invoice mail and payment safeguards unchanged.'
} finally {
  if($switched -and !$verified) { Rollback }
}
