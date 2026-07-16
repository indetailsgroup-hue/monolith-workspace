[CmdletBinding()]
param(
  [ValidateSet('bootstrap', 'existing-pre0162')]
  [string]$Mode = 'bootstrap',

  [string]$DatabaseUrl = $env:S17_TEST_DATABASE_URL,

  [Parameter(Mandatory = $true)]
  [string]$ExpectedDatabase,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmNonProduction
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if (-not $ConfirmNonProduction) {
  throw 'Refusing to run: -ConfirmNonProduction is required.'
}
if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw 'Set S17_TEST_DATABASE_URL or pass -DatabaseUrl. Use a disposable/non-production database only.'
}

$psql = Get-Command psql -ErrorAction Stop
$identity = & $psql.Source -w -X --dbname=$DatabaseUrl --tuples-only --no-align --field-separator='|' --command "select current_database(), current_user, coalesce(inet_server_addr()::text, 'local'), inet_server_port();"
if ($LASTEXITCODE -ne 0) {
  throw "psql identity preflight failed with exit code $LASTEXITCODE"
}

$identityLine = ($identity | Select-Object -Last 1).Trim()
$parts = $identityLine -split '\|', 4
if ($parts.Count -ne 4) {
  throw "Unexpected psql identity response: $identityLine"
}

$actualDatabase = $parts[0]
if ($actualDatabase -ne $ExpectedDatabase) {
  throw "Database mismatch: expected '$ExpectedDatabase', connected to '$actualDatabase'."
}
if ($actualDatabase -in @('postgres', 'template0', 'template1') -or $actualDatabase -match '(?i)prod(uction)?') {
  throw "Refusing protected/production-like database name '$actualDatabase'."
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$driver = if ($Mode -eq 'bootstrap') {
  Join-Path $scriptRoot 'dry-run-bootstrap.sql'
} else {
  Join-Path $scriptRoot 'dry-run-existing.sql'
}

Write-Host "S17 0162 dry-run target: database=$actualDatabase user=$($parts[1]) host=$($parts[2]) port=$($parts[3]) mode=$Mode"
Write-Host 'The SQL driver opens one transaction and ends with ROLLBACK. No production apply is performed.'

& $psql.Source -w -X --dbname=$DatabaseUrl --set=ON_ERROR_STOP=1 --set=VERBOSITY=verbose --file=$driver
if ($LASTEXITCODE -ne 0) {
  throw "S17 0162 dry-run failed with exit code $LASTEXITCODE"
}

Write-Host 'S17_0162_PSQL_PACKAGE_PASS'
