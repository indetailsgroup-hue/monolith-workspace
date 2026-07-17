[CmdletBinding()]
param(
  [string]$BaseUrl = $env:S17_FACTORY_API_BASE_URL,
  [string]$AnonKey = $env:S17_SUPABASE_ANON_KEY,
  [string]$DesignerJwt = $env:S17_DESIGNER_JWT,
  [string]$FactoryJwt = $env:S17_FACTORY_JWT,
  [string]$InstallerJwt = $env:S17_INSTALLER_JWT,
  [string]$NoRoleJwt = $env:S17_NO_ROLE_JWT,
  [string]$ExpiredJwt = $env:S17_EXPIRED_JWT,
  [string]$TargetLabel = $env:S17_TARGET_LABEL,
  [string]$ExpectedCommit = $env:S17_EXPECTED_COMMIT,
  [string]$ExpectedMigrationSha256 = $env:S17_EXPECTED_MIGRATION_SHA256,
  [string]$JobId = ("S17-HOSTED-{0}" -f [DateTimeOffset]::UtcNow.ToString("yyyyMMddHHmmss")),
  [string]$EvidencePath = "artifacts/s17-hosted-auth-evidence.local.json",
  [switch]$ConfirmNonProduction,
  [switch]$ForceEvidenceOverwrite,
  [switch]$PlanOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

$testPlan = @(
  [ordered]@{ id = "AUTH-VALID-STATE"; expected = "Designer JWT -> 200/DRAFT" },
  [ordered]@{ id = "AUTH-EXPIRED"; expected = "genuinely expired JWT -> 401" },
  [ordered]@{ id = "AUTH-NO-ROLE"; expected = "valid no-role JWT -> 403" },
  [ordered]@{ id = "READ-INSTALLER-STATE"; expected = "INSTALLER state -> 200" },
  [ordered]@{ id = "READ-INSTALLER-ACTIVITY"; expected = "INSTALLER activity -> 403" },
  [ordered]@{ id = "AUTH-FORGED-ROLE"; expected = "FACTORY + forged DESIGNER header -> 403" },
  [ordered]@{ id = "AUTH-FORGED-NO-SIDE-EFFECT"; expected = "job remains DRAFT" },
  [ordered]@{ id = "STATE-FREEZE"; expected = "Designer freeze -> 200/FROZEN" },
  [ordered]@{ id = "FROZEN-PACKET"; expected = "FROZEN packet -> 409" },
  [ordered]@{ id = "FROZEN-EXPORT"; expected = "FROZEN export -> 409" },
  [ordered]@{ id = "FROZEN-VERIFY"; expected = "FROZEN verify -> 409" },
  [ordered]@{ id = "STATE-RELEASE"; expected = "Designer release -> 200/RELEASED" },
  [ordered]@{ id = "AUDIT-SUBJECT-ONLY"; expected = "release actorName/actorSubjectId equal JWT sub" }
)

if ($PlanOnly) {
  [ordered]@{
    schema = "monolith.s17.hosted-auth-test-plan@1"
    stateChangingWhenExecuted = $true
    deploysAnything = $false
    cases = $testPlan
  } | ConvertTo-Json -Depth 8
  exit 0
}

function Require-Value {
  param([string]$Name, [string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    throw "Missing required value: $Name"
  }
}

function ConvertFrom-Base64Url {
  param([string]$Value)
  $normalized = $Value.Replace("-", "+").Replace("_", "/")
  switch ($normalized.Length % 4) {
    0 { }
    2 { $normalized += "==" }
    3 { $normalized += "=" }
    default { throw "Invalid base64url length" }
  }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($normalized))
}

function Get-JwtPayload {
  param([string]$Token, [string]$Label)
  $parts = $Token.Split(".")
  if ($parts.Count -ne 3) { throw "$Label is not a three-part JWT" }
  try {
    return (ConvertFrom-Base64Url -Value $parts[1]) | ConvertFrom-Json
  } catch {
    throw "$Label payload cannot be decoded: $($_.Exception.Message)"
  }
}

function Get-Roles {
  param($Payload)
  $appMetadataProperty = $Payload.PSObject.Properties["app_metadata"]
  if ($null -eq $appMetadataProperty -or $null -eq $appMetadataProperty.Value) { return @() }
  $rolesProperty = $appMetadataProperty.Value.PSObject.Properties["roles"]
  if ($null -eq $rolesProperty -or $null -eq $rolesProperty.Value) { return @() }
  return @($rolesProperty.Value | ForEach-Object { [string]$_ })
}

function Test-RoleIntersection {
  param([string[]]$Roles, [string[]]$Accepted)
  foreach ($role in $Roles) {
    if ($Accepted -ccontains $role) { return $true }
  }
  return $false
}

function Get-Sha256Text {
  param([string]$Value)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Select-SafeBody {
  param($Body)
  if ($null -eq $Body) { return $null }
  $safe = [ordered]@{}
  foreach ($name in @("ok", "error", "specState", "revisionId", "canExport", "verdict")) {
    if ($null -ne $Body.PSObject.Properties[$name]) { $safe[$name] = $Body.$name }
  }
  return $safe
}

function Invoke-FactoryRequest {
  param(
    [string]$Method,
    [string]$Path,
    [string]$Token,
    $Body = $null,
    [hashtable]$ExtraHeaders = @{}
  )
  $uri = "$script:NormalizedBaseUrl/api/factory/jobs$Path"
  $message = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $uri)
  try {
    [void]$message.Headers.TryAddWithoutValidation("authorization", "Bearer $Token")
    [void]$message.Headers.TryAddWithoutValidation("apikey", $script:AnonKey)
    foreach ($entry in $ExtraHeaders.GetEnumerator()) {
      [void]$message.Headers.TryAddWithoutValidation([string]$entry.Key, [string]$entry.Value)
    }
    if ($null -ne $Body) {
      $payload = $Body | ConvertTo-Json -Depth 20 -Compress
      $message.Content = [System.Net.Http.StringContent]::new($payload, [Text.Encoding]::UTF8, "application/json")
    }
    $response = $script:HttpClient.SendAsync($message).GetAwaiter().GetResult()
    try {
      $raw = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $json = $null
      if (-not [string]::IsNullOrWhiteSpace($raw)) {
        try { $json = $raw | ConvertFrom-Json } catch { $json = $null }
      }
      return [pscustomobject]@{
        Status = [int]$response.StatusCode
        Body = $json
        SafeBody = Select-SafeBody -Body $json
      }
    } finally {
      $response.Dispose()
    }
  } finally {
    $message.Dispose()
  }
}

$results = [Collections.Generic.List[object]]::new()

function Add-CaseResult {
  param(
    [string]$Id,
    [int]$ExpectedStatus,
    $Response,
    [bool]$AdditionalPass = $true,
    [string]$Check = "status"
  )
  $pass = ($Response.Status -eq $ExpectedStatus) -and $AdditionalPass
  $script:results.Add([ordered]@{
    id = $Id
    expectedStatus = $ExpectedStatus
    actualStatus = $Response.Status
    check = $Check
    pass = $pass
    response = $Response.SafeBody
  })
  if (-not $pass) {
    throw "$Id failed: expected HTTP $ExpectedStatus and $Check; got HTTP $($Response.Status)"
  }
  return $Response
}

foreach ($pair in @(
  @("BaseUrl", $BaseUrl), @("AnonKey", $AnonKey), @("DesignerJwt", $DesignerJwt),
  @("FactoryJwt", $FactoryJwt), @("InstallerJwt", $InstallerJwt), @("NoRoleJwt", $NoRoleJwt),
  @("ExpiredJwt", $ExpiredJwt), @("TargetLabel", $TargetLabel),
  @("ExpectedCommit", $ExpectedCommit), @("ExpectedMigrationSha256", $ExpectedMigrationSha256)
)) {
  Require-Value -Name $pair[0] -Value $pair[1]
}

if (-not $ConfirmNonProduction) { throw "Refusing hosted run without -ConfirmNonProduction" }
if ($TargetLabel -notmatch '(?i)(staging|stage|preview|test|sandbox)') {
  throw "TargetLabel must explicitly identify a staging/test target"
}
if ($ExpectedCommit -notmatch '^[0-9a-f]{40}$') { throw "ExpectedCommit must be a full lowercase Git SHA" }
if ($ExpectedMigrationSha256 -notmatch '^[0-9a-f]{64}$') { throw "ExpectedMigrationSha256 must be lowercase SHA-256" }
if ($JobId -notmatch '^S17-HOSTED-[A-Za-z0-9-]+$') { throw "JobId must use the S17-HOSTED- prefix" }

try { $baseUri = [Uri]$BaseUrl } catch { throw "BaseUrl is not a valid URI" }
if (-not $baseUri.IsAbsoluteUri) { throw "BaseUrl must be absolute" }
if ($baseUri.Scheme -ne "https" -and $baseUri.Host -notin @("localhost", "127.0.0.1", "::1")) {
  throw "Hosted BaseUrl must use HTTPS"
}
$NormalizedBaseUrl = $BaseUrl.TrimEnd("/")

$designer = Get-JwtPayload -Token $DesignerJwt -Label "DesignerJwt"
$factory = Get-JwtPayload -Token $FactoryJwt -Label "FactoryJwt"
$installer = Get-JwtPayload -Token $InstallerJwt -Label "InstallerJwt"
$noRole = Get-JwtPayload -Token $NoRoleJwt -Label "NoRoleJwt"
$expired = Get-JwtPayload -Token $ExpiredJwt -Label "ExpiredJwt"
$nowEpoch = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

foreach ($identity in @(
  [pscustomobject]@{ Label = "DesignerJwt"; Payload = $designer; Accepted = @("designer", "DESIGNER", "admin", "operations", "executive_owner", "ADMIN") },
  [pscustomobject]@{ Label = "FactoryJwt"; Payload = $factory; Accepted = @("factory", "factory_operator", "FACTORY", "admin", "operations", "executive_owner", "ADMIN") },
  [pscustomobject]@{ Label = "InstallerJwt"; Payload = $installer; Accepted = @("installer", "INSTALLER") }
)) {
  if ([string]::IsNullOrWhiteSpace([string]$identity.Payload.sub)) { throw "$($identity.Label) has no sub" }
  if ([long]$identity.Payload.exp -le $nowEpoch) { throw "$($identity.Label) is expired" }
  if (-not (Test-RoleIntersection -Roles (Get-Roles -Payload $identity.Payload) -Accepted $identity.Accepted)) {
    throw "$($identity.Label) does not carry its required app_metadata role"
  }
}

$recognizedRoles = @(
  "designer", "DESIGNER", "factory", "factory_operator", "FACTORY", "installer", "INSTALLER",
  "finance", "FINANCE", "admin", "operations", "executive_owner", "ADMIN"
)
if ([string]::IsNullOrWhiteSpace([string]$noRole.sub)) { throw "NoRoleJwt has no sub" }
if ([long]$noRole.exp -le $nowEpoch) { throw "NoRoleJwt is expired" }
if (Test-RoleIntersection -Roles (Get-Roles $noRole) -Accepted $recognizedRoles) {
  throw "NoRoleJwt unexpectedly has a recognized Factory role"
}
if ([string]::IsNullOrWhiteSpace([string]$expired.sub)) { throw "ExpiredJwt has no sub" }
if ([long]$expired.exp -ge $nowEpoch) { throw "ExpiredJwt is not genuinely expired yet" }

$evidenceFullPath = [IO.Path]::GetFullPath($EvidencePath)
if ((Test-Path -LiteralPath $evidenceFullPath) -and -not $ForceEvidenceOverwrite) {
  throw "EvidencePath already exists; choose a new path or pass -ForceEvidenceOverwrite"
}

$HttpClient = [System.Net.Http.HttpClient]::new()
$startedAt = [DateTimeOffset]::UtcNow
$overallStatus = "FAIL"
$failure = $null

try {
  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/state" -Token $DesignerJwt
  [void](Add-CaseResult -Id "AUTH-VALID-STATE" -ExpectedStatus 200 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "DRAFT") -Check "specState=DRAFT")

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/state" -Token $ExpiredJwt
  [void](Add-CaseResult -Id "AUTH-EXPIRED" -ExpectedStatus 401 -Response $response)

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/state" -Token $NoRoleJwt
  [void](Add-CaseResult -Id "AUTH-NO-ROLE" -ExpectedStatus 403 -Response $response)

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/state" -Token $InstallerJwt
  [void](Add-CaseResult -Id "READ-INSTALLER-STATE" -ExpectedStatus 200 -Response $response)

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/activity" -Token $InstallerJwt
  [void](Add-CaseResult -Id "READ-INSTALLER-ACTIVITY" -ExpectedStatus 403 -Response $response)

  $response = Invoke-FactoryRequest -Method "POST" -Path "/$JobId/freeze" -Token $FactoryJwt `
    -Body @{ note = "forged role negative case" } -ExtraHeaders @{ "x-actor-role" = "DESIGNER"; "x-actor-name" = "forged@example.invalid" }
  [void](Add-CaseResult -Id "AUTH-FORGED-ROLE" -ExpectedStatus 403 -Response $response)

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/state" -Token $DesignerJwt
  [void](Add-CaseResult -Id "AUTH-FORGED-NO-SIDE-EFFECT" -ExpectedStatus 200 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "DRAFT") -Check "specState remains DRAFT")

  $response = Invoke-FactoryRequest -Method "POST" -Path "/$JobId/freeze" -Token $DesignerJwt `
    -Body @{ note = "hosted S17 Auth evidence"; changeClass = "METADATA" }
  [void](Add-CaseResult -Id "STATE-FREEZE" -ExpectedStatus 200 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "FROZEN") -Check "specState=FROZEN")

  $packetBytes = [Text.Encoding]::UTF8.GetBytes("S17 hosted FROZEN negative packet")
  $response = Invoke-FactoryRequest -Method "POST" -Path "/$JobId/packet" -Token $DesignerJwt `
    -Body @{ zipBase64 = [Convert]::ToBase64String($packetBytes); manifestSha256 = ("0" * 64) }
  [void](Add-CaseResult -Id "FROZEN-PACKET" -ExpectedStatus 409 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "FROZEN") -Check "FROZEN denial")

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/export" -Token $FactoryJwt
  [void](Add-CaseResult -Id "FROZEN-EXPORT" -ExpectedStatus 409 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "FROZEN") -Check "FROZEN denial")

  $response = Invoke-FactoryRequest -Method "POST" -Path "/$JobId/verify" -Token $FactoryJwt -Body @{}
  [void](Add-CaseResult -Id "FROZEN-VERIFY" -ExpectedStatus 409 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "FROZEN") -Check "FROZEN denial")

  $response = Invoke-FactoryRequest -Method "POST" -Path "/$JobId/release" -Token $DesignerJwt `
    -Body @{ note = "hosted S17 release evidence" }
  [void](Add-CaseResult -Id "STATE-RELEASE" -ExpectedStatus 200 -Response $response `
    -AdditionalPass ($null -ne $response.Body -and $response.Body.specState -eq "RELEASED") -Check "specState=RELEASED")

  $response = Invoke-FactoryRequest -Method "GET" -Path "/$JobId/activity" -Token $DesignerJwt
  $releaseEvent = $null
  if ($response.Status -eq 200 -and $null -ne $response.Body -and $null -ne $response.Body.activity) {
    $releaseEvent = $response.Body.activity | Where-Object { $_.event -eq "release" } | Select-Object -First 1
  }
  $subjectOnly = $null -ne $releaseEvent -and
    [string]$releaseEvent.actorSubjectId -eq [string]$designer.sub -and
    [string]$releaseEvent.actorName -eq [string]$designer.sub
  [void](Add-CaseResult -Id "AUDIT-SUBJECT-ONLY" -ExpectedStatus 200 -Response $response `
    -AdditionalPass $subjectOnly -Check "release actorName=actorSubjectId=JWT sub")

  $overallStatus = "PASS"
} catch {
  $failure = $_.Exception.Message
} finally {
  $completedAt = [DateTimeOffset]::UtcNow
  $record = [ordered]@{
    schema = "monolith.s17.hosted-auth-evidence@1"
    recordedAt = $completedAt.ToString("o")
    target = [ordered]@{
      label = $TargetLabel
      baseUrl = $NormalizedBaseUrl
      confirmedNonProduction = [bool]$ConfirmNonProduction
    }
    anchors = [ordered]@{
      expectedCommit = $ExpectedCommit
      expectedMigrationSha256 = $ExpectedMigrationSha256
      scriptSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    run = [ordered]@{
      jobId = $JobId
      startedAt = $startedAt.ToString("o")
      completedAt = $completedAt.ToString("o")
      status = $overallStatus
      failure = $failure
    }
    identityAnchors = [ordered]@{
      designerSubjectSha256 = Get-Sha256Text -Value ([string]$designer.sub)
      factorySubjectSha256 = Get-Sha256Text -Value ([string]$factory.sub)
      installerSubjectSha256 = Get-Sha256Text -Value ([string]$installer.sub)
      noRoleSubjectSha256 = Get-Sha256Text -Value ([string]$noRole.sub)
      expiredSubjectSha256 = Get-Sha256Text -Value ([string]$expired.sub)
      rawTokensStored = $false
    }
    cases = @($results)
    exclusions = @(
      "does not prove production deployment or operational readiness",
      "does not close S17-1, S17-2, or any P0",
      "does not test multi-site isolation; factory-site-isolation remains an open hard gate",
      "creates a synthetic staging job that remains RELEASED for audit preservation",
      "does not authorize merge, production apply, or real cutting"
    )
  }
  $parent = Split-Path -Parent $evidenceFullPath
  if (-not [string]::IsNullOrWhiteSpace($parent)) {
    [void](New-Item -ItemType Directory -Path $parent -Force)
  }
  $record | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $evidenceFullPath -Encoding UTF8
  $HttpClient.Dispose()
}

if ($overallStatus -ne "PASS") {
  throw "S17 hosted Auth evidence FAILED; redacted record: $evidenceFullPath; reason: $failure"
}

Write-Output "S17_HOSTED_AUTH_EVIDENCE_PASS"
Write-Output "evidence=$evidenceFullPath"
Write-Output "jobId=$JobId"
