-- DO NOT RE-RUN. Already applied; superseded by phase18_staff_only_access.sql.
--
-- This file creates "authenticated full access" policies. Since phase18,
-- every table is staff-only (public.is_staff()), so running this again
-- would reopen these tables to any signed-in account, not just the shop
-- login. Kept as history. On a brand-new database, run it and then re-run
-- phase18 straight after. npm run deploy-staging skips files with this line.
--
-- Feature B (price tracking + spike alerts), PR 1 — data model only. The
-- scheduled supabase/functions/price-check Edge Function (triggered daily
-- by .github/workflows/price-check.yml) reads/writes these tables directly
-- via a service-role client. No in-app UI reads these yet (that's PR 2) —
-- see CLAUDE.md's "Price tracking & spike alerts" section.
--
-- Run this in the Supabase SQL Editor before deploying price-check.

-- Append-only, like `sales` — every scheduled check's result for every
-- tracked item, forever. Kept for future trend/sparkline use, not read by
-- anything yet. No realtime-publication step needed (nothing needs to see
-- a row land live).
create table price_history (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null default '',
  game text not null default '',
  price numeric not null,
  checked_at timestamptz not null default now()
);
create index price_history_sku_idx on price_history (sku, checked_at desc);

alter table price_history enable row level security;
create policy "authenticated full access" on price_history
  for all
  to authenticated
  using (true)
  with check (true);

-- One row per detected spike. `acknowledged` is what PR 2's in-app badge
-- will count — a row is never deleted once resolved (unlike sorting_queue),
-- since "we got notified about this on this date" is itself a useful
-- historical record, not just a transient to-do.
create table price_alerts (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null default '',
  game text not null default '',
  previous_price numeric not null,
  new_price numeric not null,
  pct_change numeric not null,
  detected_at timestamptz not null default now(),
  acknowledged boolean not null default false
);
create index price_alerts_unacked_idx on price_alerts (acknowledged) where acknowledged = false;

alter table price_alerts enable row level security;
create policy "authenticated full access" on price_alerts
  for all
  to authenticated
  using (true)
  with check (true);

-- Store-configurable thresholds — its own singleton row, same reasoning
-- quote_settings got its own row separate from store_settings: this is a
-- price-tracking concern, not a Catalog condition-multiplier concern.
-- floor_price: only items with base_price >= this are checked at all ("high
-- cost" opt-in floor). spike_pct: how much a fresh price has to exceed an
-- item's own base_price by to count as a spike (up only, v1).
create table price_tracking_settings (
  id int primary key default 1 check (id = 1),
  floor_price numeric not null default 25,
  spike_pct numeric not null default 20,
  updated_at timestamptz not null default now()
);
insert into price_tracking_settings (id) values (1);

alter table price_tracking_settings enable row level security;
create policy "authenticated full access" on price_tracking_settings
  for all
  to authenticated
  using (true)
  with check (true);
