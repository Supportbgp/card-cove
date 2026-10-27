-- Phase 16: remember which quote a catalog item was bought in.
--
-- Run once in the Supabase SQL Editor, BEFORE the app version that uses it
-- is live. Safe to re-run (add column if not exists).
--
-- A card bought through the Quote tab passes through sorting_queue (which
-- already keeps quote_id) on its way to the catalog, but the link was
-- dropped when it became a catalog row. This column keeps it, so the
-- item's edit screen can show "Bought in Quote #14" next to Cost and open
-- that quote.
--
-- Nullable: most items didn't come from a quote (Scanner, Import, manual),
-- and items made from quotes before this change have no recorded link
-- (decided with the user: no guessing/backfill). "on delete set null": if
-- the quote is later deleted, the item stays and just loses the link.
-- Bulk rows never get one (a Bulk row collects cards from many quotes).

alter table catalog
  add column if not exists source_quote_id uuid references quotes(id) on delete set null;
