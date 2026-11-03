-- DO NOT RE-RUN. Already applied; superseded by phase18_staff_only_access.sql.
--
-- This file creates "authenticated full access" policies. Since phase18,
-- every table is staff-only (public.is_staff()), so running this again
-- would reopen these tables to any signed-in account, not just the shop
-- login. Kept as history. On a brand-new database, run it and then re-run
-- phase18 straight after. npm run deploy-staging skips files with this line.
--
-- Sorting stage + Bulk item type. Real staff feedback on the Quote tab:
-- accepting a quote used to ask for one location+channels decision for the
-- WHOLE quote and write straight to Catalog (see the now-superseded
-- AcceptQuoteModal, closed unmerged in PR #40) — but cards from the same
-- quote can go to several different places, and a "just count it, don't
-- track it individually" Bulk option needs to exist too, decided AFTER
-- acceptance, not during it. See CLAUDE.md's "Sorting stage" section for
-- the full design.
--
-- Accepting a quote now just moves its items into this `sorting_queue`
-- table (a "needs to process" stage) instead of writing Catalog rows
-- directly. Staff then sort each row individually from the new Sorting
-- tab, either into a real Catalog row (itemType 'single', same as today)
-- or into Bulk (see below). A sorted row is deleted from this table once
-- resolved — the resulting Catalog row (or the incremented Bulk row) is
-- the durable record; this table only ever shows what's still pending,
-- matching sync_queue's "in-flight work" role rather than an audit log.
--
-- One row per quote LINE ITEM (i.e. its own qty carries over as one unit
-- of work), not one row per physical card — a stack of 3 identical copies
-- almost always gets sorted to the same place in one action.
create table sorting_queue (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid references quotes(id) on delete set null,
  -- Snapshotted so a row still reads sensibly even if its origin quote is
  -- later deleted (quote_id going null via the FK's on delete set null) —
  -- same "snapshot at the time" discipline sync_queue tickets already use.
  quote_collection_name text not null default '',
  name text not null,
  game text,
  set text,
  number text,
  rarity text,
  printing text,
  condition text,
  price numeric,
  base_price numeric,
  qty integer not null default 1,
  notes text,
  image_url text not null default '',
  image_data text not null default '',
  photo_url text not null default '',
  photo_data text not null default '',
  active_image text not null default 'photo' check (active_image in ('stock', 'photo')),
  created_at timestamptz not null default now()
);

alter table sorting_queue enable row level security;
create policy "authenticated full access" on sorting_queue
  for all
  to authenticated
  using (true)
  with check (true);

-- Bulk is a THIRD catalog.item_type value ('single' | 'slab' | 'bulk'),
-- not a separate table — a Bulk "item" is just a normal catalog row scoped
-- to one (location, game) pair, with qty as its running count. Sorting a
-- card into Bulk finds the existing row for that binder+game and
-- increments its qty, or creates one if this is the first card sorted
-- there. This reuses every bit of existing Catalog infrastructure
-- (CatalogTable, export, realtime sync, selling it back down) for free
-- instead of inventing parallel plumbing — deliberately NOT its own
-- table, unlike sorting_queue above, since a Bulk row genuinely IS a
-- catalog row, just one representing a pile instead of a single print.
-- Bulk rows carry no per-item identity (no set/rarity/condition/price)
-- and are never individually listed (posChannel/tcgplayerChannel/
-- collectrChannel all false, set client-side — see cardUtils.js).
--
-- Excluded from catalog_public_view: a Bulk lot isn't a specific card a
-- customer browses/buys off the public binder page, just an internal
-- holding count. Recreating the view (not just its WHERE clause alone,
-- since CREATE OR REPLACE VIEW needs the full column list) with the same
-- columns as phase6_dual_image.sql, adding the item_type exclusion.
create or replace view catalog_public_view as
select
  name, set_name, game, condition, printing,
  item_type, grader, grade,
  qty, price, image_url, image_data,
  location,
  photo_url, photo_data, active_image
from catalog
where sold = false and qty > 0 and item_type <> 'bulk';

-- Run this in the Supabase SQL Editor before deploying this code. After
-- running it, also add `sorting_queue` to the `supabase_realtime`
-- publication via the Supabase dashboard (Database → Publications) — the
-- same one-time manual step `quotes` needed (see phase8_quotes.sql).
