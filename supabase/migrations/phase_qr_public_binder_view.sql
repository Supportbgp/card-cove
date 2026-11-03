-- DO NOT RE-RUN. Already applied; superseded by phase19_public_binders.sql.
--
-- This file recreates catalog_public_view without phase19's public_binders
-- filter, so running it again would put every binder back on the public
-- pages. Kept as history. npm run deploy-staging skips files with this line.
--
-- Binder QR feature: a restricted, read-only view for the unauthenticated
-- binder lookup page. Exposes only browsing-relevant columns (no SKU, notes,
-- or source URL), and only rows that are actually available (not sold, qty
-- > 0). Granting SELECT on this view — not the catalog table itself — is
-- what lets an anonymous visitor (someone who scanned the QR code, with no
-- login) read binder contents without opening up the base table at all.
--
-- This relies on the standard Postgres/Supabase view-ownership behavior:
-- since this view is created by the role running this migration (which owns
-- `catalog` and bypasses its RLS), querying the view doesn't re-check
-- catalog's RLS policy for the anon role — the view's own WHERE clause and
-- column list are the only restriction anon ends up with.

CREATE VIEW catalog_public_view AS
SELECT
  name, set_name, game, condition, printing,
  item_type, grader, grade,
  qty, price, image_url, image_data,
  location
FROM catalog
WHERE sold = false AND qty > 0;

GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON catalog_public_view TO anon;
