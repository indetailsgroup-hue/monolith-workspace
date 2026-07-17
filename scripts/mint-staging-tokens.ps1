# mint-staging-tokens.ps1 - sign in 4 s17-staging test users, set S17_*_JWT env in-process.
# Requires $env:S17_SUPABASE_ANON_KEY (legacy anon key, starts with eyJ...) set before running.
$ErrorActionPreference = 'Stop'
$base = 'https://wlivqsdgvwcjlbqqtcwt.supabase.co'
if ([string]::IsNullOrWhiteSpace($env:S17_SUPABASE_ANON_KEY)) {
  Write-Host 'Set $env:S17_SUPABASE_ANON_KEY first (legacy anon key eyJ...)' -ForegroundColor Red
  return
}
function Get-Tok([string]$email) {
  for ($i = 0; $i -lt 4; $i++) {
    try {
      $resp = Invoke-RestMethod -Method Post -Uri "$base/auth/v1/token?grant_type=password" `
        -Headers @{ apikey = $env:S17_SUPABASE_ANON_KEY; 'Content-Type' = 'application/json' } `
        -Body (@{ email = $email; password = 'S17test!pass' } | ConvertTo-Json)
      return [string]$resp.access_token
    } catch {
      if ($i -eq 3) { Write-Host "FAILED $email : $($_.Exception.Message)" -ForegroundColor Red; return '' }
      Start-Sleep -Milliseconds 900
    }
  }
}
$env:S17_DESIGNER_JWT  = Get-Tok 'designer@s17.test';  Start-Sleep -Milliseconds 500
$env:S17_FACTORY_JWT   = Get-Tok 'factory@s17.test';   Start-Sleep -Milliseconds 500
$env:S17_INSTALLER_JWT = Get-Tok 'installer@s17.test'; Start-Sleep -Milliseconds 500
$env:S17_NO_ROLE_JWT   = Get-Tok 'norole@s17.test'
Write-Host ("designer={0} factory={1} installer={2} norole={3}" -f `
  $env:S17_DESIGNER_JWT.Length, $env:S17_FACTORY_JWT.Length, `
  $env:S17_INSTALLER_JWT.Length, $env:S17_NO_ROLE_JWT.Length)
