-- Phase 18: staff-only access (bounties Phase 0).
--
-- Run once in the Supabase SQL Editor, on staging first (it runs there
-- automatically with `npm run deploy-staging`), then on production right
-- before merging. Safe to re-run. AFTER running it, sign out and back in on
-- every device (or just reload the app: it refreshes the login on load) so
-- the staff flag reaches the login token.
--
-- Until now every table's rule was "authenticated full access": anyone
-- signed in could read and change everything, which was fine while the only
-- login was the shop's own. The public bounty section will add member
-- accounts (Sign in with Discord), so "signed in" must stop meaning "staff".
--
-- How staff are marked: a `staff: true` flag in the login account's
-- app_metadata. Only an admin (SQL / service role) can set app_metadata; a
-- user can't change it themselves, and it's carried in their login token.
-- is_staff() reads it from the token, so a rule check costs no extra query.
--
-- The public binder page is unaffected: it reads catalog_public_view as
-- anon, through the view owner's access, not through these rules. The
-- service role (price-check) bypasses RLS as before.

-- 1. Who counts as staff.
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'staff')::boolean, false)
$$;

-- 2. Mark the shop's shared login as staff (the same email the app signs in
--    with: src/lib/supabase.js SHARED_LOGIN_EMAIL). On staging this is the
--    staging-only login with the same email.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"staff": true}'::jsonb
where email = 'rafaelromero.dev@gmail.com';

-- 3. Every table in public: RLS on, every existing rule dropped, one
--    staff-only rule instead. Done as a loop over whatever tables exist, so
--    tables made by hand (catalog, sync_queue) and ones from migrations not
--    yet run here are covered alike. A table added later must create its own
--    "staff full access" policy using is_staff() (see CLAUDE.md).
do $$
declare
  t record;
  p record;
begin
  for t in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relispartition = false
  loop
    execute format('alter table public.%I enable row level security', t.relname);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t.relname loop
      execute format('drop policy %I on public.%I', p.policyname, t.relname);
    end loop;
    execute format(
      'create policy "staff full access" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())',
      t.relname
    );
  end loop;
end $$;

-- Check: every public table should now list exactly one policy, "staff full
-- access", and the shop login should show staff = true.
--   select tablename, policyname from pg_policies where schemaname = 'public' order by 1;
--   select email, raw_app_meta_data -> 'staff' as staff from auth.users;
