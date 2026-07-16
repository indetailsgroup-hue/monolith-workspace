[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 55432,

  [string]$DatabaseName = 's17_0162_dryrun',

  [string]$DataRoot = (Join-Path ([IO.Path]::GetTempPath()) ("monolith-s17-0162-" + [guid]::NewGuid().ToString('N')))
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($DatabaseName -notmatch '^s17_0162_[a-z0-9_]+$') {
  throw 'DatabaseName must match ^s17_0162_[a-z0-9_]+$.'
}

$initdb = Get-Command initdb -ErrorAction Stop
$pgCtl = Get-Command pg_ctl -ErrorAction Stop
$createdb = Get-Command createdb -ErrorAction Stop
$pgIsReady = Get-Command pg_isready -ErrorAction Stop

& $pgIsReady.Source -h 127.0.0.1 -p $Port -q
if ($LASTEXITCODE -eq 0) {
  throw "Port $Port already has a PostgreSQL server; choose another -Port."
}

$resolvedTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$resolvedRoot = [IO.Path]::GetFullPath($DataRoot)
$rootLeaf = Split-Path -Leaf $resolvedRoot
if (-not $resolvedRoot.StartsWith($resolvedTemp, [StringComparison]::OrdinalIgnoreCase) -or
    $rootLeaf -notmatch '^monolith-s17-0162-[0-9a-f]{32}$') {
  throw "Unsafe DataRoot '$resolvedRoot'; it must be a generated monolith-s17-0162-* directory under the system temp directory."
}
if (Test-Path -LiteralPath $resolvedRoot) {
  throw "DataRoot already exists: $resolvedRoot"
}

$dataDir = Join-Path $resolvedRoot 'data'
$logPath = Join-Path $resolvedRoot 'postgres.log'
$serverStarted = $false
$previousDatabaseUrl = $env:S17_TEST_DATABASE_URL

try {
  New-Item -ItemType Directory -Path $resolvedRoot | Out-Null
  & $initdb.Source -D $dataDir --username=postgres --encoding=UTF8 --no-locale --auth-host=trust --auth-local=trust
  if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE" }

  & $pgCtl.Source -D $dataDir -l $logPath -o "-p $Port -h 127.0.0.1" -w start
  if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed with exit code $LASTEXITCODE" }
  $serverStarted = $true

  & $createdb.Source -h 127.0.0.1 -p $Port -U postgres $DatabaseName
  if ($LASTEXITCODE -ne 0) { throw "createdb failed with exit code $LASTEXITCODE" }

  $env:S17_TEST_DATABASE_URL = "postgresql://postgres@127.0.0.1:$Port/$DatabaseName"
  $runner = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'run-0162-dry-run.ps1'
  & $runner -Mode bootstrap -ExpectedDatabase $DatabaseName -ConfirmNonProduction
  if ($LASTEXITCODE -ne 0) { throw "dry-run runner failed with exit code $LASTEXITCODE" }
} finally {
  $env:S17_TEST_DATABASE_URL = $previousDatabaseUrl
  if ($serverStarted) {
    & $pgCtl.Source -D $dataDir -m fast -w stop
  }
  if (Test-Path -LiteralPath $resolvedRoot) {
    Remove-Item -LiteralPath $resolvedRoot -Recurse -Force
  }
}

Write-Host 'S17_0162_EPHEMERAL_POSTGRES_PASS'
