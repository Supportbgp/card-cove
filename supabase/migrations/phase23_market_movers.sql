-- Market price climbs. Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql (this uses its public.is_staff()).
--
-- market_movers: cards whose TCGplayer market price rose over the last 30
-- days, from TCGCSV's daily price archives (CLAUDE.md "Hot cards: market
-- price climbs from TCGCSV"). Rebuilt daily by
-- .github/workflows/market-check.yml (scripts/market-movers/run.js), which
-- writes with the service role (bypasses RLS). A quote row reads it to say
-- "TCGplayer market up 34% in 30 days" for that exact print.
-- Staff-only, per phase18's rule for every table. Re-runnable.

create table if not exists public.market_movers (
  product_id int not null,         -- TCGplayer product id
  sub_type text not null default '', -- 'Normal', 'Holofoil', 'Foil', ...
  game text not null,              -- canonical app game name
  name text not null,              -- TCGplayer product name
  name_key text not null,          -- hotNameKey(name), for matching
  set_name text not null default '', -- TCGplayer set (group) name
  number text not null default '', -- printed card number
  old_price numeric not null,      -- market price 30 days ago
  new_price numeric not null,      -- market price on the latest day
  pct_change numeric not null,
  url text not null default '',    -- the product's TCGplayer page
  window_days int not null,
  updated_at timestamptz not null default now(),
  primary key (product_id, sub_type)
);
create index if not exists market_movers_name_key on public.market_movers (game, name_key);

alter table public.market_movers enable row level security;
drop policy if exists "staff full access" on public.market_movers;
create policy "staff full access" on public.market_movers
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.market_movers to authenticated;
revoke all on public.market_movers from anon;

-- So the app sees the new table right away.
notify pgrst, 'reload schema';
