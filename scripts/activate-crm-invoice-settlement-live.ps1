# LSZH CRM V2 invoice settlement controlled Live cutover.
# Existing tested candidate only. No build, Firestore writes, Gmail, Make, or banking.
# Self-initiated rollback to lszh-crm-v2-00043-wur if any post-cutover check fails.
# DO NOT use for later revisions without a reviewed update.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='lszh-crm-v2-00043-wur'
$candidate='lszh-crm-v2-00046-faj'
$tag='crm-settlement-qa'
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
function CheckFrontend([string]$base) {
  $home=Http ($base.TrimEnd('/')+'/')
  if([int]$home.StatusCode -ne 200 -or [string]$home.Content -notmatch 'id="invoicePaymentsPanel"' -or
    [string]$home.Content -notmatch 'id="invoiceReminderPanel"' -or
    [string]$home.Content -notmatch 'id="invoicePdf"') {
    throw ('Invoice payment/reminder/PDF frontend not available at '+$base)
  }
  $config=Invoke-RestMethod -Uri ($base.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($config.offerMailEnabled -ne $true -or $config.offerMailMode -cne 'production' -or
     $config.offerMailTestTo -or $config.invoiceMailEnabled -ne $false -or
     $config.invoiceMailMode -cne 'disabled' -or $config.invoiceMailTestTo) {
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
  foreach($gate in @('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED')) {
    $v=Env $rev $gate
    if($v -and [string]$v.value -ceq 'true') { throw ('Invoice mail enabled unexpectedly: '+$gate) }
  }
  $iban=Env $rev 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
     [string]$iban.valueFrom.secretKeyRef.key -cne '1') {
    throw 'Invoice IBAN must reference pinned Secret Manager v1.'
  }
}
$routes=@($svc.status.traffic | Where-Object {
  $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
})
if($routes.Count -ne 1) { throw 'Candidate is not the expected tagged zero-traffic revision' }
CheckScheduler

Write-Host '2/4: Check candidate UI, existing offer mode, blocked invoices and authentication'
$candidateUrl=[string]$routes[0].url
if(!$candidateUrl -or !$candidateUrl.StartsWith('https://')) { throw 'Candidate URL invalid' }
CheckFrontend $candidateUrl
Write-Host ('CANDIDATE QA PASS: '+$candidate+' (0 percent)')
Write-Host ('CURRENT LIVE: '+$expectedLive+' (100 percent)')
Write-Host 'Invoice email stays disabled; no sending or artificial payment confirmation.'
Write-Host 'This changes the live CRM application code only. It does not create, send, settle or remind any invoices.'
$approval=Read-Host 'Zur Freigabe des CRM-Versionswechsels exakt LIVE SETTLEMENT eingeben'
if($approval -cne 'LIVE SETTLEMENT') { throw 'Cutover not authorised; no traffic changed.' }

try {
  Write-Host '3/4: Switch production CRM URL to the verified settlement revision'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$candidate+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'Cloud Run traffic cutover failed'
  if((Live (Service)) -cne $candidate) { throw 'Candidate does not receive exactly 100% traffic' }
  Write-Host '4/4: Re-run HTTP auth, invoice UI, mail scheduler and traffic checks'
  CheckFrontend $crmUrl
  CheckScheduler
  if((Live (Service)) -cne $candidate) { throw 'Unexpected production traffic drift after cutover' }
  $verified=$true
  Write-Host 'CRM INVOICE SETTLEMENT LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$expectedCutoff)
  Write-Host ('CRM URL: '+$crmUrl)
  Write-Host 'No customer invoice email, reminder, payment, Firestore seed or bank action executed.'
  Write-Host 'NOTE: live test payments require a separately approved genuine TEST_ONLY send receipt.'
} finally {
  if($switched -and !$verified) { Rollback }
}
