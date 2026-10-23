# LSZH CRM V2 - release Swiss QR invoice PDF into existing LIVE CRM.
# PRECONDITIONS: protected 0%-candidate 00041-far, SIX+optical tests PASS, bank Secret v1.
# No new revision, secret version, invoice, e-mail or Firestore mutation by this script.
# Explicit operator approval required. Rolls back to 00038-gic on failed post-switch checks.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='lszh-crm-v2-00038-gic'
$candidate='lszh-crm-v2-00041-far'
$runtimeSA='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$secret='lszh-crm-v2-invoice-iban'
$tag='crm-invoice-qr-protected'
$base='https://lszh-crm-v2-ozx7mp2bka-oa.a.run.app'
$mailJob='lszh-crm-v2-mail-tick'
$schedulerSA='lszh-crm-mail-scheduler@lszh-automations.iam.gserviceaccount.com'
$expectedCutoff='2026-10-23T16:15:28Z'
$switched=$false
$completed=$false
function Check([string]$message){if($LASTEXITCODE -ne 0){throw $message}}
function Service {
  $raw=(& gcloud.cmd run services describe $service --project $project --region $region --format=json)-join [Environment]::NewLine
  Check 'Cannot read CRM Cloud Run service'
  return ($raw|ConvertFrom-Json)
}
function Revision([string]$name){
  $raw=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json)-join [Environment]::NewLine
  Check ('Cannot read CRM revision '+$name)
  return ($raw|ConvertFrom-Json)
}
function LiveName($svc){
  $found=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($found.Count -ne 1 -or [int]$found[0].percent -ne 100){throw 'Unexpected production CRM traffic split'}
  return [string]$found[0].revisionName
}
function Item($rev,[string]$name){
  $m=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $name})
  if($m.Count -gt 1){throw ('Duplicate variable '+$name)}
  if($m.Count -eq 0){return $null}
  return $m[0]
}
function Signature($rev,[string[]]$omit=@()){
  $data=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -notin $omit}|Sort-Object name|ForEach-Object {
    [pscustomobject]@{
      name=$_.name
      value=$_.value
      valueFrom=($_.valueFrom|ConvertTo-Json -Depth 10 -Compress)
    }
  })
  return ($data|ConvertTo-Json -Depth 15 -Compress)
}
function ExpectEnv($rev,[string]$name,[string]$expected){
  $v=Item $rev $name
  if(!$v -or [string]$v.value -cne $expected){throw ('Unexpected environment value '+$name)}
}
function CheckMailScheduler {
  $raw=(& gcloud.cmd scheduler jobs describe $mailJob --project $project --location $region --format=json)-join [Environment]::NewLine
  Check 'Cannot read existing mail scheduler'
  $job=$raw|ConvertFrom-Json
  if($job.state -ne 'ENABLED' -or $job.schedule -ne '* * * * *' -or
    $job.httpTarget.uri -ne ($base+'/api/internal/mail/tick') -or
    $job.httpTarget.httpMethod -ne 'POST' -or
    $job.httpTarget.oidcToken.serviceAccountEmail -ne $schedulerSA -or
    $job.httpTarget.oidcToken.audience -ne $base){
    throw 'Existing Cloud Scheduler contract unexpectedly changed'
  }
}
function Http([string]$url){
  try{
    return Invoke-WebRequest -Uri $url -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode){
      return [pscustomobject]@{StatusCode=[int]$_.Exception.Response.StatusCode;Content=''}
    }
    throw
  }
}
function CheckWeb([string]$url){
  # $HOME is a read-only PowerShell automatic variable (case-insensitive).
  $homepageResponse=Http ($url.TrimEnd('/')+'/')
  if([int]$homepageResponse.StatusCode -ne 200 -or [string]$homepageResponse.Content -notmatch 'id="invoicePdf"'){
    throw ('CRM frontend missing Swiss QR invoice button at '+$url)
  }
  $config=Invoke-RestMethod -Uri ($url.TrimEnd('/')+'/api/config') -Method GET -TimeoutSec 30
  if($config.offerMailEnabled -ne $true -or $config.offerMailMode -ne 'production' -or $config.offerMailTestTo){
    throw ('Existing manual offer mail settings changed at '+$url)
  }
  $unauth=Http ($url.TrimEnd('/')+'/api/pdf/rechnung/TEST_ONLY_NOT_REAL')
  if([int]$unauth.StatusCode -ne 401){
    throw ('Unauthenticated Swiss QR invoice access not blocked at '+$url)
  }
}
function Rollback {
  Write-Warning ('Restoring the existing CRM version '+$expectedLive)
  $arg='--to-revisions='+$expectedLive+'=100'
  & gcloud.cmd run services update-traffic $service $arg "--project=$project" "--region=$region" '--quiet'
  Check 'CRITICAL: CRM rollback command failed; inspect Cloud Run immediately'
  if((LiveName (Service)) -ne $expectedLive){throw 'CRITICAL: Cannot confirm the existing live revision'}
  Write-Host ('ROLLBACK PASS: '+$expectedLive+' (100 percent)')
}
if(!(Get-Command gcloud.cmd -ErrorAction SilentlyContinue)){throw 'gcloud.cmd is required'}
Write-Host '1/4: Verify existing live CRM revision, secret and mail operations'
$before=Service
if((LiveName $before) -ne $expectedLive){throw 'CRM live revision has changed. Stop, do not switch traffic.'}
$old=Revision $expectedLive
$new=Revision $candidate
if($old.spec.serviceAccountName -ne $runtimeSA -or $new.spec.serviceAccountName -ne $runtimeSA){
  throw 'Unexpected CRM service account'
}
foreach($pair in @(
  @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
  @('CRM_WEBSITE_INTAKE_ENABLED','true'),
  @('CRM_MAIL_ENABLED','true'),
  @('CRM_OFFER_MAIL_ENABLED','true'),
  @('CRM_OFFER_MAIL_MODE','production'),
  @('CRM_MAIL_ACTIVE_FROM',$expectedCutoff)
)){
  ExpectEnv $old $pair[0] $pair[1]
  ExpectEnv $new $pair[0] $pair[1]
}
if(Item $old 'CRM_OFFER_MAIL_TEST_TO'){throw 'Live test email override should not be present'}
if(Item $new 'CRM_OFFER_MAIL_TEST_TO'){throw 'Candidate test email override should not be present'}
$allowedDelta=@('CRM_INVOICE_IBAN','CRM_INVOICE_QR_ENABLED','CRM_INVOICE_PRODUCTION_APPROVED')
if((Signature $old $allowedDelta) -cne (Signature $new $allowedDelta)){
  throw 'Candidate changed existing mail, lead, Firestore or service secrets'
}
foreach($key in $allowedDelta){
  if(Item $old $key){throw ('Existing live revision unexpectedly has '+$key)}
}
ExpectEnv $new 'CRM_INVOICE_QR_ENABLED' 'true'
ExpectEnv $new 'CRM_INVOICE_PRODUCTION_APPROVED' 'true'
$ibanVar=Item $new 'CRM_INVOICE_IBAN'
if(!$ibanVar -or $ibanVar.value -or
   $ibanVar.valueFrom.secretKeyRef.name -ne $secret -or
   [string]$ibanVar.valueFrom.secretKeyRef.key -ne '1'){
  throw 'Candidate does not reference protected pinned IBAN Secret Manager version 1'
}
$target=@($before.status.traffic|Where-Object {
  $_.revisionName -eq $candidate -and $_.tag -eq $tag -and [int]$_.percent -eq 0
})
if($target.Count -ne 1){throw 'Candidate must be an explicitly tagged 0% revision'}
CheckMailScheduler
Write-Host '2/4: Verify tagged QR candidate WITHOUT changing live traffic'
CheckWeb ([string]$target[0].url)
Write-Host ('QA candidate verified: '+$candidate+' (0 percent)')
Write-Host ('Current production: '+$expectedLive+' (100 percent)')
Write-Host 'The change enables manually downloaded PAYABLE Swiss QR invoice PDFs in existing live CRM.'
Write-Host 'It does NOT automatically send invoices or change existing mail and lead workflows.'
$approval=Read-Host 'Zur Freigabe genau LIVE QR PDF eingeben'
if($approval -cne 'LIVE QR PDF'){throw 'No explicit rollout approval. No traffic changed.'}
try{
  Write-Host '3/4: Route existing LIVE CRM domain to approved QR candidate'
  $arg='--to-revisions='+$candidate+'=100'
  $switched=$true
  & gcloud.cmd run services update-traffic $service $arg "--project=$project" "--region=$region" '--quiet'
  Check 'Traffic migration failed'
  if((LiveName (Service)) -ne $candidate){throw 'New candidate is not receiving exactly 100 percent'}
  Write-Host '4/4: Verify public CRM frontend, auth and existing mail configuration'
  CheckWeb $base
  CheckMailScheduler
  if((LiveName (Service)) -ne $candidate){throw 'Traffic changed during verification'}
  $completed=$true
  Write-Host 'CRM SWISS QR PDF LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$expectedCutoff)
  Write-Host ('LOGIN: '+$base)
  Write-Host 'Swiss QR PDF download is active ONLY after signed-in manual CRM action. No invoice mail automation.'
}finally{
  if($switched -and !$completed){Rollback}
}
