<#
Takes the staging site offline and empties the staging database (decided
with the user: the copy of production's customer data only exists while
something is being tested; the next deploy copies it fresh).

Run:  npm run staging-down
-NoPrompt (used by Claude Code's /staging-down) fails instead of asking for
the staging database credentials if they aren't saved yet.
#>
param([switch]$NoPrompt)
. (Join-Path $PSScriptRoot 'staging-lib.ps1')

Assert-Tools
Set-Location $RepoRoot

# Works from any branch: falls back to main's .env.staging.
try { $stagingRef = Get-StagingRef }
catch {
  git fetch -q origin main
  $stagingRef = Get-StagingRef ((git show origin/main:.env.staging) -join "`n")
}
$urls = Get-DbUrls $stagingRef -Need 'staging' -NoPrompt:$NoPrompt

Write-Step '1/2 Taking the staging site offline'
git ls-remote --exit-code --heads origin staging | Out-Null
if ($LASTEXITCODE -eq 0) {
  git push -q origin --delete staging
  if ($LASTEXITCODE -ne 0) { throw 'Deleting the staging branch failed (see above).' }
  Invoke-PagesDeploy
  $live = 'x'
  for ($i = 0; $i -lt 24 -and $live; $i++) {
    $live = Get-LiveStagingCommit
    if ($live) { Start-Sleep -Seconds 5 }
  }
  if ($live) { Write-Host "The deploy finished, but $StagingSiteUrl still answers. It may take a few minutes to disappear." -ForegroundColor Yellow }
  else { Write-Host 'The staging site is offline.' }
} else {
  Write-Host 'The staging site was already offline.'
}

Write-Step '2/2 Emptying the staging database'
Clear-StagingData $urls.Staging
Write-Host 'Staging database emptied (tables kept, no rows).'
Write-Host ''
Write-Host 'Staging is down.' -ForegroundColor Green
