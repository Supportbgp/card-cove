-- Public binders (bounties Phase 1). Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql (this uses its public.is_staff()).
--
-- Staff choose which binders/cases are public. Only those show up on the
-- public stock page (?shop=1) and on their QR page (?binder=...). Every
-- binder starts NOT public (decided with the user): until staff tick one in
-- Import / Export -> Public binders, its QR page shows "not shared".
--
-- A binder is just catalog.location text (there's no binders table), so
-- this is a list of location names. Bulk lots stay excluded as before:
-- they're in-store only.
--
-- Re-runnable.

create table if not exists public.public_binders (
  location text primary key,
  created_at timestamptz not null default now()
);

alter table public.public_binders enable row level security;
drop policy if exists "staff full access" on public.public_binders;
create policy "staff full access" on public.public_binders
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Supabase normally grants these on a new table by itself; stated here so
-- this doesn't depend on it. The rule above still limits it to staff.
-- Visitors never touch the table, only the view below.
grant select, insert, update, delete on public.public_binders to authenticated;
revoke all on public.public_binders from anon;

-- Same columns as before (phase10_sorting_bulk.sql), now limited to public
-- binders. The view's owner reads catalog and public_binders past their
-- RLS, so visitors only ever see what this select allows.
create or replace view public.catalog_public_view as
select
  name, set_name, game, condition, printing,
  item_type, grader, grade,
  qty, price, image_url, image_data,
  location,
  photo_url, photo_data, active_image
from public.catalog
where sold = false and qty > 0 and item_type <> 'bulk'
  and location in (select location from public.public_binders);

-- The names of the public binders, so the public pages can tell "not
-- shared" apart from "empty", and list the binders to filter by.
create or replace view public.public_binder_list as
select location from public.public_binders;

-- Signed-in users (staff now, members later) read these too.
grant select on public.catalog_public_view to anon, authenticated;
grant select on public.public_binder_list to anon, authenticated;

-- Check: before ticking any binder, this returns 0.
--   select count(*) from catalog_public_view;
