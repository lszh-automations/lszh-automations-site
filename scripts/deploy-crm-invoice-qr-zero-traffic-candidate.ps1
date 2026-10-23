# CRM V2 Swiss-QR invoice release candidate. ZERO TRAFFIC ONLY.
# Operate from clean feature branch. Never sends invoices, triggers email or changes live traffic.
# Requires gcloud.cmd, git, node/npm. Run only after reviewing current production state.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-cloud-staging-20261023'
$knownLive='lszh-crm-v2-00038-gic'
$expectedSA='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$tag='crm-invoice-qr-qa'
function CheckExit([string]$label) { if($LASTEXITCODE -ne 0){throw $label} }
function Service {
  $json=(& gcloud.cmd run services describe $service --project $project --region $region --format=json) -join [Environment]::NewLine
  CheckExit 'Cannot describe CRM Cloud Run service'
  return ($json|ConvertFrom-Json)
}
function Revision([string]$name){
  $json=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json) -join [Environment]::NewLine
  CheckExit ('Cannot describe revision '+$name)
  return ($json|ConvertFrom-Json)
}
function Live($svc){
  $active=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($active.Count -ne 1 -or [int]$active[0].percent -ne 100){throw 'Unexpected production traffic split'}
  return [string]$active[0].revisionName
}
function Env($rev,[string]$name){
  $matched=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $name})
  if($matched.Count -eq 0){return ''}
  if($matched.Count -ne 1){throw ('Duplicate environment variable '+$name)}
  return [string]$matched[0].value
}
function Signature($rev){
  $items=@(@($rev.spec.containers)[0].env|Sort-Object name|ForEach-Object {
    [pscustomobject]@{name=$_.name;value=$_.value;valueFrom=($_.valueFrom|ConvertTo-Json -Depth 10 -Compress)}
  })
  return ($items|ConvertTo-Json -Depth 14 -Compress)
}
foreach($command in @('git','gcloud.cmd','npm.cmd')){
  if(!(Get-Command $command -ErrorAction SilentlyContinue)){throw ('Missing command '+$command)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  $current=((& git branch --show-current)-join '').Trim();CheckExit 'Cannot find Git branch'
  if($current -ne $branch){throw ('Wrong branch: '+$current)}
  $dirty=((& git status --porcelain)-join '').Trim();CheckExit 'Cannot check Git worktree'
  if($dirty){throw 'Git working tree is not clean'}
  $pdf=Get-Content '.\crm-v2\invoice-pdf.js' -Raw -Encoding UTF8
  $api=Get-Content '.\crm-v2\server.js' -Raw -Encoding UTF8
  if(!$pdf.Contains('function makeInvoicePdf') -or
     !$api.Contains('CRM_INVOICE_PRODUCTION_APPROVED') -or
     !$api.Contains('CRM_INVOICE_QR_ENABLED')){
    throw 'Swiss QR-PDF or production gating missing'
  }
  Write-Host '1/4: Run CRM regression tests locally'
  & npm.cmd install --prefix '.\crm-v2' --no-audit --no-fund;CheckExit 'Dependencies failed'
  & npm.cmd test --prefix '.\crm-v2';CheckExit 'CRM tests failed; no deployment'

  Write-Host '2/4: Verify protected production baseline'
  $before=Service
  if((Live $before) -ne $knownLive){throw ('Live revision changed; expected '+$knownLive)}
  $old=Revision $knownLive
  if($old.spec.serviceAccountName -ne $expectedSA){throw 'Service identity mismatch'}
  foreach($rule in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production')
  )){
    if((Env $old $rule[0]) -ne $rule[1]){throw ('Live safeguard mismatch: '+$rule[0])}
  }
  if((Env $old 'CRM_INVOICE_QR_ENABLED') -eq 'true' -or
     (Env $old 'CRM_INVOICE_PRODUCTION_APPROVED') -eq 'true'){
    throw 'Invoice export already enabled: stop, review live release'
  }
  if(!(Env $old 'CRM_MAIL_ACTIVE_FROM')){throw 'Existing lead mail cutoff missing'}
  $environment=Signature $old
  Write-Host '3/4: Build new Cloud Run revision with exactly ZERO traffic'
  & gcloud.cmd run deploy $service --source '.\crm-v2' --project $project --region $region --no-traffic ('--tag='+$tag) --quiet
  CheckExit 'No-traffic Cloud Run candidate deployment failed'
  $after=Service
  if((Live $after) -ne $knownLive){throw 'CRITICAL: active CRM traffic changed'}
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -eq $knownLive){throw 'No new ready candidate'}
  $new=Revision $candidate
  if($new.spec.serviceAccountName -ne $expectedSA){throw 'Candidate service identity mismatch'}
  if((Signature $new) -ne $environment){throw 'Candidate changed mail/lead env or secret references'}
  if((Env $new 'CRM_INVOICE_QR_ENABLED') -eq 'true' -or
     (Env $new 'CRM_INVOICE_PRODUCTION_APPROVED') -eq 'true'){
    throw 'CRITICAL: invoice export unexpectedly enabled'
  }
  $target=@($after.status.traffic | Where-Object {
    $_.tag -eq $tag -and $_.revisionName -eq $candidate -and [int]$_.percent -eq 0
  })
  if($target.Count -ne 1){throw 'QA tag must point only to zero-traffic candidate'}
  Write-Host '4/4: Verify non-mutating candidate endpoints'
  $r=Invoke-WebRequest -Uri ($target[0].url.TrimEnd('/')+'/api/config') -TimeoutSec 35 -UseBasicParsing
  if([int]$r.StatusCode -ne 200){throw 'Candidate config did not respond'}
  if((Live (Service)) -ne $knownLive){throw 'Active revision drifted after QA check'}
  Write-Host 'CRM INVOICE QR ZERO TRAFFIC CANDIDATE PASS'
  Write-Host ('CANDIDATE: '+$candidate+' (0 percent)')
  Write-Host ('CANDIDATE TAG URL: '+$target[0].url)
  Write-Host ('LIVE UNCHANGED: '+$knownLive+' (100 percent)')
  Write-Host 'INVOICE EXPORT DISABLED. NO EMAILS, REVISIONS SWITCHES OR FIRESTORE WRITES.'
} finally {
  Pop-Location
}
