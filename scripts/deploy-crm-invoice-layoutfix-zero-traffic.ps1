# LSZH CRM V2 – Swiss QR PDF scissors regression FIX, zero-traffic candidate.
# Safe release preparation only. NO user invoices, NO mail sends, NO traffic switch.
# Baseline: LIVE lszh-crm-v2-00041-far (100 %), prior rollback 00038-gic.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-cloud-staging-20261023'
$expectedLive='lszh-crm-v2-00041-far'
$tag='crm-invoice-layoutfix-qa'
$serviceAccount='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$secret='lszh-crm-v2-invoice-iban'
function Check([string]$reason){if($LASTEXITCODE -ne 0){throw $reason}}
function Service {
  $raw=(& gcloud.cmd run services describe $service "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check 'Cannot inspect Cloud Run CRM'
  return ($raw | ConvertFrom-Json)
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name "--project=$project" "--region=$region" '--format=json') -join [Environment]::NewLine
  Check ('Cannot inspect CRM revision '+$name)
  return ($raw | ConvertFrom-Json)
}
function LiveName($s){
  $active=@($s.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){throw 'Unexpected CRM traffic split'}
  return [string]$active[0].revisionName
}
function Config($rev,[string]$key){
  $v=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $key})
  if($v.Count -ne 1){throw ('Missing/duplicate CRM configuration '+$key)}
  return $v[0]
}
function Signature($rev){
  return (@(@($rev.spec.containers)[0].env|Sort-Object name|ForEach-Object {
    [pscustomobject]@{name=$_.name;value=$_.value;valueFrom=($_.valueFrom|ConvertTo-Json -Depth 12 -Compress)}
  })|ConvertTo-Json -Depth 16 -Compress)
}
function HttpCode([string]$url){
  try {
    $r=Invoke-WebRequest -Uri $url -Method GET -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    return [int]$r.StatusCode
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode){
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}
foreach($cmd in @('git','npm.cmd','gcloud.cmd')){
  if(!(Get-Command $cmd -ErrorAction SilentlyContinue)){throw ('Missing '+$cmd)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $current=((& git branch --show-current)-join '').Trim();Check 'git branch failed'
  if($current -ne $branch){throw ('Wrong branch: '+$current)}
  $dirty=((& git status --porcelain)-join '').Trim();Check 'git status failed'
  if($dirty){throw 'Uncommitted work detected: preserve it, do not deploy'}
  $source=Get-Content '.\crm-v2\invoice-pdf.js' -Raw -Encoding UTF8
  $checker=Get-Content '.\crm-v2\scripts\invoice-qr-scan.py' -Raw -Encoding UTF8
  if(!$source.Contains('xScale:2.5,yScale:2.5') -or
     $source.Contains('width:5,height:5') -or
     !$checker.Contains('oversized scissors curve')){
    throw 'QR scissors fix or independent PDF regression check missing'
  }
  Write-Host '1/4: Run non-sending CRM regression tests'
  & npm.cmd test --prefix '.\crm-v2'
  Check 'CRM tests failed'
  Write-Host '2/4: Validate current 100% LIVE revision and protected IBAN configuration'
  $before=Service
  if((LiveName $before) -ne $expectedLive){throw ('Live changed, expected '+$expectedLive)}
  $old=Revision $expectedLive
  if($old.spec.serviceAccountName -ne $serviceAccount){throw 'CRM service identity changed'}
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM','2026-10-23T16:15:28Z'),
    @('CRM_INVOICE_QR_ENABLED','true'),
    @('CRM_INVOICE_PRODUCTION_APPROVED','true')
  )){
    if([string](Config $old $pair[0]).value -cne [string]$pair[1]){
      throw ('Protected baseline mismatch: '+$pair[0])
    }
  }
  $iban=Config $old 'CRM_INVOICE_IBAN'
  if($iban.value -or $iban.valueFrom.secretKeyRef.name -ne $secret -or
     [string]$iban.valueFrom.secretKeyRef.key -ne '1'){
    throw 'Expected secret-pinned company IBAN is not present'
  }
  $saved=Signature $old
  Write-Host '3/4: Build one FIX candidate with ZERO traffic; no mail/secret modifications'
  [string[]]$deployArgs=@(
    'run','deploy',$service,
    '--source=.\crm-v2',
    "--project=$project",
    "--region=$region",
    '--no-traffic',
    "--tag=$tag",
    '--quiet'
  )
  if($deployArgs.Count -ne 9){throw 'Unexpected deploy argument count; no deployment'}
  & gcloud.cmd @deployArgs
  Check '0%-traffic layoutfix deploy failed'
  $after=Service
  if((LiveName $after) -ne $expectedLive){throw 'CRITICAL: CRM production traffic changed'}
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -eq $expectedLive){throw 'No new ready candidate'}
  $fresh=Revision $candidate
  if($fresh.spec.serviceAccountName -ne $serviceAccount -or
     (Signature $fresh) -cne $saved){
    throw 'Candidate service account or mail/lead/QR secret configuration differs from live'
  }
  $tagged=@($after.status.traffic|Where-Object {
    $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
  })
  if($tagged.Count -ne 1){throw 'Wrong 0%-candidate tag/traffic'}
  Write-Host '4/4: Read-only tagged candidate smoke checks'
  $url=[string]$tagged[0].url
  if((HttpCode ($url.TrimEnd('/')+'/api/config')) -ne 200){throw 'Candidate config failed'}
  if((HttpCode ($url.TrimEnd('/')+'/api/pdf/rechnung/TEST_ONLY_NOT_REAL')) -ne 401){
    throw 'Candidate invoice PDF auth missing'
  }
  if((LiveName (Service)) -ne $expectedLive){throw 'CRITICAL: live CRM traffic drifted'}
  Write-Host 'CRM INVOICE LAYOUTFIX ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE: '+$candidate+' (0 percent)')
  Write-Host ('TAG URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$expectedLive+' (100 percent)')
  Write-Host 'No invoices or mails sent. Existing company IBAN Secret version 1 retained.'
} finally {
  Pop-Location
}
