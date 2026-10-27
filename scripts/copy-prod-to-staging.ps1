<#
Copies the production database (everything in the public schema: tables,
data, policies, views) into the staging Supabase project, replacing
whatever staging had. Production is only read, never changed.

Run it yourself from the repo folder, in PowerShell:

    powershell -ExecutionPolicy Bypass -File scripts/copy-prod-to-staging.ps1

It asks for each project's connection string and database password. The
passwords are typed into this script only; they aren't saved anywhere.

Connection strings: Supabase dashboard -> the project -> Connect ->
"Session pooler" (works on any network). Paste it as shown, with
[YOUR-PASSWORD] still in it; the script fills the password in.

Safety: the staging project ref is read from .env.staging, and the script
refuses to run unless the staging connection string is for that project
and the production one is for production. It also needs you to type
"staging" before it changes anything. Everything on staging runs in one
transaction, so if any step fails, staging is left exactly as it was.

Not copied: logins (staging has its own, see CLAUDE.md), Edge Functions
and their secrets (deployed separately), and files in Storage (unused).

Needs pg_dump and psql (PostgreSQL client tools) on PATH.
Use -KeepDump to keep the dump file in .staging-copy/ afterwards (it holds
real customer data, so it's deleted by default; the folder is gitignored).
#>
param([switch]$KeepDump)

$ErrorActionPreference = 'Stop'
$ProdRef = 'pkyeytypgifgyiartgii'
$Root = Split-Path -Parent $PSScriptRoot

# --- Which project is staging -------------------------------------------
$envLine = Get-Content (Join-Path $Root '.env.staging') | Where-Object { $_ -match '^VITE_SUPABASE_URL=' }
if (-not $envLine -or $envLine -notmatch 'https://([a-z0-9]+)\.supabase\.co') {
  throw '.env.staging has no real VITE_SUPABASE_URL yet. Fill it in first.'
}
$StagingRef = $Matches[1]
if ($StagingRef -eq $ProdRef) { throw '.env.staging points at the production project. Refusing to continue.' }

foreach ($tool in 'pg_dump', 'psql') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw "$tool not found. Install the PostgreSQL client tools and make sure they're on PATH."
  }
}

# --- Connection strings ---------------------------------------------------
function Read-Plain([string]$prompt) {
  $secure = Read-Host $prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-ConnectionString([string]$label, [string]$mustHave, [string]$mustNotHave) {
  $url = (Read-Host "$label connection string (Session pooler, with [YOUR-PASSWORD] in it)").Trim()
  if ($url -notmatch '^postgres(ql)?://') { throw "$label`: that doesn't look like a postgresql:// connection string." }
  if (-not $url.Contains($mustHave)) { throw "$label`: that connection string isn't for project $mustHave. Refusing to continue." }
  if ($url.Contains($mustNotHave)) { throw "$label`: that connection string mentions project $mustNotHave. Refusing to continue." }
  if ($url.Contains('[YOUR-PASSWORD]')) {
    $password = Read-Plain "$label database password"
    $url = $url.Replace('[YOUR-PASSWORD]', [Uri]::EscapeDataString($password))
  }
  return $url
}

Write-Host ''
Write-Host "Production project: $ProdRef (read only)"
Write-Host "Staging project:    $StagingRef (will be REPLACED with a copy of production)"
Write-Host ''
$ProdUrl = Get-ConnectionString 'Production' $ProdRef $StagingRef
$StagingUrl = Get-ConnectionString 'Staging' $StagingRef $ProdRef

Write-Host ''
$answer = Read-Host "This deletes everything in staging ($StagingRef) and replaces it with production's data. Type 'staging' to continue"
if ($answer -ne 'staging') { Write-Host 'Cancelled. Nothing was changed.'; exit 1 }

# --- Dump production ---------------------------------------------------------
$Work = Join-Path $Root '.staging-copy'
New-Item -ItemType Directory -Force -Path $Work | Out-Null
$rawDump = Join-Path $Work 'prod-public.raw.sql'
$dump = Join-Path $Work 'prod-public.sql'
$dropSql = Join-Path $Work 'clear-staging.sql'
$postSql = Join-Path $Work 'after-restore.sql'

Write-Host 'Dumping production (read only)...'
& pg_dump "--dbname=$ProdUrl" --schema=public --no-owner "--file=$rawDump"
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed (see above). Nothing was changed.' }

# Leave out the lines a fresh Supabase project already has or can't take:
#  - The public schema itself (CREATE SCHEMA public, its comment, and its
#    GRANT/REVOKE lines): every Supabase project already has it, set up
#    the same way.
#  - ALTER DEFAULT PRIVILEGES for roles other than postgres (supabase_admin):
#    the postgres user isn't allowed to change those, and they're the same
#    in every project. The postgres ones are kept; see clear-staging below.
#  - SET transaction_timeout: only exists on Postgres 17+.
# Table-level grants and policies are kept: they're this app's own rules.
# Streamed line by line (rows with photos can be megabytes long), written as
# UTF-8 without a BOM so psql reads the first line correctly.
$utf8 = New-Object System.Text.UTF8Encoding($false)
$reader = New-Object System.IO.StreamReader($rawDump, $utf8)
$writer = New-Object System.IO.StreamWriter($dump, $false, $utf8)
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
Remove-Item $rawDump

# Which tables production sends to Realtime (live sync between devices).
$realtimeTables = & psql "--dbname=$ProdUrl" -At -c "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' order by 1"
if ($LASTEXITCODE -ne 0) { throw 'Reading the Realtime table list from production failed. Nothing was changed.' }

# --- SQL around the restore --------------------------------------------------
# Clears staging's public schema (tables, views, sequences, functions and
# types this app made; nothing that belongs to an extension) so the dump
# can recreate it.
# It also switches off the automatic grants Supabase gives every new table
# (to anon/authenticated/service_role) while the copy is made: pg_dump writes
# each table's grants assuming it starts with none, so with them on, any
# access production took away (e.g. anon on catalog) would come back on
# staging. Production's own default grants are re-applied from the dump at
# the end of the restore.
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
[System.IO.File]::WriteAllText($dropSql, $clear, $utf8)

$after = "-- Realtime: same tables as production.`n"
foreach ($t in @($realtimeTables)) {
  if ($t) { $after += "alter publication supabase_realtime add table public.`"$t`";`n" }
}
[System.IO.File]::WriteAllText($postSql, $after, $utf8)

# --- Restore into staging, all or nothing ------------------------------------
Write-Host 'Replacing staging with the copy (one transaction)...'
& psql "--dbname=$StagingUrl" --single-transaction --set=ON_ERROR_STOP=1 --quiet --output=NUL "--file=$dropSql" "--file=$dump" "--file=$postSql"
$restoreFailed = $LASTEXITCODE -ne 0

Remove-Item $dropSql, $postSql
if (-not $KeepDump) { Remove-Item $dump }

if ($restoreFailed) { throw 'The restore failed (see above), so it was rolled back: staging is unchanged.' }

$count = & psql "--dbname=$StagingUrl" -At -c "select count(*) from public.catalog"
Write-Host ''
Write-Host "Done. Staging now has a copy of production ($count catalog rows)."
if ($KeepDump) { Write-Host "The dump was kept at $dump (real customer data; delete it when you're done)." }
