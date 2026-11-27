-- Openings: sealed product the store opens itself (booster boxes etc.) for
-- bulk/online sales. Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql (this uses its public.is_staff()).
-- Re-runnable.
--
-- One row per opening: what was opened (one product name + quantity), who
-- opened it and why, what the sealed product was worth, what staff expected
-- it to yield, and every card pulled (the `items` jsonb array, same shape
-- as a quote's items: singles plus flat-priced bulk lots). The actual value
-- of the singles, the bulk value and the difference from Expected are
-- computed in the app from `items`, never stored, so they can't disagree.
--
-- Marking an opening Done moves its pulls to sorting_queue (like an
-- accepted quote), with each card's Cost split from the sealed value
-- (src/lib/openingUtils.js). `moved_to_sorting` keeps a second save from
-- moving them twice.

create table if not exists public.openings (
  id uuid primary key default gen_random_uuid(),
  opening_number bigserial,
  opened_at timestamptz not null default now(),
  product_name text not null default '',
  product_qty integer not null default 1,
  game text not null default '',
  employee text not null default '',
  reason text not null default '',
  -- What the sealed product was worth, for the whole quantity opened.
  sealed_value numeric,
  -- What staff expected it to yield (typed in, e.g. from an EV site).
  expected_value numeric,
  -- Why the pulls came out above/below Expected.
  difference_reason text not null default '',
  notes text not null default '',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'done')),
  moved_to_sorting boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.openings enable row level security;
drop policy if exists "staff full access" on public.openings;
create policy "staff full access" on public.openings
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.openings to authenticated;
grant usage, select on sequence public.openings_opening_number_seq to authenticated;
revoke all on public.openings from anon;

-- Sorting rows remember the opening they came from (like quote_id), and so
-- do the catalog rows made from them, so an item's edit screen can say
-- "Pulled in Opening #3". "on delete set null": deleting an opening keeps
-- the cards and just drops the link.
alter table public.sorting_queue
  add column if not exists opening_id uuid references public.openings(id) on delete set null;
alter table public.catalog
  add column if not exists source_opening_id uuid references public.openings(id) on delete set null;

-- So the app sees the new table and columns right away.
notify pgrst, 'reload schema';
