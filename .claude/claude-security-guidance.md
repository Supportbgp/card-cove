# Card Cove security rules

Card Cove is a React SPA (GitHub Pages) talking straight to Supabase. There is
no app server: the database's row-level security (RLS) and the Edge
Functions are the only places access is enforced. Flag changes that break
any of these rules.

## Database access
- Every table in `public` has RLS on and exactly one policy:
  `"staff full access"` for `authenticated`, `using (public.is_staff())
  with check (public.is_staff())`. A migration that creates a table must add
  it. Never add an "authenticated full access" / `using (true)` policy, and
  never grant `anon` anything on a table.
- `is_staff()` reads `app_metadata.staff` from the login token. Only an
  admin (SQL Editor or the service role) may set it; nothing in the app may
  write `app_metadata`.
- Visitors (no login) only ever read views: `catalog_public_view`,
  `public_binder_list`, `public_want_list`. These must expose browsing-safe
  card columns only: never customer names, contact details, prices a
  customer offered, staff notes, costs, sales or quotes. Adding a column to
  a public view needs a deliberate reason.
- Migrations are SQL run by hand in the Supabase SQL Editor and must be
  re-runnable (`if not exists`, `drop policy if exists`, `create or replace`).
- Old migrations that create "authenticated full access" start with
  `-- DO NOT RE-RUN` (superseded by phase18); `deploy-staging` skips them.
  Keep that header on any migration a later one supersedes.

## Secrets
- The service-role key is only ever used inside Edge Functions
  (`SUPABASE_SERVICE_ROLE_KEY`, auto-provided) and as the
  `SUPABASE_SERVICE_ROLE_KEY` GitHub Actions secret for `price-check`. It
  must never appear in `src/`, in a committed file, in a URL, or in logs.
- `src/lib/supabase.js` and `.env.staging` may hold only the public project
  URL and publishable/anon key. Anything else secret there is a finding.
- `.staging-db.local` holds database passwords: never read, print, log or
  commit it. `.staging-copy/` holds real customer data: never commit it.
- `ANTHROPIC_API_KEY` and `TOPDECK_API_KEY` live only in Supabase Edge
  Function secrets (TopDeck.gg's terms forbid the key in a browser). The
  local `.topdeck-key.local` (gitignored) is for testing: never print it.

## Edge Functions (`supabase/functions/*`)
- Functions called from the browser must check the caller is staff on the
  auth server (`callerIsStaff`), not just that a token exists, before
  spending the shop's API keys or touching data.
- CORS stays an allowlist (`ALLOWED_ORIGINS` + `DEV_ORIGIN_RE`), never `*`
  with credentials.
- `price-check` runs with the service role from GitHub Actions only: it
  rejects any bearer that isn't the service-role key (`isServiceRoleRequest`
  in `auth.ts`), checked before anything else. It must
  not become callable with arbitrary request bodies that widen what it
  reads or writes.
- `meta-check` is the same: service-role bearer only (its own `auth.ts`),
  called by GitHub Actions, and it only takes a job number. It stores card
  counts only, never TopDeck/Limitless player names or details.
- Don't send secrets, tokens or customer data to third-party card APIs
  (Scryfall, TCGdex, YGOPRODeck, Lorcast, Egman, swu-db, Limitless,
  TopDeck.gg); they get card
  names and set/number hints only.

## Browser code
- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function` with
  data from the database, imports, scans or card APIs.
- Customer and staff data from the database is rendered as text.
- Imported spreadsheets (`xlsx`, CSV) are untrusted input: parse, never
  execute; don't build formulas or URLs from cell contents without
  validation.
- Never put personal data in URL query strings or `localStorage`.
  IndexedDB (the stack scanner) holds card photos only.
- Links built from stored, imported or API data (`listingUrl`, `sourceUrl`,
  a price alert's `matched_url`) go through `safeHttpUrl` (or `openSafeUrl`
  for `window.open`) in `src/lib/safeUrl.js` before any `href`; imports run
  `sourceUrl` through it before saving.

## GitHub Actions
- Workflow inputs and secrets reach `run:` scripts through `env:`, never as
  `${{ }}` pasted into the script text, and inputs are validated there.
