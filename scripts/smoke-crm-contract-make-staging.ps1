# Synthetic 2/3 PDF Make STAGING smoke test. Expect exact HTTP 423 deny JSON.
# NEVER sends email or invokes production CRM. Only scenario 8162162.
# Windows PowerShell 5.1: HttpClient reads body even for HTTP 4xx responses.
param(
  [ValidateSet('no','yes')][string]$Avv='no',
  [switch]$SelfTest
)
$ErrorActionPreference='Stop'

function Assert-MakeStagingDeny {
  param([int]$Status,[AllowEmptyString()][string]$Body)
  # An inactive Make webhook can return 200 Accepted while queueing the
  # request. HTTP 200 is never proof of a successful runtime smoke test.
  if($Status -ne 423){
    throw ('UNCONFIRMED: HTTP '+$Status+
      '. Expected strict 423; inspect Make queue. No automatic retry.')
  }
  if([string]::IsNullOrWhiteSpace($Body)){
    throw 'HTTP 423 received but response body is empty; NO confirmation and no retry.'
  }
  try{
    $receipt=ConvertFrom-Json -InputObject $Body -ErrorAction Stop
  }catch{
    throw 'HTTP 423 received but deny JSON is invalid; no retry.'
  }
  if($null -eq $receipt -or
     $receipt.ok -ne $false -or
     $receipt.error -cne 'STAGING_CONTRACT_NOT_ENABLED' -or
     $receipt.transmitted -ne $false -or
     $receipt.provider -cne 'NONE' -or
     $null -ne $receipt.messageId){
    throw 'HTTP 423 deny response did not match expected safe contract. No automatic retry.'
  }
  return $true
}
if($SelfTest){
  $good='{"ok":false,"error":"STAGING_CONTRACT_NOT_ENABLED","transmitted":false,"provider":"NONE","messageId":null}'
  if(!(Assert-MakeStagingDeny -Status 423 -Body $good)){
    throw 'Offline 423 parser selftest failed.'
  }
  $rejected=0
  foreach($bad in @(
    '',
    '{}',
    '{"ok":true,"error":"STAGING_CONTRACT_NOT_ENABLED","transmitted":false,"provider":"NONE","messageId":null}',
    '{"ok":false,"error":"STAGING_CONTRACT_NOT_ENABLED","transmitted":false,"provider":"NONE","messageId":"gmail_fake"}'
  )){
    try{
      $null=Assert-MakeStagingDeny -Status 423 -Body $bad
    }catch{
      $rejected++
    }
  }
  try{
    $null=Assert-MakeStagingDeny -Status 200 -Body $good
  }catch{
    $rejected++
  }
  if($rejected -ne 5){throw 'Offline 423 parser did not reject all invalid responses.'}
  Write-Host 'LOCAL 423 PARSER SELFTEST PASS (1 valid, 5 invalid, zero HTTP requests).'
  return
}

$generator=Join-Path (Split-Path -Parent $PSScriptRoot) 'crm-v2\scripts\generate-contract-make-learn-sample.cjs'
if(!(Test-Path -LiteralPath $generator)){throw 'Generator missing. Run git pull --ff-only.'}
if(!(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Node.js not found.'}
$hook=$env:LSZH_CONTRACT_STAGING_WEBHOOK
if(!$hook){
  Write-Host 'Use ONLY STAGING scenario 8162162 webhook URL, never the production scenario.'
  $secret=Read-Host 'STAGING webhook URL (hidden)' -AsSecureString
  try{
    $hook=([pscredential]::new('LSZH_STAGING_WEBHOOK',$secret)).GetNetworkCredential().Password
  }finally{
    $secret=$null
  }
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
# HttpClient does not throw for an HTTP 423 status and retains its response
# body. Invoke-WebRequest under Windows PowerShell 5.1 can lose that body
# while raising a WebException; do not treat an empty result as confirmed.
$handler=$null
$client=$null
$content=$null
$response=$null
$status=0
$body=''
try{
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler=[System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect=$false
  $client=[System.Net.Http.HttpClient]::new($handler)
  $client.Timeout=[TimeSpan]::FromSeconds(25)
  $client.DefaultRequestHeaders.Add('X-LSZH-Test','STAGING-Blocked-Smoke')
  $content=[System.Net.Http.StringContent]::new($json,[System.Text.Encoding]::UTF8,'application/json')
  $response=$client.PostAsync($hook,$content).GetAwaiter().GetResult()
  $status=[int]$response.StatusCode
  $body=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
}catch{
  # Do not log exception.Message: transport errors can reveal URL/tokens.
  throw 'Make STAGING HTTP transport failed; no retry. Inspect Make run history.'
}finally{
  if($null -ne $response){$response.Dispose()}
  if($null -ne $content){$content.Dispose()}
  if($null -ne $client){$client.Dispose()}
  if($null -ne $handler){$handler.Dispose()}
}
$null=Assert-MakeStagingDeny -Status $status -Body $body
Write-Host 'Make STAGING deny response VERIFIED: HTTP 423 | transmitted=false | messageId=null'
Write-Host 'Next: inspect Make execution history to confirm Iterator x2/x3 and Aggregator x1.'
