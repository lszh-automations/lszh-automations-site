# Synthetic 2/3 PDF Make STAGING smoke test. It expects HTTP 423 (hard-deny).
# NEVER sends email or invokes the production CRM. Run only for scenario 8162162.
param([ValidateSet('no','yes')][string]$Avv='no')
$ErrorActionPreference='Stop'
$generator=Join-Path (Split-Path -Parent $PSScriptRoot) 'crm-v2\scripts\generate-contract-make-learn-sample.cjs'
if(!(Test-Path -LiteralPath $generator)){throw 'Generator missing. Run git pull --ff-only.'}
if(!(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Node.js not found.'}
$hook=$env:LSZH_CONTRACT_STAGING_WEBHOOK
if(!$hook){
  Write-Host 'Use ONLY STAGING scenario 8162162 webhook URL, never the production scenario.'
  $secret=Read-Host 'STAGING webhook URL (hidden)' -AsSecureString
  try{
    $hook=([pscredential]::new('LSZH_STAGING_WEBHOOK',$secret)).GetNetworkCredential().Password
  }finally{$secret=$null}
}
if($hook -cnotmatch '^https://hook\.eu1\.make\.com/[A-Za-z0-9]+$'){
  throw 'Not a eu1.make.com webhook URL; refusing to send.'
}
$json=& node.exe $generator $Avv
if($LASTEXITCODE -ne 0 -or !$json){throw 'TEST_ONLY generator failed.'}
$payload=$json | ConvertFrom-Json
$expectedCount=if($Avv -eq 'yes'){3}else{2}
$kinds=if($Avv -eq 'yes'){@('offer','terms','avv')}else{@('offer','terms')}
if($payload.kind -cne 'contract_package_staging_mock' -or
   $payload.sendMode -cne 'staging_mock_only' -or
   $payload.neverSend -ne $true -or
   $payload.to -cne 'preview@example.invalid' -or
   $payload.attachmentCount -ne $expectedCount -or
   @($payload.attachments).Count -ne $expectedCount){
  throw 'Unsafe package blocked before POST.'
}
for($i=0;$i -lt $expectedCount;$i++){
  $a=$payload.attachments[$i]
  if($a.kind -cne $kinds[$i] -or
     $a.filename -cnotmatch '^TEST_ONLY_[A-Za-z0-9_.-]+\.pdf$' -or
     $a.mimeType -cne 'application/pdf'){
    throw 'Non-test or out-of-order attachment blocked before POST.'
  }
}
Write-Host ("TEST_ONLY Make smoke: AVV="+$Avv+
 " | attachments="+$expectedCount+
 " | provider=NONE | no production CRM or email")
$status=0
$body=''
try{
  $res=Invoke-WebRequest -Uri $hook -Method Post -Body $json -ContentType 'application/json; charset=utf-8' -Headers @{'X-LSZH-Test'='STAGING-Blocked-Smoke'} -UseBasicParsing
  $status=[int]$res.StatusCode
  $body=[string]$res.Content
}catch{
  $response=$_.Exception.Response
  if(!$response){throw 'Make STAGING transport failed; no retry. Inspect Make history.'}
  $status=[int]$response.StatusCode
  $stream=$response.GetResponseStream()
  if($null -ne $stream){
    $reader=New-Object System.IO.StreamReader($stream)
    try{$body=$reader.ReadToEnd()}finally{$reader.Dispose()}
  }
}
# An inactive Make webhook can return 200 Accepted while simply queueing the
# request. DO NOT interpret that as a successful runtime test.
if($status -ne 423){
  throw ('UNCONFIRMED: HTTP '+$status+'. Expected strict 423; inspect Make queue. No automatic retry.')
}
$receipt=$null
try{$receipt=$body | ConvertFrom-Json}catch{
  throw 'HTTP 423 received but deny JSON missing or invalid.'
}
if($receipt.ok -ne $false -or
   $receipt.error -cne 'STAGING_CONTRACT_NOT_ENABLED' -or
   $receipt.transmitted -ne $false -or
   $receipt.provider -cne 'NONE' -or
   $null -ne $receipt.messageId){
  throw 'HTTP 423 deny response did not match expected safe contract.'
}
Write-Host ('Make STAGING deny response VERIFIED: HTTP 423 | transmitted=false | messageId=null')
Write-Host 'Next: inspect Make execution history to confirm Iterator x2/x3 and Aggregator x1.'
