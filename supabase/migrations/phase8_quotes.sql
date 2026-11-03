-- DO NOT RE-RUN. Already applied; superseded by phase18_staff_only_access.sql.
--
-- This file creates "authenticated full access" policies. Since phase18,
-- every table is staff-only (public.is_staff()), so running this again
-- would reopen these tables to any signed-in account, not just the shop
-- login. Kept as history. On a brand-new database, run it and then re-run
-- phase18 straight after. npm run deploy-staging skips files with this line.
--
-- Quote tab: trade-in/buylist quoting for customers selling cards TO the
-- shop (the reverse of Catalog/Scanner/Import, which are about the shop's
-- own outbound stock). Ported from a manual Excel sheet the shop already
-- used — see CLAUDE.md's "Quote tab" section for the full design.
--
-- One `quotes` row is both a "collection" (an in-progress staging area
-- staff build up, e.g. "Jake binder proposal") and, once its offer_status
-- is set, the finalized record of that transaction — there is no separate
-- collection entity. Line items live in a single `items` jsonb array
-- rather than a child table: they're never queried independently of their
-- parent quote, matching this app's existing preference for denormalized
-- snapshots over relational child tables (e.g. sync_queue tickets already
-- snapshot fields rather than joining back to catalog). Each item:
--   { id, name, game, set, number, rarity, printing, condition,
--     basePrice, price, qty, notes }
-- Condition is deliberately never defaulted client-side (a genuine
-- physical assessment staff make at the counter), so it can be blank.
--
-- offer_status is one of: null (still open/in-progress), 'accepted_cash',
-- 'accepted_store_credit', 'rejected'. converted_to_catalog guards against
-- creating duplicate Catalog rows if an already-accepted quote is edited
-- and saved again — the accept-time conversion only fires once, on the
-- transition into an accepted state while this flag is false.
--
-- quote_number is a human-friendly display id ("Quote #14") — the uuid
-- primary key isn't something staff should ever need to read or type.
--
-- Deliberately NOT added to catalog_public_view (quotes are a staff-only
-- concern, never shown on the public binder page) or to sync_queue
-- (unrelated concern — sync_queue tracks the shop's own outbound listings
-- across POS/TCG Player/Collectr, not buy-side transactions).
--
-- Run this in the Supabase SQL Editor before deploying this code. After
-- running it, also add `quotes` to the `supabase_realtime` publication via
-- the Supabase dashboard (Database → Replication) — that step isn't done
-- by any migration file in this repo (catalog/sync_queue needed the same
-- one-time manual step when they were first set up).

create table quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number bigserial not null,
  collection_name text not null,
  customer_name text,
  customer_id text,
  phone text,
  date_quoted date not null default current_date,
  employee text,
  time_taken text,
  items jsonb not null default '[]'::jsonb,
  offer_status text,
  payout_amount numeric,
  paid_out boolean not null default false,
  converted_to_catalog boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table quotes enable row level security;
create policy "authenticated full access" on quotes
  for all
  to authenticated
  using (true)
  with check (true);

-- Quote tier settings — the % of total quoted value offered at each of the
-- three tiers, store-configurable rather than a hardcoded constant (the
-- source sheet hardcoded 50/60/70 everywhere). Separate from
-- store_settings: condition multipliers are a Catalog pricing concern,
-- tier percentages are a quoting concern, and conflating them in one
-- settings row would blur that distinction.
create table quote_settings (
  id int primary key default 1 check (id = 1),
  tier1_pct numeric not null default 50,
  tier2_pct numeric not null default 60,
  tier3_pct numeric not null default 70,
  updated_at timestamptz not null default now()
);
insert into quote_settings (id) values (1);

alter table quote_settings enable row level security;
create policy "authenticated full access" on quote_settings
  for all
  to authenticated
  using (true)
  with check (true);
