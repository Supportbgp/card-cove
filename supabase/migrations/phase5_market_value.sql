-- DO NOT RE-RUN. Already applied; superseded by phase18_staff_only_access.sql.
--
-- This file creates "authenticated full access" policies. Since phase18,
-- every table is staff-only (public.is_staff()), so running this again
-- would reopen these tables to any signed-in account, not just the shop
-- login. Kept as history. On a brand-new database, run it and then re-run
-- phase18 straight after. npm run deploy-staging skips files with this line.
--
-- Sprint 5: Market Value & Our Price. `price` keeps meaning what it already
-- means (the item's actual selling price, "Our Price"). Market Value itself
-- is never stored — it's computed live in the UI as base_price × a
-- condition multiplier, so it can't go stale if the condition changes later.
-- base_price is the NM reference price captured from whichever card
-- candidate staff actually selected in the image search (Scryfall/
-- pokemontcg.io/YGOPRODeck/Lorcast/SWU all carry a real price on the exact
-- card object already returned by search — no extra fetch needed).
--
-- Run this in the Supabase SQL Editor before deploying the Sprint 5 code.

alter table catalog add column base_price numeric;

-- Singleton settings row — store-configurable condition-multiplier table,
-- defaulting to the NM100/LP85/MP65/HP45/DMG25 anchor decided earlier
-- (CrystalCommerce's confirmed 100%/50% NM-to-Damaged default, centered on
-- community-cited ranges). NM is always 100 by definition, not stored.
create table store_settings (
  id int primary key default 1 check (id = 1),
  lp_pct numeric not null default 85,
  mp_pct numeric not null default 65,
  hp_pct numeric not null default 45,
  dmg_pct numeric not null default 25,
  updated_at timestamptz not null default now()
);
insert into store_settings (id) values (1);

alter table store_settings enable row level security;
create policy "authenticated full access" on store_settings
  for all
  to authenticated
  using (true)
  with check (true);
