-- Want list. Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql (this uses its public.is_staff()).
--
-- Cards customers asked the shop to look for ("do you have X?" "No, but
-- I'll keep it on a list"). Staff add them; there's no customer login.
-- A request stays open until staff mark it fulfilled or rejected: it never
-- expires. Customer name and contact are staff-only: the public Wanted page
-- reads the view below, which leaves them out, and only lists the requests
-- staff ticked "Show on the public list" for.
--
-- Replaces the Discord-member bounty design (PRs #82-#84, never run on
-- production). Re-runnable.

create table if not exists public.want_requests (
  id uuid primary key default gen_random_uuid(),
  game text not null default '',
  name text not null,
  set_name text not null default '',
  number text not null default '',
  rarity text not null default '',
  printing text not null default '',
  condition text not null default '',
  image_url text not null default '',
  -- What the customer said they'd pay, if they said.
  max_price numeric,
  customer_name text not null default '',
  customer_contact text not null default '',
  -- Optional: the staff member who took the request (like a quote's Employee).
  responsible text not null default '',
  notes text not null default '',
  show_public boolean not null default true,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'rejected')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

alter table public.want_requests enable row level security;
drop policy if exists "staff full access" on public.want_requests;
create policy "staff full access" on public.want_requests
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.want_requests to authenticated;
revoke all on public.want_requests from anon;

-- The public Wanted page: open requests staff chose to show, without the
-- customer, their contact, their price, the responsible staff member or
-- the notes.
create or replace view public.public_want_list as
select id, game, name, set_name, number, rarity, printing, condition, image_url, created_at
from public.want_requests
where status = 'open' and show_public;

grant select on public.public_want_list to anon, authenticated;

-- So the app sees the new table right away.
notify pgrst, 'reload schema';
