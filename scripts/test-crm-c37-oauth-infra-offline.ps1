# C3.7.1 offline PowerShell integration test using a synthetic gcloud function.
# No Google Cloud, OAuth, secrets, Gmail, IAM writes, or network calls.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$global:LASTEXITCODE = 0
$global:Scenario='valid'
$global:Requests = New-Object 'System.Collections.Generic.List[string]'

function global:gcloud.cmd {
  $argv = @($args)
  $signature = ($argv -join ' ')
  $global:Requests.Add($signature)
  $global:LASTEXITCODE = 0
  if ($signature -notmatch '\-\-format=json$') { throw 'Unexpected gcloud output format.' }
  if ($signature -like 'iam service-accounts describe *') {
    return '{"email":"lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com","disabled":false}'
  }
  if ($signature -like 'secrets describe *') {
    return '{"name":"projects/470613067122/secrets/lszh-crm-c37-gmail-readonly","replication":{"userManaged":{"replicas":[{"location":"europe-west6"}]}}}'
  }
  if ($signature -like 'secrets get-iam-policy *') {
    if ($global:Scenario -eq 'extraGrant') {
      return '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com","user:unexpected@example.com"]}]}'
    }
    return '{"bindings":[{"role":"roles/secretmanager.secretAccessor","members":["serviceAccount:lszh-crm-c37-ro@lszh-automations.iam.gserviceaccount.com"]}]}'
  }
  if ($signature -like 'secrets versions list *') {
    if ($global:Scenario -eq 'hasVersion') {
      return '[{"name":"projects/470613067122/secrets/lszh-crm-c37-gmail-readonly/versions/1","state":"ENABLED"}]'
    }
    return '[]'
  }
  throw 'Unexpected non-readonly gcloud operation.'
}

$preflight = Join-Path $PSScriptRoot 'check-crm-c37-oauth-infrastructure.ps1'
$pass = @(& $preflight)
if ($pass -notcontains 'C3.7 METADATA-ONLY PRECHECK PASS - NO SECRET VALUES READ OR CHANGED') {
  throw 'C3.7.1 expected success marker missing.'
}
if ($global:Requests.Count -ne 4) { throw 'C3.7.1 should make exactly four metadata calls.' }
Write-Host 'C3.7.1 MOCK PASS: dedicated account, Zurich replication, IAM and empty secret'

$global:Scenario='extraGrant'
$gotError=$false
try { & $preflight | Out-Null } catch {
  $gotError=$_.Exception.Message -match 'unexpected secret-level accessor grant'
}
if (-not $gotError) { throw 'C3.7.1 should reject extra secret-level grant.' }
Write-Host 'C3.7.1 MOCK PASS: extra accessors rejected'

$global:Scenario='hasVersion'
$gotError=$false
try { & $preflight | Out-Null } catch {
  $gotError=$_.Exception.Message -match 'secret already has versions'
}
if (-not $gotError) { throw 'C3.7.1 should reject an already initialized secret.' }
Write-Host 'C3.7.1 MOCK PASS: existing secret version rejected'

Remove-Item Function:\gcloud.cmd -ErrorAction SilentlyContinue
Write-Host 'C3.7.1 SYNTHETIC OFFLINE POWERSHELL PASS'
