# C3.7.2 private, one-use Cloud Run JOB source builder.
# No cloud APIs; never copies private OAuth JSON, service files, or customer data.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$src=Join-Path $root 'crm-v2'
$allowed=@(
  'c372-profile-job.js',
  'contract-gmail-c37-backend-staging.js',
  'contract-gmail-c36-local-oauth.js',
  'contract-gmail-c35-readonly-api-staging.js',
  'contract-gmail-c34-readback-staging.js',
  'contract-gmail-api-readonly-staging.js',
  'contract-gmail-evidence-staging.js',
  'contract-dispatch-ledger-staging.js',
  'contract-dispatch-release-staging.js',
  'offer-contract-package.js'
)
$destination=Join-Path ([IO.Path]::GetTempPath()) ("lszh-c372-profile-job-"+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
try {
  foreach ($name in $allowed) {
    if ($name -notmatch '^[A-Za-z0-9-]+\.js$') { throw 'Unexpected C3.7.2 source path' }
    $file=Join-Path $src $name
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      throw 'C3.7.2 job source missing'
    }
    Copy-Item -LiteralPath $file -Destination (Join-Path $destination $name)
  }
  $manifest=@{
    name='lszh-crm-c372-gmail-profile-job'
    private=$true
    version='0.0.1'
    engines=@{node='>=22'}
    scripts=@{start='node c372-profile-job.js'}
    dependencies=@{'google-auth-library'='9.15.1'}
  } | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText(
    (Join-Path $destination 'package.json'),$manifest,
    [Text.UTF8Encoding]::new($false)
  )
  $expected=@($allowed+'package.json' | Sort-Object)
  $actual=@(Get-ChildItem -LiteralPath $destination -File | ForEach-Object Name | Sort-Object)
  if (($actual -join '|') -cne ($expected -join '|') -or $actual.Count -ne 11) {
    throw 'C3.7.2 job source not restricted to expected modules'
  }
  Write-Host 'C3.7.2 JOB SOURCE PASS: eleven strictly allowlisted files; no cloud actions'
  Write-Output $destination
} catch {
  Remove-Item -LiteralPath $destination -Recurse -Force -ErrorAction SilentlyContinue
  throw
}
