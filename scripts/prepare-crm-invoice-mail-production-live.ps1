# LSZH CRM V2 - prepare manual customer invoice email production via existing Make/Gmail.
# Creates a 0%-traffic revision. Never triggers Gmail or Firestore writes.
# Explicit per-invoice click remains mandatory in the authenticated CRM.
param([switch]$DeployCandidate)
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-invoice-settlement-20261024'
$expectedLive='lszh-crm-v2-00046-faj'
$expectedTestCandidate='lszh-crm-v2-00048-sim'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$tag='crm-invoice-production-qa'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailCutoff='2026-10-23T16:15:28Z'
$keys=@('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED',
  'CRM_INVOICE_MAIL_MODE','CRM_INVOICE_MAIL_TEST_TO')
$root=Split-Path $PSScriptRoot -Parent

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
  Check ('Cloud Run revision inaccessible: '+$name)
  return ($raw | ConvertFrom-Json)
}
function Live($svc) {
  $active=@($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) {
    throw 'Unexpected production traffic split'
  }
  return [string]$active[0].revisionName
}
function Env($rev,[string]$key) {
  $values=@(@($rev.spec.containers)[0].env | Where-Object { $_.name -eq $key })
  if($values.Count -gt 1) { throw ('Duplicate env '+$key) }
  if($values.Count -eq 0) { return $null }
  return $values[0]
}
function Required($rev,[string]$key,[string]$value) {
  $item=Env $rev $key
  if(!$item -or [string]$item.value -cne $value) {
    throw ('Unexpected environment setting '+$key)
  }
}
function Signature($rev,[string[]]$omit) {
  $vars=@(@($rev.spec.containers)[0].env |
    Where-Object { $_.name -notin $omit } | Sort-Object name | ForEach-Object {
      [pscustomobject]@{
        name=[string]$_.name
        value=[string]$_.value
        valueFrom=($_.valueFrom | ConvertTo-Json -Depth 12 -Compress)
      }
    })
  return (ConvertTo-Json -InputObject $vars -Depth 16 -Compress)
}
function CheckAuth([string]$url) {
  try {
    $r=Invoke-WebRequest -Uri $url -TimeoutSec 35 -UseBasicParsing -ErrorAction Stop
    return [int]$r.StatusCode
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}
function CheckScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe 'lszh-crm-v2-mail-tick' "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  Check 'Existing mail Scheduler job unavailable'
  $job=$raw | ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
     $job.httpTarget.uri -cne ($base+'/api/internal/mail/tick') -or
     $job.httpTarget.httpMethod -ne 'POST' -or
     $job.httpTarget.oidcToken.serviceAccountEmail -cne 'lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com' -or
     $job.httpTarget.oidcToken.audience -cne $base) {
    throw 'Existing mail Scheduler contract unexpectedly changed'
  }
}
foreach($cmd in @('git','npm.cmd','gcloud.cmd')) {
  if(!(Get-Command $cmd -ErrorAction SilentlyContinue)) { throw ('Missing '+$cmd) }
}
Push-Location $root
try {
  $actual=((& git branch --show-current)-join '').Trim(); Check 'Cannot read Git branch'
  if($actual -cne $branch) { throw ('Wrong branch: '+$actual) }
  $dirty=((& git status --porcelain)-join '').Trim(); Check 'Cannot read Git status'
  if($dirty) { throw 'Git working tree is not clean' }
  $head=((& git rev-parse HEAD)-join '').Trim(); Check 'Cannot read Git commit'
  $remote=((& git rev-parse "origin/$branch")-join '').Trim(); Check 'Cannot read origin branch'
  if($head -cne $remote) { throw 'Local checkout is not equal to fetched origin branch' }

  Write-Host '1/4: Run CRM/regression tests from release source'
  & npm.cmd ci '--prefix' '.\crm-v2' '--ignore-scripts' '--no-audit' '--no-fund'
  Check 'npm ci failed'
  & npm.cmd test '--prefix' '.\crm-v2'
  Check 'CRM regression tests failed'
  $dirty=((& git status --porcelain)-join '').Trim(); Check 'Cannot recheck Git status'
  if($dirty) { throw 'Install/test changed files; deployment blocked' }

  Write-Host '2/4: Check exact current Live and previous unused 0%-candidate'
  $before=Service
  if((Live $before) -cne $expectedLive) { throw 'Live revision changed; STOP' }
  $old=Revision $expectedLive
  $test=Revision $expectedTestCandidate
  foreach($rev in @($old,$test)) {
    if([string]$rev.spec.serviceAccountName -cne $serviceAccount) {
      throw 'Service account changed'
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
    )) { Required $rev ([string]$pair[0]) ([string]$pair[1]) }
    if(Env $rev 'CRM_OFFER_MAIL_TEST_TO') { throw 'Unexpected offer recipient override' }
    $bank=Env $rev 'CRM_INVOICE_IBAN'
    if(!$bank -or $bank.value -or
       [string]$bank.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
       [string]$bank.valueFrom.secretKeyRef.key -cne '1') {
      throw 'Pinned IBAN Secret Manager v1 changed'
    }
    $hook=Env $rev 'CRM_OFFER_MAIL_WEBHOOK_URL'
    if(!$hook -or $hook.value -or
       [string]$hook.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-offer-make-hook') {
      throw 'Approved production Make webhook secret binding missing'
    }
    $invoiceHook=Env $rev 'CRM_INVOICE_MAIL_WEBHOOK_URL'
    if($invoiceHook -and ($invoiceHook.value -or
        [string]$invoiceHook.valueFrom.secretKeyRef.name -cne [string]$hook.valueFrom.secretKeyRef.name -or
        [string]$invoiceHook.valueFrom.secretKeyRef.key -cne [string]$hook.valueFrom.secretKeyRef.key)) {
      throw 'Invoice webhook does not match approved Make gateway'
    }
  }
  if((Signature $old $keys) -cne (Signature $test $keys)) {
    throw 'Prior TEST_ONLY candidate changed unrelated settings or secrets'
  }
  foreach($gate in @('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED')) {
    $v=Env $old $gate
    if($v -and [string]$v.value -ceq 'true') { throw 'Live invoice mail already enabled' }
  }
  Required $test 'CRM_INVOICE_MAIL_ENABLED' 'true'
  Required $test 'CRM_INVOICE_MAIL_PRODUCTION_APPROVED' 'true'
  Required $test 'CRM_INVOICE_MAIL_MODE' 'test_only'
  Required $test 'CRM_INVOICE_MAIL_TEST_TO' 'lars.schulthess@outlook.com'
  $testTag=@($before.status.traffic | Where-Object {
    $_.revisionName -eq $expectedTestCandidate -and
    $_.tag -eq 'crm-invoice-testonly-qa' -and [int]$_.percent -eq 0
  })
  if($testTag.Count -ne 1 -or
     [string]$before.status.latestReadyRevisionName -cne $expectedTestCandidate) {
    throw 'Expected most recent TEST_ONLY candidate is not found at zero traffic'
  }
  CheckScheduler
  Write-Host ('PRE-FLIGHT PASS: Production live '+$expectedLive+' (100%)')
  Write-Host 'Make/Gmail existing production invoice_send route: inspected via connected Make'
  if(!$DeployCandidate) {
    Write-Host 'READ-ONLY PRE-FLIGHT PASS: Nothing deployed or sent.'
    return
  }

  Write-Host '3/4: Deploy production manual invoice sender with zero traffic'
  # IMPORTANT: latest service template is TEST_ONLY candidate. Remove that private
  # recipient override while setting mode=production in the SAME atomic deploy.
  # No --set-env-vars, --set-secrets, or other destructive secret/environment options.
  $changes='CRM_INVOICE_MAIL_ENABLED=true,'+
    'CRM_INVOICE_MAIL_PRODUCTION_APPROVED=true,'+
    'CRM_INVOICE_MAIL_MODE=production'
  & gcloud.cmd run deploy $service '--source' '.\crm-v2' "--project=$project" "--region=$region" '--no-traffic' "--tag=$tag" '--remove-env-vars=CRM_INVOICE_MAIL_TEST_TO' "--update-env-vars=$changes" '--quiet'
  Check 'Production invoice mail candidate build failed'
  $after=Service
  if((Live $after) -cne $expectedLive) { throw 'CRITICAL: Live traffic changed' }
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -ceq $expectedLive -or $candidate -ceq $expectedTestCandidate) {
    throw 'Separate production candidate was not created'
  }
  $new=Revision $candidate
  if([string]$new.spec.serviceAccountName -cne $serviceAccount -or
    (Signature $new $keys) -cne (Signature $old $keys)) {
    throw 'Production candidate changed protected settings or secrets'
  }
  Required $new 'CRM_INVOICE_MAIL_ENABLED' 'true'
  Required $new 'CRM_INVOICE_MAIL_PRODUCTION_APPROVED' 'true'
  Required $new 'CRM_INVOICE_MAIL_MODE' 'production'
  if(Env $new 'CRM_INVOICE_MAIL_TEST_TO') {
    throw 'Production candidate STILL has TEST_ONLY recipient override'
  }
  $route=@($after.status.traffic | Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($route.Count -ne 1) { throw 'Expected uniquely tagged production candidate at zero traffic' }

  Write-Host '4/4: Anonymous read-only HTTP, mail settings and authorization gates'
  $url=[string]$route[0].url
  if(!$url -or !$url.StartsWith('https://')) { throw 'Tagged candidate URL invalid' }
  $conf=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 35
  if($conf.offerMailEnabled -ne $true -or $conf.offerMailMode -cne 'production' -or
     $conf.offerMailTestTo -or $conf.invoiceMailEnabled -ne $true -or
     $conf.invoiceMailMode -cne 'production' -or $conf.invoiceMailTestTo) {
    throw 'Production invoice mail config invalid'
  }
  if((CheckAuth ($url.TrimEnd('/')+'/')) -ne 200) {
    throw 'CRM frontend unavailable'
  }
  if((CheckAuth ($url.TrimEnd('/')+'/api/records/rechnungen')) -ne 401) {
    throw 'Unauthenticated invoices exposed'
  }
  if((CheckAuth ($url.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NOT_REAL/send')) -ne 401) {
    throw 'Unauthenticated invoice send not blocked'
  }
  CheckScheduler
  if((Live (Service)) -cne $expectedLive) { throw 'Production traffic drifted' }

  Write-Host 'CRM INVOICE MAIL PRODUCTION ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE REVISION: '+$candidate)
  Write-Host ('CANDIDATE URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$expectedLive+' (100 percent)')
  Write-Host 'No email sent, no bank action, no data writes and no Make/scheduler changes.'
  Write-Host 'STOP: Production customer email still disabled at Live until separate safe cutover.'
} finally { Pop-Location }
