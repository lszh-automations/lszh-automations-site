# LSZH CRM V2: only allow explicit TEST_ONLY offer dispatch to approved inbox.
# Productive mail scheduler, existing Make lead mails, and Firestore stay untouched.
# This script prompts for the new offer Make webhook; never store it in git.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$previous='lszh-crm-v2-00030-ren'
$tag='crm-offer-send-test-only'
$secret='lszh-crm-v2-offer-make-hook'
$account='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$testTo='lars.schulthess@outlook.com'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$job='lszh-crm-v2-mail-tick'
$scheduler='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$switched=$false
$completed=$false

function Check([string]$message){
  if($LASTEXITCODE -ne 0){throw $message}
}
function ReadService{
  $raw=(& gcloud.cmd run services describe $service --project $project --region $region --format=json) -join [Environment]::NewLine
  Check 'Cloud Run service describe failed'
  return ($raw|ConvertFrom-Json)
}
function ReadRevision([string]$name){
  $raw=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json) -join [Environment]::NewLine
  Check ('Revision describe failed: '+$name)
  return ($raw|ConvertFrom-Json)
}
function ReadScheduler{
  $raw=(& gcloud.cmd scheduler jobs describe $job --project $project --location $region --format=json) -join [Environment]::NewLine
  Check 'Scheduler describe failed'
  return ($raw|ConvertFrom-Json)
}
function ActiveRevision($svc){
  $live=@($svc.status.traffic|Where-Object{[int]$_.percent -gt 0})
  if($live.Count -ne 1 -or [int]$live[0].percent -ne 100){throw 'Unexpected traffic split'}
  return [string]$live[0].revisionName
}
function EnvEntry($revision,[string]$key){
  $found=@(@($revision.spec.containers)[0].env|Where-Object{$_.name -eq $key})
  if($found.Count -ne 1){throw ('Missing/duplicate env: '+$key)}
  return $found[0]
}
function EnvCore($revision){
  $container=@($revision.spec.containers)[0]
  return (@($container.env|Where-Object{$_.name -notlike 'CRM_OFFER_MAIL_*'}|
    Sort-Object name|ForEach-Object{
      [pscustomobject]@{
        name=$_.name;value=$_.value
        valueFrom=($_.valueFrom|ConvertTo-Json -Depth 10 -Compress)
      }
    })|ConvertTo-Json -Depth 16 -Compress)
}
function HttpStatus([string]$url,[string]$method){
  try{
    $reply=Invoke-WebRequest -Uri $url -Method $method -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    return [int]$reply.StatusCode
  }catch{
    if(!$_.Exception.Response -or !$_.Exception.Response.StatusCode){throw}
    return [int]$_.Exception.Response.StatusCode
  }
}
function Probe([string]$url){
  foreach($v in @(
    @('/','GET',200),
    @('/api/config','GET',200),
    @('/api/records/leads','GET',401),
    @('/api/records/offerten/test-offer/send','POST',401),
    @('/api/internal/website-leads','POST',401),
    @('/api/internal/mail/tick','POST',401)
  )){
    $actual=HttpStatus ($url.TrimEnd('/')+$v[0]) $v[1]
    if($actual -ne [int]$v[2]){
      throw ('Unexpected HTTP '+$v[1]+' '+$v[0]+': '+$actual)
    }
  }
}
function CheckScheduler($j){
  if($j.state -ne 'ENABLED' -or $j.schedule -ne '* * * * *'){
    throw 'Existing mail scheduler must stay enabled every minute'
  }
  if($j.httpTarget.uri -ne ($base+'/api/internal/mail/tick') -or
     $j.httpTarget.httpMethod -ne 'POST' -or
     $j.httpTarget.oidcToken.serviceAccountEmail -ne $scheduler -or
     $j.httpTarget.oidcToken.audience -ne $base){
    throw 'Existing scheduler target or account changed'
  }
}
function CheckMode([string]$url,[bool]$enabled){
  $cfg=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -TimeoutSec 30 -Method GET
  if($enabled){
    if($cfg.offerMailEnabled -ne $true -or
       $cfg.offerMailMode -ne 'test_only' -or
       $cfg.offerMailTestTo -ne $testTo){
      throw 'ALARM: candidate not restricted to TEST_ONLY mailbox'
    }
  }elseif($cfg.offerMailEnabled -ne $false){
    throw 'ALARM: previous live could already send offers'
  }
}
function CheckRuntime($revision){
  if($revision.spec.serviceAccountName -ne $account){
    throw 'Unexpected CRM runtime identity'
  }
  if((EnvEntry $revision 'CRM_RECORD_PREFIX').value -ne 'lszh_crm_v2_'){
    throw 'Unexpected production Firestore prefix'
  }
  if((EnvEntry $revision 'CRM_WEBSITE_INTAKE_ENABLED').value -ne 'true'){
    throw 'Website lead intake not enabled'
  }
  if((EnvEntry $revision 'CRM_MAIL_ENABLED').value -ne 'true'){
    throw 'Existing lead mail disabled'
  }
  $activeFrom=(EnvEntry $revision 'CRM_MAIL_ACTIVE_FROM').value
  $test=[DateTimeOffset]::MinValue
  if(!$activeFrom -or ![DateTimeOffset]::TryParse($activeFrom,[ref]$test)){
    throw 'Mail deduplication activation cutoff missing'
  }
}
function Rollback{
  Write-Warning ('Restoring previous CRM revision: '+$previous)
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$previous+'=100') --project $project --region $region --quiet
  Check 'CRITICAL: rollback traffic failed'
  if((ActiveRevision (ReadService)) -ne $previous){
    throw 'CRITICAL: rollback could not be confirmed'
  }
  Write-Host 'ROLLBACK PASS'
}

foreach($tool in @('gcloud.cmd','git','npm.cmd','node')){
  if(!(Get-Command $tool -ErrorAction SilentlyContinue)){throw ('Missing tool: '+$tool)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $branch=((& git branch --show-current)-join '').Trim()
  Check 'Git branch failed'
  if($branch -ne 'feature/crm-v2-cloud-staging-20261023'){throw 'Wrong Git branch'}
  $dirty=((& git status --porcelain)-join '').Trim()
  Check 'Git status failed'
  if($dirty){throw 'Uncommitted code: abort'}

  Write-Host '1. CRM tests and live revision guard'
  & npm.cmd test --prefix '.\crm-v2'
  Check 'Regression tests failed before cloud changes'
  $current=ReadService
  if((ActiveRevision $current) -ne $previous){throw 'Different live revision, no change applied'}
  $old=ReadRevision $previous
  CheckRuntime $old
  CheckScheduler (ReadScheduler)
  Probe $base
  CheckMode $base $false
  $core=EnvCore $old

  Write-Host '2. Prepare offer-only Make URL in Secret Manager (no customer sends)'
  $allRaw=(& gcloud.cmd secrets list --project $project --format=json) -join [Environment]::NewLine
  Check 'Cannot list secrets in project'
  $found=@(($allRaw|ConvertFrom-Json)|Where-Object{
    $_.name -match ('/secrets/'+[regex]::Escape($secret)+'$')
  })
  if($found.Count -gt 1){throw 'Duplicate offer webhook secrets detected'}
  if($found.Count -eq 0){
    & gcloud.cmd secrets create $secret --project $project --replication-policy=automatic --quiet
    Check 'Cannot create offer Make secret'
  }
  $rawVersions=(& gcloud.cmd secrets versions list $secret --project $project --format=json) -join [Environment]::NewLine
  Check 'Cannot list offer Make secret versions'
  $versions=@($rawVersions|ConvertFrom-Json)
  $enabledVersions=@($versions|Where-Object{$_.state -eq 'ENABLED'})
  if($enabledVersions.Count -eq 0){
    $secure=Read-Host 'Paste NEW OFFERS Make webhook URL (hidden input; never paste in chat)' -AsSecureString
    $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try{$hook=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim()}
    finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)}
    if($hook -notmatch '^https://hook[.]eu1[.]make[.]com/[A-Za-z0-9]+$'){
      throw 'Wrong offer Make URL format'
    }
    $tmp=Join-Path $env:TEMP ('lszh-offer-'+[guid]::NewGuid().ToString('N')+'.tmp')
    try{
      [IO.File]::WriteAllText($tmp,$hook,([System.Text.UTF8Encoding]::new($false)))
      $hook=$null
      & gcloud.cmd secrets versions add $secret ('--data-file='+$tmp) --project $project --quiet | Out-Null
      Check 'Could not store offer Make secret version'
    }finally{if(Test-Path $tmp){Remove-Item $tmp -Force}}
  }else{
    Write-Host 'PASS: Existing enabled offer webhook Secret Manager version reused'
  }
  & gcloud.cmd secrets add-iam-policy-binding $secret --project $project ('--member=serviceAccount:'+$account) --role=roles/secretmanager.secretAccessor --quiet | Out-Null
  Check 'CRM cannot read offer Make secret'

  Write-Host '3. Deploy source with allowlisted TEST_ONLY sending at ZERO live traffic'
  $vars='CRM_OFFER_MAIL_ENABLED=true,CRM_OFFER_MAIL_TEST_TO='+$testTo
  $binding='CRM_OFFER_MAIL_WEBHOOK_URL='+$secret+':latest'
  & gcloud.cmd run deploy $service --source '.\crm-v2' --project $project --region $region --no-traffic ('--tag='+$tag) ('--update-env-vars='+$vars) ('--update-secrets='+$binding) --quiet
  Check 'Cloud Run offer test-only candidate build failed'
  $candidateService=ReadService
  if((ActiveRevision $candidateService) -ne $previous){
    throw 'ALARM: live traffic changed during candidate deployment'
  }
  $newName=[string]$candidateService.status.latestReadyRevisionName
  if(!$newName -or $newName -eq $previous){throw 'New candidate revision missing'}
  $new=ReadRevision $newName
  CheckRuntime $new
  if((EnvCore $new) -ne $core){throw 'Existing service env/secret settings changed'}
  if((EnvEntry $new 'CRM_OFFER_MAIL_ENABLED').value -ne 'true'){
    throw 'Offer enabled flag missing from candidate'
  }
  if((EnvEntry $new 'CRM_OFFER_MAIL_TEST_TO').value -ne $testTo){
    throw 'TEST_ONLY mailbox allowlist missing from candidate'
  }
  $ref=(EnvEntry $new 'CRM_OFFER_MAIL_WEBHOOK_URL').valueFrom.secretKeyRef
  if($ref.name -ne $secret){throw 'Offer webhook not supplied through Secret Manager'}
  $candidateTag=@($candidateService.status.traffic|Where-Object{
    $_.tag -eq $tag -and $_.revisionName -eq $newName -and [int]$_.percent -eq 0
  })
  if($candidateTag.Count -ne 1){throw 'Tagged candidate must have zero live traffic'}
  Probe $candidateTag[0].url
  CheckMode $candidateTag[0].url $true
  CheckScheduler (ReadScheduler)
  Write-Host ('PASS: TEST_ONLY candidate '+$newName+' ready; old live unchanged')

  Write-Host '4. Switch traffic; retain original mail scheduler and rollback revision'
  $switched=$true
  & gcloud.cmd run services update-traffic $service ('--to-revisions='+$newName+'=100') --project $project --region $region --quiet
  Check 'Could not route 100 percent to TEST_ONLY revision'
  if((ActiveRevision (ReadService)) -ne $newName){
    throw 'TEST_ONLY revision did not receive all traffic'
  }
  Probe $base
  CheckMode $base $true
  CheckScheduler (ReadScheduler)
  $completed=$true
  Write-Host 'CRM OFFER TEST ONLY LIVE PASS'
  Write-Host ('LIVE: '+$newName+' 100 percent')
  Write-Host ('ROLLBACK: '+$previous)
  Write-Host ('AUTOMATIC OFFER MAIL: TEST_ONLY to '+$testTo)
  Write-Host 'Existing customer emails, scheduler and mail cutoff unchanged.'
}finally{
  try{if($switched -and !$completed){Rollback}}finally{Pop-Location}
}
