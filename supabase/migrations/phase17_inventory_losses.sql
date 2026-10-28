-- Phase 17: lost / stolen cards.
--
-- Run once in the Supabase SQL Editor, BEFORE the app version that uses it
-- is live (on staging this runs automatically with `npm run deploy-staging`).
-- Safe to re-run.
--
-- inventory_losses: one row per "Report lost / stolen" from a card's Edit
-- screen. Two kinds:
--   - a card missing from stock (sale_id null): the catalog qty goes down
--     and a Sync Queue ticket (kind 'loss') reminds staff to delist it;
--   - a card that was sold and then lost in shipment (sale_id set): if the
--     customer was refunded, that sale is marked refunded (sales.refunded_at)
--     and drops out of Reports' revenue.
-- Either way the loss is valued at the card's Cost (cost_each, per copy,
-- snapshotted here so a later Cost edit doesn't rewrite history), and the
-- Reports tab subtracts loss_amount from Profit.

create table if not exists inventory_losses (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  name text not null default '',
  game text not null default '',
  condition text not null default '',
  qty integer not null default 1,
  cost_each numeric not null,
  loss_amount numeric not null,
  reason text not null default 'other',
  notes text not null default '',
  sale_id uuid references sales(id) on delete set null,
  refunded boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists inventory_losses_occurred_at_idx on inventory_losses (occurred_at);

alter table inventory_losses enable row level security;
drop policy if exists "authenticated full access" on inventory_losses;
create policy "authenticated full access" on inventory_losses
  for all
  to authenticated
  using (true)
  with check (true);

-- A sale whose customer was refunded after a shipping loss. Reports leave a
-- refunded sale out of revenue, cost and units (the loss row carries the
-- cost instead).
alter table sales add column if not exists refunded_at timestamptz;

-- 'sale' (every existing ticket) or 'loss' (a lost/stolen card still to be
-- delisted). A loss ticket has no "Undo sale"; the loss is undone from the
-- toast right after reporting it, or removed in Reports.
alter table sync_queue add column if not exists kind text not null default 'sale';
