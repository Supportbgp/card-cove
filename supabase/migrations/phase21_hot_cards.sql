-- Hot cards. Run in the Supabase SQL Editor, after
-- phase18_staff_only_access.sql (this uses its public.is_staff()).
--
-- A quote row warns staff when a card is sought after (CLAUDE.md "Hot
-- cards"). Three stored inputs, plus the sales table that already exists:
--   * meta_cards: how often each card shows up in recent tournament
--     decklists, rebuilt daily by the meta-check Edge Function from
--     Limitless and TopDeck.gg.
--   * hot_cards: a short list staff keep by hand ("meta staple", "everyone
--     asks for it") for what the data can't see.
--   * price_movers: a view over price_history (the daily price check's
--     log) of tracked cards whose market price moved in the last 30 days.
-- Staff-only, per phase18's rule for every table. The Edge Function writes
-- meta_cards with the service role, which bypasses RLS. Re-runnable.

create table if not exists public.meta_cards (
  source text not null,          -- 'limitless' or 'topdeck'
  game text not null,            -- canonical app game name ('Pokemon', 'Magic', ...)
  format text not null default '',
  name text not null,            -- as printed in the decklists
  name_key text not null,        -- normalized for matching (see hotNameKey in hotCards.js)
  code text not null default '', -- printed card code ('OP13-16'), One Piece/Gundam only (CODE_GAMES)
  decks int not null,            -- decklists that play the card
  total_decks int not null,      -- decklists counted for this game/format
  copies int not null,           -- total copies across those decklists
  events int not null default 0, -- tournaments counted for this game/format
  window_days int not null,
  updated_at timestamptz not null default now(),
  primary key (source, game, format, name_key, code)
);

create table if not exists public.hot_cards (
  id uuid primary key default gen_random_uuid(),
  game text not null default '',
  name text not null,
  reason text not null default '',
  added_by text not null default '',
  created_at timestamptz not null default now()
);

alter table public.meta_cards enable row level security;
drop policy if exists "staff full access" on public.meta_cards;
create policy "staff full access" on public.meta_cards
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.meta_cards to authenticated;
revoke all on public.meta_cards from anon;

alter table public.hot_cards enable row level security;
drop policy if exists "staff full access" on public.hot_cards;
create policy "staff full access" on public.hot_cards
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
grant select, insert, update, delete on public.hot_cards to authenticated;
revoke all on public.hot_cards from anon;

-- Per tracked catalog item: its first and latest daily price in the last
-- 30 days, at least 7 days apart (a day-or-two change is noise).
-- security_invoker, so price_history's own staff-only rule applies to
-- whoever reads the view.
create or replace view public.price_movers with (security_invoker = true) as
with recent as (
  select sku, name, game, price, checked_at
  from public.price_history
  where checked_at >= now() - interval '30 days'
),
first_seen as (
  select distinct on (sku) sku, price as first_price, checked_at as first_at
  from recent order by sku, checked_at asc
),
last_seen as (
  select distinct on (sku) sku, name, game, price as last_price, checked_at as last_at
  from recent order by sku, checked_at desc
)
select l.sku, l.name, l.game, f.first_price, l.last_price, f.first_at, l.last_at,
  round((l.last_price - f.first_price) / nullif(f.first_price, 0) * 100, 1) as pct_change
from last_seen l
join first_seen f using (sku)
where l.last_at - f.first_at >= interval '7 days';

revoke all on public.price_movers from anon;
grant select on public.price_movers to authenticated;

-- So the app sees the new tables right away.
notify pgrst, 'reload schema';
