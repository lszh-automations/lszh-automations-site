# LSZH CRM V2 - enable customer confirmation and internal mail notifications.
# PRODUCTION: This script activates customer emails. Run only when approved.
# Windows PowerShell 5.1 compatible. Make scenario 8135270 MUST be active.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$previous='lszh-crm-v2-00008-zog'
$tag='crm-v2-mail-go-live'
$job='lszh-crm-v2-mail-tick'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$runtime='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$scheduler='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$switched=$false
$done=$false
function Check-Exit([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function Read-Service{
  $raw=(& gcloud.cmd run services describe $service --project $project --region $region --format=json) -join [Environment]::NewLine
  Check-Exit 'Cloud Run describe failed'
  return ($raw|ConvertFrom-Json)
}
function Read-Revision([string]$name){
  $raw=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json) -join [Environment]::NewLine
  Check-Exit ('Revision describe failed: '+$name)
  return ($raw|ConvertFrom-Json)
}
function Read-Scheduler{
  $raw=(& gcloud.cmd scheduler jobs describe $job --project $project --location $region --format=json) -join [Environment]::NewLine
  Check-Exit 'Cloud Scheduler describe failed'
  return ($raw|ConvertFrom-Json)
}
function Live-Revision($svc){
  $live=@($svc.status.traffic|Where-Object{[int]$_.percent -gt 0})
  if($live.Count -ne 1 -or [int]$live[0].percent -ne 100){throw 'Unexpected traffic split'}
  return [string]$live[0].revisionName
}
function Env($rev,[string]$key){
  $matches=@(@($rev.spec.containers)[0].env|Where-Object{$_.name -eq $key})
  if($matches.Count -ne 1){throw ('Missing/duplicate env: '+$key)}
  return $matches[0]
}
function Check-Scheduler($j){
  if($j.state -ne 'PAUSED'){throw 'Scheduler must remain PAUSED until final step'}
  if($j.httpTarget.uri -ne ($base+'/api/internal/mail/tick') -or
     $j.httpTarget.httpMethod -ne 'POST' -or
     $j.httpTarget.oidcToken.serviceAccountEmail -ne $scheduler -or
     $j.httpTarget.oidcToken.audience -ne $base){
    throw 'Scheduler OIDC/target configuration differs'
  }
}
function HTTP-Code([string]$url,[string]$verb){
  try{
    $r=Invoke-WebRequest -Uri $url -Method $verb -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    return [int]$r.StatusCode
  }catch{
    if(!$_.Exception.Response -or !$_.Exception.Response.StatusCode){throw}
    return [int]$_.Exception.Response.StatusCode
  }
}
function Probe([string]$url,[int]$mailExpected){
  foreach($p in @(
    @('/','GET',200),
    @('/api/config','GET',200),
    @('/api/records/leads','GET',401),
    @('/api/internal/website-leads','POST',401),
    @('/api/internal/mail/tick','POST',$mailExpected)
  )){
    $actual=HTTP-Code ($url.TrimEnd('/')+$p[0]) $p[1]
    if($actual -ne [int]$p[2]){
      throw ('HTTP '+$p[1]+' '+$p[0]+': got '+$actual+', expected '+$p[2])
    }
  }
  Write-Host ('PASS: CRM HTTP and mail endpoint: '+$url)
}
function Pause-Scheduler{
  $j=Read-Scheduler
  if($j.state -ne 'PAUSED'){
    & gcloud.cmd scheduler jobs pause $job --project $project --location $region --quiet
    Check-Exit 'CRITICAL: Scheduler pause failed'
  }
}
function Rollback{
  Write-Warning ('Mail activation rollback to '+$previous)
  Pause-Scheduler
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$previous+'=100') --project $project --region $region --quiet
  Check-Exit 'CRITICAL: Cloud Run rollback command failed'
  if((Live-Revision (Read-Service)) -ne $previous){throw 'CRITICAL: traffic rollback not confirmed'}
  Write-Host ('ROLLBACK PASS: '+$previous+' 100 percent, Scheduler PAUSED')
}
if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw 'gcloud.cmd not installed'}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $branch=((& git branch --show-current)-join '').Trim()
  Check-Exit 'Git branch failed'
  if($branch -ne 'feature/crm-v2-cloud-staging-20261023'){throw 'Wrong branch'}
  $dirty=((& git status --porcelain)-join '').Trim()
  Check-Exit 'Git status failed'
  if($dirty){throw 'Git working tree dirty'}
  Write-Host '1. Regression tests'
  & npm.cmd test --prefix '.\crm-v2'
  Check-Exit 'CRM tests failed. Nothing changed in Cloud Run'
  Write-Host '2. Preflight old live revision and paused scheduler'
  $oldService=Read-Service
  if((Live-Revision $oldService) -ne $previous){throw 'Unexpected live revision; abort'}
  $oldRev=Read-Revision $previous
  if($oldRev.spec.serviceAccountName -ne $runtime){throw 'Unexpected runtime service account'}
  if((Env $oldRev 'CRM_MAIL_ENABLED').value -ne 'false'){throw 'Existing live mail already enabled'}
  if((Env $oldRev 'CRM_RECORD_PREFIX').value -ne 'lszh_crm_v2_'){throw 'Live CRM database prefix unexpected'}
  if((Env $oldRev 'CRM_WEBSITE_INTAKE_ENABLED').value -ne 'true'){throw 'Website lead intake disabled'}
  if((Env $oldRev 'CRM_MAIL_WEBHOOK_URL').valueFrom.secretKeyRef.name -ne 'lszh-crm-v2-mail-make-hook'){
    throw 'Mail webhook is not coming from the approved Secret Manager secret'
  }
  Check-Scheduler (Read-Scheduler)
  Probe $base 404
  Write-Host '3. Create 0 percent mail-enabled revision (no outgoing messages yet)'
  # Only leads written after this point qualify. All existing leads are excluded.
  $activeFrom=[DateTimeOffset]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  $mailVars='CRM_MAIL_ENABLED=true,CRM_MAIL_ACTIVE_FROM='+$activeFrom
  & gcloud.cmd run services update $service ('--update-env-vars='+$mailVars) --no-traffic ('--tag='+$tag) --project $project --region $region --quiet
  Check-Exit 'Could not create 0 percent mail-enabled revision'
  $candidateService=Read-Service
  if((Live-Revision $candidateService) -ne $previous){throw 'ALARM: traffic changed unexpectedly'}
  $newName=[string]$candidateService.status.latestReadyRevisionName
  if(!$newName -or $newName -eq $previous){throw 'New mail revision is missing'}
  $tags=@($candidateService.status.traffic|Where-Object{$_.tag -eq $tag -and $_.revisionName -eq $newName -and [int]$_.percent -eq 0})
  if($tags.Count -ne 1){throw 'Mail candidate not accessible at 0 percent tagged traffic'}
  $newRev=Read-Revision $newName
  if($newRev.spec.serviceAccountName -ne $runtime){throw 'Unexpected runtime service account on candidate'}
  $oldImage=[string](@($oldRev.spec.containers)[0].image)
  $newImage=[string](@($newRev.spec.containers)[0].image)
  if($newImage -ne $oldImage){throw 'Application image unexpectedly changed'}
  foreach($key in @('CRM_RECORD_PREFIX','CRM_WEBSITE_INTAKE_ENABLED','CRM_INGEST_SECRET',
    'GOOGLE_OAUTH_CLIENT_ID','CRM_ALLOWED_EMAILS','CRM_MAIL_WEBHOOK_URL',
    'CRM_MAIL_SCHEDULER_EMAIL','CRM_MAIL_SCHEDULER_AUDIENCE')){
    $a=Env $oldRev $key
    $b=Env $newRev $key
    if(($a|ConvertTo-Json -Depth 8 -Compress) -ne ($b|ConvertTo-Json -Depth 8 -Compress)){
      throw ('Critical configuration changed: '+$key)
    }
  }
  if((Env $newRev 'CRM_MAIL_ENABLED').value -ne 'true' -or
     (Env $newRev 'CRM_MAIL_ACTIVE_FROM').value -ne $activeFrom){
    throw 'Candidate mail activation timestamp incorrect'
  }
  Probe $tags[0].url 401
  Check-Scheduler (Read-Scheduler)
  Write-Host ('PASS: Mail candidate ready '+$newName+'; activation cutoff (UTC): '+$activeFrom)
  Write-Host '4. Switch CRM to mail-enabled revision'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$newName+'=100') --project $project --region $region --quiet
  Check-Exit 'Mail candidate traffic shift failed'
  if((Live-Revision (Read-Service)) -ne $newName){throw 'Mail revision is not serving 100 percent traffic'}
  Probe $base 401
  Check-Scheduler (Read-Scheduler)
  Write-Host '5. Configure paused Cloud Scheduler to once per minute'
  & gcloud.cmd scheduler jobs update http $job --project $project --location $region '--schedule=* * * * *' '--time-zone=Etc/UTC' '--max-retry-attempts=0' --quiet
  Check-Exit 'Could not update Scheduler cadence'
  $j=Read-Scheduler
  Check-Scheduler $j
  if($j.schedule -ne '* * * * *'){throw 'Scheduler schedule is not once per minute'}
  Write-Host '6. Resume Cloud Scheduler (THIS ACTIVATES CUSTOMER EMAILS)'
  & gcloud.cmd scheduler jobs resume $job --project $project --location $region --quiet
  Check-Exit 'Scheduler resume failed'
  $enabledJob=Read-Scheduler
  if($enabledJob.state -ne 'ENABLED' -or $enabledJob.schedule -ne '* * * * *'){
    throw 'Live Scheduler enabled state could not be verified'
  }
  if((Live-Revision (Read-Service)) -ne $newName){throw 'Unexpected CRM traffic after resuming Scheduler'}
  $done=$true
  Write-Host 'MAIL GO-LIVE PASS: Website customer confirmation + internal new lead + conditional 24h reminder enabled.'
  Write-Host ('LIVE REVISION: '+$newName+' 100 percent')
  Write-Host ('ACTIVATION CUTOFF UTC: '+$activeFrom)
  Write-Host ('SCHEDULER ENABLED: '+$job+', once per minute')
  Write-Host 'ROLLBACK: scheduler pause plus traffic to lszh-crm-v2-00008-zog=100'
}finally{
  try{
    if($switched -and !$done){Rollback}
  }finally{Pop-Location}
}
