# C3.7.1 - non-mutating readiness check for the dedicated Gmail-readonly staging secret.
# No OAuth, no Secret Manager payload access, no Cloud Run deployment, no IAM writes.
# Windows PowerShell 5.1-compatible. Run from the LSZH repository root.
param(
  [string]$Project = 'lszh-automations',
  [string]$ServiceAccountId = 'lszh-crm-c37-ro',
  [string]$SecretId = 'lszh-crm-c37-gmail-readonly'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Reject arbitrary project/account/secret changes: this helper is pinned to C3.7.
if ($Project -cne 'lszh-automations' -or
    $ServiceAccountId -cne 'lszh-crm-c37-ro' -or
    $SecretId -cne 'lszh-crm-c37-gmail-readonly') {
  throw 'C3.7 PRECHECK BLOCKED: unexpected project or resource selection.'
}
$serviceAccount = "$ServiceAccountId@$Project.iam.gserviceaccount.com"
$principal = "serviceAccount:$serviceAccount"

function Get-GcloudJson {
  param([string[]]$Arguments)
  # All callers below pass literal, read-only gcloud commands.
  $lines = @(& gcloud.cmd @Arguments '--format=json')
  if ($LASTEXITCODE -ne 0) {
    throw 'C3.7 PRECHECK BLOCKED: Google Cloud metadata lookup failed.'
  }
  $json = ($lines -join [Environment]::NewLine).Trim()
  if (-not $json) {
    throw 'C3.7 PRECHECK BLOCKED: Google Cloud returned no metadata.'
  }
  try { return ConvertFrom-Json -InputObject $json }
  catch { throw 'C3.7 PRECHECK BLOCKED: unexpected Google Cloud JSON response.' }
}

$sa = Get-GcloudJson -Arguments @('iam','service-accounts','describe',$serviceAccount,"--project=$Project")
# Google IAM omits "disabled" when the account is enabled. Under StrictMode
# accessing a missing property throws. Treat missing as enabled, but deny
# explicit true or any malformed non-Boolean disabled value.
$emailField = $sa.PSObject.Properties['email']
$disabledField = $sa.PSObject.Properties['disabled']
if ($null -eq $emailField -or
    $emailField.Value -cne $serviceAccount -or
    ($null -ne $disabledField -and
      ($disabledField.Value -isnot [bool] -or $disabledField.Value -eq $true))) {
  throw 'C3.7 PRECHECK BLOCKED: dedicated service account missing or disabled.'
}
Write-Host 'C3.7 SA METADATA PASS'

$secret = Get-GcloudJson -Arguments @('secrets','describe',$SecretId,"--project=$Project")
$expectedName = "projects/470613067122/secrets/$SecretId"
$replicas = @($secret.replication.userManaged.replicas)
if ($secret.name -cne $expectedName -or
    $replicas.Count -ne 1 -or
    $replicas[0].location -cne 'europe-west6') {
  throw 'C3.7 PRECHECK BLOCKED: secret resource or Zurich replication mismatch.'
}
Write-Host 'C3.7 SECRET ZURICH METADATA PASS'

$policy = Get-GcloudJson -Arguments @('secrets','get-iam-policy',$SecretId,"--project=$Project")
$accessors = @($policy.bindings | Where-Object { $_.role -ceq 'roles/secretmanager.secretAccessor' })
if ($accessors.Count -ne 1 -or
    @($accessors[0].members).Count -ne 1 -or
    @($accessors[0].members)[0] -cne $principal) {
  throw 'C3.7 PRECHECK BLOCKED: unexpected secret-level accessor grant.'
}
Write-Host 'C3.7 DEDICATED SECRET IAM PASS'
# Note: This only checks secret-level IAM. Project/folder inherited grants
# cannot be excluded from the secret policy alone and need separate audit.

# An empty JSON array has inconsistent PowerShell 5.1 pipeline semantics.
# The value(name) format is empty ONLY when no version has been returned.
$versionNames = @(& gcloud.cmd secrets versions list $SecretId "--project=$Project" '--format=value(name)')
if ($LASTEXITCODE -ne 0) {
  throw 'C3.7 PRECHECK BLOCKED: version metadata lookup failed.'
}
$presentVersions = @($versionNames | Where-Object {
  $_ -is [string] -and $_.Trim().Length -gt 0
})
if ($presentVersions.Count -ne 0) {
  throw 'C3.7 PRECHECK BLOCKED: secret already has versions; stop before any new authorization.'
}
Write-Host 'C3.7 EMPTY SECRET PASS'
Write-Output 'C3.7 METADATA-ONLY PRECHECK PASS - NO SECRET VALUES READ OR CHANGED'
