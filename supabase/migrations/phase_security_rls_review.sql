-- DO NOT RE-RUN. Already applied; superseded by phase18_staff_only_access.sql.
--
-- This file creates "authenticated full access" policies. Since phase18,
-- every table is staff-only (public.is_staff()), so running this again
-- would reopen these tables to any signed-in account, not just the shop
-- login. Kept as history. On a brand-new database, run it and then re-run
-- phase18 straight after. npm run deploy-staging skips files with this line.
--
-- Security review: catalog/sync_queue RLS was set up directly in the
-- Supabase dashboard early in the project and was never captured as a
-- migration, so it isn't version-controlled or auditable from the repo.
-- This makes that policy explicit and reproducible.
--
-- Run the SELECT below FIRST to see current state:
--
--   select tablename, rowsecurity from pg_tables where tablename in ('catalog','sync_queue');
--
-- If rowsecurity is already true with an equivalent authenticated-only
-- policy, the statements below are a no-op. If it's false, this closes a
-- real gap: without RLS, the catalog is readable/writable by anyone with
-- the public anon key (which ships in the client bundle) even without
-- logging in through the app. This does not affect the public binder QR
-- view (catalog_public_view) — that view is owned by a role that bypasses
-- RLS on the base table, per its own migration.

alter table catalog enable row level security;
alter table sync_queue enable row level security;

drop policy if exists "authenticated full access" on catalog;
create policy "authenticated full access" on catalog
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated full access" on sync_queue;
create policy "authenticated full access" on sync_queue
  for all
  to authenticated
  using (true)
  with check (true);
