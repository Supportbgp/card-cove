<#
Puts the branch you're on live at https://supportbgp.github.io/card-cove/staging/
for testing:
  1. copies production's database into the staging database (production
     is only read),
  2. runs the migrations this branch adds on staging,
  3. publishes this branch's latest commit as the staging site,
  4. waits until the site serves it.
Take it down again with `npm run staging-down` when you're done.

Run:  npm run deploy-staging
The first run asks for both database connection strings and passwords and
saves them to .staging-db.local (gitignored). -NoPrompt (used by Claude
Code's /deploy-staging) fails instead of asking.

Only committed work is published: the site is built by GitHub from this
branch's last commit (pushed to the `staging` branch), not from this folder.
#>
param([switch]$NoPrompt)
. (Join-Path $PSScriptRoot 'staging-lib.ps1')

Assert-Tools
Set-Location $RepoRoot

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
$sha = (git rev-parse HEAD).Trim()
$subject = (git log -1 --format=%s).Trim()

# The commit being published has to carry the staging setup itself (the
# GitHub build runs `npm run build:staging` from it).
if (-not (git ls-tree --name-only HEAD .env.staging) -or -not ((git show HEAD:package.json) -join "`n").Contains('"build:staging"')) {
  throw "Branch $branch doesn't have the staging setup yet. Merge main into it first (git merge origin/main)."
}
$stagingRef = Get-StagingRef ((git show HEAD:.env.staging) -join "`n")
if (git status --porcelain --untracked-files=no) {
  Write-Host "Note: you have uncommitted changes. They are NOT included; staging gets the last commit ($($sha.Substring(0,7)) $subject)." -ForegroundColor Yellow
}

$urls = Get-DbUrls $stagingRef -NoPrompt:$NoPrompt
Test-DbConnection 'production' $urls.Prod
Test-DbConnection 'staging' $urls.Staging

Write-Step "1/4 Copying production's database into staging"
Copy-ProdToStaging $urls

Write-Step "2/4 Running this branch's migrations on staging"
Invoke-BranchMigrations $urls.Staging

Write-Step "3/4 Publishing $branch ($($sha.Substring(0,7)) $subject)"
git push -q -f origin "HEAD:refs/heads/staging"
if ($LASTEXITCODE -ne 0) { throw 'Pushing to the staging branch failed (see above).' }
Invoke-PagesDeploy

Write-Step '4/4 Checking the staging site'
$live = $null
for ($i = 0; $i -lt 24; $i++) {
  $live = Get-LiveStagingCommit
  if ($live -eq $sha) { break }
  Start-Sleep -Seconds 5
}
if ($live -ne $sha) {
  throw "The deploy finished but the staging site isn't serving $($sha.Substring(0,7)). The staging build may have failed: check the deploy run's warnings."
}
Write-Host ''
Write-Host "Staging is live: $StagingSiteUrl" -ForegroundColor Green
Write-Host "  $branch at $($sha.Substring(0,7)) ($subject)"
Write-Host "  Take it down when you're done: npm run staging-down"
