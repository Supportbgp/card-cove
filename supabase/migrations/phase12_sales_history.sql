-- DO NOT RE-RUN. Already applied; superseded by phase18_staff_only_access.sql.
--
-- This file creates "authenticated full access" policies. Since phase18,
-- every table is staff-only (public.is_staff()), so running this again
-- would reopen these tables to any signed-in account, not just the shop
-- login. Kept as history. On a brand-new database, run it and then re-run
-- phase18 straight after. npm run deploy-staging skips files with this line.
--
-- Sales reporting (Feature A of the price-tracking/reporting roadmap) —
-- a durable, append-only record of what's actually sold, independent of
-- sync_queue (which only tracks in-flight cross-platform listing cleanup
-- and has no reason to keep a ticket around once every platform stamp is
-- done) and independent of `catalog` itself (a sold single's row can later
-- be edited/deleted, which must never retroactively change a past report).
--
-- One row per Mark Sold event, snapshotting the fields a report actually
-- needs — same "snapshot at the time" discipline sync_queue tickets and
-- sorting_queue rows already use elsewhere in this app. Deliberately does
-- NOT snapshot every catalog field (no set/printing/rarity/location) —
-- only what Feature A's revenue/volume-by-game report needs; add more
-- columns later if a report actually needs them, rather than guessing now.
--
-- Scope note: only the batch "Mark sold" flow writes here (see
-- App.jsx's handleBatchSell) — editing Quantity down directly in Edit does
-- NOT create a sale record, same boundary it already draws for sync_queue
-- tickets (confirmed with the user rather than assumed, since the two
-- flows could reasonably have been treated the same).
create table sales (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null,
  game text not null default '',
  condition text not null default '',
  qty_sold integer not null default 1,
  sale_price numeric,
  sold_at timestamptz not null default now()
);

create index sales_sold_at_idx on sales (sold_at);

alter table sales enable row level security;
create policy "authenticated full access" on sales
  for all
  to authenticated
  using (true)
  with check (true);

-- Run this in the Supabase SQL Editor before deploying this code — no
-- code-side default masks a missing table here, so Mark Sold would start
-- throwing a real insert error rather than silently skipping the sale
-- record. No realtime-publication step needed (unlike quotes/sorting_queue)
-- — reports are pull-based, not something another open tab needs to see
-- update live.
