# LSZH CRM V2 read-performance zero-traffic staging.
# No traffic switch, emails, payments or Firestore mutations from this script.
param([switch]$DeployCandidate)
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-read-performance-20261024'
$expectedLive='lszh-crm-v2-00063-baz'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$tag='crm-read-perf-qa'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailCutoff='2026-10-23T16:15:28Z'
function RequireExit([string]$reason){if($LASTEXITCODE -ne 0){throw "$reason (exit $LASTEXITCODE)"}}
function GetService{
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  RequireExit 'Cannot read CRM service'
  return $raw|ConvertFrom-Json
}
function GetRevision([string]$name){
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  RequireExit ('Cannot read revision '+$name)
  return $raw|ConvertFrom-Json
}
function LiveRevision($svc){
  $active=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){throw 'Unexpected split live traffic'}
  return [string]$active[0].revisionName
}
function EnvEntry($rev,[string]$name){
  $items=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $name})
  if($items.Count -gt 1){throw ('Duplicate env '+$name)}
  if($items.Count -eq 0){return $null}
  return $items[0]
}
function CheckEnv($rev,[string]$name,[string]$wanted){
  $item=EnvEntry $rev $name
  if(!$item -or [string]$item.value -cne $wanted){throw ('Unexpected environment: '+$name)}
}
function EnvSignature($rev){
  $items=@(@($rev.spec.containers)[0].env|Sort-Object name|ForEach-Object {
    [pscustomobject]@{name=[string]$_.name;value=[string]$_.value;valueFrom=($_.valueFrom|ConvertTo-Json -Depth 12 -Compress)}
  })
  return ConvertTo-Json -InputObject $items -Depth 16 -Compress
}
function HttpStatus([string]$url){
  try{return [int](Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop).StatusCode}
  catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode){
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}
function CheckMailScheduler{
  $raw=(& gcloud.cmd scheduler jobs describe 'lszh-crm-v2-mail-tick' "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  RequireExit 'Cannot read mail scheduler'
  $job=$raw|ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
     $job.httpTarget.uri -cne ($base+'/api/internal/mail/tick') -or
     $job.httpTarget.httpMethod -ne 'POST' -or
     $job.httpTarget.oidcToken.serviceAccountEmail -cne 'lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com' -or
     $job.httpTarget.oidcToken.audience -cne $base){
    throw 'Mail scheduler drift; no deployment allowed'
  }
}
function CheckWeb([string]$url,[bool]$optimizationExpected){
  $page=Invoke-WebRequest -Uri ($url.TrimEnd('/')+'/') -UseBasicParsing -TimeoutSec 30
  if([int]$page.StatusCode -ne 200){throw 'CRM homepage unavailable'}
  $html=[string]$page.Content
  if($html -notmatch 'function renderPageMore\(' -or
     $html -notmatch 'pageSize=50' -or
     $html -notmatch 'id="invoiceSend"' -or
     $html -notmatch 'id="invoicePaymentsPanel"'){
    throw 'Existing pagination, invoice or payment UI missing'
  }
  $hasSearch=($html -match 'id="statusFilter"' -and
    $html -match 'function loadFilteredRows\(' -and
    $html -match 'function filteredSearchUrl\(')
  if(!$hasSearch){throw 'Production CRM server search UI is missing'}
  $optimized=($html -match 'LSZH CRM READ PERF: firestore-status-index-singleflight-v1')
  if($optimized -ne $optimizationExpected){
    throw 'Candidate/source optimization marker differs from expected version'
  }
  if((HttpStatus ($url.TrimEnd('/')+'/api/records/kunden?q=TEST_ONLY')) -ne 401){
    throw 'Anonymous search API must return HTTP 401'
  }
  if((HttpStatus ($url.TrimEnd('/')+'/api/records/rechnungen')) -ne 401){
    throw 'Anonymous invoice register API must return HTTP 401'
  }
  if((HttpStatus ($url.TrimEnd('/')+'/api/cockpit/summary')) -ne 401){
    throw 'Anonymous full dashboard summary must return HTTP 401'
  }
  if($html -notmatch 'Rechnung wirklich senden|RECHNUNG WIRKLICH SENDEN' -or
     $html -notmatch 'Dies protokolliert nur den bereits erfolgten Versand'){
    throw 'Manual invoice/reminder safeguards changed'
  }
  $conf=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($conf.offerMailEnabled -ne $true -or $conf.offerMailMode -cne 'production' -or
     $conf.offerMailTestTo -or $conf.invoiceMailEnabled -ne $true -or
     $conf.invoiceMailMode -cne 'production' -or $conf.invoiceMailTestTo){
    throw 'Offer or invoice mail mode changed'
  }
}
foreach($tool in @('git','node','npm.cmd','gcloud.cmd')){
  if(!(Get-Command $tool -ErrorAction SilentlyContinue)){throw ('Required tool missing: '+$tool)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $actual=((& git branch --show-current)-join '').Trim();RequireExit 'Cannot read source branch'
  if($actual -cne $branch){throw 'Wrong development branch'}
  $dirty=((& git status --porcelain)-join '').Trim();RequireExit 'Cannot check repository state'
  if($dirty){throw 'Working tree is not clean'}
  $head=((& git rev-parse HEAD)-join '').Trim();RequireExit 'Cannot inspect HEAD'
  $origin=((& git rev-parse "origin/$branch")-join '').Trim();RequireExit 'Cannot inspect fetched origin'
  if($head -cne $origin){throw 'Branch differs from fetched origin; git pull --ff-only first'}
  Write-Host '1/4: Verify source, CRM tests and frontend syntax'
  & npm.cmd ci '--prefix' '.\crm-v2' '--ignore-scripts' '--no-audit' '--no-fund'
  RequireExit 'Dependencies failed to install'
  & npm.cmd test '--prefix' '.\crm-v2'
  RequireExit 'CRM regression tests failed'
  $dirty=((& git status --porcelain)-join '').Trim();RequireExit 'Cannot verify clean worktree'
  if($dirty){throw 'Test run modified the tracked source'}
  Write-Host '2/4: Verify current live mail/auth/secret baseline'
  $before=GetService
  if((LiveRevision $before) -cne $expectedLive -or
     [string]$before.status.latestReadyRevisionName -cne $expectedLive){
    throw 'Live/latest CRM revision changed; stop and re-evaluate'
  }
  $old=GetRevision $expectedLive
  if([string]$old.spec.serviceAccountName -cne $serviceAccount){throw 'CRM service identity changed'}
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
  )){CheckEnv $old ([string]$pair[0]) ([string]$pair[1])}
  if(EnvEntry $old 'CRM_INVOICE_MAIL_TEST_TO'){throw 'Unexpected invoice test recipient override'}
  $iban=EnvEntry $old 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
     [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
     [string]$iban.valueFrom.secretKeyRef.key -cne '1'){throw 'Bank IBAN secret binding changed'}
  $hook=EnvEntry $old 'CRM_OFFER_MAIL_WEBHOOK_URL'
  if(!$hook -or $hook.value -or
     [string]$hook.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-offer-make-hook'){
    throw 'Make/Gmail secret binding changed'
  }
  CheckMailScheduler
  CheckWeb $base $false
  Write-Host ('LIVE BASELINE PASS: '+$expectedLive+' (100 percent)')
  if(!$DeployCandidate){
    Write-Host 'READ-ONLY PASS. Add -DeployCandidate to create a new 0-percent candidate.'
    return
  }
  Write-Host '3/4: Build read-performance candidate with 0 percent live traffic'
  & gcloud.cmd run deploy $service '--source' '.\crm-v2' "--project=$project" "--region=$region" '--no-traffic' "--tag=$tag" '--quiet'
  RequireExit 'Cloud Run candidate build failed'
  $after=GetService
  if((LiveRevision $after) -cne $expectedLive){throw 'CRITICAL: live traffic changed during candidate deployment'}
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -ceq $expectedLive){throw 'New candidate revision not found'}
  $new=GetRevision $candidate
  if([string]$new.spec.serviceAccountName -cne $serviceAccount -or
     (EnvSignature $new) -cne (EnvSignature $old)){
    throw 'Candidate service account or environment differs from current live revision'
  }
  $route=@($after.status.traffic|Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($route.Count -ne 1){throw 'Candidate must be uniquely tagged at 0 percent'}
  Write-Host '4/4: Validate read-performance build, search/auth and unchanged mail controls'
  $url=[string]$route[0].url
  if(!$url -or !$url.StartsWith('https://')){throw 'Candidate URL unavailable'}
  CheckWeb $url $true
  CheckMailScheduler
  if((LiveRevision (GetService)) -cne $expectedLive){throw 'Unexpected live traffic change'}
  Write-Host 'CRM READ PERFORMANCE ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE: '+$candidate+' (0 percent)')
  Write-Host ('CANDIDATE URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$expectedLive+' (100 percent)')
  Write-Host 'NO CUSTOMER MAIL, REMINDER, PAYMENT, OFFER OR RECORD WRITE EXECUTED.'
}finally{Pop-Location}
