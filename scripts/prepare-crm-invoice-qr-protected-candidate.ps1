# LSZH CRM V2 Swiss QR: protected candidate only, ALWAYS ZERO TRAFFIC.
# No real customer e-mails, payment initiation, CRM writes or 100% rollout.
$ErrorActionPreference='Stop'
$project='lszh-automations'
$region='europe-west6'
$service='lszh-crm-v2'
$branch='feature/crm-v2-cloud-staging-20261023'
$baseline='lszh-crm-v2-00038-gic'
$lastSafe='lszh-crm-v2-00040-dax'
$runtimeSA='lszh-crm-v2@lszh-automations.iam.gserviceaccount.com'
$secret='lszh-crm-v2-invoice-iban'
$tag='crm-invoice-qr-protected'
function Check([string]$message) { if($LASTEXITCODE -ne 0){throw $message} }
function Service {
  $raw=(& gcloud.cmd run services describe $service --project $project --region $region --format=json)-join [Environment]::NewLine
  Check 'Cannot read CRM service';return ($raw|ConvertFrom-Json)
}
function Revision([string]$name) {
  $raw=(& gcloud.cmd run revisions describe $name --project $project --region $region --format=json)-join [Environment]::NewLine
  Check ('Cannot read CRM revision '+$name);return ($raw|ConvertFrom-Json)
}
function LiveName($svc) {
  $l=@($svc.status.traffic|Where-Object {[int]$_.percent -gt 0})
  if($l.Count -ne 1 -or [int]$l[0].percent -ne 100){throw 'Unexpected CRM traffic split'}
  return [string]$l[0].revisionName
}
function Item($rev,[string]$name){
  $m=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -eq $name})
  if($m.Count -gt 1){throw ('Duplicate environment key '+$name)}
  if($m.Count -eq 0){return $null}
  return $m[0]
}
function Signature($rev,[string[]]$except=@()) {
  $list=@(@($rev.spec.containers)[0].env|Where-Object {$_.name -notin $except}|Sort-Object name|ForEach-Object {
    [pscustomobject]@{name=$_.name;value=$_.value;valueFrom=($_.valueFrom|ConvertTo-Json -Depth 10 -Compress)}
  })
  return ($list|ConvertTo-Json -Depth 15 -Compress)
}
function HttpCode([string]$uri){
  try {
    $r=Invoke-WebRequest -Uri $uri -Method GET -TimeoutSec 30 -UseBasicParsing -ErrorAction Stop
    return [int]$r.StatusCode
  }catch{
    if($_.Exception.Response -and $_.Exception.Response.StatusCode){
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}
function ValidIban([string]$value) {
  if($value -cnotmatch '^CH[0-9]{19}$' -or !$value.EndsWith('2002')){return $false}
  $s=$value.Substring(4)+$value.Substring(0,4)
  $rem=0
  foreach($char in $s.ToCharArray()){
    $n=[int][char]$char
    if($n -ge 48 -and $n -le 57){$rem=($rem*10+$n-48)%97}
    elseif($n -ge 65 -and $n -le 90){$rem=($rem*100+$n-55)%97}
    else{return $false}
  }
  $iid=[int]$value.Substring(4,5)
  return $rem -eq 1 -and !($iid -ge 30000 -and $iid -le 31999)
}
foreach($bin in @('git','npm.cmd','gcloud.cmd')){
  if(!(Get-Command $bin -ErrorAction SilentlyContinue)){throw ('Missing '+$bin)}
}
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
$secure=$null;$iban=$null;$pointer=[IntPtr]::Zero
try {
  $current=((& git branch --show-current)-join '').Trim();Check 'git branch failure'
  if($current -ne $branch){throw ('Wrong branch: '+$current)}
  $dirty=((& git status --porcelain)-join '').Trim();Check 'git status failure'
  if($dirty){throw 'Uncommitted changes; abort'}
  $before=Service
  if((LiveName $before) -ne $baseline){throw 'Live revision changed: abort'}
  $old=Revision $baseline
  $safe=Revision $lastSafe
  if($old.spec.serviceAccountName -ne $runtimeSA -or
     $safe.spec.serviceAccountName -ne $runtimeSA){throw 'Runtime identity mismatch'}
  if((Signature $old) -cne (Signature $safe)){throw 'Zero-traffic candidate changed existing production configuration'}
  foreach($pair in @(
    @('CRM_RECORD_PREFIX','lszh_crm_v2_'),
    @('CRM_WEBSITE_INTAKE_ENABLED','true'),
    @('CRM_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_ENABLED','true'),
    @('CRM_OFFER_MAIL_MODE','production'),
    @('CRM_MAIL_ACTIVE_FROM','2026-10-23T16:15:28Z')
  )){
    $item=Item $safe $pair[0]
    if(!$item -or $item.value -ne $pair[1]){throw ('Unexpected live config: '+$pair[0])}
  }
  foreach($name in @('CRM_INVOICE_QR_ENABLED','CRM_INVOICE_PRODUCTION_APPROVED','CRM_INVOICE_IBAN')){
    if(Item $safe $name){throw ('Old candidate already has '+$name)}
  }
  Write-Host '1/5 CRM regression tests'
  & npm.cmd test --prefix '.\crm-v2';Check 'CRM regression failed'
  Write-Host '2/5 Enter and verify IBAN securely (value is never committed or printed)'
  $secure=Read-Host 'Firmen-IBAN der LSZH Invest GmbH eingeben (verdeckte Eingabe)' -AsSecureString
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $iban=([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)-replace '\s','').ToUpperInvariant()
  if(!(ValidIban $iban)){throw 'IBAN checksum or expected last four digits invalid'}
  Write-Host 'Swiss regular IBAN and Modulo-97 PASS; ending 2002'
  $confirm=Read-Host 'Gehört dieses Konto laut Bankunterlagen der LSZH Invest GmbH? (JA/NEIN)'
  if($confirm -cne 'JA'){throw 'No ownership confirmation'}
  Write-Host '3/5 Secret Manager setup'
  $names=@(& gcloud.cmd secrets list --project $project --format='value(name)')
  Check 'Cannot list Secret Manager'
  $isExisting=$false
  foreach($name in $names){if(($name -split '/')[-1] -eq $secret){$isExisting=$true}}
  if(!$isExisting){
    & gcloud.cmd secrets create $secret --project $project --replication-policy=automatic --quiet
    Check 'Cannot create IBAN secret'
  }else {
    throw 'IBAN secret already exists. Stop and review instead of overwriting banking information.'
  }
  # PowerShell adds a newline on stdin; swiss-qr.js normalizes whitespace before validation.
  $result=@($iban | & gcloud.cmd secrets versions add $secret --project $project --data-file=- --format='value(name)')
  Check 'Cannot add IBAN secret version'
  $versionName=($result|Where-Object {$_ -match '(^|/)versions/([0-9]+)$' -or $_ -match '^[0-9]+$'}|Select-Object -Last 1)
  if(!$versionName){throw 'Cannot determine created secret version'}
  if($versionName -match '([0-9]+)$'){$version=$Matches[1]}
  else{throw 'Unknown secret version'}
  & gcloud.cmd secrets add-iam-policy-binding $secret --project $project --member=('serviceAccount:'+$runtimeSA) --role=roles/secretmanager.secretAccessor --quiet | Out-Null
  Check 'Secret access grant failed'
  Write-Host ('IBAN secret created: '+$secret+':'+$version+' (value hidden)')
  Write-Host '4/5 Deploy protected 0% release candidate'
  $args=@('run','deploy',$service,'--source=.\crm-v2','--project='+$project,'--region='+$region,
    '--no-traffic','--tag='+$tag,
    '--update-secrets=CRM_INVOICE_IBAN='+$secret+':'+$version,
    '--update-env-vars=CRM_INVOICE_QR_ENABLED=true,CRM_INVOICE_PRODUCTION_APPROVED=true','--quiet')
  & gcloud.cmd @args
  Check 'Cloud Run protected candidate deployment failed'
  $after=Service
  if((LiveName $after) -ne $baseline){throw 'CRITICAL: customer traffic changed'}
  $candidate=[string]$after.status.latestReadyRevisionName
  if(!$candidate -or $candidate -eq $lastSafe){throw 'Candidate not ready'}
  $revision=Revision $candidate
  if($revision.spec.serviceAccountName -ne $runtimeSA){throw 'Unexpected candidate identity'}
  $additions=@('CRM_INVOICE_IBAN','CRM_INVOICE_QR_ENABLED','CRM_INVOICE_PRODUCTION_APPROVED')
  if((Signature $revision $additions) -cne (Signature $old $additions)){throw 'Existing environment or secret configuration changed'}
  if((Item $revision 'CRM_INVOICE_QR_ENABLED').value -ne 'true' -or
     (Item $revision 'CRM_INVOICE_PRODUCTION_APPROVED').value -ne 'true'){
    throw 'Feature gates are not active on candidate'
  }
  $secretBinding=Item $revision 'CRM_INVOICE_IBAN'
  if(!$secretBinding -or $secretBinding.value -or
    $secretBinding.valueFrom.secretKeyRef.name -ne $secret -or
    [string]$secretBinding.valueFrom.secretKeyRef.key -ne [string]$version){
    throw 'IBAN must be linked to pinned Secret Manager version'
  }
  $qa=@($after.status.traffic|Where-Object {
    $_.tag -eq $tag -and $_.revisionName -eq $candidate -and [int]$_.percent -eq 0
  })
  if($qa.Count -ne 1){throw 'No isolated tagged 0% candidate'}
  Write-Host '5/5 Check tagged endpoints without actual invoices'
  $url=[string]$qa[0].url
  if((HttpCode ($url+'/api/config')) -ne 200){throw 'Candidate config failed'}
  if((HttpCode ($url+'/api/pdf/rechnung/TEST_ONLY_NOT_REAL')) -ne 401){throw 'Invoice endpoint missing auth'}
  if((LiveName (Service)) -ne $baseline){throw 'Production traffic drifted'}
  Write-Host 'CRM INVOICE QR PROTECTED ZERO TRAFFIC PASS'
  Write-Host ('CANDIDATE: '+$candidate+' (0 percent)')
  Write-Host ('TAG URL: '+$url)
  Write-Host ('LIVE UNCHANGED: '+$baseline+' (100 percent)')
  Write-Host 'No invoices, mail sends or Firestore writes were triggered.'
}finally{
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  $secure=$null;$iban=$null
  Pop-Location
}
