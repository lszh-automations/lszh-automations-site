# LSZH CRM V2: manual offer dispatch logging, follow-ups and decisions.
# Does not call the mail webhook, reset deduplication, or change activation cutoff.
# No mail/CRM workflow changes. Scheduler, Make, Firestore, intake and emails unchanged.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='' # Read and validate actual current live revision at preflight
$expectedAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$schedulerAccount='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$job='lszh-crm-v2-mail-tick'
$tag='crm-offer-tracking'
$switched=$false
$completed=$false
function CheckExit([string]$message) {
  if($LASTEXITCODE -ne 0){throw $message}
}
function ReadService {
  $raw=(& gcloud.cmd run services describe $service --project $project --region $region --format=json) -join [Environment]::NewLine
  CheckExit 'Cloud Run service cannot be read'
  return ($raw | ConvertFrom-Json)
}
function ReadRevision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json) -join [Environment]::NewLine
  CheckExit ('Cloud Run revision cannot be read: '+$name)
  return ($raw | ConvertFrom-Json)
}
function ReadScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe $job --project $project --location $region --format=json) -join [Environment]::NewLine
  CheckExit 'Cloud Scheduler cannot be read'
  return ($raw | ConvertFrom-Json)
}
function ActiveRevision($svc) {
  $live=@($svc.status.traffic | Where-Object {[int]$_.percent -gt 0})
  if($live.Count -ne 1 -or [int]$live[0].percent -ne 100){throw 'Unexpected Cloud Run traffic split'}
  return [string]$live[0].revisionName
}
function EnvValue($revision,[string]$name) {
  $items=@(@($revision.spec.containers)[0].env | Where-Object {$_.name -eq $name})
  if($items.Count -ne 1){throw ('Missing/duplicate environment variable: '+$name)}
  return [string]$items[0].value
}
function EnvSignature($revision) {
  $container=@($revision.spec.containers)[0]
  $items=@($container.env | Sort-Object name | ForEach-Object {
    [pscustomobject]@{
      name=$_.name
      value=$_.value
      valueFrom=($_.valueFrom | ConvertTo-Json -Depth 10 -Compress)
    }
  })
  return ($items | ConvertTo-Json -Depth 14 -Compress)
}
function CheckScheduler($scheduler) {
  if($scheduler.state -ne 'ENABLED' -or $scheduler.schedule -ne '* * * * *'){
    throw 'Existing production mail scheduler is not enabled every minute'
  }
  if($scheduler.httpTarget.uri -ne ($base+'/api/internal/mail/tick') -or
     $scheduler.httpTarget.httpMethod -ne 'POST' -or
     $scheduler.httpTarget.oidcToken.serviceAccountEmail -ne $schedulerAccount -or
     $scheduler.httpTarget.oidcToken.audience -ne $base){
    throw 'Scheduler OIDC identity or endpoint changed'
  }
}
function HttpCode([string]$uri,[string]$method) {
  try {
    $response=Invoke-WebRequest -Uri $uri -Method $method -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
    return [int]$response.StatusCode
  } catch {
    if(!$_.Exception.Response -or !$_.Exception.Response.StatusCode){throw}
    return [int]$_.Exception.Response.StatusCode
  }
}
function Probe([string]$url) {
  $checks=@(
    @('/','GET',200),
    @('/api/config','GET',200),
    @('/api/records/leads','GET',401),
    @('/api/records/leads/web_00000000000000000000000000000000','DELETE',401),
    @('/api/records/leads/web_00000000000000000000000000000000/contacts','POST',401),
    @('/api/records/offerten/test-offer/dispatch','POST',401),
    @('/api/records/offerten/test-offer/followup','POST',401),
    @('/api/internal/website-leads','POST',401),
    @('/api/internal/mail/tick','POST',401)
  )
  foreach($check in $checks) {
    $actual=HttpCode ($url.TrimEnd('/')+$check[0]) $check[1]
    if($actual -ne [int]$check[2]){
      throw ('HTTP probe failed: '+$check[1]+' '+$check[0]+' got '+$actual+' expected '+$check[2])
    }
  }
}
function Rollback {
  Write-Warning ('Restoring previous live revision: '+$expectedLive)
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$expectedLive+'=100') --project $project --region $region --quiet
  CheckExit 'CRITICAL: rollback command failed'
  if((ActiveRevision (ReadService)) -ne $expectedLive){
    throw 'CRITICAL: rollback could not be confirmed'
  }
  Write-Host ('ROLLBACK PASS: '+$expectedLive+' serves 100 percent')
}
foreach($command in @('gcloud.cmd','git','npm.cmd')) {
  if(!(Get-Command $command -ErrorAction SilentlyContinue)){throw ('Missing command: '+$command)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $branch=((& git branch --show-current) -join '').Trim()
  CheckExit 'git branch failed'
  if($branch -ne 'feature/crm-v2-cloud-staging-20261023'){throw 'Wrong Git branch'}
  $dirty=((& git status --porcelain) -join '').Trim()
  CheckExit 'git status failed'
  if($dirty){throw 'Uncommitted local changes: release aborted'}
  $html=Get-Content '.\crm-v2\public\index.html' -Raw -Encoding UTF8
  $backend=Get-Content '.\crm-v2\cloud-records.js' -Raw -Encoding UTF8
  $routes=Get-Content '.\crm-v2\server.js' -Raw -Encoding UTF8
  $tracking=Get-Content '.\crm-v2\offer-tracking.js' -Raw -Encoding UTF8
  foreach($marker in @('function renderOfferWorkflow(', 'function dueOfferFollowUps(',
    'function offerEmailDraft(', 'offer-workflow', 'Versand dokumentieren',
    'Nachfassen protokollieren', 'record', 'followUpDate',
    'Als angenommen markieren', 'Als abgelehnt markieren')) {
    if(!$html.Contains($marker)){throw ('Required offer UI missing: '+$marker)}
  }
  foreach($marker in @('async function recordOfferDispatch(', 'async function recordOfferFollowUp(',
    'status:', 'sentAt:date', "before.status==='Versendet'")) {
    if(!$backend.Contains($marker)){throw ('Offer backend missing: '+$marker)}
  }
  if(!$routes.Contains('const offerAction=pathname.match(') -or
     !$routes.Contains("if(!sameOrigin(req))return reply(res,403")) {
    throw 'Authenticated offer tracking endpoint missing'
  }
  if(!$tracking.Contains('function checkReadyForDispatch(') -or
     !$tracking.Contains('function normalizeFollowUpInput(')) {
    throw 'Offer tracking validation module missing'
  }

  Write-Host '1. CRM regression tests (no messages sent)'
  & npm.cmd test --prefix '.\crm-v2'
  CheckExit 'CRM tests failed: no Cloud Run changes'

  Write-Host '2. Verify current mail-enabled live deployment'
  $before=ReadService
  $expectedLive=ActiveRevision $before
  # The latest user-confirmed productive version includes the contact workflow.
  $previousTag=@($before.status.traffic | Where-Object {
    $_.tag -eq 'crm-contact-workflow' -and
    $_.revisionName -eq $expectedLive -and [int]$_.percent -eq 100
  })
  if($previousTag.Count -ne 1){
    throw ('Unexpected live CRM revision/tag. No changes applied: '+$expectedLive)
  }
  $old=ReadRevision $expectedLive
  if($old.spec.serviceAccountName -ne $expectedAccount){throw 'Unexpected CRM runtime identity'}
  if((EnvValue $old 'CRM_MAIL_ENABLED') -ne 'true'){throw 'Live mail delivery is not enabled'}
  if((EnvValue $old 'CRM_RECORD_PREFIX') -ne 'lszh_crm_v2_'){throw 'Unexpected Firestore namespace'}
  if((EnvValue $old 'CRM_WEBSITE_INTAKE_ENABLED') -ne 'true'){throw 'Website lead intake is not enabled'}
  $activeFrom=EnvValue $old 'CRM_MAIL_ACTIVE_FROM'
  $parsedCutoff=[DateTimeOffset]::MinValue
  if(!$activeFrom -or ![DateTimeOffset]::TryParse($activeFrom,[ref]$parsedCutoff)){
    throw 'Mail activation cutoff is missing/invalid'
  }
  $oldEnv=EnvSignature $old
  CheckScheduler (ReadScheduler)
  Probe $base

  Write-Host '3. Build tagged CRM offer tracking candidate with ZERO production traffic'
  & gcloud.cmd run deploy $service --source '.\crm-v2' --project $project --region $region --no-traffic ('--tag='+$tag) --quiet
  CheckExit 'Source build or no-traffic Cloud Run deployment failed'
  $after=ReadService
  if((ActiveRevision $after) -ne $expectedLive){throw 'ALARM: live traffic unexpectedly changed during candidate deploy'}
  $newName=[string]$after.status.latestReadyRevisionName
  if(!$newName -or $newName -eq $expectedLive){throw 'No new ready revision'}
  $new=ReadRevision $newName
  if($new.spec.serviceAccountName -ne $expectedAccount){throw 'Unexpected candidate runtime identity'}
  if((EnvSignature $new) -ne $oldEnv){throw 'Candidate changed an environment variable or secret reference'}
  if((EnvValue $new 'CRM_MAIL_ACTIVE_FROM') -ne $activeFrom){
    throw 'Candidate changed mail activation cutoff'
  }
  $tags=@($after.status.traffic | Where-Object {
    $_.tag -eq $tag -and $_.revisionName -eq $newName -and [int]$_.percent -eq 0
  })
  if($tags.Count -ne 1){throw 'Candidate tag does not point to zero-traffic revision'}
  Probe $tags[0].url
  CheckScheduler (ReadScheduler)
  Write-Host ('PASS: CRM offer tracking candidate '+$newName+' is healthy, existing live unchanged')

  Write-Host '4. Switch traffic; keep scheduler, Make and existing mail deduplication unchanged'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$newName+'=100') --project $project --region $region --quiet
  CheckExit 'Production traffic switch failed'
  if((ActiveRevision (ReadService)) -ne $newName){throw 'New revision does not serve 100 percent'}
  Probe $base
  CheckScheduler (ReadScheduler)
  $completed=$true
  Write-Host 'CRM OFFER TRACKING LIVE PASS'
  Write-Host ('LIVE: '+$newName+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$activeFrom)
  Write-Host 'No emails sent or past events replayed by this script.'
} finally {
  try {
    if($switched -and !$completed){Rollback}
  } finally {
    Pop-Location
  }
}
