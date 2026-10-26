# LSZH CRM V2 – read-only executive cockpit, exact CHF receivables and project health.
# Zero-traffic UI-only release. No mail, ledger write, offer acceptance or record mutation.
param([switch]$DeployCandidate)
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-invoice-settlement-20261024'
$expectedLive='lszh-crm-v2-00057-qek'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$tag='crm-cockpit-qa'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailCutoff='2026-10-23T16:15:28Z'
function Check([string]$what) { if($LASTEXITCODE -ne 0) { throw "$what (exit $LASTEXITCODE)" } }
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cannot read CRM service'
  return $raw|ConvertFrom-Json
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ('Cannot read revision '+$name)
  return $raw|ConvertFrom-Json
}
function Live($svc) {
  $active=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) { throw 'Unexpected split live traffic' }
  return [string]$active[0].revisionName
}
function Env($rev,[string]$name) {
  $items=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $name})
  if($items.Count -gt 1) { throw ('Duplicate env '+$name) }
  if($items.Count -eq 0) { return $null }
  return $items[0]
}
function RequireEnv($rev,[string]$name,[string]$wanted) {
  $item=Env $rev $name
  if(!$item -or [string]$item.value -cne $wanted) { throw ('Unexpected '+$name) }
}
function Signature($rev) {
  $items=@(@($rev.spec.containers)[0].env|Sort-Object name|ForEach-Object {
    [pscustomobject]@{name=$_.name;value=$_.value;valueFrom=($_.valueFrom|ConvertTo-Json -Depth 12 -Compress)}
  })
  return (ConvertTo-Json -InputObject $items -Depth 16 -Compress)
}
function Status([string]$url) {
  try{ return [int](Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop).StatusCode }
  catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}
function CheckMailScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe 'lszh-crm-v2-mail-tick' "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  Check 'Mail Scheduler cannot be read'
  $job=$raw|ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
     $job.httpTarget.uri -cne ($base+'/api/internal/mail/tick') -or
     $job.httpTarget.httpMethod -ne 'POST' -or
     $job.httpTarget.oidcToken.serviceAccountEmail -cne 'lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com' -or
     $job.httpTarget.oidcToken.audience -cne $base) {
    throw 'Existing mail scheduler drift'
  }
}
function CheckWeb([string]$url,[bool]$expectUnlocked) {
  $page=Invoke-WebRequest -Uri ($url.TrimEnd('/')+'/') -TimeoutSec 30 -UseBasicParsing
  if([int]$page.StatusCode -ne 200 -or
     [string]$page.Content -notmatch 'id="invoiceSend"' -or
     [string]$page.Content -notmatch 'id="invoicePaymentsPanel"') {
    throw 'CRM invoice UI missing'
  }
  $cockpit=([string]$page.Content -match 'function cockpitMetrics\(' -and
    [string]$page.Content -match 'dash-receivable-amount' -and
    [string]$page.Content -match 'dash-data-scope' -and
    [string]$page.Content -match 'dash-project-row')
  if($expectUnlocked -and !$cockpit) { throw 'Read-only CRM cockpit not found in candidate' }
  if(!$expectUnlocked -and $cockpit) { throw 'Baseline unexpectedly already contains read-only cockpit' }
  if([string]$page.Content -notmatch 'Dies protokolliert nur den bereits erfolgten Versand' -or
    [string]$page.Content -notmatch 'Rechnung wirklich senden|RECHNUNG WIRKLICH SENDEN') {
    throw 'Manual email/reminder confirmation safety controls missing'
  }
  $conf=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($conf.offerMailEnabled -ne $true -or $conf.offerMailMode -cne 'production' -or
     $conf.offerMailTestTo -or
     $conf.invoiceMailEnabled -ne $true -or $conf.invoiceMailMode -cne 'production' -or
     $conf.invoiceMailTestTo) {
    throw 'Existing production offer/invoice mail HTTP mode changed'
  }
  if((Status ($url.TrimEnd('/')+'/api/records/rechnungen')) -ne 401) { throw 'Unauth invoice list not protected' }
  if((Status ($url.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NOT_REAL/send')) -ne 401) {
    throw 'Unauthenticated invoice send not protected'
  }
}
foreach($bin in @('git','npm.cmd','gcloud.cmd')) {
  if(!(Get-Command $bin -ErrorAction SilentlyContinue)) { throw ('Required tool missing: '+$bin) }
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $actual=((& git branch --show-current)-join '').Trim();Check 'Cannot inspect Git branch'
  if($actual -cne $branch) { throw 'Wrong source branch' }
  $dirty=((& git status --porcelain)-join '').Trim();Check 'Cannot inspect working tree'
  if($dirty) { throw 'Uncommitted work, no deployment' }
  $localHead=((& git rev-parse HEAD)-join '').Trim();Check 'Cannot read HEAD'
  $originHead=((& git rev-parse "origin/$branch")-join '').Trim();Check 'Cannot read origin branch'
  if($localHead -cne $originHead) { throw 'Local source differs from fetched origin branch' }
  Write-Host '1/4: Run CRM tests and verify clean source'
  & npm.cmd ci '--prefix' '.\crm-v2' '--ignore-scripts' '--no-audit' '--no-fund'
  Check 'CRM npm install failed'
  & npm.cmd test '--prefix' '.\crm-v2'
  Check 'CRM tests failed'
  $changed=((& git status --porcelain)-join '').Trim();Check 'Cannot verify clean tree after tests'
  if($changed) { throw 'Test run modified repository; stop' }
  Write-Host '2/4: Confirm active customer-mail baseline, secrets and scheduler'
  $before=Service
  if((Live $before) -cne $expectedLive -or
     [string]$before.status.latestReadyRevisionName -cne $expectedLive) {
    throw 'Baseline live/latest revision changed; do not deploy'
  }
  $old=Revision $expectedLive
  if([string]$old.spec.serviceAccountName -cne $serviceAccount) { throw 'CRM service identity drift' }
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
  )){ RequireEnv $old ([string]$pair[0]) ([string]$pair[1]) }
  if(Env $old 'CRM_INVOICE_MAIL_TEST_TO') { throw 'Unexpected TEST_ONLY recipient override in live' }
  $iban=Env $old 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
    [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
    [string]$iban.valueFrom.secretKeyRef.key -cne '1') { throw 'IBAN Secret Manager v1 drifted' }
  $hook=Env $old 'CRM_OFFER_MAIL_WEBHOOK_URL'
  if(!$hook -or $hook.value -or
    [string]$hook.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-offer-make-hook') {
    throw 'Existing Make/Gmail secret binding changed'
  }
  $invoiceHook=Env $old 'CRM_INVOICE_MAIL_WEBHOOK_URL'
  if($invoiceHook -and ($invoiceHook.value -or
      [string]$invoiceHook.valueFrom.secretKeyRef.name -cne [string]$hook.valueFrom.secretKeyRef.name -or
      [string]$invoiceHook.valueFrom.secretKeyRef.key -cne [string]$hook.valueFrom.secretKeyRef.key)) {
    throw 'Invoice webhook changed'
  }
  CheckMailScheduler
  CheckWeb $base $false
  Write-Host ('BASELINE PASS: '+$expectedLive+' (100 percent)')
  if(!$DeployCandidate) { Write-Host 'READ-ONLY PASS, no deployment, no mail sent'; return }
  Write-Host '3/4: Build CRM cockpit UI candidate at zero live traffic'
  & gcloud.cmd run deploy $service '--source' '.\crm-v2' "--project=$project" "--region=$region" '--no-traffic' "--tag=$tag" '--quiet'
  Check 'Cloud Run candidate build failed'
  $after=Service
  if((Live $after) -cne $expectedLive) { throw 'CRITICAL: live traffic unexpectedly changed' }
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -ceq $expectedLive) { throw 'Candidate revision not created' }
  $new=Revision $candidate
  if([string]$new.spec.serviceAccountName -cne $serviceAccount -or
     (Signature $new) -cne (Signature $old)) { throw 'Candidate env/secrets differ from live' }
  $route=@($after.status.traffic|Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($route.Count -ne 1) { throw 'Candidate not uniquely tagged at 0 percent' }
  Write-Host '4/4: Validate cockpit read-only UI and unchanged mail/auth controls'
  $url=[string]$route[0].url
  if(!$url -or !$url.StartsWith('https://')) { throw 'Candidate URL missing' }
  CheckWeb $url $true
  CheckMailScheduler
  if((Live (Service)) -cne $expectedLive) { throw 'Production traffic drift detected' }
  Write-Host 'CRM COCKPIT ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE: '+$candidate+' (0 percent)')
  Write-Host ('CANDIDATE URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$expectedLive+' (100 percent)')
  Write-Host 'READ-ONLY COCKPIT. NO MAIL, OFFER, REMINDER, PAYMENT OR PRODUCTION RECORD CHANGED.'
}finally{Pop-Location}
