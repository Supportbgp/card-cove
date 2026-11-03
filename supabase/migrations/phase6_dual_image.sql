-- DO NOT RE-RUN. Already applied; superseded by phase19_public_binders.sql.
--
-- This file recreates catalog_public_view without phase19's public_binders
-- filter, so running it again would put every binder back on the public
-- pages. Kept as history. npm run deploy-staging skips files with this line.
--
-- Sprint 6: dual-image model. Every item can now have two independent
-- images — a "stock" reference (image_url/image_data, already existed —
-- from card search APIs or a manual paste) and a "photo" (photo_url/
-- photo_data — a real-life picture, either a scanner crop or a manual
-- upload). active_image records which one staff want shown; defaults to
-- 'photo' so a real photo added later automatically takes over display
-- with no extra step (per the original ask: prefer the real photo when
-- both exist). The app still falls back to whichever slot actually has
-- something if the preferred one is empty (see resolveActiveImage in
-- cardUtils.js) — existing rows have no photo yet, so this default is a
-- no-op for them until one gets added.
--
-- Run this in the Supabase SQL Editor before deploying the Sprint 6 code.

alter table catalog
  add column photo_url text not null default '',
  add column photo_data text not null default '',
  add column active_image text not null default 'photo'
    check (active_image in ('stock', 'photo'));

-- catalog_public_view (see phase_qr_public_binder_view.sql) exposes a fixed
-- column list to the anon role for the public binder page — it needs the
-- same three new columns so a real photo can show there too, not just in
-- the authenticated catalog table. create or replace view preserves the
-- existing anon GRANT (grants are on the view object, not its definition),
-- but Postgres only allows CREATE OR REPLACE VIEW to *append* new columns —
-- it errors if an existing column's position shifts. So the three new
-- columns go after `location` (the previous last column), not interleaved
-- with the image columns they're conceptually next to.
create or replace view catalog_public_view as
select
  name, set_name, game, condition, printing,
  item_type, grader, grade,
  qty, price, image_url, image_data,
  location,
  photo_url, photo_data, active_image
from catalog
where sold = false and qty > 0;
