# LSZH CRM V2: switch to prepared mail-capable revision with mail DISABLED.
# Does not activate Make, Cloud Scheduler or CRM mail sending.
# Windows PowerShell 5.1 compatible. Roll back to known-good revision on failure.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$previous='lszh-crm-v2-00006-moz'
$candidate='lszh-crm-v2-00008-zog'
$tag='crm-v2-mail-prepared'
$schedulerJob='lszh-crm-v2-mail-tick'
$runtime='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$mailScheduler='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$switched=$false
$passed=$false
function Check-Exit([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function Read-Service{
  $json=(& gcloud.cmd run services describe $service --project $project --region $region --format=json) -join [Environment]::NewLine
  Check-Exit 'CRM Cloud Run service describe failed'
  return $json|ConvertFrom-Json
}
function Read-Revision([string]$name){
  $json=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json) -join [Environment]::NewLine
  Check-Exit ('CRM Cloud Run revision describe failed: '+$name)
  return $json|ConvertFrom-Json
}
function Active-Revision($svc){
  $active=@($svc.status.traffic|Where-Object{[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){throw 'Unexpected live traffic split'}
  return [string]$active[0].revisionName
}
function Get-Env($rev,[string]$key){
  $items=@(@($rev.spec.containers)[0].env|Where-Object{$_.name -eq $key})
  if($items.Count -ne 1){throw ('Missing or duplicate revision env var: '+$key)}
  return $items[0]
}
function Validate-Revisions {
  $old=Read-Revision $previous
  $new=Read-Revision $candidate
  if($old.spec.serviceAccountName -ne $runtime -or $new.spec.serviceAccountName -ne $runtime){
    throw 'Service account changed unexpectedly'
  }
  foreach($key in @('CRM_RECORD_PREFIX','CRM_WEBSITE_INTAKE_ENABLED','CRM_INGEST_SECRET','GOOGLE_OAUTH_CLIENT_ID','CRM_ALLOWED_EMAILS')){
    $before=Get-Env $old $key
    $after=Get-Env $new $key
    if(($before|ConvertTo-Json -Depth 8 -Compress) -ne ($after|ConvertTo-Json -Depth 8 -Compress)){
      throw ('Critical production env changed: '+$key)
    }
  }
  if((Get-Env $new 'CRM_RECORD_PREFIX').value -ne 'lszh_crm_v2_'){throw 'Candidate is not using live CRM Firestore prefix'}
  if((Get-Env $new 'CRM_WEBSITE_INTAKE_ENABLED').value -ne 'true'){throw 'Website intake unexpectedly disabled'}
  if((Get-Env $new 'CRM_MAIL_ENABLED').value -ne 'false'){throw 'Mail must be disabled during traffic cutover'}
  if((Get-Env $new 'CRM_MAIL_SCHEDULER_EMAIL').value -ne $mailScheduler){throw 'Wrong mail scheduler identity'}
  if((Get-Env $new 'CRM_MAIL_SCHEDULER_AUDIENCE').value -ne $base){throw 'Wrong scheduler OIDC audience'}
  $hook=Get-Env $new 'CRM_MAIL_WEBHOOK_URL'
  if($hook.valueFrom.secretKeyRef.name -ne 'lszh-crm-v2-mail-make-hook'){
    throw 'Mail Make URL is not coming from approved Secret Manager secret'
  }
  Write-Host 'PASS: Same CRM data, OAuth, website intake and runtime identity. Mail disabled.'
}
function Http-Code([string]$uri,[string]$method){
  try {
    $r=Invoke-WebRequest -Uri $uri -Method $method -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    return [int]$r.StatusCode
  }catch{
    if(!$_.Exception.Response -or !$_.Exception.Response.StatusCode){throw}
    return [int]$_.Exception.Response.StatusCode
  }
}
function Probe([string]$url){
  $checks=@(
    @('/','GET',200),
    @('/api/config','GET',200),
    @('/api/records/leads','GET',401),
    @('/api/internal/mail/tick','POST',404),
    @('/api/internal/website-leads','POST',401)
  )
  foreach($item in $checks){
    $actual=Http-Code ($url.TrimEnd('/')+$item[0]) $item[1]
    if($actual -ne [int]$item[2]){
      throw ('HTTP failed: '+$item[1]+' '+$item[0]+': got '+$actual+', expected '+$item[2])
    }
  }
  Write-Host ('PASS: authenticated API protected, disabled mail 404, website intake protected: '+$url)
}
function Scheduler-Paused {
  $raw=(& gcloud.cmd scheduler jobs describe $schedulerJob --project $project --location $region --format=json) -join [Environment]::NewLine
  Check-Exit 'Cloud Scheduler status could not be read'
  $job=$raw|ConvertFrom-Json
  if($job.state -ne 'PAUSED'){throw 'Mail Scheduler MUST remain PAUSED'}
  if($job.httpTarget.uri -ne ($base+'/api/internal/mail/tick') -or
    $job.httpTarget.oidcToken.serviceAccountEmail -ne $mailScheduler -or
    $job.httpTarget.oidcToken.audience -ne $base){throw 'Mail Scheduler configuration mismatch'}
  Write-Host 'PASS: Cloud Scheduler PAUSED and correctly targeted.'
}
function Rollback {
  Write-Warning ('Returning 100 percent traffic to '+$previous)
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$previous+'=100') --project $project --region $region --quiet
  Check-Exit 'CRITICAL: rollback command failed; manually inspect Cloud Run traffic'
  $svc=Read-Service
  if((Active-Revision $svc) -ne $previous){throw 'CRITICAL: rollback not confirmed'}
  Write-Host ('ROLLBACK PASS: '+$previous+' = 100 percent')
}
if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw 'gcloud.cmd missing'}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $branch=((& git branch --show-current)-join '').Trim()
  Check-Exit 'git branch failed'
  if($branch -ne 'feature/crm-v2-cloud-staging-20261023'){throw 'Wrong branch'}
  $dirty=((& git status --porcelain)-join '').Trim()
  Check-Exit 'git status failed'
  if($dirty){throw 'Local working tree has changes'}
  Write-Host '1. Test CRM code'
  & npm.cmd test --prefix '.\crm-v2'
  Check-Exit 'Tests failed: live revision unchanged'
  Write-Host '2. Verify live traffic and prepared 0 percent candidate'
  $before=Read-Service
  if((Active-Revision $before) -ne $previous){throw 'Unknown live revision: refusing to change traffic'}
  $tagged=@($before.status.traffic|Where-Object{$_.tag -eq $tag -and $_.revisionName -eq $candidate})
  if($tagged.Count -ne 1 -or [int]$tagged[0].percent -ne 0){throw 'Prepared candidate tag/0 percent traffic missing'}
  Validate-Revisions
  Scheduler-Paused
  Probe $tagged[0].url
  Write-Host '3. Move 100 percent traffic to prepared candidate; mail stays OFF'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$candidate+'=100') --project $project --region $region --quiet
  Check-Exit 'Cloud Run traffic shift failed'
  $current=Read-Service
  if((Active-Revision $current) -ne $candidate){throw 'New candidate did not receive 100 percent traffic'}
  Probe $base
  Scheduler-Paused
  $passed=$true
  Write-Host ('CUTOVER PASS: '+$candidate+' = 100 percent, mail OFF; '+$previous+' available for rollback.')
  Write-Host ('Scheduler remains PAUSED: '+$schedulerJob)
  Write-Host 'Make scenario 8135270 must remain INACTIVE until mail go-live.'
}finally {
  try {
    if($switched -and !$passed){Rollback}
  }finally {Pop-Location}
}
