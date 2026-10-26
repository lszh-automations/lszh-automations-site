# LSZH CRM V2 / STAGING ONLY. Does NOT run Make scenario and sends no email.
# Run ONLY while scenario 8162162 webhook is in learning mode.
param(
  [ValidateSet('no','yes')][string]$Avv='no'
)
$ErrorActionPreference='Stop'
$generator=Join-Path (Split-Path -Parent $PSScriptRoot) 'crm-v2\scripts\generate-contract-make-learn-sample.cjs'
if(!(Test-Path -LiteralPath $generator)){throw 'TEST_ONLY sample generator not found. First git pull --ff-only.'}
if(!(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Node.js is required.'}
$hook=$env:LSZH_CONTRACT_STAGING_WEBHOOK
if(!$hook){
  Write-Host 'Paste the webhook URL from the INACTIVE Make STAGING scenario 8162162.'
  $secret=Read-Host 'STAGING webhook URL (hidden)' -AsSecureString
  try{
    $hook=([pscredential]::new('LSZH_STAGING_WEBHOOK',$secret)).GetNetworkCredential().Password
  }finally{
    $secret=$null
  }
}
if($hook -cnotmatch '^https://hook\.eu1\.make\.com/[A-Za-z0-9]+$'){
  throw 'Wrong webhook URL. Only eu1.make.com STAGING webhook URLs are allowed.'
}
$json=& node.exe $generator $Avv
if($LASTEXITCODE -ne 0 -or !$json){throw 'Cannot generate TEST_ONLY schema payload.'}
$payload=$json | ConvertFrom-Json
$expectedCount=if($Avv -eq 'yes'){3}else{2}
if($payload.kind -cne 'contract_package_staging_mock' -or
   $payload.sendMode -cne 'staging_mock_only' -or
   $payload.neverSend -ne $true -or
   $payload.to -cne 'preview@example.invalid' -or
   @($payload.attachments).Count -ne $expectedCount){
  throw 'Unsafe staging payload refused BEFORE HTTP request.'
}
Write-Host ("TEST_ONLY Make-schema request: AVV="+$Avv+
  " | PDF attachments="+@($payload.attachments).Count+
  " | no customer email / no CRM writes")
# Make is in webhook learning mode; it captures a sample WITHOUT running modules.
# Do not treat HTTP acceptance as an email receipt.
try{
  $response=Invoke-WebRequest -Uri $hook -Method Post -Body $json -ContentType 'application/json; charset=utf-8' -Headers @{'X-LSZH-Test'='Schema-Learning-Only'} -UseBasicParsing
  Write-Host ('Make STAGING webhook HTTP '+[int]$response.StatusCode+
    '. Schema-learning request submitted; NO delivery confirmation.')
}catch{
  $code='unavailable'
  if($_.Exception.Response){$code=[int]$_.Exception.Response.StatusCode}
  throw ('Make STAGING schema capture failed (HTTP '+$code+
    '). NO automatic retry. Check scenario learning state and webhook address.')
}
