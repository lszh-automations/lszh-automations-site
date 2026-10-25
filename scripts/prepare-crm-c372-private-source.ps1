# C3.7.2: create an ISOLATED source-only Cloud Run build context.
# Never deploy from the CRM production package or upload unapproved files.
# This script neither accesses Secret Manager nor invokes gcloud or npm.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$src=Join-Path $repo 'crm-v2'
if (-not (Test-Path (Join-Path $src 'c372-readonly-server.js'))) {
  throw 'C3.7.2: expected local source is missing'
}
$allowed=@(
  'c372-readonly-server.js',
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
$directory=Join-Path ([IO.Path]::GetTempPath()) ("lszh-c372-readonly-build-"+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory -ErrorAction Stop | Out-Null
try {
  foreach ($name in $allowed) {
    if ($name -notmatch '^[A-Za-z0-9-]+\.js$') { throw 'Unsafe C3.7.2 filename' }
    $file=Join-Path $src $name
    if (-not (Test-Path $file -PathType Leaf)) {
      throw 'C3.7.2 source component missing'
    }
    Copy-Item -LiteralPath $file -Destination (Join-Path $directory $name)
  }
  $manifest=@{
    name='lszh-crm-c372-readonly-private'
    private=$true
    version='0.0.1'
    engines=@{node='>=22'}
    scripts=@{start='node c372-readonly-server.js'}
    dependencies=@{'google-auth-library'='9.15.1'}
  } | ConvertTo-Json -Depth 8
  [IO.File]::WriteAllText((Join-Path $directory 'package.json'),$manifest,[Text.UTF8Encoding]::new($false))
  # Prevent accidental upload of anything other than the copied allowlist.
  $expected=@($allowed+'package.json' | Sort-Object)
  $actual=@(Get-ChildItem -LiteralPath $directory -File | ForEach-Object Name | Sort-Object)
  if (($actual -join '|') -cne ($expected -join '|')) {
    throw 'C3.7.2 allowed build files mismatch'
  }
  Write-Host 'C3.7.2 ISOLATED SOURCE PASS: static allowlist only; no secret, no production CRM'
  Write-Output $directory
} catch {
  Remove-Item -LiteralPath $directory -Recurse -Force -ErrorAction SilentlyContinue
  throw
}
