# LSZH CRM C.3.2 synthetic Make STAGING test (scenario 8166714 only).
# Absolutely NO Gmail send: server scenario has no Gmail module, HTTP 423 hard stop.
# -Mode Learn: while INACTIVE, accepts 200 only to teach Make a schema (NOT runtime proof).
# -Mode Smoke: while ACTIVE with no Gmail, expects exact 423 deny JSON.
param(
  [ValidateSet('no','yes')][string]$Avv='no',
  [ValidateSet('Learn','Smoke')][string]$Mode='Learn'
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$generator=Join-Path $root 'crm-v2\scripts\generate-contract-c3-2-blocked-make-sample.cjs'
if(!(Test-Path -LiteralPath $generator) -or !(Get-Command node.exe -ErrorAction SilentlyContinue)){
  throw 'C3.2 TEST_ONLY generator/Node.js missing. Run git pull --ff-only.'
}
$hook=$env:LSZH_CONTRACT_C32_STAGING_WEBHOOK
if(!$hook){
  Write-Host 'ONLY the webhook of Make scenario 8166714 (C3.2); NEVER production or old C3.1.'
  $secret=Read-Host 'C3.2 STAGING webhook URL (hidden)' -AsSecureString
  try{
    $hook=([pscredential]::new('LSZH_C3_2_STAGING_WEBHOOK',$secret)).GetNetworkCredential().Password
  }finally{$secret=$null}
}
if($hook -cnotmatch '^https://hook\.eu1\.make\.com/[A-Za-z0-9]+$'){
  throw 'Unexpected webhook host/format; no request sent.'
}
$json=& node.exe $generator $Avv
if($LASTEXITCODE -ne 0 -or !$json){throw 'TEST_ONLY generator failed; no request sent.'}
$payload=$json | ConvertFrom-Json
$count=if($Avv -eq 'yes'){3}else{2}
$kinds=if($Avv -eq 'yes'){@('offer','terms','avv')}else{@('offer','terms')}
if($payload.kind -cne 'lszh_contract_gmail_c3_2_blocked' -or
   $payload.sendMode -cne 'blocked_preview_only' -or
   $payload.neverSend -ne $true -or
   $payload.to -cne 'test-approved@example.com' -or
   $payload.attachmentCount -ne $count -or
   @($payload.attachments).Count -ne $count){
  throw 'Unsafe Make preview envelope rejected BEFORE POST.'
}
for($i=0;$i -lt $count;$i++){
  $a=$payload.attachments[$i]
  if($a.kind -cne $kinds[$i] -or
     $a.filename -cnotmatch '^TEST_ONLY_[A-Za-z0-9_.-]+\.pdf$' -or
     $a.mimeType -cne 'application/pdf' -or
     $a.sha256 -cnotmatch '^[a-f0-9]{64}$'){
    throw 'Non-test/malformed PDF metadata rejected BEFORE POST.'
  }
}
Write-Host ("C3.2 BLOCKED STAGING "+$Mode+" | AVV="+$Avv+
  " | PDFs="+$count+" | no Gmail/no customer data")
$handler=$null;$client=$null;$postBody=$null;$resp=$null
try{
  Add-Type -AssemblyName System.Net.Http -ErrorAction Stop
  $handler=[System.Net.Http.HttpClientHandler]::new()
  $handler.AllowAutoRedirect=$false
  $client=[System.Net.Http.HttpClient]::new($handler)
  $client.Timeout=[TimeSpan]::FromSeconds(25)
  $client.DefaultRequestHeaders.Add('X-LSZH-Test','C3-2-BLOCKED-PDF')
  $postBody=[System.Net.Http.StringContent]::new(
    $json,[System.Text.Encoding]::UTF8,'application/json')
  $resp=$client.PostAsync($hook,$postBody).GetAwaiter().GetResult()
  $status=[int]$resp.StatusCode
  $body=$resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
}catch{
  # Never print raw exception: it may contain the confidential hook token.
  throw 'STAGING transport failed. No retry. Inspect Make execution queue/history.'
}finally{
  if($null -ne $resp){$resp.Dispose()}
  if($null -ne $postBody){$postBody.Dispose()}
  if($null -ne $client){$client.Dispose()}
  if($null -ne $handler){$handler.Dispose()}
}
if($Mode -eq 'Learn'){
  if($status -ne 200){
    throw ('Schema learning NOT confirmed; HTTP '+$status+
      '. Do not retry; inspect Make scenario 8166714 first.')
  }
  Write-Host 'Make webhook HTTP 200 received for schema learning ONLY.'
  Write-Host 'NOT a module execution proof. Inspect Make hook, then coordinate safe active smoke.'
  return
}
if($status -ne 423){throw ('C3.2 BLOCKED smoke unconfirmed: HTTP '+$status+
  ', expected 423. Do not retry.')}
try{$receipt=$body|ConvertFrom-Json -ErrorAction Stop}catch{
  throw 'C3.2 got HTTP 423 but invalid/missing JSON body; do not retry.'
}
if($receipt.ok -ne $false -or
   $receipt.error -cne 'STAGING_C3_2_SEND_NOT_AUTHORISED' -or
   $receipt.transmitted -ne $false -or
   $receipt.provider -cne 'NONE' -or
   $null -ne $receipt.messageId)
{
  throw 'C3.2 denial receipt unverified. No automatic retry.'
}
Write-Host 'C3.2 Make denial VERIFIED: HTTP 423 | transmitted=false | provider=NONE | messageId=null'
Write-Host 'Read Make history to independently verify iterator 2/3 and aggregator 1.'
