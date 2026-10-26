# LSZH CRM V2 - release manual customer invoice mail using existing Make/Gmail.
# No invoice is sent by this script. CRM button and Gmail receipt are mandatory.
# A failed post-release check attempts automatic rollback to 00046-faj.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-invoice-settlement-20261024'
$expectedLive='lszh-crm-v2-00046-faj'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$tag='crm-invoice-production-qa'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailCutoff='2026-10-23T16:15:28Z'
$four=@('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED',
  'CRM_INVOICE_MAIL_MODE','CRM_INVOICE_MAIL_TEST_TO')
$switched=$false
$verified=$false

function Check([string]$message) {
  if($LASTEXITCODE -ne 0) { throw "$message (exit $LASTEXITCODE)" }
}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'CRM service not readable'
  return ($raw | ConvertFrom-Json)
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ('CRM revision not readable: '+$name)
  return ($raw | ConvertFrom-Json)
}
function Live($svc) {
  $active=@($svc.status.traffic | Where-Object { [int]$_.percent -gt 0 })
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100) {
    throw 'Unexpected split in production traffic'
  }
  return [string]$active[0].revisionName
}
function Env($rev,[string]$name) {
  $matches=@(@($rev.spec.containers)[0].env | Where-Object { $_.name -eq $name })
  if($matches.Count -gt 1) { throw ('Duplicate config '+$name) }
  if($matches.Count -eq 0) { return $null }
  return $matches[0]
}
function Required($rev,[string]$key,[string]$expected) {
  $item=Env $rev $key
  if(!$item -or [string]$item.value -cne $expected) {
    throw ('Unexpected protected environment setting '+$key)
  }
}
function Signature($rev,[string[]]$except) {
  $items=@(@($rev.spec.containers)[0].env |
    Where-Object { $_.name -notin $except } | Sort-Object name | ForEach-Object {
      [pscustomobject]@{
        name=[string]$_.name
        value=[string]$_.value
        valueFrom=($_.valueFrom | ConvertTo-Json -Depth 12 -Compress)
      }
    })
  return (ConvertTo-Json -InputObject $items -Depth 16 -Compress)
}
function CheckScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe 'lszh-crm-v2-mail-tick' "--project=$project" "--location=$region" '--format=json') -join [Environment]::NewLine
  Check 'Lead mail scheduler not readable'
  $job=$raw | ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
     $job.httpTarget.uri -cne ($base+'/api/internal/mail/tick') -or
     $job.httpTarget.httpMethod -ne 'POST' -or
     $job.httpTarget.oidcToken.serviceAccountEmail -cne 'lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com' -or
     $job.httpTarget.oidcToken.audience -cne $base) {
    throw 'Existing scheduler mail contract changed'
  }
}
function Http([string]$url) {
  try {
    return Invoke-WebRequest -Uri $url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      return [pscustomobject]@{StatusCode=[int]$_.Exception.Response.StatusCode;Content=''}
    }
    throw
  }
}
function CheckWeb([string]$url,[bool]$isProduction) {
  $pageResponse=Http ($url.TrimEnd('/')+'/')
  if([int]$pageResponse.StatusCode -ne 200 -or
     [string]$pageResponse.Content -notmatch 'id="invoiceSend"' -or
     [string]$pageResponse.Content -notmatch 'id="invoicePaymentsPanel"' -or
     [string]$pageResponse.Content -notmatch 'id="invoicePdf"') {
    throw ('Invoice UI incomplete at '+$url)
  }
  $config=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($config.offerMailEnabled -ne $true -or $config.offerMailMode -cne 'production' -or
     $config.offerMailTestTo) { throw 'Previously approved offer mail mode drifted' }
  if($isProduction) {
    if($config.invoiceMailEnabled -ne $true -or
       $config.invoiceMailMode -cne 'production' -or $config.invoiceMailTestTo) {
      throw 'Production invoice mail config incorrect'
    }
  }else{
    if($config.invoiceMailEnabled -ne $false -or $config.invoiceMailTestTo) {
      throw 'Existing live invoice mail should remain disabled before release'
    }
  }
  if([int](Http ($url.TrimEnd('/')+'/api/records/rechnungen')).StatusCode -ne 401) {
    throw 'Unauthenticated invoice collection available'
  }
  if([int](Http ($url.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NOT_REAL/send')).StatusCode -ne 401) {
    throw 'Unauthenticated invoice send access allowed'
  }
  if([int](Http ($url.TrimEnd('/')+'/api/pdf/rechnung/TEST_ONLY_NOT_REAL')).StatusCode -ne 401) {
    throw 'Unauthenticated Swiss-QR PDF access allowed'
  }
}
function Rollback {
  Write-Warning ('ROLLBACK: restore '+$expectedLive+' (100 percent)')
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$expectedLive+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'CRITICAL: rollback command failed; inspect traffic NOW'
  if((Live (Service)) -cne $expectedLive) {
    throw 'CRITICAL: rollback cannot be confirmed; inspect Cloud Run NOW'
  }
  Write-Host ('ROLLBACK PASS: '+$expectedLive+' (100 percent)')
}
foreach($command in @('gcloud.cmd','git')) {
  if(!(Get-Command $command -ErrorAction SilentlyContinue)) { throw ('Missing '+$command) }
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $actual=((& git branch --show-current)-join '').Trim(); Check 'Cannot read Git branch'
  if($actual -cne $branch) { throw ('Wrong release branch: '+$actual) }
  $dirty=((& git status --porcelain)-join '').Trim(); Check 'Cannot inspect Git state'
  if($dirty) { throw 'Uncommitted changes prevent customer-mail release' }
  $head=((& git rev-parse HEAD)-join '').Trim(); Check 'Cannot read Git HEAD'
  $remote=((& git rev-parse "origin/$branch")-join '').Trim(); Check 'Cannot inspect origin branch'
  if($head -cne $remote) { throw 'Local files differ from fetched origin branch' }
}finally { Pop-Location }

Write-Host '1/4: Verify production candidate, exact Live settings and protected secrets'
$svc=Service
if((Live $svc) -cne $expectedLive) { throw 'Active CRM revision changed since approval; stop' }
$old=Revision $expectedLive
$matches=@($svc.status.traffic | Where-Object {
  $_.tag -eq $tag -and [int]$_.percent -eq 0
})
if($matches.Count -ne 1) { throw 'Missing uniquely tagged zero-traffic production candidate' }
$candidate=[string]$matches[0].revisionName
if(!$candidate -or $candidate -ceq $expectedLive -or
   [string]$svc.status.latestReadyRevisionName -cne $candidate) {
  throw 'Tagged production candidate is not latest ready revision'
}
$new=Revision $candidate
if([string]$old.spec.serviceAccountName -cne $serviceAccount -or
   [string]$new.spec.serviceAccountName -cne $serviceAccount -or
   (Signature $old $four) -cne (Signature $new $four)) {
  throw 'Candidate changed existing mail, lead, QR, secret or service account'
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
    @('CRM_INVOICE_PRODUCTION_APPROVED','true')
  )) { Required $rev ([string]$pair[0]) ([string]$pair[1]) }
  if(Env $rev 'CRM_OFFER_MAIL_TEST_TO') { throw 'Unexpected customer offer email override' }
  $iban=Env $rev 'CRM_INVOICE_IBAN'
  if(!$iban -or $iban.value -or
     [string]$iban.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-invoice-iban' -or
     [string]$iban.valueFrom.secretKeyRef.key -cne '1') {
    throw 'CRM IBAN Secret Manager pin missing'
  }
  $hook=Env $rev 'CRM_OFFER_MAIL_WEBHOOK_URL'
  if(!$hook -or $hook.value -or
     [string]$hook.valueFrom.secretKeyRef.name -cne 'lszh-crm-v2-offer-make-hook') {
    throw 'Existing approved Make webhook reference changed'
  }
}
foreach($gate in @('CRM_INVOICE_MAIL_ENABLED','CRM_INVOICE_MAIL_PRODUCTION_APPROVED')) {
  $item=Env $old $gate
  if($item -and [string]$item.value -ceq 'true') {
    throw 'Unexpected live invoice mail already enabled'
  }
}
Required $new 'CRM_INVOICE_MAIL_ENABLED' 'true'
Required $new 'CRM_INVOICE_MAIL_PRODUCTION_APPROVED' 'true'
Required $new 'CRM_INVOICE_MAIL_MODE' 'production'
if(Env $new 'CRM_INVOICE_MAIL_TEST_TO') { throw 'TEST_ONLY override must be ABSENT from production' }
CheckScheduler
Write-Host '2/4: HTTP checks of production CRM candidate (no mail send)'
CheckWeb $base $false
$qaUrl=[string]$matches[0].url
if(!$qaUrl -or !$qaUrl.StartsWith('https://')) { throw 'Production candidate URL missing' }
CheckWeb $qaUrl $true
Write-Host ('LIVE: '+$expectedLive+' (100 percent)')
Write-Host ('PRODUCTION CANDIDATE: '+$candidate+' (0 percent)')
Write-Host 'Rechnungen werden NUR beim ausdruecklichen CRM-Klick an den Rechnungskunden gesendet.'
Write-Host 'Mailversand, bestehende Lead-/Offertenautomationen und Scheduler bleiben hier unberuehrt.'
$approval=Read-Host 'Freigabe fuer manuellen Rechnungs-E-Mail-Versand an echte Kunden: exakt LIVE RECHNUNG PRODUKTIV eingeben'
if($approval -cne 'LIVE RECHNUNG PRODUKTIV') {
  throw 'No final production release approval; traffic unchanged'
}
try {
  Write-Host '3/4: Route the verified production invoice mail revision to Live URL'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ("--to-revisions="+$candidate+"=100") "--project=$project" "--region=$region" '--quiet'
  Check 'Customer invoice mail cutover failed'
  if((Live (Service)) -cne $candidate) { throw 'New revision does not serve exactly 100% of CRM traffic' }
  Write-Host '4/4: Verify productive invoice mail, auth, existing offer mail, scheduler and traffic'
  CheckWeb $base $true
  CheckScheduler
  if((Live (Service)) -cne $candidate) { throw 'Production CRM traffic moved during verification' }
  $verified=$true
  Write-Host 'CRM INVOICE MAIL PRODUCTION LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$mailCutoff)
  Write-Host ('CRM URL: '+$base)
  Write-Host 'No customer email sent by rollout. Delivery occurs only on future manual CRM invoice click.'
}finally{
  if($switched -and !$verified) { Rollback }
}
