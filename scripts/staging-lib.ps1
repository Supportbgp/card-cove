# Shared pieces for deploy-staging.ps1 and staging-down.ps1 (dot-sourced).
# See CLAUDE.md's "Staging environment" section for the whole picture.
#
# Database credentials live in .staging-db.local in the repo folder
# (gitignored; the user chose to save them rather than type them on every
# deploy). It's written the first time a deploy asks for them. Its lines:
#   PROD_DB_URL=<Session pooler connection string, with [YOUR-PASSWORD] in it>
#   PROD_DB_PASSWORD=<production database password>
#   STAGING_DB_URL=<same, for the staging project>
#   STAGING_DB_PASSWORD=<staging database password>
# Never print, read out or commit this file.

$ErrorActionPreference = 'Stop'
$ProdRef = 'pkyeytypgifgyiartgii'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$CredsFile = Join-Path $RepoRoot '.staging-db.local'
$StagingSiteUrl = 'https://supportbgp.github.io/card-cove/staging/'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Give up on a database connection after 20 seconds instead of hanging.
# Every pg_dump/psql call below reads this from the environment.
$env:PGCONNECT_TIMEOUT = '20'

# What to try when a database can't be reached. Found in real use: a VPN
# (Proton VPN) blocked port 5432, which the Session pooler uses, so the
# connection was cut ("server closed the connection unexpectedly") or
# just timed out.
$ConnectionHint = @'
Couldn't connect to the {0} database (see the error above).
  - "server closed the connection unexpectedly" or "timeout expired": something is
    blocking port 5432, most often a VPN. Turn it off (or exclude pg_dump.exe and
    psql.exe from it with split tunneling) and run this again.
  - "password authentication failed": a saved password is wrong. Delete
    .staging-db.local and run this again in a terminal to enter it again.
Nothing was changed.
'@

function Write-Step([string]$text) { Write-Host "`n== $text" -ForegroundColor Cyan }

function Assert-Tools {
  foreach ($tool in 'pg_dump', 'psql', 'git', 'gh') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      throw "$tool not found on PATH. (pg_dump/psql come with the PostgreSQL client tools; gh is the GitHub CLI.)"
    }
  }
}

# The staging project's ref, from .env.staging's VITE_SUPABASE_URL.
function Get-StagingRef([string]$envText) {
  if (-not $envText) { $envText = [System.IO.File]::ReadAllText((Join-Path $RepoRoot '.env.staging')) }
  if ($envText -notmatch '(?m)^VITE_SUPABASE_URL=https://([a-z0-9]+)\.supabase\.co') {
    throw '.env.staging has no real VITE_SUPABASE_URL yet. Fill it in first.'
  }
  $ref = $Matches[1]
  if ($ref -eq $ProdRef) { throw '.env.staging points at the production project. Refusing to continue.' }
  return $ref
}

function Read-Plain([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Read-SavedCreds {
  $creds = @{}
  if (Test-Path $CredsFile) {
    foreach ($line in [System.IO.File]::ReadAllLines($CredsFile)) {
      if ($line -match '^\s*([A-Z_]+)=(.*)$') { $creds[$Matches[1]] = $Matches[2].Trim() }
    }
  }
  return $creds
}

# Full connection string (password filled in) for one project, checked to be
# for that project and not the other.
function Resolve-DbUrl([string]$label, [string]$url, [string]$password, [string]$mustHave, [string]$mustNotHave) {
  if ($url -notmatch '^postgres(ql)?://') { throw "$label connection string in .staging-db.local doesn't look like a postgresql:// string." }
  if (-not $url.Contains($mustHave)) { throw "$label connection string isn't for project $mustHave. Refusing to continue." }
  if ($url.Contains($mustNotHave)) { throw "$label connection string mentions project $mustNotHave. Refusing to continue." }
  if ($url.Contains('[YOUR-PASSWORD]')) { $url = $url.Replace('[YOUR-PASSWORD]', [Uri]::EscapeDataString($password)) }
  return $url
}

# Returns @{ Prod = <url>; Staging = <url> }. -Need 'staging' when only the
# staging database is used (staging-down). Asks and saves on first use,
# unless -NoPrompt (Claude Code's /deploy-staging), which fails instead.
function Get-DbUrls([string]$stagingRef, [string]$Need = 'both', [switch]$NoPrompt) {
  $creds = Read-SavedCreds
  $wanted = @('STAGING')
  if ($Need -eq 'both') { $wanted = @('PROD', 'STAGING') }
  $missing = $wanted | Where-Object { -not $creds["$($_)_DB_URL"] -or -not $creds["$($_)_DB_PASSWORD"] }
  if ($missing) {
    if ($NoPrompt) {
      throw "Database credentials aren't saved yet. Run 'npm run deploy-staging' once in a terminal; it asks for them and saves them to .staging-db.local."
    }
    Write-Host 'Database credentials (saved to .staging-db.local, which git ignores).'
    Write-Host 'Connection string: Supabase dashboard -> project -> Connect -> Session pooler. Paste it as shown, with [YOUR-PASSWORD] in it.'
    foreach ($w in $missing) {
      $name = if ($w -eq 'PROD') { "Production ($ProdRef)" } else { "Staging ($stagingRef)" }
      $creds["$($w)_DB_URL"] = (Read-Host "$name connection string").Trim()
      $creds["$($w)_DB_PASSWORD"] = Read-Plain "$name database password"
    }
    # Check before saving, so a mixed-up pair is never written down.
    if ($creds['PROD_DB_URL']) { Resolve-DbUrl 'Production' $creds['PROD_DB_URL'] $creds['PROD_DB_PASSWORD'] $ProdRef $stagingRef | Out-Null }
    Resolve-DbUrl 'Staging' $creds['STAGING_DB_URL'] $creds['STAGING_DB_PASSWORD'] $stagingRef $ProdRef | Out-Null
    $lines = @('# Card Cove staging database credentials. Local only (gitignored). Never commit or share.')
    foreach ($k in 'PROD_DB_URL', 'PROD_DB_PASSWORD', 'STAGING_DB_URL', 'STAGING_DB_PASSWORD') {
      if ($creds[$k]) { $lines += "$k=$($creds[$k])" }
    }
    [System.IO.File]::WriteAllLines($CredsFile, $lines, $Utf8NoBom)
    Write-Host "Saved to $CredsFile"
  }
  $result = @{
    Staging = Resolve-DbUrl 'Staging' $creds['STAGING_DB_URL'] $creds['STAGING_DB_PASSWORD'] $stagingRef $ProdRef
  }
  if ($Need -eq 'both') {
    $result.Prod = Resolve-DbUrl 'Production' $creds['PROD_DB_URL'] $creds['PROD_DB_PASSWORD'] $ProdRef $stagingRef
  }
  return $result
}

# A quick "can we log in at all?" check before anything is changed, so a
# blocked port or a wrong password stops the run up front with a hint.
function Test-DbConnection([string]$label, [string]$url) {
  & psql -w "--dbname=$url" -At -c "select 1" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw ($ConnectionHint -f $label) }
}

# Replaces everything in staging's public schema with a copy of production's
# (tables, data, policies, grants, views, Realtime). Production is only read.
# One transaction: if anything fails, staging is left exactly as it was.
function Copy-ProdToStaging($urls) {
  $work = Join-Path $RepoRoot '.staging-copy'
  New-Item -ItemType Directory -Force -Path $work | Out-Null
  $rawDump = Join-Path $work 'prod-public.raw.sql'
  $dump = Join-Path $work 'prod-public.sql'
  $dropSql = Join-Path $work 'clear-staging.sql'
  $postSql = Join-Path $work 'after-restore.sql'
  try {
    & pg_dump "--dbname=$($urls.Prod)" --schema=public --no-owner "--file=$rawDump"
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump of production failed (see above). Nothing was changed.' }

    # Leave out the lines a fresh Supabase project already has or can't take:
    #  - The public schema itself (CREATE SCHEMA public, its comment, and its
    #    GRANT/REVOKE lines): every Supabase project already has it, set up
    #    the same way.
    #  - ALTER DEFAULT PRIVILEGES for roles other than postgres (supabase_admin):
    #    the postgres user isn't allowed to change those, and they're the same
    #    in every project. The postgres ones are kept; see $clear below.
    #  - SET transaction_timeout: only exists on Postgres 17+.
    # Table-level grants and policies are kept: they're this app's own rules.
    # Streamed line by line (rows with photos can be megabytes long), written
    # as UTF-8 without a BOM so psql reads the first line correctly.
    $reader = New-Object System.IO.StreamReader($rawDump, $Utf8NoBom)
    $writer = New-Object System.IO.StreamWriter($dump, $false, $Utf8NoBom)
    try {
      while ($null -ne ($line = $reader.ReadLine())) {
        if ($line.StartsWith('ALTER DEFAULT PRIVILEGES ') -and -not $line.StartsWith('ALTER DEFAULT PRIVILEGES FOR ROLE postgres ')) { continue }
        if ($line.StartsWith('SET transaction_timeout')) { continue }
        if ($line -eq 'CREATE SCHEMA public;' -or $line.StartsWith('COMMENT ON SCHEMA public ')) { continue }
        if ($line -match '^(GRANT|REVOKE) .* ON SCHEMA public (TO|FROM) ') { continue }
        $writer.WriteLine($line)
      }
    } finally {
      $reader.Close(); $writer.Close()
    }

    # Which tables production sends to Realtime (live sync between devices).
    $realtimeTables = & psql "--dbname=$($urls.Prod)" -At -c "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1"
    if ($LASTEXITCODE -ne 0) { throw 'Reading the Realtime table list from production failed. Nothing was changed.' }

    # Clears staging's public schema (tables, views, sequences, functions and
    # types this app made; nothing that belongs to an extension) so the dump
    # can recreate it.
    # It also switches off the automatic grants Supabase gives every new table
    # (to anon/authenticated/service_role) while the copy is made: pg_dump
    # writes each table's grants assuming it starts with none, so with them
    # on, any access production took away (e.g. anon on catalog) would come
    # back on staging. Production's own default grants are re-applied from
    # the dump at the end of the restore.
    $clear = @'
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated, service_role;
do $$
declare r record;
begin
  for r in select c.oid::regclass as obj, c.relkind from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('v', 'm')
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop %s if exists %s cascade', case r.relkind when 'm' then 'materialized view' else 'view' end, r.obj);
  end loop;
  for r in select c.oid::regclass as obj from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relispartition = false
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop table if exists %s cascade', r.obj);
  end loop;
  for r in select c.oid::regclass as obj from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'S'
             and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    execute format('drop sequence if exists %s cascade', r.obj);
  end loop;
  for r in select p.oid::regprocedure as obj from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('drop routine if exists %s cascade', r.obj);
  end loop;
  for r in select t.oid::regtype as obj from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typtype in ('e', 'd')
             and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e') loop
    execute format('drop type if exists %s cascade', r.obj);
  end loop;
end $$;
'@
    [System.IO.File]::WriteAllText($dropSql, $clear, $Utf8NoBom)

    $after = "-- Realtime: same tables as production.`n"
    foreach ($t in @($realtimeTables)) {
      if ($t) { $after += "alter publication supabase_realtime add table public.`"$t`";`n" }
    }
    # Supabase's API keeps its own list of tables and only reloads it when
    # told to; without this the app can report a copied table as missing
    # ("Could not find the table ... in the schema cache"). Sent when the
    # transaction commits.
    $after += "notify pgrst, 'reload schema';`n"
    [System.IO.File]::WriteAllText($postSql, $after, $Utf8NoBom)

    & psql "--dbname=$($urls.Staging)" --single-transaction --set=ON_ERROR_STOP=1 --quiet --output=NUL "--file=$dropSql" "--file=$dump" "--file=$postSql"
    if ($LASTEXITCODE -ne 0) { throw 'Copying into staging failed (see above), so it was rolled back: staging is unchanged.' }
  } finally {
    # The dump holds real customer data: never leave it lying around.
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
  }
  $count = & psql "--dbname=$($urls.Staging)" -At -c "select count(*) from public.catalog"
  Write-Host "Staging database now has a copy of production ($count catalog rows)."
}

# Migration files this branch adds or changes compared to main, in name
# order. They run on staging after the copy, so a feature's schema change is
# tested before it's run on production.
function Get-BranchMigrations {
  git -C $RepoRoot fetch -q origin main
  $files = git -C $RepoRoot diff --name-only --diff-filter=AM origin/main...HEAD -- supabase/migrations
  return @($files | Where-Object { $_ -like '*.sql' } | Sort-Object)
}

function Invoke-BranchMigrations([string]$stagingUrl) {
  $files = Get-BranchMigrations
  if (-not $files.Count) { Write-Host 'No new migrations on this branch.'; return }
  foreach ($f in $files) {
    Write-Host "Running $f on staging..."
    & psql "--dbname=$stagingUrl" --single-transaction --set=ON_ERROR_STOP=1 --quiet --output=NUL "--file=$(Join-Path $RepoRoot $f)"
    if ($LASTEXITCODE -ne 0) { throw "Migration $f failed on staging (see above). The site wasn't published." }
  }
  # Same reason as in Copy-ProdToStaging: new tables/columns must reach the API.
  & psql "--dbname=$stagingUrl" --quiet --output=NUL -c "notify pgrst, 'reload schema';"
}

# Empties every table in staging's public schema (structure stays).
function Clear-StagingData([string]$stagingUrl) {
  $sql = @'
do $$
declare tables text;
begin
  select string_agg(c.oid::regclass::text, ', ') into tables
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relispartition = false;
  if tables is not null then
    execute 'truncate table ' || tables || ' restart identity cascade';
  end if;
end $$;
'@
  & psql "--dbname=$stagingUrl" --set=ON_ERROR_STOP=1 --quiet --output=NUL -c $sql
  if ($LASTEXITCODE -ne 0) { throw 'Emptying the staging database failed (see above).' }
}

# Starts deploy.yml on main (it builds production from main, and staging
# from the `staging` branch if that exists) and waits for it to finish.
function Invoke-PagesDeploy {
  $started = (Get-Date).ToUniversalTime().AddSeconds(-5)
  gh workflow run deploy.yml --ref main | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Starting the Pages deploy failed (see above).' }
  $runId = $null
  for ($i = 0; $i -lt 30 -and -not $runId; $i++) {
    Start-Sleep -Seconds 3
    $runs = gh run list --workflow deploy.yml --event workflow_dispatch --limit 5 --json databaseId,createdAt | ConvertFrom-Json
    $run = $runs | Where-Object { ([datetime]$_.createdAt).ToUniversalTime() -ge $started } | Select-Object -First 1
    if ($run) { $runId = $run.databaseId }
  }
  if (-not $runId) { throw "Couldn't find the deploy run that was just started. Check the repo's Actions tab." }
  Write-Host "Deploy run: https://github.com/Supportbgp/card-cove/actions/runs/$runId"
  while ($true) {
    Start-Sleep -Seconds 10
    $view = gh run view $runId --json status,conclusion | ConvertFrom-Json
    if ($view.status -eq 'completed') {
      if ($view.conclusion -ne 'success') { throw "The deploy run finished with '$($view.conclusion)'. See the link above." }
      return
    }
  }
}

# What the staging site currently serves: the commit in staging-version.txt,
# or $null if staging is offline. A fresh query string skips Pages' cache.
function Get-LiveStagingCommit {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$($StagingSiteUrl)staging-version.txt?t=$([DateTime]::UtcNow.Ticks)"
    return $r.Content.Trim()
  } catch {
    return $null
  }
}
