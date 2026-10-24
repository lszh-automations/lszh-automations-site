# LSZH CRM V2 – Invoice email zero-traffic candidate. NO customer sends.
# The LIVE CRM and current Make offer gateway must remain untouched.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-cloud-staging-20261023'
$expectedLive='lszh-crm-v2-00043-wur'
$tag='crm-invoice-mail-qa'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$secret='lszh-crm-v2-invoice-iban'
function Check([string]$why){if($LASTEXITCODE -ne 0){throw $why}}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json')-join [Environment]::NewLine
  Check 'Cloud Run service inspect failed'
  return ($raw|ConvertFrom-Json)
}
function Revision([string]$name){
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json')-join [Environment]::NewLine
  Check ('Cannot inspect revision '+$name)
  return ($raw|ConvertFrom-Json)
}
function LiveName($svc){
  $active=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){throw 'Unexpected traffic split'}
  return [string]$active[0].revisionName
}
function Env($rev,[string]$key){
  $m=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $key})
  if($m.Count -gt 1){throw ('Duplicate env '+$key)}
  if($m.Count -eq 0){return $null}
  return $m[0]
}
function Signature($rev){
  $items=@(@($rev.spec.containers)[0].env|Sort-Object name|ForEach-Object {
    [pscustomobject]@{name=$_.name;value=$_.value;valueFrom=($_.valueFrom|ConvertTo-Json -Depth 12 -Compress)}
  })
  return ($items|ConvertTo-Json -Depth 16 -Compress)
}
function HttpCode([string]$url){
  try{
    return [int](Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 35 -UseBasicParsing -ErrorAction Stop).StatusCode
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode){return [int]$_.Exception.Response.StatusCode}
    throw
  }
}
foreach($bin in @('git','npm.cmd','gcloud.cmd')){
  if(!(Get-Command $bin -ErrorAction SilentlyContinue)){throw ('Missing '+$bin)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try{
  $branchNow=((& git branch --show-current)-join '').Trim();Check 'Cannot inspect Git branch'
  if($branchNow -cne $branch){throw ('Wrong branch: '+$branchNow)}
  $dirty=((& git status --porcelain)-join '').Trim();Check 'Cannot inspect Git status'
  if($dirty){throw 'Uncommitted work; no deployment'}
  Write-Host '1/4: CRM invoice send tests'
  & npm.cmd test --prefix '.\crm-v2'
  Check 'CRM invoice send tests failed'
  Write-Host '2/4: Preserve existing live CRM, offer emails, lead scheduler and IBAN'
  $before=Service
  if((LiveName $before) -ne $expectedLive){throw 'Live CRM changed; stop'}
  $old=Revision $expectedLive
  if($old.spec.serviceAccountName -ne $serviceAccount){throw 'CRM identity changed'}
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM','2026-10-23T16:15:28Z'),
    @('CRM_INVOICE_QR_ENABLED','true'),
    @('CRM_INVOICE_PRODUCTION_APPROVED','true')
  )){
    $found=Env $old ([string]$pair[0])
    if(!$found -or $found.value -cne $pair[1]){throw ('Baseline environment drift: '+$pair[0])}
  }
  $i=Env $old 'CRM_INVOICE_IBAN'
  if(!$i -or $i.value -or $i.valueFrom.secretKeyRef.name -ne $secret -or
     [string]$i.valueFrom.secretKeyRef.key -ne '1'){
    throw 'Protected IBAN Secret v1 missing'
  }
  $enabled=Env $old 'CRM_INVOICE_MAIL_ENABLED'
  $approved=Env $old 'CRM_INVOICE_MAIL_PRODUCTION_APPROVED'
  if($enabled?.value -eq 'true' -or $approved?.value -eq 'true'){
    throw 'Invoice mail must remain disabled until separate explicit release'
  }
  $signature=Signature $old
  Write-Host '3/4: Build a new invoice email candidate with ZERO percent traffic'
  [string[]]$argv=@('run','deploy',$service,'--source=.\crm-v2',
    "--project=$project","--region=$region",'--no-traffic',"--tag=$tag",'--quiet')
  if($argv.Count -ne 9){throw 'Unexpected CLI argument count; no deployment'}
  & gcloud.cmd @argv
  Check 'Zero-traffic candidate build failed'
  $after=Service
  if((LiveName $after) -ne $expectedLive){throw 'CRITICAL: production CRM traffic changed'}
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -eq $expectedLive){throw 'Candidate not ready'}
  $new=Revision $candidate
  if($new.spec.serviceAccountName -ne $serviceAccount -or
     (Signature $new) -cne $signature){throw 'Changed production env, mail, secret or identity'}
  $route=@($after.status.traffic|Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($route.Count -ne 1){throw 'Candidate must have 0 percent traffic'}
  Write-Host '4/4: Read-only HTTP checks, no invoice or email'
  $url=[string]$route[0].url
  if((HttpCode ($url.TrimEnd('/')+'/api/config')) -ne 200){throw 'QA config failure'}
  if((HttpCode ($url.TrimEnd('/')+'/api/records/rechnungen/TEST_ONLY_NO_RECORD/send')) -ne 401){
    # GET requires auth first, and no unauthenticated sender invocation is allowed.
    throw 'Unauthorized send route not blocked'
  }
  if((LiveName (Service)) -ne $expectedLive){throw 'CRITICAL: live changed during verification'}
  Write-Host 'CRM INVOICE MAIL ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE: '+$candidate+' (0 percent)')
  Write-Host ('TAG URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$expectedLive+' (100 percent)')
  Write-Host 'Invoice mail flags disabled; no Gmail, Make, Firestore writes or customer emails.'
}finally{Pop-Location}
