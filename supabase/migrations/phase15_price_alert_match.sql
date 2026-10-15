-- Records WHICH card the daily price check compared an item against, on each
-- price alert — real report: the first TCGdex-era runs left 46 open alerts
-- where 5 were expected, many on generic names like "Mew", and there was no
-- way to tell whether an alert compared our card against the right print or
-- a different, pricier one. See CLAUDE.md's "Price alerts: matched card,
-- Find card, and no alerts on guessed matches" section.
--
-- All text, default '' (not nullable) — an alert raised before this
-- migration simply shows "matched card not recorded" in the app.
-- match_basis is how solidly the print was identified ('number', 'set',
-- 'only_print' — Pokemon only today; '' for other games, whose lookups take
-- the first search result without a basis). 'guess' never appears here:
-- price-check doesn't raise an alert for a guessed match at all.
--
-- Run once in the Supabase SQL Editor BEFORE redeploying price-check — the
-- new function writes these columns, and a missing column makes the alert
-- insert fail (it now reports that as `alertInsertErrors` in its response
-- instead of failing silently).
alter table price_alerts add column matched_name text not null default '';
alter table price_alerts add column matched_set text not null default '';
alter table price_alerts add column matched_number text not null default '';
alter table price_alerts add column matched_image text not null default '';
alter table price_alerts add column matched_url text not null default '';
alter table price_alerts add column match_basis text not null default '';

-- Condition: provider prices are Near Mint, so price-check now scales the NM
-- price by the store's condition multipliers (store_settings) before
-- comparing — real report: a Damaged Gengar alerting against an NM price.
-- `condition` is the item's condition tier at check time (NM/LP/MP/HP/DMG),
-- `market_nm_price` the raw NM price found; `new_price` becomes the
-- condition-adjusted estimate that was actually compared. Both null for
-- alerts raised before this migration (compared as NM).
alter table price_alerts add column condition text;
alter table price_alerts add column market_nm_price numeric;
