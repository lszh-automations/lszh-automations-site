# LSZH CRM V2 - correct the visible invoice QR scissors print-layout defect in existing LIVE CRM.
# PRECONDITIONS: scissors-fixed 0%-candidate 00043-wur, Render geometric + optical QR tests PASS, bank Secret v1.
# No new revision, secret version, invoice, e-mail or Firestore mutation by this script.
# Explicit operator approval required. Rolls back to 00041-far on failed post-switch checks.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$expectedLive='lszh-crm-v2-00041-far'
$candidate='lszh-crm-v2-00043-wur'
$runtimeSA='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$secret='lszh-crm-v2-invoice-iban'
$tag='crm-invoice-layoutfix-qa'
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
# This fix must change ONLY code, not ANY existing live runtime setting or secret.
if((Signature $old) -cne (Signature $new)){
  throw 'PDF layoutfix candidate differs from live mail, lead, Firestore or secret configuration'
}
ExpectEnv $old 'CRM_INVOICE_QR_ENABLED' 'true'
ExpectEnv $new 'CRM_INVOICE_QR_ENABLED' 'true'
ExpectEnv $old 'CRM_INVOICE_PRODUCTION_APPROVED' 'true'
ExpectEnv $new 'CRM_INVOICE_PRODUCTION_APPROVED' 'true'
foreach($rev in @($old,$new)){
  $ibanVar=Item $rev 'CRM_INVOICE_IBAN'
  if(!$ibanVar -or $ibanVar.value -or
     $ibanVar.valueFrom.secretKeyRef.name -ne $secret -or
     [string]$ibanVar.valueFrom.secretKeyRef.key -ne '1'){
    throw 'A revision does not reference the exact pinned IBAN Secret Manager version 1'
  }
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
Write-Host 'The change repairs oversized scissors curves in manual Swiss QR PDFs on existing live CRM.'
Write-Host 'It does NOT automatically send invoices or change existing mail and lead workflows.'
$approval=Read-Host 'Freigabe des korrigierten Drucklayouts: genau LIVE QR LAYOUTFIX eingeben'
if($approval -cne 'LIVE QR LAYOUTFIX'){throw 'No explicit layoutfix approval. No traffic changed.'}
try{
  Write-Host '3/4: Route existing LIVE CRM domain to scissors-fixed QR candidate'
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
  Write-Host 'CRM SWISS QR LAYOUTFIX LIVE PASS'
  Write-Host ('LIVE: '+$candidate+' (100 percent)')
  Write-Host ('ROLLBACK: '+$expectedLive)
  Write-Host ('MAIL CUTOFF UNCHANGED: '+$expectedCutoff)
  Write-Host ('LOGIN: '+$base)
  Write-Host 'Corrected QR invoice layout now served to authenticated manual CRM PDF downloads. No invoice mail automation. Require visual PDF recheck before customer delivery.'
}finally{
  if($switched -and !$completed){Rollback}
}
