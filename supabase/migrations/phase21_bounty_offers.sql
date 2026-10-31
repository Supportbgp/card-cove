-- Bounty offers and holds (bounties Phase 4). Run in the Supabase SQL
-- Editor, after phase20_bounties.sql.
--
-- Staff answer a bounty with an offer: a card from the catalog at a price.
-- One copy of that card is held for the member for 7 days while they
-- Accept or Decline on the website; accepting keeps the hold until they
-- pick it up and pay in store (decided with the user). Walk-ins reach a
-- bounty the normal way: Quote, then Sorting, into the catalog, then an
-- offer from there.
--
-- One offer at a time per bounty, stored on the bounty itself. The offered
-- card is snapshotted (name/set/condition/image/price), because a member
-- can't read the catalog. Every change still goes through the bounties
-- Edge Function; nothing here gives members new write access.
--
-- Re-runnable.

alter table public.bounties add column if not exists offer_status text
  check (offer_status in ('pending', 'accepted', 'declined'));
alter table public.bounties add column if not exists offer_sku text not null default '';
alter table public.bounties add column if not exists offer_name text not null default '';
alter table public.bounties add column if not exists offer_set text not null default '';
alter table public.bounties add column if not exists offer_condition text not null default '';
alter table public.bounties add column if not exists offer_printing text not null default '';
alter table public.bounties add column if not exists offer_image text not null default '';
alter table public.bounties add column if not exists offer_location text not null default '';
alter table public.bounties add column if not exists offer_price numeric;
alter table public.bounties add column if not exists offer_note text not null default '';
alter table public.bounties add column if not exists offered_at timestamptz;
alter table public.bounties add column if not exists offer_expires_at timestamptz;
alter table public.bounties add column if not exists offer_answered_at timestamptz;

-- The hold: one copy of this catalog row is set aside for that bounty
-- until hold_until. A hold past its date simply no longer counts (no job
-- needed to clear it).
alter table public.catalog add column if not exists hold_bounty_id uuid
  references public.bounties(id) on delete set null;
alter table public.catalog add column if not exists hold_until timestamptz;

-- Public stock: same columns as phase19, but a held copy isn't for sale.
create or replace view public.catalog_public_view as
select
  name, set_name, game, condition, printing,
  item_type, grader, grade,
  qty - (case when hold_until > now() then 1 else 0 end) as qty,
  price, image_url, image_data,
  location,
  photo_url, photo_data, active_image
from public.catalog
where sold = false and item_type <> 'bulk'
  and location in (select location from public.public_binders)
  and qty - (case when hold_until > now() then 1 else 0 end) > 0;

-- Public bounties: an accepted offer means the card is spoken for, so it
-- leaves the Wanted list. A pending offer stays listed (the member may
-- still decline it).
create or replace view public.public_bounties as
select
  id, game, name, set_name, number, rarity, printing, condition,
  image_url, max_price, created_at, expires_at
from public.bounties
where status = 'open' and expires_at > now()
  and coalesce(offer_status, '') <> 'accepted';

grant select on public.catalog_public_view to anon, authenticated;
grant select on public.public_bounties to anon, authenticated;
