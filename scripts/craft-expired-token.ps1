# craft-expired-token.ps1 - build an HS256 JWT whose exp is in the past, set S17_EXPIRED_JWT.
# Requires $env:S17_JWT_SECRET (branch legacy JWT Secret from Settings) set before running.
# The token is validly signed but expired, so GoTrue /auth/v1/user rejects it -> factory-api 401.
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:S17_JWT_SECRET)) {
  Write-Host 'Set $env:S17_JWT_SECRET first (branch JWT Secret, Settings > JWT Keys / Legacy JWT Secret)' -ForegroundColor Red
  return
}
function ConvertTo-B64Url([byte[]]$b) {
  [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')
}
$now = [int][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$exp = $now - 3600
$iat = $now - 7200
$header  = '{"alg":"HS256","typ":"JWT"}'
$payload = '{"sub":"baf7546d-aa40-4c8d-862b-f06105bc3e96","aud":"authenticated","role":"authenticated","iat":' + $iat + ',"exp":' + $exp + '}'
$hB = ConvertTo-B64Url ([Text.Encoding]::UTF8.GetBytes($header))
$pB = ConvertTo-B64Url ([Text.Encoding]::UTF8.GetBytes($payload))
$signingInput = "$hB.$pB"
$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($env:S17_JWT_SECRET)
$sig = ConvertTo-B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($signingInput)))
$env:S17_EXPIRED_JWT = "$signingInput.$sig"
Write-Host ("expired token set: length={0} exp={1} now={2} ({3}s in the past)" -f `
  $env:S17_EXPIRED_JWT.Length, $exp, $now, ($now - $exp))
