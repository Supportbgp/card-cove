# Card Cove — Board Game Paradise Inventory App

Internal inventory/catalog tool for a TCG/collectibles shop (singles + graded
slabs). No traditional backend — a React SPA talking directly to Supabase.

## Architecture

- **Frontend**: Vite + React SPA, deployed to GitHub Pages via
  `.github/workflows/deploy.yml` on every push to `main`. `base:
  '/card-cove/'` in `vite.config.js` — the live URL is
  `https://supportbgp.github.io/card-cove/`. (Renamed from
  `Sync-Ledger-App`/`supportbgp.github.io/Sync-Ledger-App/` — see the
  Branding section below for why that decision was reversed.)
- **Backend**: Supabase — Postgres (`catalog`, `sync_queue` tables), Supabase
  Auth (one shared login for shop staff, no per-user accounts), Supabase
  Realtime (cross-device live sync), one Edge Function
  (`scan-binder-page`, Deno) for the binder scanner's vision-LLM call.
- **No router library**: `src/main.jsx` checks the URL for a `?binder=`
  query param and renders either the authenticated `<App/>` or the public,
  no-login `<BinderView/>` — there's nothing else to route.
- **State**: no Redux/Zustand — `App.jsx` owns top-level state and passes
  handlers down; `UIContext.jsx` covers cross-cutting UI concerns (toasts,
  confirm dialogs, lightbox).

## Branding

- **App renamed from "Ledger" to "Card Cove"** (user-facing text only).
  "Card Cove" is the name everywhere it's shown on its own (topbar, login
  screen, staff docs header, export labels); "by Board Game Paradise" is
  appended only in footer-type spots (`App.jsx`'s bottom footnote,
  `BinderView.jsx`'s public footnote, `StaffDocs.jsx`'s footnote) — not in
  the topbar/login, per explicit instruction to keep the main name just
  "Card Cove" everywhere else. `package.json`'s internal `name` field was
  updated to match (`card-cove`) — cosmetic only, no visible effect.
  Every section below this point that still says "Ledger" in its own
  prose is historical — written back when that was the app's name — and
  was deliberately left as-is rather than rewritten, same as this file's
  standing practice of not silently rewriting past decisions.
  - **The GitHub repo was renamed `Sync-Ledger-App` → `card-cove`,
    reversing an earlier "leave it alone indefinitely" decision.** That
    earlier call (keep the old name/URL forever, since renaming breaks
    the live Pages URL and any already-printed Binder QR codes, and a
    custom domain was offered and declined) stood only briefly — the user
    decided the mismatch between the live brand name and the repo/URL
    wasn't worth carrying long-term after all, and went through with the
    rename. `vite.config.js`'s `base` and `playwright.config.js`'s
    `baseURL` were updated to `/card-cove/` in the same PR that preceded
    the rename, merged immediately after the rename to keep the Pages
    downtime (GitHub does **not** auto-redirect a Pages site on repo
    rename, unlike the repo's own git/web URLs) to a single redeploy
    cycle. Every Binder QR code printed under the old URL needed
    reprinting after this — there is no redirect to fall back on. Local
    git remotes were repointed to `card-cove` to match.
  - **Logo/icon imagery deliberately unchanged** — confirmed with the
    user to keep the existing Board Game Paradise palm/sun/meeple/wave
    emblem (see "Logo assets" below) as Card Cove's own icon rather than
    commissioning distinct mark, i.e. Card Cove reads as a feature/
    sub-brand under the same visual identity, not a fully separate one.
- **Logo assets**: `src/assets/logo-icon.png` (square, transparent, used
  inline via `<img>` in `App.jsx`'s topbar, `Login.jsx`, and
  `BinderView.jsx`'s public topbar) plus `public/favicon.ico`,
  `public/favicon.png` (32×32), and `public/apple-touch-icon.png` (180×180,
  flattened onto white — iOS doesn't render transparent touch icons well),
  all referenced from `index.html`. All four are the same crop: just the
  palm/sun/meeple/wave emblem from the real Board Game Paradise logo, with
  the "BOARD GAME PARADISE" wordmark cropped out — favicon/topbar space is
  too small for a wordmark to read, and the emblem alone is distinctive
  enough. The wordmark and emblem sit almost flush against each other in
  the source logo (near-zero gap), so the crop's right edge cuts a couple
  px into the wave's outer curl rather than risk including a sliver of the
  "B" — imperceptible at icon size, and the only way to guarantee zero text
  bleed given how tight the source composition is.
- **Color palette** (`src/styles/index.css` `:root`): every existing
  variable (`--amber`, `--green`, `--rust`, `--purple`, `--blue`, `--bg`,
  `--surface-alt`, `--ink*`, `--border`) was recolored to a palette sampled
  directly from the logo's actual pixels (palm/grass green, sun gold,
  meeple red, wave teal, trunk brown), then deepened only as much as needed
  to clear ~4.5:1 WCAG contrast against white for text/filled-button use —
  computed with the real contrast formula per color, not eyeballed; several
  new values (e.g. green, blue) land *above* the original muted palette's
  own contrast levels. Variable **names and semantic roles are unchanged**
  (amber=pending/warning, green=success, rust=danger/sold, purple=slab,
  blue=informational/links) so no component needed touching — only the
  hex values moved. `--teal`/`--teal-soft` are new tokens (the logo's wave
  color has no prior UI equivalent) and now drive the primary button fill
  and the active-tab underline, so the brand color shows up on the app's
  actual primary actions, not just decoratively. A couple of hardcoded
  hex colors that bypassed the variable system entirely (`.pending-badge`'s
  border, `.binder-card-slab-badge`'s background) were found and moved
  onto the same token system / matching hues so they don't silently clash
  with the new palette.
- **To swap in a different/updated logo later**: replace
  `src/assets/logo-icon.png` and regenerate the three `public/` favicon
  files from the same source crop (square, transparent background) — there
  is no build step that derives them automatically, they're committed as
  static files.

## Polish & mobile responsiveness

- **Priority surfaces**: staff explicitly need the public binder page
  (`BinderView`), Catalog, Scanner, and Import/Export to be comfortably
  usable from a phone, not just the register desktop — Sync Queue and the
  Export/QR modals stay desktop-oriented for now (not asked for, not yet
  touched beyond not being actively broken).
- **One shared CSS breakpoint** (`@media (max-width: 640px)` in
  `styles/index.css`) covers every plain style/stacking fix — two-column
  grids (`.field-row2`, `.map-grid`) collapse to one column, `.img-preview-
  wrap` and `.scan-row` switch to column layout, `.overlay`/`.app` padding
  shrinks to give content more width. `CatalogTable`'s table-vs-cards swap
  uses its own JS breakpoint instead (`useIsMobile`, `hooks/useIsMobile.js`,
  700px via `matchMedia`) since that's a structural markup change, not a
  style tweak — a media query alone can't conditionally mount different
  JSX.
  - **Inline `style={{flex: N}}` silently defeats a CSS media query** —
    found this the hard way in `ScannerPanel`'s `ScanRow`: its inputs had
    hardcoded `style={{flex: 2}}` etc., which as an inline style always
    outranks any external stylesheet rule regardless of specificity or
    media query. Fixed by moving those to real classes (`.sf-wide`, `.sf`,
    `.sf-auto`) so the mobile breakpoint can actually override them. Worth
    remembering for any future inline flex/width styling on a component
    that might need a responsive override later.
- **CatalogTable mobile view**: below the 700px breakpoint, the dense
  table is replaced entirely (not just visually collapsed) by
  `.catalog-cards` — one compact card per item (thumb, name, game tag,
  qty, price) that expands on tap to reveal SKU/updated/location/notes/
  platform-status/Edit+Sell, via per-row `expandedSkus` state in
  `CatalogTable.jsx`. Batch-select checkboxes still work per-card plus a
  "Select all visible" row at the bottom. `deriveRow()` computes the
  qty/sold/subtitle/game-tag fields once, shared by both the desktop table
  and mobile card rendering paths, so the two layouts can't quietly
  disagree on what "sold" or the subtitle line means.
- **Per-game color tags** (`GAME_TAG_CLASS` in `cardUtils.js`, `.badge.tag-*`
  in CSS): a small colored badge next to each item's name showing its game.
  Originally reused the 6 shared UI accent tokens with some games sharing a
  color; real-phone testing found 3 exact repeats (Magic/SWU, Pokemon/
  Riftbound, Yugioh/Gundam) plus Lorcana/One Piece sitting only ~10° apart
  on the color wheel despite different tokens — all too close to tell apart
  at badge size. Every game now gets its own dedicated hue (4 new `--tag-*`
  tokens — `--tag-gundam`/`--tag-riftbound`/`--tag-swu`/`--tag-lorcana` —
  alongside the 5 shared tokens still reused for Magic/Pokemon/Yugioh/One
  Piece/Sports Singles), spaced ~30-40° apart around the wheel, each
  individually verified at ≥4.5:1 contrast against white. Games with no
  obvious color default to a neutral gray tag rather than no tag at all, so
  every row still shows its game. Adds a real scan-by-color aid on a
  catalog that stocks 9+ separate game lines, not just decoration.
- **Saturated palette v2**: every accent color (`--amber`/`--green`/`--rust`/
  `--purple`/`--blue`/`--teal`) was pushed noticeably more saturated than
  the first branding pass (which read as muted once actually deployed),
  then re-darkened just enough to hold ≥4.5:1 contrast against white again
  — recomputed with the real WCAG formula after each saturation bump, same
  discipline as the original palette pass. The three hand-picked border
  colors that sit between a token's `-soft` background and its saturated
  foreground (`.pending-badge`, `.pending-badge.zero`, `.batch-bar`) were
  recomputed to match (a 65%-soft/35%-fg blend) rather than left stale
  against the new colors.
- **EditModal reorganized into labeled boxed sections** (`.form-section` +
  the existing `.section-label` divider style, already used elsewhere in
  the app) — Item details / Channels / Quantity & pricing / Notes & status
  — instead of one long flat list of fields. Purely a markup/CSS
  reorganization; no field, handler, or validation logic changed.
- **SellModal** skips the quantity stepper entirely for a single-copy item
  (`card.qty === 1`) and shows a plain "Mark this item as sold?" yes/no
  confirmation instead — asking for a quantity when there's only one
  possible answer was pure friction for the common case. Multi-copy items
  keep the existing stepper.
- **Row actions**: Edit was a 28px icon-button with "Edit" as literal text
  crammed into it (too small to read comfortably, and rendered flush
  against Sell with no gap). Now a normal `.btn.secondary.small` with a
  `.row-actions` flex gap between it and Sell, used identically by both the
  desktop table and the mobile card's expanded view. "+ Add item" moved
  from `.btn.secondary.small` to a plain `.btn` (full-size, teal-filled)
  so it reads as the toolbar's primary action, not a peer of the filter
  dropdowns.
- **Manual QA note**: this sandbox has no network path to the real
  Supabase project, so Catalog/Scanner/Import (all behind the shared
  login) couldn't be screenshot-tested against live data. Verified instead
  with a throwaway local harness (mock catalog data, real components,
  deleted before committing — see git history for `devtest.html`/
  `src/devtest.jsx` if this needs redoing) — actually exercised CSV
  parsing (client-side, no network needed) and every modal (Add/Edit item,
  Sell) at both a phone and desktop viewport width via Playwright
  screenshots, which is what caught the inline-`flex`-style bug above.
  BinderView and Login were checked directly against the built app instead
  since they don't require a session.

## Mobile polish round 2 (real-phone findings)

A first pass at mobile (above) was verified via a local harness and
Playwright screenshots, not a real device. Actually testing on a real phone
surfaced a second round of issues, several of which trace back to two root
causes rather than N unrelated bugs:

- **The toast's `z-index` (60) was accidentally *higher* than the modal
  overlay's (50)** — a still-fading toast could sit on top of an open
  modal. Fixed by making `.overlay` categorically outrank everything else
  on screen (`z-index: 1000`) and dropping `.toast` to `40`.
- **Flex items don't shrink below their content's width by default** — a
  `<select>` inside a flex row (`.map-row` in the import column-mapper,
  `.sheet-picker`'s sheet selector) with a long option text could force the
  whole row, and the whole page, wider than the viewport. On mobile this
  didn't just look bad — it also visually mislaid the Binder QR modal
  (which centers on the *viewport*, so a page zoomed-to-fit to accommodate
  the overflow no longer has that centered modal within the visible area)
  and made the sheet picker read as "not there." Fixed at the source
  (`flex: 1; min-width: 0` on both selects) plus a `overflow-x: hidden`
  safety net on `body` so no future overflowing element can do this again.

Everything else found:

- **Modal system**: `EditModal`/`SellModal`/`SettingsModal`/`ConfirmModal`
  close only via their own explicit Cancel/confirm buttons — no backdrop-tap-
  to-close. That was tried (a shared `backdropClose(onClose)` helper wired
  onto each `.overlay`'s `onClick`, checking `e.target === e.currentTarget`
  so clicks on the modal card itself didn't bubble into a close) and then
  removed after real use found it caused more accidental dismissals than it
  prevented — deliberately staying with explicit-button-only closing rather
  than re-adding a backdrop shortcut. `Lightbox` is the one exception, and
  was never wired through that helper in the first place: it closes on a
  click anywhere (including the image), which is the expected pattern for a
  plain image viewer with no form state to protect.
  - **Also tried, then reverted before that: closing a modal on the mobile
    back button/gesture.** An earlier version pushed a throwaway `history` entry
    per modal and closed on the resulting `popstate` (`useModalBackClose`,
    since deleted). Real-device testing found this made Cancel and
    backdrop-tap *also* trigger a real "go back" navigation — this app has
    no history depth beneath a modal's pushed entry to safely consume, so
    the cleanup's own `history.back()` call (meant to tidy up after a
    non-back close) ended up navigating the browser away for real. Decided
    the win wasn't worth the risk here and dropped it entirely — at the
    time, Cancel plus backdrop-tap (since also removed, above) were enough;
    the physical back button/gesture just does its normal thing again, same
    as before this round.
    (This is also where a `<React.StrictMode>` double-invoke dev-mode-only
    bug briefly appeared — the *first* symptom found — where the modal
    closed itself the instant it opened, because the async `history.back()`
    from a phantom StrictMode cleanup landed its `popstate` on the second
    mount's listener instead of firing into a void. Fixed with a timing
    guard at the time; moot now that the whole back-button feature is
    gone, but worth remembering if anything else in this app ever pairs
    `pushState`/`history.back()` with effect cleanup.)
- **Touch targets were sized for a mouse**: `.btn`/`.btn.small` get real
  min-heights (44px/40px) under the mobile breakpoint; `.modal-foot`
  buttons (Cancel/Delete/Save etc.) go full-width and stack, Cancel first
  (top) — matching each modal's own markup order, so no per-modal
  reordering trick (e.g. `column-reverse`) is needed; `.checkbox-row`
  checkboxes and the mobile catalog card's platform-status chips and
  Edit/Sell buttons all got bigger specifically in that context
  (`.catalog-card-details` scoped rules), leaving the denser desktop table
  untouched.
- **`.img-frame.large` (EditModal's big preview) wasn't centering its own
  children** when the Real photo/Stock image toggle row rendered below the
  image — the toggle row could be wider than the image, and since the
  frame is `display: inline-block` sized to its widest child, the
  (narrower) image defaulted to the frame's left edge instead of centering
  within it. Switched to `flex; flex-direction: column; align-items:
  center`.
- **CatalogTable**: "Select all visible" moved to the top of the mobile
  card list (was at the bottom, easy to miss); the `deriveRow()` subtitle
  builder now assembles parts as an array and joins once instead of
  string-concatenating a separator onto a possibly-empty first join — the
  old version left a stray leading " · " before a slab's grade whenever
  set/condition/printing were *all* blank.
- **Pricing settings silently failing to open**: `multipliers` started as
  `null`, and the Settings modal was gated on it truthily
  (`{showSettings && multipliers && <SettingsModal/>}`) — on any network
  hiccup loading it (no `.catch` on that promise, so a thrown exception
  rather than a Supabase-shaped `{error}` would leave it `null` forever),
  tapping the footer link did nothing, with zero feedback. `multipliers`
  now starts as `DEFAULT_CONDITION_MULTIPLIERS` instead of `null` — the
  modal is usable immediately regardless of load state, and a real
  settings row (or the same defaults, via the added `.catch`) just
  overwrites it once the fetch actually resolves.
- **Pricing warning text reworded** (`EditModal`/`ScannerPanel`, both had
  the same copy) to actually explain itself — what Market Value is an
  estimate *of* (NM price × a flat condition %) and why that can be off by
  real money on an expensive card — instead of just asserting "this can be
  off," which staff had to come ask about.
- **Scanner file input dropped `capture="environment"`** — that attribute
  is exactly what skips the OS's normal file-picker chooser and launches
  the camera directly; removing it restores the OS's own "Camera / Photo
  Library / Files" choice so a photo already on the device can be shared in
  instead of always requiring a fresh one.
- **Scanner "Find another image" doing nothing**: `ScanRow`'s displayed
  image was `row.photoData || (stock image)` — since a crop almost always
  exists, it unconditionally won regardless of what stock candidate got
  picked, so a pick never visibly changed anything. Fixed by giving
  `ScanRow` the same dual-image model as `EditModal` (`row.activeImage`,
  defaulting to `'photo'`) with its own compact Photo/Stock toggle in the
  thumbnail column; picking a stock candidate now also flips the toggle to
  `'stock'` (same reasoning as `EditModal`'s `selectCandidate`), and the
  chosen `activeImage` is carried into the saved catalog row.
- **Rarity-based disambiguation** (`row.rarity` in `ScannerPanel`, a plain
  editable field next to Set — the vision model now guesses it too, see
  the crop-pipeline note above): the same-name/same-set-different-rarity
  case wasn't disambiguated at all before, since rarity wasn't captured
  anywhere. It's deliberately *not* a hard server-side filter for
  Scryfall/pokemontcg.io — `preferRarity()` in `cardSearch.js` re-sorts
  results whose own reported rarity loosely matches the hint to the front
  but never drops anything, since a hard filter risks silently zeroing out
  results over a free-text/vocabulary mismatch (same "never guess an
  external API's exact behavior" discipline as everywhere else in this
  project). For the three Egman-backed games (One Piece/Riftbound/Gundam),
  `rarityHint` narrows server-side in `card-lookup-proxy`'s `egmanQuery` —
  safe there specifically because `rarity` is a real, already-confirmed
  field on that response (same sample that confirmed `card_code`/
  `set_code`), using the identical narrow-if-it-helps/fall-back-if-not rule
  already used for `setHint`. SWU gets neither — no confirmed rarity field
  in its response, so nothing was added rather than guessed at. Requires
  redeploying both `scan-binder-page` (new schema field) and
  `card-lookup-proxy` (new request/response field) to take effect.

## Directory map

- `src/lib/` — all non-React logic. `db.js` (Supabase reads/writes + row↔card
  mapping), `cardUtils.js` (`normalizeCard`, game-name canonicalization,
  platform-status-reset logic, the canonical `GAMES` list), `cardSearch.js`
  (Scryfall/TCGdex/YGOPRODeck/Lorcast card+image lookup — Pokemon moved
  off pokemontcg.io, see "Pokemon: pokemontcg.io → TCGdex migration"), `csv.js`/
  `importParse.js`/`exportFormats.js` (import/export), `quoteUtils.js`
  (Quote tab totals/tiers/catalog-conversion logic), `image.js`
  (client-side photo resize), `scanner.js` (binder-scan Edge Function
  client), `qr.js` (QR generation), `supabase.js` (client init).
- `src/components/catalog/` — main catalog table, edit/sell modals, batch
  actions.
- `src/components/queue/` — the Sync Queue tab (POS/TCG Player/Collectr
  three-stamp tracking).
- `src/components/importexport/` — `ImportPanel.jsx` (the CSV/XLSX import
  flow, standalone enough to also be embedded in the Quote tab),
  `ExportPanel.jsx` (Export/Binder-QR/Reset-all-data), and
  `ImportExportPanel.jsx` (a thin composer of both — the real Import/Export
  tab).
- `src/components/scanner/` — the binder-page scanner review queue
  (`ScannerPanel.jsx`, also embeddable in the Quote tab).
- `src/components/quotes/` — the Quote tab: `QuotesTab.jsx` (landing list +
  new-quote entry point), `QuoteDetail.jsx` (one quote's detail view),
  `QuoteLineItemRow.jsx`, `CatalogItemPicker.jsx` (the local-catalog
  typeahead).
- `src/components/BinderView.jsx` — the public, read-only binder page (no
  `UIContext`, no auth).
- `src/components/docs/` — the standalone staff documentation page (also no
  `UIContext`, no auth; reached via `?help=1`), split into one section file
  per topic under `docs/sections/`.
- `supabase/migrations/` — SQL run manually via the Supabase SQL Editor
  (there is no migration runner wired up — each file's header comment says
  when/how to run it).
- `supabase/functions/scan-binder-page/` — the Edge Function; deploy with
  `supabase functions deploy scan-binder-page`, secret set with `supabase
  secrets set ANTHROPIC_API_KEY=sk-ant-...`.

## Data model notes

- A catalog item is either a `single` or a `slab` (`itemType`). Slabs are
  unique (grader/grade/cert fields); singles have qty.
- Three independent per-item platform-status booleans —
  `posSynced`/`tcgplayerSynced`/`collectrSynced` — plus matching `_done`
  columns on `sync_queue` tickets. These reset to `false` automatically when
  price/qty/condition/sold changes (see `needsPlatformStatusReset` in
  `cardUtils.js`) — the assumption is any of those changes invalidates
  whatever's currently listed elsewhere. Selling always resets all three.
- Not every item lives on every platform (some are in-store only) — three
  more per-item booleans, `posChannel`/`tcgplayerChannel`/`collectrChannel`
  (Sprint 2), gate whether a given platform even applies. Default `true` on
  every row so nothing pre-existing silently dropped out of tracking. The
  Sync Queue/status chips only show and require the channels an item is
  actually enrolled in (`isTicketComplete` in `cardUtils.js`), and Export
  filters TCG Player/Collectr/pending-POS lists to matching-channel items
  only. `sync_queue` tickets snapshot an item's channels at sale time, same
  as its other snapshotted fields. New items default their channels to
  whatever the majority of existing items in the same binder/case already
  use (`channelDefaultsForLocation`), editable per item either way.
- **CSV/XLSX import channel picker + image auto-fill**: `ImportExportPanel`
  now has the same per-batch channel checkboxes as the Edit modal/Scanner
  (`channelDefaultsForLocation` keyed off the import's binder/case field,
  same "follow the majority until staff touches a checkbox" behavior).
  Import also auto-searches an image for any row that doesn't already have
  one (no Image URL column mapped, or that cell was blank for that row) —
  same lookup Scanner/EditModal use, now shared as `searchCardImage` in
  `cardSearch.js` instead of three near-identical copies of the same
  by-game dispatch table. Unlike Scanner/EditModal there's no per-row
  review step or price/listing backfill: the top result fills the image
  slot directly, matching how little review any other imported column
  already gets. Runs with limited concurrency (`runWithConcurrency` in
  `importParse.js`, cap of 4) rather than firing one request per row
  unbounded — a large spreadsheet import can be hundreds of rows, unlike a
  ~9-card scanner batch.
- `game` values are canonicalized on read (`canonicalizeGame`/
  `GAME_ALIASES` in `cardUtils.js`) so imported data like "MTG" normalizes to
  "Magic" — several features (image search, scanner) do exact string checks
  against the canonical game names in the `GAMES` array (kept in sync across
  `EditModal.jsx` and `ScannerPanel.jsx`).
- `catalog_public_view` (SQL, not in the app code) is the only thing the
  public binder page reads — a restricted view exposing browsing-safe
  columns only, for unsold/in-stock rows. It relies on view-ownership
  bypassing the base table's RLS, so `anon` never touches `catalog` directly.
  Column list is `create or replace view`d per migration (see
  `phase6_dual_image.sql`) rather than tracked by hand elsewhere.
- **Dual-image model (Sprint 6)**: every item can carry two independent
  images — the existing "stock" reference (`image_url`/`image_data`, from
  card search or a manual paste/upload) plus a new "photo" (`photo_url`/
  `photo_data` — a real picture of this exact copy: a scanner crop or manual
  upload). `active_image` (`'stock'|'photo'`, DB default `'photo'`) records
  which one staff prefer displayed; `resolveActiveImage`/`activeImageSrc` in
  `cardUtils.js` are the single source of truth for which one actually shows
  — they honor that preference but fall back to whichever slot isn't blank,
  so a card with only one image type never renders empty just because the
  preferred slot is unset. Defaulting the column to `'photo'` (not `'stock'`)
  means a real photo added later to an old stock-only item takes over
  display automatically with no extra step, matching the original ask to
  prefer the real photo when both exist — existing rows are unaffected since
  their photo slot starts blank. `CatalogTable`'s `Thumb` and `BinderView`
  both render through `activeImageSrc`, so staff and public views stay
  consistent. In `EditModal.jsx`, "Find stock image" (search) and "Upload
  real photo" write to separate pending slots and auto-switch the toggle to
  show whatever was just changed; "Find market price" (Sprint 5) still
  never touches either image slot. The toggle itself only renders when both
  slots actually resolve to something. CSV/XLSX import and the Scanner's
  auto-fill still only populate the stock slot — CSV/XLSX import detects an
  existing image URL only (see the backlog item above), and the Scanner now
  crops the "photo" slot too (below).
- **Scanner per-card crop pipeline (Sprint 6)**: `scan-binder-page`'s
  `DETECT_CARDS_TOOL` schema now requires a `bbox` (`x_min/y_min/x_max/y_max`,
  each a 0.0-1.0 fraction of the full page photo's width/height) per
  detected card, tightly bounding just that card's pocket — the prompt
  explicitly warns the model not to bound a neighboring pocket instead.
  `cropImageRegion` (`image.js`) is a Canvas crop-and-downscale (same
  maxDim/quality pattern as `resizeImageFile`) that turns that bbox into an
  actual cropped data URL. `ScannerPanel.handleScan` crops every detected
  card immediately (no extra network call — it's the same page photo
  already in memory) into that row's `photoData`/`photoUrl:'local'`,
  independent of and parallel to the existing stock-image auto-search. A
  crop failure (bad/missing bbox) just leaves that row's photo slot blank —
  the stock search result is still there as a fallback. The scan review
  row's thumbnail shows the crop over the stock search result when both
  exist by default (same photo-first rule as `resolveActiveImage`), with a
  per-row Photo/Stock toggle (mirroring `EditModal`'s) once both actually
  exist — picking a different stock candidate switches this row's toggle
  to "Stock" automatically, same reasoning as `EditModal`'s
  `selectCandidate`. **Requires redeploying `scan-binder-page`**
  (`supabase functions deploy scan-binder-page`) before this takes effect —
  the schema change is server-side.
  - **Crop accuracy is hit-or-miss** — real-world testing showed the model's
    bbox tends to hug the card too tightly and most often clips the *top*
    edge (the bottom of a plastic pocket is a sharp, unambiguous line; the
    top blends into the pocket/page above it) — and a second round of
    real-phone testing found this specifically worse for the *bottom row* of
    a page (those cards are typically more foreshortened/steeper-angled in
    the photo, which degrades the model's already-weaker top-edge estimate
    further). Three mitigations now, not two: the prompt tells the model to
    anchor on the bottom edge first and err toward a slightly larger box;
    `cropImageRegion` pads the box outward before cropping regardless — 2%
    bottom, 3% left/right, flat (`DEFAULT_CROP_PADDING`); and top padding is
    no longer flat — `adaptiveTopPadding` scales it from ~8% (near the top
    of the photo) up to ~18% (near the bottom) based on the box's own
    `y_max`, targeting the specific bottom-row problem directly. All
    padding is relative to the detected box's own size, not the full page,
    so it scales with card size rather than being a fixed pixel margin.
  - **Toggle/lightbox click bug (fixed)**: the stock/photo toggle buttons in
    `EditModal.jsx` live inside the big-preview `div` that opens the
    lightbox on click. Without `stopPropagation()`, clicking a toggle also
    bubbled to that div's own `onClick`, which read the *pre-click* `src` —
    so the lightbox opened showing the previously-active image, not the one
    just switched to, even though the small preview itself updated
    correctly on the next render. Both toggle buttons now call
    `e.stopPropagation()`.
- **Pokemon set/rarity recognition was poor for alt-art/high-rarity cards**
  (e.g. a Special Illustration Rare getting "Scarlet & Violet" as its set —
  too vague to be useful — and "Pokemon EX" reported as a *rarity*, which
  isn't a real one). Root-caused to two schema/prompt gaps, not a vision
  capability limit: (1) the `rarity` field's description never distinguished
  a print's actual rarity tier from a Pokemon card's *subtype* printed in
  its name area (ex/GX/V/VMAX/VSTAR) — the model was doing exactly what an
  ambiguous instruction invited, reporting the subtype it could clearly see
  as if it were the rarity; (2) `set` had no guidance to prefer the specific
  expansion name over the general era/block, so it defaulted to the vaguer,
  easier-to-infer-from-styling answer. Fixed by rewriting both field
  descriptions with explicit anti-examples and real rarity-ladder terms
  (Double Rare/Illustration Rare/Special Illustration Rare/Hyper Rare,
  alongside older Rare Holo/Rare Secret), reinforced in `PROMPT_TEXT` too.
  Also added a new `number` field (the printed collector number, e.g.
  "280/217") — previously never captured at all, despite being the
  strongest disambiguator a print has among many same-name/alt-art
  versions. `searchPokemon` (`cardSearch.js`) now tries `name+set+number`,
  then `name+number` *before* falling back to `name+set` — number is
  deliberately given priority over set in the fallback ladder because set
  is the less reliable of the two signals per the above, so a set guess
  that's still just the vague era name shouldn't block a number-based
  match. **Requires redeploying `scan-binder-page`** (schema/prompt
  changes are server-side); `number` is threaded through `ScannerPanel` the
  same transient, never-saved way `rarity` already was — a plain editable
  field next to Rarity in the review row, used only to narrow the search.
  Scoped to Pokemon only for now, per an explicit decision to prove the
  approach on the game with the worst symptoms before generalizing the
  same rarity/set-description discipline to the other games.
- **Rarity detection (tier 2) now leans on visual border/frame treatment,
  not fine-print reading** — real testing of the tier-1 fix above (schema/
  prompt wording only) still found the model regularly failing to fill in
  Rarity at all, and separately misreading the specific Set on some cards
  (e.g. an XY-era Zapdos ex reported as "XY Evolutions" instead of the
  correct "XY — Phantom Forces"). Root cause: tier 1 only fixes the
  model's *instructions* for what counts as a rarity vs. a subtype — it
  doesn't help the model actually *see* a rarity symbol or set icon that's
  printed too small/blurry to read in an ordinary binder-page photo,
  which is a real, separate limitation. Rather than a second zoom/crop
  pass on that same tiny text (still fragile against any photo that isn't
  perfectly sharp), the `rarity` field's description was rewritten to
  judge PRIMARILY from the card's overall visual layout — a much bigger,
  more robust signal than reading small print, and a case where Claude's
  vision is far more reliable at holistic style recognition than
  fine-grained OCR under imperfect photo conditions. Researched (not
  guessed) via `pokemon-tcg-data` on GitHub — the actual open-source
  dataset pokemontcg.io serves, fetched directly (`curl` on
  `raw.githubusercontent.com`, not blocked here unlike most other TCG
  sites) and inspected for real rarity values across a modern set
  (`sv1.json`, Scarlet & Violet base) and an older one (`xy4.json`,
  Phantom Forces — the same set as the real Zapdos ex report). This
  caught and corrected a wrong first guess (this doc originally said
  Illustration Rare keeps "a colored info box" unlike Special Illustration
  Rare — false; both are fully borderless, the real difference is an
  added glitter-foil layer on SIR) before it shipped. Confirmed real
  values, by era — the field now asks for one of these exact strings
  (matching what `preferRarity`'s substring search actually matches
  against), not a free-text description:
  **Modern (2023+, lowercase "ex")**: `Double Rare` = normal small-boxed
  frame, all-over foil, for an ex Pokemon. `Illustration Rare` = full-bleed
  edge-to-edge art, holo border line, no ex suffix. `Ultra Rare` = same
  full-bleed treatment, ex suffix. `Special Illustration Rare` = same
  full-bleed art plus an extra glitter-foil layer. `Hyper Rare` = entire
  border/background gold-toned.
  **Older (2012-2022, uppercase "-EX"/"-GX"/"V")**: `Rare Holo` = normal
  frame, foil over the art only, no suffix. `Rare Holo EX`/`Rare Holo GX`/
  `Rare Holo V` = normal frame but the art breaks past its border, for an
  EX/GX/V Pokemon. `Rare Ultra` = full art, a colored text bar remains.
  `Rare Secret` = same full art plus a gold border, and/or a collector
  number past the set's listed total.
  Only the plain `Common`/`Uncommon`/`Rare` tiers still require reading an
  actual tiny rarity symbol, and the field stays blank rather than
  guessing if that's not legible — same never-guess discipline as before,
  just with a much higher chance of correctly identifying the higher (and
  more valuable, more disambiguation-critical) tiers. No schema change —
  same `rarity` field, so no client-side code changes needed, only the
  Edge Function's field description/`PROMPT_TEXT`. Doesn't address wrong
  Set guesses directly (border style doesn't tell you *which* expansion a
  card is from) — that failure mode instead relies on the existing
  number-before-set fallback priority in `searchPokemon` for resilience: a
  correctly-read collector number still finds the right card even when Set
  is guessed wrong, provided the number itself was legible.
  **Requires redeploying `scan-binder-page`** again (prompt-only change,
  no schema/version bump needed on the client side).
- **Mega Evolution era rarities added** (`Mega Attack Rare`, `Mega Hyper
  Rare`) — researched the same way as the rest of this section, against a
  real sample (`me1.json`/Mega Evolution base set and `me2pt5.json`/
  Ascended Heroes, both from `pokemon-tcg-data`) rather than assumed from
  the name alone. `Mega Hyper Rare` replaces plain `Hyper Rare` as this
  era's gold chase-card tier for a `Mega ___ ex` headliner; `Mega Attack
  Rare` debuted specifically with Ascended Heroes and — unlike every other
  visual-style rule above — isn't about border/art-bleed extent at all:
  its real tell is the attack name itself being printed in Japanese
  katakana instead of English, even on an otherwise-English card, which
  the prompt now checks for explicitly on any `Mega ___ ex` Pokemon.
  Also found and fixed a real data quirk while verifying: pokemontcg.io's
  actual API value for Mega Attack Rare is `MEGA_ATTACK_RARE` (all-caps,
  underscored) — inconsistent with every other rarity string in the same
  set, which are normal Title Case. Rather than special-case that one
  value, `preferRarity`'s matching (`cardSearch.js`) now normalizes
  underscores/hyphens to spaces before comparing, so the model's Title
  Case guess still connects to the real data regardless of this kind of
  formatting inconsistency, for this or any future rarity.
- **ScannerPanel's post-scan auto-fill silently failing, then working on
  manual retry** — also surfaced by the same round of real testing above,
  and a separate root cause from the two rarity/set issues above: an
  unbounded parallel search burst right after a scan (see the
  `runWithConcurrency` concurrency-cap note further down, under Market
  Value/pokemontcg.io reliability) was the actual culprit, not a
  search-logic bug.
- **Rarity field gained a `<datalist>` of real suggestions for Pokemon**
  (`RARITY_OPTIONS_BY_GAME` in `cardUtils.js`, the same researched rarity
  strings from the tier-2 fix above) in both `EditModal.jsx` and
  `ScannerPanel.jsx`'s `ScanRow` — still a plain text `<input>`, so staff
  can type any value, but now with a dropdown of real options to pick
  from instead of needing to remember/spell the exact rarity name. Games
  with no entry in `RARITY_OPTIONS_BY_GAME` (everything except Pokemon,
  for now) just get no suggestions, same free-text behavior as before —
  to be filled in "when the time comes" for each other game, matching the
  Pokemon-first staged rollout elsewhere in this doc. `ScannerPanel`'s
  `<datalist>` id is keyed per-row (`rarity-options-${row.id}`) since a
  single scan can review several cards — and therefore several `ScanRow`s
  — at once; a shared static id would collide.
  - **Found a real accessibility gap while wiring this up**: an `<input
    list="...">` gets an implicit ARIA `combobox` role per the HTML-ARIA
    mapping spec — same as a `<select>` — which shifted the position that
    `EditModal.test.jsx`'s `getAllByRole('combobox')[1]` hack depended on
    to find `LocationPicker`'s `<select>` (it had no accessible name of
    its own; its `<label>` was a visual sibling only, never wired via
    `htmlFor`). Fixed at the actual root cause rather than dodging the
    datalist pattern: `LocationPicker` now takes an `ariaLabel` prop
    (passed as each caller's own visible label text — "Binder / case /
    collection" in `EditModal`, "...for this page" in `ScannerPanel`),
    and the test now finds it via `getByLabelText` instead of a
    position-dependent index that any future added form control could
    just as easily have broken again.
- **Scanner post-scan auto-fill hardened further against overloading
  pokemontcg.io** (on top of the `runWithConcurrency` cap above), after
  the same round of real-phone testing that surfaced the concurrency and
  rarity/set issues above:
  - **Self-imposed request pacing**: the batch auto-fill in
    `ScannerPanel.handleScan` now staggers the first wave of requests
    (`Math.min(i, 2) * 220ms` before each row's search starts) instead of
    firing the initial concurrency-capped batch in the same instant — a
    deliberately conservative pace meant to stay under whatever limit the
    API enforces, rather than finding it the hard way via 5xx responses.
  - **Query de-duplication cache** (`pokemonQueryCache` in `cardSearch.js`,
    module-level, keyed on the exact query string): a binder page with
    several copies of the same card (bulk commons especially) previously
    fired one full search per copy — now the first search's promise is
    cached and reused for any identical query, whether still in-flight or
    already resolved, collapsing N duplicate requests into one for the
    rest of the session. Cleared on failure so a transient error doesn't
    get stuck cached; a successful result is safe to reuse indefinitely
    since a print's data doesn't change mid-session. Test-only
    `__resetPokemonQueryCacheForTests()` clears it between test cases so
    two tests reusing the same query string (e.g. two 5xx-retry tests
    both searching "Charizard") don't interfere with each other.
  - **Progress UI to mask the added latency**: a `fillProgress` counter
    ("Looking up images & prices — X of Y done…", reusing the existing
    `.status-line`/`.spinner` styling) shows while the batch runs, each
    `.scan-row` fades/slides in once on its first mount via a staggered
    `scanRowIn` CSS animation (`prefers-reduced-motion` respected) so the
    queue visibly populates card-by-card, and once every row settles the
    view scrolls smoothly back to the top of the review queue — covers
    the pacing/dedup changes with something that reads as intentional
    rather than makes scanning feel slower.
  - **Post-batch "needs review" nudge**: once the auto-fill batch settles,
    a toast reports how many rows ended up with no image found (tallied in
    a plain closure variable inside the `runWithConcurrency` callback, not
    read back off `rows` state — the `.then()` fires the instant every
    worker resolves, which can outrace React actually applying the last
    `setRows` calls). A blank thumbnail is easy to miss in a long list, and
    jumping straight into mass-retrying "Find another image" clicks would
    recreate the exact request burst the pacing above exists to avoid — one
    nudge is more useful than staff discovering blanks by scrolling.
- **Real-phone scan accuracy findings, round 2** — a 9-card real binder page
  test surfaced three more distinct issues beyond the rarity/set/number work
  above, each with a different fix:
  - **"Rare Ultra" (older era) and "Ultra Rare" (modern era) were getting
    swapped** — same two words, opposite order, for the visually-identical
    full-art "ex"/EX/GX/V treatment in different eras; an easy thing for the
    model to transpose. Both the `rarity` field's schema description and
    `PROMPT_TEXT` now call this out explicitly with a CAUTION note at the
    exact point each term is defined, telling the model to re-check word
    order before answering either one.
  - **Detection was noticeably non-deterministic** — the same 9-card photo
    scanned anywhere from 3 to 7 detected cards across reruns. Tried pinning
    `temperature: 0` on the Anthropic call to cut down that variance (this
    is forced tool-use structured extraction, not creative writing), but a
    real scan attempt came back with `"temperature" is deprecated for this
    model` — this model rejects the parameter outright rather than
    ignoring/clamping it, so it can't be set at all here. Reverted; this
    specific variance is unaddressed for now.
  - **"Find market price"/"Find another image" failed on every input
    combination for "Lillie's Clefairy ex"** specifically — first suspected
    to be the apostrophe in the name (fixed via `sanitizeForPokemonQuery`
    stripping it, same as its other special characters), but real-world
    retesting after that fix showed the client correctly sending the
    sanitized query and *still* hitting a 500. The apostrophe fix was
    real but not the actual cause here — see the fallback-ladder bug
    below, which is.
  **Requires redeploying `scan-binder-page`** (schema description + prompt
  + temperature are all server-side).
- **`searchPokemon`'s fallback ladder had no per-tier failure isolation** —
  a real regression from the retry-then-throw change above. Before that
  change, a failing tier silently returned "zero results" and the ladder
  moved on to the next, broader tier; after it, a *persistent* 5xx on the
  first tier tried (most often `name+set+number`, since Set is frequently
  wrong per the findings above) now threw straight out of `searchPokemon`
  entirely, aborting the whole search before ever reaching the plain-name
  tier that would likely have succeeded. This is almost certainly why
  "search by name only" empirically outperformed hint-narrowed search in
  real testing, and directly explains the Lillie's Clefairy 500 above (not
  the apostrophe). Fixed by restructuring the ladder into a list of tiers
  tried in a loop, wrapped so a thrown error is treated the same as an
  empty result and falls through to the next tier — except the *last*
  tier, whose failure still propagates, so a genuinely unreachable API
  still reports as an error rather than a misleading "no matches."
- **"Find another image"/"Find stock image"/"Find market price" briefly
  went name-only, then reverted** — the theory (a wrong hint narrows OUT
  the correct print) was real, but real-world retesting found it was a net
  regression: names with multiple genuine variants sharing a first word
  ("Eevee" vs "Eevee ex") lost their disambiguation entirely, and
  possessive names ("Lillie's", "Cynthia's") fell through to the broad
  first-word-prefix tier and matched unrelated cards (e.g. "Cynthia's
  Gabite" instead of "Cynthia's Garchomp ex") once hints weren't there to
  short-circuit before reaching it — the same prefix-tier fallback
  mechanism, just triggered by a missing hint instead of a wrong one.
  Reverted to using every hint again everywhere (both these manual actions
  and the initial auto-fill), trusting the fallback-ladder isolation fix
  above to degrade gracefully on a bad hint instead of removing hints
  altogether. EditModal's search calls now also pass `number` (via its new
  scratch field, added for Sprint 1 below) to match ScannerPanel's full
  hint set.
- **Possessive names ("Lillie's Clefairy ex", "Cynthia's Garchomp ex") were
  still broken after the fallback-ladder fix above — real-world retest found
  the *hint-restored* search now returning the right card mixed in with
  unrelated Trainer/Supporter cards literally named "Lillie"/"Cynthia".**
  Root cause was the original apostrophe fix itself: `sanitizeForPokemonQuery`
  replaced the apostrophe with a space, turning "Lillie's" into two tokens,
  `"Lillie"` + `"s"`. But Elasticsearch/Lucene's English analyzer (which
  pokemontcg.io's search is built on) applies a possessive filter that
  strips a trailing `'s` from a token *during indexing* — the real card is
  indexed as `["lillie","clefairy","ex"]`, never `["lillie","s","clefairy",
  "ex"]`. That spurious `"s"` token broke the exact-phrase tier's adjacency
  match, so every possessive-name search fell through past it to the broad
  first-word-prefix tier (`name:Lillie*`), which has no way to distinguish
  the searched-for Pokemon from an unrelated card that merely starts with
  the same word. Fixed by stripping a trailing `'s`/`’s` outright (no
  replacement character) instead of space-replacing it, mirroring the
  indexer's own possessive filter rather than fighting it — confirmed via
  the Elasticsearch/TCGPlayer pricing docs research below, not guessed.
  Non-possessive apostrophes still fall through to the general
  space-replacement rule.
- **No image candidate was ever showing a Market Value price, even for a
  card with real, live TCGPlayer listings (reported for Mega Gengar ex)** —
  traced to `pokemonTcgplayerPrice` only accepting a price variant when
  `market` or `mid` was populated. Per TCGPlayer's own pricing model
  (confirmed via their public pricing-settings docs), `market` is an
  aggregate of *sold* listings over the previous week and `mid` is the
  median of that same sold set — both come back null whenever a card
  simply hasn't sold that week, which is common for an expensive,
  low-volume chase card even while it has real active *listings* (which is
  what `low`/`high` reflect instead, since those are listing-based, not
  sale-based). `pokemonTcgplayerPrice` now falls back further, in the same
  most-reliable-first order (`market` → `mid` → average of `low`+`high` →
  whichever of `low`/`high` alone is present), so a real listing-based
  estimate surfaces instead of "no price data" whenever a card just hasn't
  had a sale recently. Scoped to Pokemon only, matching every other
  provider-specific fix in this doc — Scryfall/YGOPRODeck/Lorcast/the
  Egman-backed games each report a single flat price field with no
  equivalent sold-vs-listed split to fall back through.
  **Real-world retest after this fix still found Mega Gengar ex with no
  price** — the low/high fallback is a real, defensible improvement per
  TCGPlayer's own documented pricing model, but it can only surface a price
  that exists somewhere in the four sub-fields; it can't be confirmed to be
  the actual cause of this specific card's gap without inspecting a live
  response (`c.tcgplayer`), which this sandbox has no network path to (see
  the Manual QA note above — the same constraint that blocks Supabase also
  blocks pokemontcg.io directly). Left open pending either a pasted real
  API response for this print or confirmation of which message/candidate
  actually shows for it.
- **Possessive-name search ("Lillie's Clefairy ex", "Cynthia's Garchomp
  ex") hedges both apostrophe representations instead of committing to one
  theory** — the earlier fix (stripping a trailing `'s` outright, on the
  theory pokemontcg.io's index applies an English possessive filter) was
  real-world retested and still found unreliable. Without a way to inspect
  the live index from this sandbox, there's no way to confirm that theory
  over the alternative (the apostrophe needs to stay in the query
  literally). `searchPokemon` now tries both representations —
  `sanitizeStrippingPossessive` and the new `sanitizeKeepingApostrophe` —
  at every precision tier (set+number, number, set, exact phrase, unquoted)
  before ever falling through to the next, broader tier, so whichever one
  the index actually needs is found at the highest precision available
  instead of only being tried once everything else has failed. For a name
  with no apostrophe at all the two functions produce an identical string,
  so the common case still fires the same number of requests as before —
  this only doubles requests for the minority of possessive names, and even
  then only until one representation succeeds.
- **The dominant real cause of "search unreliable"/"no results" reports
  turned out to be pokemontcg.io's public tier being far flakier than a
  single retry could survive — not the apostrophe handling or the hint
  logic, which were both real but secondary.** Confirmed by directly
  querying `api.pokemontcg.io` by hand, repeatedly, for the exact queries
  this app sends: individual queries needed anywhere from 3 to 12
  *consecutive* 5xx responses before finally succeeding. The original
  "retry once" fix (added earlier in this doc) assumed occasional transient
  failures; against a streak that long, one retry gives up almost
  immediately, `searchPokemon`'s fallback ladder marks that tier "empty",
  and the search either lands on a broader/wrong-print tier or exhausts
  every tier and reports "no matches" — even when the exact right query
  would have succeeded on its 3rd or 4th try. `pokemonQueryUncached` now
  retries up to 3 times (4 attempts total) with a short backoff (400ms/1.0s/
  2.2s) instead of once, still only on a 5xx. This directly explains real
  reports that looked like search-logic bugs: a manually re-triggered
  search "just working" on a second attempt (observed for Lillie's Clefairy
  ex once Set/Number were correctly populated) was likely the API recovering
  between attempts, not the hints being the deciding factor.
  - **While diagnosing this, also directly confirmed two "no price data"
    reports are genuine, permanent data gaps on pokemontcg.io's side, not
    bugs**: Mega Gengar ex's Ascended Heroes print (`me2pt5-269`, Mega
    Attack Rare) has a `tcgplayer` object with only a `url`, no `prices` key
    at all; Lillie's Clefairy ex (`me2pt5-280`) has no `tcgplayer` field
    whatsoever. `pokemonTcgplayerPrice` already handles both correctly
    (returns `null`) — there's no client-side fix possible when the API
    itself never populated pricing for that exact print. A *different*,
    unrelated print of "Mega Gengar ex" in a different set did have real
    `market` pricing when found by a plain name-only query, confirming
    (again) that Pokemon commonly reprints the same name with wildly
    inconsistent price-data coverage per print — the existing "no per-
    condition pricing" acceptance in this doc extends to "no pricing at
    all for some individual prints," not just no per-condition granularity.
  - Also confirmed via direct query that "Ascended Heroes" alone (name +
    set, no number) returns 3 distinct real "Mega Gengar ex" prints
    (#125 Double Rare, #269 Mega Attack Rare, #284 Special Illustration
    Rare) — validating that Number remains the right disambiguator among
    same-name-same-set reprints, exactly as this doc has assumed throughout.
- **Manual TCGPlayer search link as a fallback for the two failure modes
  above** (search exhausts every retry and finds nothing, or finds a real
  card with no price data) — `tcgplayerSearchUrl(name, set)` in
  `cardSearch.js` builds a link straight to TCGPlayer's own search with the
  name/set already filled in, so staff aren't left with a dead end when the
  automated lookup can't help. Deliberately game-agnostic: it uses
  TCGPlayer's general `/search/all/product?q=...` results page (verified
  live, 2026-08-21 — a real, working URL) rather than a per-game category
  path like `/search/pokemon/product` — confirming the exact category slug
  for all 8 games this app supports without a real sample for each risks
  shipping a wrong one, and "all" is already confirmed correct for every
  game. Shown in `EditModal` right under the status line whenever
  `imageStatus.kind === 'err'` (covers both "no matches" and "found it, no
  price data" — both set that same `kind`), and in `ScannerPanel`'s
  `ScanRow` next to "Find another image" when `row.imageStatus === 'none'`
  and next to "Find market price" when no price is available
  (`row.pendingPrice == null`).
- **Scanner/EditModal: blocking modal during the post-scan image/price
  auto-fill, loading state + disabled state on every manual search button,
  and a "Search by name only" escape hatch** — three real-phone UX reports
  bundled into one pass since they share the same buttons/state:
  - The post-scan "Looking up images & prices" fill used to run with the
    review queue already fully visible and editable underneath it — staff
    could (and did) start correcting a row's name/set or toggling its
    image while the batch fill was still writing into that same row,
    racing it. Replaced the inline status line with a real, non-dismissible
    modal (`ScannerPanel`, same `.overlay`/`.modal` system as every other
    modal — z-index 1000 categorically covers and blocks clicks to
    everything below it) that shows only progress ("X of Y done") until the
    batch settles, then disappears on its own — no Cancel/backdrop-close,
    matching this app's explicit-button-only modal convention elsewhere,
    since there's nothing sensible to do mid-fill besides wait.
  - "Find stock image"/"Find market price" (`EditModal`) and "Find another
    image" (`ScannerPanel`'s `ScanRow`) already disabled themselves (or, for
    ScanRow, now newly disable themselves) while their own search is in
    flight, but gave no visible feedback beyond that — real testing reported
    this as "taking too long" with no way to tell if a click had registered.
    Each button's own label now switches to a spinner + "Searching…" while
    its specific search runs (`EditModal`'s `activeSearch` state, `ScanRow`'s
    existing `row.imageStatus === 'searching'`), and every *other* search
    button for that same item/row is disabled meanwhile too — a double-tap
    or a click on a sibling button can't fire a second overlapping search.
  - **"Search by name only", added then removed**: staff reported that a
    wrong Set/Rarity/Number hint can steer the search onto the wrong print,
    and once picked, that wrong print's own data backfills those same
    fields (Sprint 1's behavior), compounding the mistake on any retry
    using the same hints. Added as an explicit, opt-in per-click escape
    hatch — a second button next to each "Find stock image"/"Find market
    price"/"Find another image" that searched by name only for that one
    attempt, without touching the Set/Rarity/Number field values
    themselves — deliberately distinct from the earlier blanket
    name-only-search regression (which removed hints for *every* search
    and lost real disambiguation entirely). After real use with the
    retry-budget fix and the manual TCGPlayer link both in place (both
    below), staff found the extra button redundant and potentially
    confusing: clearing the Set field yourself and re-clicking the regular
    search button does the same thing, more transparently (you can see and
    control exactly what's being ignored, rather than a second button whose
    behavior has to be remembered). Removed — `runFindImage`/
    `runFindMarketPrice` (`EditModal`) and `findAnotherImageForRow`
    (`ScannerPanel`) no longer take a `clean` parameter.
- **Market Value (Sprint 5)** is never stored — `catalog.base_price` (the NM
  reference price captured from whichever search candidate staff actually
  selected) is the only new column; Market Value itself is computed live in
  the UI as `base_price × condition multiplier` (`marketValueForCondition`
  in `cardUtils.js`), so it can't go stale if the condition changes later.
  `price` keeps meaning what it already meant ("Our Price") — no rename.
  Condition multipliers live in a `store_settings` singleton row, editable
  via the "Pricing settings" link in the footer, defaulting to the
  NM100/LP85/MP65/HP45/DMG25 table decided earlier. The condition field
  stays free text; `canonicalizeCondition` fuzzy-matches it onto one of the
  five tiers for multiplier lookup only. Two independent soft, non-blocking
  toasts warn at save time: `priceOrderingWarning` (App.jsx) if an item's
  price breaks condition ordering against another *physical copy* of the
  same card in the same location, and `priceVsMarketValueWarning` (App.jsx)
  if Our Price diverges more than 15% from *this card's own* computed
  Market Value — a different kind of check (one compares inventory copies
  against each other, the other compares a price against the estimate).
  Neither blocks the save; deliberate pricing decisions are expected. One
  Piece/Riftbound/Gundam (Egman-backed) now have pricing too — Egman's
  `/api/prices/<game>` endpoint (confirmed by a real sample, joined to
  `/api/cards/<game>` by `card_code`; see the `card-lookup-proxy` note
  below). The Scanner's per-row Market Value is revealed by an explicit "Find
  market price" action, not fetched automatically — it reads whatever
  price/listing was already returned alongside the currently-selected
  image (auto-picked, or chosen via "Find another image"), so confirming
  the right card via the image is what gates seeing/trusting a price at
  all, with no extra network call needed since that data's already there.
- **EditModal's "Find market price" button moved into the Quantity &
  pricing section** (out of the image area's `.img-actions` row) — staff
  found its old spot next to "Find stock image" confusing, since it reads
  the same name/game/set/rarity fields but runs an independent search, not
  something tied to the image. The button, its underlying
  `handleFindMarketPrice` search, and `selectCandidate`'s `candidateMode
  === "price"` branch (still never touches either image slot) are
  unchanged — only where the button and its resulting status line/
  candidate grid render moved, gated on the same `candidateMode` state
  that already existed to distinguish an image-search result set from a
  price-search one. Picking a stock image via "Find stock image" still
  auto-backfills Market Value as a bonus, same as before — the new button
  is for refreshing/backfilling that price independently, without needing
  to touch (or already have) an image.
- **pokemontcg.io's key-less public tier occasionally returns a transient
  5xx** (real-world example: a card search for "Alolan Exeggutor ex" in
  "SV08: Surging Sparks (SSP)" hit a 500 then a 502 back to back) — before
  this fix, `pokemonQuery` (`cardSearch.js`) silently treated any
  non-`ok` response as "zero results," so a real API failure got
  misreported to staff as "No matches found" instead of a real error, and
  `searchPokemon`'s fallback ladder would then burn through 3 more
  requests against an endpoint that was already failing. `pokemonQuery`
  now retries once (600ms) on a 5xx before giving up, and throws instead of
  swallowing a failure that survives the retry, so EditModal's
  `handleFindImage`/`handleFindMarketPrice` catch it and show an honest
  "couldn't reach the database, try again" message rather than a
  misleading "no matches." A 4xx isn't retried (a bad query won't succeed
  on a second try). Doesn't touch Scryfall/Yugioh/Lorcana/the proxy-backed
  games — scoped to the one provider a real report came in for, same
  discipline as the Pokemon-only scan-accuracy work above.
- **ScannerPanel's post-scan image auto-fill is concurrency-capped, not
  unbounded** (`runWithConcurrency`, cap 3 — same helper CSV import already
  used for the same reason) — found via a real-phone test scan where a
  card's automatic image/price fill silently came up empty, but manually
  retrying that one row via "Find another image" immediately succeeded.
  Root cause: `handleScan` used to fire one search per detected card on the
  page all at once with no cap — a full 9-card page can mean 30+
  simultaneous requests against pokemontcg.io's key-less tier (each card's
  search can itself fire up to 4 fallback queries), which is exactly the
  kind of burst that tier's rate limiting/5xx-proneness (see above) hits
  hardest. A manual single-row retry doesn't compete with that burst, which
  is why it worked when the automatic pass didn't.
- **The condition-multiplier estimate can be materially wrong for
  high-value cards** — a flat percentage is a population average, not any
  specific card's real going rate, and a real example (M Rayquaza EX,
  XY-Roaring Skies) showed the HP estimate ~$13 under the real TCGPlayer HP
  price. True per-condition pricing still requires TCGPlayer's own
  partner-gated API (see below) — until/unless that's available, the
  mitigation is a direct link to the card's real TCGPlayer listing
  (`purchase_uris.tcgplayer` on Scryfall, `tcgplayer.url` on pokemontcg.io —
  both already returned by the same search call used for the image, no
  extra fetch), auto-captured into `sourceUrl`, plus a visible warning in
  the Edit modal/Scanner above a $25 base price nudging staff to check the
  real listing before pricing anything expensive — especially in a batch,
  where the same misestimate repeats across every copy. YGOPRODeck/Lorcast/
  SWU don't carry an equivalent direct-listing link today.

## Known constraints / accepted risks

- **Fixed**: `xlsx@0.18.5`'s two known vulnerabilities (prototype pollution,
  ReDoS) — `package.json` now points `xlsx` at SheetJS's own patched CDN
  build (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) instead of
  the vulnerable npm release (PR #11). One lasting nuance, not a
  vulnerability: `npm install`/`npm ci` needs outbound access to
  `cdn.sheetjs.com` specifically to resolve this dependency — confirmed
  working on GitHub Actions' runners (that's what the deploy workflow's
  `npm ci` step does on every run), but it'll fail in any environment
  without that egress (e.g. a network-restricted sandbox).
- **Fixed**: the catalog (and every other full-table read — `sync_queue`,
  `quotes`, `sorting_queue`, the public binder view) was silently
  truncated once it crossed **1000 real rows** — a real production
  incident, not a theoretical risk. Every `dbLoadX` in `db.js` used a bare
  `.select('*')` with no `.range()`/`.order()`; Supabase/PostgREST caps a
  bare select at the project's configured Max Rows (1000 by default) with
  **no error surfaced at all**. Once the shop's real catalog passed 1000
  rows, this looked exactly like deletions being silently undone (the
  visible count stayed pinned at 1000 no matter how many items were
  removed, since the real total was still above the cap) and like
  unrelated items "reappearing" (with no `ORDER BY`, a different arbitrary
  1000-row slice could come back on any given load, surfacing rows that
  weren't in the previous window). Fixed with a shared `fetchAllRows(table,
  orderColumn, {ascending, filter})` helper in `db.js` that pages through
  with `.range()` on a stable order column until a page comes back short
  of a full page — used by `dbLoadAll` (catalog + sync_queue), `dbLoadQuotes`,
  `dbLoadSortingQueue`, and `dbLoadPublicBinder` (ordered by `name` there,
  since `catalog_public_view` exposes no primary-key-ish column). The
  Playwright mock harness (`mockSupabaseClient.js`) needed a real
  `.range()` implementation added to its query builder for this to work
  under e2e at all — without it, every e2e test touching catalog/quotes/
  sorting_queue load would have broken outright, not just missed
  coverage. Covered by new `db.test.js` cases simulating a table just over
  1000 rows (a full first page + a second, short page) and asserting
  every row survives, not just the first 1000.
- **`CatalogTable`'s separate 400-row render cap gained a "Load more…"
  escape hatch** — a different limit from the 1000-row fetch cap above
  (that one is fixed at the DB-fetch layer; this one is a deliberate
  client-side render cap, since rendering thousands of `<tr>`/card
  elements at once is real DOM cost, not a bug). Once a real catalog/
  filtered view crosses 400 matches, staff previously had no way to see
  the rest short of narrowing their search — now a `visibleCount` state
  (default 400, desktop table and mobile cards share it) can jump straight
  to showing every match in one click, e.g. before a "Select all visible"
  that needs to reach a whole filtered collection (that checkbox already
  selected every match regardless of the render cap — `onToggleSelectAll`
  is built from the full `rows` array, not the capped slice — so this
  fixes the *visibility* gap, not a real selection bug). Deliberately not
  reset on filter/search changes: `rows.slice(0, visibleCount)` against a
  newly-narrowed `rows` just naturally returns fewer rows on its own, so
  an expanded view only ever needs to grow, never gets silently collapsed
  by an unrelated realtime update elsewhere in the catalog.
- **`ImportPanel`'s "Skip automatic image search" checkbox is provisional,
  not a settled feature** — added for a large synthetic/test-data import
  (hundreds of rows with no real card behind them, where the auto-search
  would just burn time finding nothing) and for bulk/legacy-data drops
  staff already plan to image manually later. Defaults unchecked, so a
  normal import's behavior is unchanged; when checked, `needsImage`
  resolves to an empty list, so both the search loop and the "Found
  images for…" status clause become no-ops for the whole batch, rather
  than adding a second code path to keep in sync. No dedicated automated
  test — `ImportPanel`'s file-parsing paths have never had one (see
  Testing below), and this is a one-line ternary gating an already-
  untested search path; verified manually instead (a real drag-drop
  import with the box checked, confirming the status text never mentions
  image search and the rows still save correctly). Keep or drop based on
  whether staff actually reach for it in practice.
- TCG Player's **draft catalog accepts a bulk .xlsx/.csv upload for new
  products**, not just existing listings (confirmed by hands-on
  investigation, not docs) — corrects the earlier assumption that Export
  could only produce manual-entry-aid lists for TCG Player. Building the
  actual upload-ready export format is next up — see "Next sprints" below.
  Collectr still has no bulk-upload/bulk-create API found for this app;
  that part of Export stays manual-entry-aid only until/unless that
  changes.
- Card image/price search (`cardSearch.js`) covers Magic, Pokemon, Yu-Gi-Oh,
  Lorcana, One Piece, Riftbound, Gundam, and SWU. Sports Singles has no
  lookup — an accepted **drawback**, not a risk: no card database exists
  for it at all, so there's nothing to integrate against, not an
  unmitigated danger. Findings from Sprint 4,
  live-tested from the browser console/Postman — not just docs research,
  since CORS can't be verified any other way:
  - **Lorcana** — Lorcast (`api.lorcast.com`), free/no-key, confirmed
    CORS-safe for direct browser calls. Called directly from the client.
  - **One Piece**, **Riftbound**, and **Gundam** — all go through
    `card-lookup-proxy` (a Supabase Edge Function, same pattern as
    `scan-binder-page`), routed to **Egman's deckbuilder**
    (`deckbuilder.egmanevents.com/api/cards/<optcg|riftbound|gundam>`) — a
    one-person hobby project with no published API/ToS, used with his
    explicit go-ahead (asked via his X/Twitter account before building on
    it, given it's his app's internal backend rather than a documented
    public data source). The endpoint returns each game's full card list
    with no filter param, so the proxy fetches once and does the name match
    itself rather than guessing at an undocumented filter syntax. Pricing
    for these three comes from the same backend's `/api/prices/<game>`
    endpoint (confirmed by a real sample: `market_price`, `low_price`
    unused for now, and `tcgplayer_url` — a direct real-listing link, same
    role as Scryfall's/pokemontcg.io's), joined back to the card list by
    the `card_code` field both endpoints share.
    `optcgapi.com` (a real, documented One Piece API) was evaluated and
    rejected — confirmed CORS-blocked *and* has no search-by-name endpoint
    at all, only per-card-ID lookups.
  - **SWU** — real API at `api.swu-db.com` (note: `api.`, not `www.` — the
    docs page lives at `www.swu-db.com/api` but the API itself is on a
    different subdomain; `www.swu-db.com/cards/search` 404s). Confirmed
    CORS-blocked, routed through the same proxy — response fields confirmed
    by a real sample: array at `data.data`, fields `Name`/`FrontArt`/`Set`,
    plus `MarketPrice`/`LowPrice` (unused for now, but relevant to the
    Market Value feature later).
  - Piltover Archive (a Riftbound-specific fan database) was evaluated and
    rejected as an image source — its image URLs live under a `/temporary/`
    path with what looks like a signed-upload hash, suggesting they expire
    and aren't safe to store/reuse long-term.
- **Disambiguating same-name prints**: several games reuse a card's name
  across many separate prints (alt art, promos, Gundam's base-set generics
  like "EX Base" shared by dozens of unrelated cards) — a name-only search
  can't tell them apart, and a small result cap just cuts off whichever
  prints sort last. Every search function that supports it now takes an
  optional `setHint` (the item's own `set` field, which for the Egman-backed
  games doubles as wherever a printed set/card code the scanner read off the
  card ends up) to narrow results, alongside a raised candidate cap (20, not
  6) and labels that include the disambiguating info (card code + rarity for
  Egman games, collector number for Pokemon) so same-name prints are at
  least visually distinguishable even when the hint doesn't fully narrow it.
  Falls back to the unnarrowed name match if the hint doesn't match anything
  (typo, or no hint given) rather than returning empty. Scryfall/Yugioh/
  Lorcana weren't touched — Magic already has its own number-based
  disambiguation, and per-name collisions are much rarer for Yu-Gi-Oh/
  Lorcana.
- No per-condition market pricing exists in any free card-data API — every
  one (Scryfall, pokemontcg.io, YGOPRODeck, Lorcast, etc.) exposes a single
  NM-level aggregate price. True per-condition pricing requires TCGPlayer's
  own partner-gated Pricing API. Scraping vendor sites (eBay, CoolStuffInc,
  Star City Games, Troll and Toad) was evaluated and rejected — no real
  per-condition data gain, and most explicitly ban scraping in their ToS.
- **TCGPlayer Pricing API is frozen** (parked the same way as Phase 4/Cumulus
  below) — new applications have been closed since late 2024, and while
  existing seller API keys reportedly keep working, we don't yet know if
  this shop has one. No further work on this path until/unless a real
  credential surfaces. The Market Value feature (Sprint 5) instead derives
  non-NM prices from one NM baseline price via a configurable
  condition-multiplier table, defaulting to **NM 100% / LP 85% / MP 65% /
  HP 45% / DMG 25%** — anchored to CrystalCommerce's confirmed 100%/50%
  NM-to-Damaged default (the one concrete vendor-published anchor found;
  TCGPlayer itself ships no fixed percentage table since it prices each
  condition from real sales data) and centered on community-cited ranges.
  Store-configurable, not hardcoded.
- Phase 4 (a Cumulus POS SKU manager/import) is parked — needs the shop
  owner's go/no-go and a real Cumulus export/import file sample. Never guess
  Cumulus's file format.

## Mobile polish round 3 (continued real-phone findings)

Another round of live phone-testing feedback on top of round 2 above.

- **A fixed-position toast with no `pointer-events: none` still blocks
  clicks underneath it, even at `opacity: 0`** — opacity alone doesn't
  remove an element from hit-testing. `.toast` sits `position: fixed;
  bottom: 20px` centered, which is exactly where the footer (and its
  "Pricing settings" link) ends up once a page is scrolled to the bottom —
  so the first toast that ever fired (e.g. "Pricing settings saved" itself)
  left an invisible box permanently eating clicks in that screen region,
  matching the exact reported symptom ("the link is broken until I
  refresh" — refreshing just hadn't happened to re-trigger a toast yet at
  the moment they checked). Reproduced empirically with a throwaway
  Playwright harness before fixing (real click at the link's coordinates,
  toast fired first) — confirmed the click landed on `.toast`, not the
  link. Fixed with `pointer-events: none` on `.toast` — nothing inside it
  is ever clickable, so there's no reason for it to intercept anything.
- **EditModal's image area reworked**: the Real-photo/Stock-image toggle
  and the Find stock image/Find market price/Upload real photo/URL-paste
  actions used to stack as separate full-width blocks below the image on
  mobile (`.img-preview-wrap{flex-direction:column}`), which read as too
  tall/scrolly and left those actions hugging the left edge (missing
  `align-items` on the now-vertical cross-axis). Restructured so the
  toggle + actions share one new container (`.img-side`) that sits beside
  `.img-frame.large` in a row, on *both* desktop and mobile — removed the
  mobile column override entirely rather than patching its alignment,
  since "a lot of stacking" was the actual complaint. `.img-side`'s
  children default to stretching full width of that column, which
  incidentally also fixed the separate "buttons positioned to the left"
  report (a full-width button isn't left-hugging, and button text is
  center-aligned by default anyway). `.img-preview`/`.img-preview-empty`
  shrink a bit further (72×100, was 90×126) under the mobile breakpoint so
  `.img-side` has room for its button text next to the smaller image.
  - **First attempt at this still squashed the buttons**: the "Find stock
    image"/"Upload real photo" explainer paragraph originally stayed inside
    `.img-preview-wrap` as a third child — since that wrap is a flex *row*
    (image | `.img-side`), a third flex item squeezed `.img-side` down to
    almost nothing, the opposite of the fix's intent. Moved the explainer
    out to its own dismissible `.info-banner` (blue background, a ✕ to
    close, local-only state that resets next time the modal opens) below
    the whole image row instead of inside it.
- **`.img-candidates` (the search-result thumbnail grid) does *not* reorder
  by breakpoint** — a round-3 attempt moved it after the form sections on
  desktop via CSS `order`, on the theory that the grid is secondary to the
  fields staff are editing. Real feedback said otherwise: it should stay
  right after the image on both desktop and mobile, same position it was
  already in. Reverted — removed the `order` rule and the scoped
  `.modal-body-reorder` wrapper class entirely rather than leave unused CSS
  behind.
- **Scanner's file input gained a second, explicit "Take a photo" button**
  wired to its own `<input type="file" capture="environment">`, alongside
  the existing capture-less input (still the default click target, for
  choosing an existing photo). Round 2 removed `capture="environment"`
  entirely to restore the OS's native chooser (Camera/Library/Files) after
  it was found to skip straight to the camera — but real-phone testing
  found some mobile browsers' default chooser doesn't reliably surface a
  camera option at all without that attribute. Two explicit buttons sidesteps
  relying on OS-chooser behavior that varies by browser/version instead of
  re-introducing the original bug.
- **Edge Function CORS was exact-match on `localhost` only** —
  `scan-binder-page`/`card-lookup-proxy`'s `ALLOWED_ORIGINS` allowlist never
  matched a phone testing against `npm run dev -- --host` (needed to reach
  the dev server from a phone on the same LAN), since that serves from a
  private-IP origin, not `localhost` — explaining why the exact same scan
  worked from a laptop (`http://localhost:5173`) but failed only from a
  phone on the same network ("Failed to send a request to the Edge
  Function"). Added `DEV_ORIGIN_RE`, a regex matching any RFC1918 private
  range (`192.168.x.x`/`10.x.x.x`/`172.16-31.x.x`) plus `localhost`/
  `127.0.0.1` on Vite's dev/preview ports (5173/4173), alongside the
  existing exact-match list — duplicated in both functions, matching this
  codebase's existing convention of not sharing code between them.
  **Requires redeploying both `scan-binder-page` and `card-lookup-proxy`**
  to take effect.
- **Rarity field extended to EditModal and CSV/XLSX import** — was only on
  ScannerPanel's review rows before. EditModal gets the same transient,
  never-saved input (next to Set) feeding `handleFindImage`/
  `handleFindMarketPrice`'s `rarityHint` param. Import gets a new
  `FIELD_TARGETS` entry (`rarity`) in `importParse.js`; `ImportExportPanel`
  keeps the mapped column in a separate `rarityHints` array (indexed the
  same as `newRows`, never attached to the `normalizeCard` objects
  themselves) purely to pass into the per-row auto image search — same
  "never let a transient search hint leak into what's actually saved"
  discipline as the Scanner.
- **Known limitation, not fixed**: on mobile, selecting a multi-sheet `.xlsx`
  file for Import auto-loads the first sheet instead of showing the sheet
  picker — desktop shows the picker correctly. This is what the earlier
  "returns to the main view" report actually was: not a crash, just the
  sheet-picker step being silently skipped, which read as "nothing
  happened" on a phone. Root cause not yet isolated (couldn't reproduce with
  several synthetic multi-sheet test files against both `xlsx@0.20.3` and
  `0.18.5` through the real dev server on desktop — the mobile-specific
  trigger is still unknown). Deliberately parked rather than guessed at, per
  this project's never-guess discipline — revisit with either a real device
  repro or the actual file involved.

## Staff documentation

A standalone, no-login reference page — not an in-app help tab — so staff
can pull it up on a phone before ever signing in, bookmark it, or print it.

- **Routing**: same pattern as the public binder page — `src/main.jsx`
  checks `?help=1` (alongside the existing `?binder=`) and renders
  `<StaffDocs/>` with no `UIProvider`/session check, same reasoning as
  `BinderView.jsx`. Reached from a "Staff docs" link in the main app's
  footer (`target="_blank"`, next to "Pricing settings"/"Sign out") so
  opening it never interrupts an in-progress edit/import/scan.
- **`src/components/docs/StaffDocs.jsx`**: the page shell — reuses
  `.app`/`.topbar`/`.brand` for the same visual identity `BinderView.jsx`
  already uses, plus a sticky left nav beside the content column
  (collapses to a wrapped row of pill links above the content under the
  shared 640px mobile breakpoint — no room for two columns there).
  **Shows exactly one section at a time**, driven by the URL hash — not one
  long scrolling page. The first pass used in-page jump-link anchors on a
  single page, but staff wanted to be able to jump straight to what they
  need without scrolling past everything else, or read straight through via
  a Previous/Next stepper at the bottom without losing their place. Every
  nav/stepper link is a real `#hash` anchor rather than a click handler —
  `hashchange` is what drives which section renders, so browser back/
  forward and a directly-linked/bookmarked URL (e.g. `?help=1#scan-binder`)
  both just work for free; a missing/unrecognized hash falls back to the
  first section. The last section's "Next" loops back to the first instead
  of a dead end. Cross-reference links inside a section's own prose (e.g.
  Catalog's "see Selling an item") are plain `#hash` links too, so they now
  jump straight to that section instead of just scrolling to it.
- **`src/components/docs/sections/*.jsx`** — one file per topic (Getting
  started, Catalog, Editing an item, Selling an item, Sync Queue,
  Import/Export, Scan Binder, Quote, Sorting, Pricing settings, the public
  binder page, Concepts & glossary, Known quirks), each a `<DocsSection>` with real
  field/button labels from the actual UI. Deliberately split this way so a
  future feature (e.g. the TCG Player export below) only means adding a
  paragraph to one existing section file — nothing else about this page
  changes.
- **`src/components/docs/DocsSection.jsx`** / **`DocsCallout.jsx`**: the two
  shared pieces every section is built from — a titled `<section>` wrapper,
  and a small note/warning callout box (`.docs-callout-note`/`-warn`) for a
  behavior worth flagging inline rather than burying in the glossary.
- The "Known quirks" section doubles as a living list of this doc's own
  "not a bug" answers — e.g. the mobile multi-sheet `.xlsx` sheet-picker
  issue noted above, Reset All Data being irreversible and shared, editing/
  selling resetting the P/T/C status chips. Update it alongside whatever
  section documents a quirk's actual feature area.
- `e2e/staff-docs.spec.js` follows the existing suite's conventions — loads
  `?help=1` with no `seedHarness` call at all (the page never touches the
  database), asserts every section heading renders and that a nav
  jump-link actually scrolls to its section.

## Next sprints

- **TCG Player draft-catalog export**: TCG Player's draft catalog accepts a
  bulk .xlsx/.csv upload for *new* products, not just updates to existing
  listings — confirmed by hands-on investigation (see Known constraints
  above), correcting the earlier "manual-entry-aid only" assumption Export
  was built around. This sprint builds an actual upload-ready export format
  for TCG Player specifically. Get the real required column layout/format
  before building — same "never guess an external platform's file format"
  discipline that's applied everywhere else in this project. Once built,
  add a paragraph to `ImportExportSection.jsx` in the staff docs above —
  that's the only doc change it needs.
- **Scan review UX, staged plan** (agreed after the real-phone round-2
  findings above) — Sprint 0 (rarity word-order/temperature/apostrophe
  fixes) and Sprint 1 (backfill from a confirmed candidate) are done;
  these are next, in order, each independently shippable. Every one
  applies equally to EditModal and ScannerPanel — this app has no separate
  "scanner-only" vs. "catalog-only" field behavior, and these shouldn't be
  the first exception:
  - ~~1. Backfill Number/Set/Rarity from a confirmed stock-image pick~~ —
    done. `pokemonQuery`'s candidates now carry structured `set`/`number`
    (previously only baked into the display label); picking a candidate in
    either EditModal's `selectCandidate` or ScannerPanel's per-row grid now
    overwrites the item's Set/Number/Rarity with that print's own values
    whenever the candidate actually carries them (a no-op for every
    non-Pokemon game today, which don't populate those fields). EditModal
    gained a Number scratch field to match ScannerPanel's, which already
    had one. Stays valuable independent of the name-only-search experiment
    above (tried and reverted) — confirming a candidate visually and
    trusting *that print's* real Set/Number/Rarity is a good source of
    truth for those fields regardless of how the search itself is hinted.
  ~~2. Rarity as a real `<select>`, not a `<datalist>`~~ — done. The
     datalist's browser-native filtering hid suggestions once the field
     already had a non-matching value typed, which wasn't the "always show
     me every option" behavior wanted here. Extracted `LocationPicker`'s
     select-plus-"add new" escape hatch into a new shared, generic
     `src/components/SelectWithCustom.jsx` — `LocationPicker` is now a thin
     wrapper over it (same external prop API, unchanged for its own
     callers), and both `EditModal`'s and `ScannerPanel`'s Rarity fields use
     it directly with `RARITY_OPTIONS_BY_GAME[game]` as the option list.
     Extracted rather than copy-pasted since this exact pattern is reused
     twice more below (Condition, Foil). Two behaviors added that
     `LocationPicker` didn't need before: (1) an empty options list (every
     non-Pokemon game today) skips straight to the free-text input instead
     of forcing a "+ Add new" click first, since there's nothing real to
     select from — matters here far more than for `LocationPicker`, where
     locations are rarely empty; (2) a `useEffect` re-opens that same
     escape hatch if `options` shrinks to empty *after* the picker already
     mounted in select mode — the concrete case being Rarity's options
     depending on the Game field, which staff can change after Rarity is
     already showing a dropdown for a different game.
  ~~3. Condition dropdown~~ — done. Same `SelectWithCustom` pattern as
     Rarity above. Options are the five tiers' full names ("Near Mint",
     "Lightly Played", "Moderately Played", "Heavily Played", "Damaged"),
     not the short codes — each is already a recognized
     `canonicalizeCondition` alias for its tier (a test asserts this
     round-trip explicitly, so the dropdown can never offer a name the app
     itself wouldn't recognize), and full names read better than a bare
     code in a plain-text context like `CatalogTable`'s subtitle line. New
     `CONDITION_TIERS`/`CONDITION_OPTIONS` in `cardUtils.js` are the single
     source for these names — `SettingsModal`'s per-tier multiplier rows
     (which need the short codes alongside the names, e.g. "Lightly Played
     (LP)") now derive their labels from `CONDITION_TIERS` too instead of
     keeping a second hardcoded copy that could drift out of sync. Unlike
     Rarity, `CONDITION_OPTIONS` is never empty (fixed, game-independent
     list of 5), so the free-text escape hatch only opens for a value
     that's already a custom/legacy one — notably including plain "NM"-
     style short codes on existing items, since the dropdown's options are
     the full names, not the codes.
  ~~4. Printing/finish ("foil") dropdown~~ — done, UI only, no new
     scan-side recognition. Same `SelectWithCustom` pattern again; new
     `PRINTING_OPTIONS_BY_GAME` in `cardUtils.js` (Pokemon only, matching
     `POKEMON_PRICE_VARIANTS`' Normal/Holofoil/Reverse Holofoil/1st Edition
     Normal/1st Edition Holofoil — confirmed real via live API responses
     seen this session, not guessed) is the curated list. Two things
     researched and deliberately left out, to avoid two different kinds of
     mistake:
     - **Poke Ball/Master Ball/Love Ball/Friend Ball/Quick Ball/Dusk
       Ball-style reverse holo patterns** — real, and a genuine printing/
       finish distinction (same collector number as the plain card, just a
       different foil treatment): Prismatic Evolutions (Jan 2025)
       introduced Poke Ball + Master Ball; Ascended Heroes (Jan 2026 — the
       exact set Mega Gengar ex/Lillie's Clefairy ex are from, above)
       expanded this to five ball types. Not added as dropdown options
       because the vocabulary keeps growing with every new set and would
       need permanent upkeep — staff enter these through the free-text
       escape hatch instead. Confirmed with the user before implementing,
       given it's a real trade-off (dropdown completeness vs. maintenance).
     - **"Shadowless"** — looks like a finish variant but isn't modeled as
       one on TCGPlayer: it's a separate Set category ("Base Set
       (Shadowless)"), distinct from "Base Set" itself, not a
       printing/finish flag on the same card. Belongs in the Set field
       (already free text) — including it here would have been a real
       modeling mistake, not just an omission.
     - Also fixed a related inconsistency found while implementing this:
       `ScannerPanel`'s `detectedToRow` was still pre-filling `printing`
       from the scan's own `foil` boolean guess (`card.foil ? 'Foil' :
       ''`) — a leftover from before this "don't have the model guess
       foil type" decision was made, and one `ScanRow` had no UI to
       correct anyway (Printing/finish wasn't shown there at all before
       this sprint). Now starts blank, client-side only — no Edge Function
       change, no redeploy needed.
  **Future enhancements (parked, not scheduled)**: Set-symbol accuracy
  (near-always blank in real testing — tiny icons buried in busy full-art
  illustrations; fixing this for real would mean deterministic icon
  matching against a reference library, a much bigger investment for a
  field that's already low-yield) and Japanese-print price coverage
  (pokemontcg.io is English-print-focused; a name search on a Japanese
  card can surface the English equivalent's image with no matching price
  data — no verified alternative data source yet, don't guess one).

## Rarity/Condition/Printing catalog filters, Rarity persistence

- **Rarity is now a real, saved catalog attribute** (`catalog.rarity`,
  `phase7_rarity_column.sql`) — before this it only ever existed as a
  transient scratch/search-hint field in `EditModal`/`ScannerPanel`,
  discarded on save (confirmed by checking `normalizeCard`, `db.js`'s row
  mapping, and the schema — none of them had a `rarity` field at all).
  Explicitly confirmed with the user before persisting it, since "add a
  Rarity filter" implicitly meant "start saving Rarity," a bigger change
  than a filter alone. `EditModal`'s `rarity` state was folded into
  `form.rarity` (previously separate from the saved `form` object
  entirely) — it still does the same job of narrowing Find stock image/
  Find market price, it just also persists now. `ScannerPanel`'s
  `row.rarity` needed no such refactor (already part of the saved row
  shape); `handleConfirm` just needed one added line to actually include
  it. Deliberately NOT added to `catalog_public_view` (a staff-side
  disambiguation aid, not something the public binder page needs) or to
  `sync_queue` (unlike condition/printing, which get snapshotted onto a
  sold ticket because they factor into pricing, rarity plays no role in
  pricing or sync bookkeeping) — see the migration file for the reasoning.
  **Requires running `phase7_rarity_column.sql` in the Supabase SQL Editor**
  before this code can save/read Rarity — no code-side default masks a
  missing column here, so skipping the migration would surface as a real
  save error, not a silent no-op.
- **Catalog tab gained Rarity/Condition/Printing filters, shown only once
  a single game is selected** — an explicit ask, since these three are
  specific enough to one game's own vocabulary (a Pokemon rarity means
  nothing for Magic) that a combined-games list would just be noise.
  Options come from that game's *actual* catalog values (`Array.from(new
  Set(...))`, same pattern the existing Game/Location filters already use)
  rather than the curated `RARITY_OPTIONS_BY_GAME`/`CONDITION_OPTIONS`/
  `PRINTING_OPTIONS_BY_GAME` suggestion lists used for data entry — a
  curated value nothing in the catalog has yet would just be a dead-end
  filter, and this way any custom value staff typed through those
  pickers' free-text escape hatch (e.g. a specific Poke Ball/Master Ball
  pattern) shows up as a real, usable filter option too. A filter for any
  of the three simply doesn't render if that game has zero items with a
  value for it yet (rather than showing an empty, useless dropdown). All
  three reset to blank whenever the Game filter itself changes (including
  back to "all games") — a stale value from one game would otherwise
  either mean nothing for the new game or, worse, silently zero out every
  result with no visible explanation why.
- **`SelectWithCustom`'s "+ Add new…" option gets a distinct `#f2f2f2`
  background** (`.select-add-new-option` in `index.css`) to set it apart
  from the real, selectable values above it — applies everywhere the
  component is used (Rarity/Condition/Printing/Location). Native `<option>`
  background styling has patchy cross-browser support (some OS-native
  dropdown renderers ignore it), but it's a harmless, no-cost attempt
  where it does work.

## Per-game feature parity (Magic + Yugioh + One Piece + Lorcana + SWU + Riftbound + Gundam done)

A new multi-sprint initiative, one sprint per game, bringing every other
supported game up to the same depth of feature support Pokemon already has
(curated Rarity/Printing vocab, collector-number disambiguation, search
reliability hardening, scanner prompt tuning) — confirmed with the user as
**full parity**, not just "add the dropdowns." Order: Magic first, then
Yugioh, then One Piece, then Lorcana, then SWU, then Riftbound, then
Gundam (all done below) — completing the initiative (Sports Singles is
excluded — it has no card database to integrate against at all, a
documented drawback, not an oversight).

- **Magic (Sprint 1) — done.** Real research first (Scryfall's own API,
  confirmed via its type definitions/blog posts, not guessed), then wired
  through the same places Pokemon already uses:
  - `RARITY_OPTIONS_BY_GAME.Magic` (`cardUtils.js`): the six real Scryfall
    `rarity` values — `Common`/`Uncommon`/`Rare`/`Mythic Rare`/`Special`/
    `Bonus`. Special (timeshifted cards) and Bonus (bonus-sheet cards like
    Vintage Masters' Power Nine) are real, current values, not legacy-only
    — rare enough in practice that an exact pick still beats forcing free
    text every time one shows up.
  - `PRINTING_OPTIONS_BY_GAME.Magic`: the four real Scryfall `finishes`
    values — `Nonfoil`/`Foil`/`Etched`/`Glossy`. Deliberately excludes
    frame/border TREATMENTS (Showcase, Extended Art, Borderless, Full
    Art — Scryfall's separate `frame_effects` field) and marketing-only
    finish names (Secret Lair's "Rainbow Foil"/"Surge Foil") — same
    modeling trap as Pokemon's "Shadowless" exclusion: a treatment is a
    different attribute of the same finish, not a finish itself, and
    TCGPlayer doesn't list these as finish-dropdown values either.
  - **`searchScryfall` (`cardSearch.js`) gained `setHint`/`numberHint`
    params**, matching `searchPokemon`'s `(name, setHint, rarityHint,
    numberHint)` shape (previously only took `name, rarityHint` — `set`
    was never even passed through for Magic before this). An explicit or
    name-embedded (`"Card (1234)"`, the existing import convention)
    collector number is now tried FIRST, before the plain name search —
    same "number is the strongest disambiguator" priority Pokemon uses,
    and a real change from the old behavior (which tried the plain name
    first, falling back to a parsed number only as a last resort).
    **`setHint` is deliberately accepted but never turned into a `set:`
    filter** — Scryfall's `set:`/`s:`/`e:`/`edition:` operators only match
    a 3-4 letter set CODE (confirmed via its own syntax docs/examples,
    e.g. `e:ktk` not `e:Khans of Tarkir`), and this app's Set field holds
    whatever free text staff typed or the scanner read, essentially always
    a full name, not a code, with no lookup in this app from one to the
    other. Guessing a filter here risks silently zeroing out a correct
    match on a mismatch the code can't detect — same "don't guess an
    external platform's exact capability" call as everywhere else in this
    file. Accepted as a no-op parameter anyway so every game in
    `searchCardImage`'s dispatch table shares one `(name, setHint,
    rarityHint, numberHint)` shape.
  - **Reliability**: `scryfallQuery` now retries once on a genuine 5xx
    (Scryfall has no confirmed flakiness report the way pokemontcg.io
    does, so this is a lighter 1-retry safety net, not a copy of Pokemon's
    aggressive 4-attempt backoff) and throws on a persistent failure
    instead of silently returning `[]` — except a 404, which Scryfall's
    `/cards/search` uses as its real, confirmed "zero results" response,
    not an error, so it's mapped to `[]` without retrying or throwing.
    `searchScryfall`'s own tiers isolate a failure the same way
    `searchPokemon`'s do: a persistent failure on the number-hint tier
    falls through to the broad name tier instead of aborting the whole
    search; only the last tier's failure actually propagates.
  - **Pricing**: `scryfallPrice` now falls back through `usd` → `usd_foil`
    → `usd_etched` → `usd_glossy` (Scryfall's real four USD price fields,
    confirmed via its API blog post announcing them) instead of only ever
    reading `usd` — a foil-only or etched-only print (most often a Secret
    Lair drop) can have a null `usd` while still carrying a real price
    under one of the others, same reasoning as Pokemon's
    `POKEMON_PRICE_VARIANTS` fallback.
  - Scryfall's mapped candidate objects now also carry structured `set`/
    `number` fields (previously only baked into the label) — lets a
    confirmed pick back-fill the item's own Set/Number/Rarity fields for
    Magic too, the same Sprint-1-era backfill Pokemon already had.
  - **`scan-binder-page`'s rarity guidance now branches by game** — added a
    Magic-specific block (both in the tool schema's field description and
    `PROMPT_TEXT`) telling the model to read the small expansion symbol's
    COLOR on the type line, not overall visual style the way Pokemon
    works: black/white = Common (also basic lands, which print no
    symbol), silver = Uncommon, gold = Rare, red-orange = Mythic Rare
    (doesn't exist pre-2008), purple = Special (Time Spiral timeshifted
    only), glowing/prismatic = Bonus. A new catch-all line covers every
    other game: leave rarity blank unless an exact tier name is legibly
    printed, since the visual-guessing rules are only verified for Magic
    and Pokemon. **Requires redeploying `scan-binder-page`**
    (`supabase functions deploy scan-binder-page`) — schema/prompt changes
    are server-side.
  - `EditModal`/`ScannerPanel` needed no changes beyond a placeholder-text
    tweak (the Number field's example was Pokemon's "280/217" format only
    — now reads "150, or 280/217") — both already passed `number`/`rarity`
    generically to every game via `searchCardImage`, and already rendered
    `RARITY_OPTIONS_BY_GAME`/`PRINTING_OPTIONS_BY_GAME` per the selected
    game, so adding Magic's entries to `cardUtils.js` was enough to light
    up the same dropdowns Pokemon already had.
- **Yugioh (Sprint 2) — done.** Real research first (YGOPRODeck's own API
  guide/a live response sample, plus community rarity guides for tiers a
  single sample didn't happen to include), then wired through the same
  places Pokemon/Magic already use:
  - **Structural finding that shaped everything else below**: unlike
    Scryfall/pokemontcg.io, a Yu-Gi-Oh card is ONE database entry covering
    every printing — a reprint doesn't get its own card object, it's just
    another entry in that one card's own `card_sets` array (each with its
    own `set_name`/`set_code`/`set_rarity`/`set_price`). So there's no
    "wrong print returned" problem to fix the way Magic/Pokemon have (a
    fuzzy name search already finds the right card); the real
    disambiguation need is picking WHICH of that one confirmed card's
    `card_sets` entries to surface a price/rarity/set from, not which card.
    This meaningfully narrowed this sprint's scope versus Magic's.
  - `RARITY_OPTIONS_BY_GAME.Yugioh` (`cardUtils.js`): thirteen real, common
    tiers (Common through Quarter Century Secret Rare) confirmed against a
    real `card_sets[].set_rarity` sample ("Secret Rare"/"Ultra Rare" as
    exact Title Case strings) plus community rarity guides for the higher
    tiers. Deliberately excludes Parallel Rare variants (Duel
    Terminal-exclusive) and region-specific OCG-only tiers — same
    "ever-expanding niche vocabulary belongs in the free-text escape hatch"
    call as Pokemon's Poke Ball pattern exclusion.
  - `PRINTING_OPTIONS_BY_GAME.Yugioh`: `1st Edition`/`Unlimited Edition`/
    `Limited Edition` — confirmed via Yugipedia's edition pages and
    TCGPlayer's own price-guide edition options. Unlike Magic/Pokemon,
    rarity already implies a Yu-Gi-Oh print's foil treatment (an Ultra Rare
    is always name+art foil, full stop) — there's no independent foil/
    nonfoil axis to capture here. Edition is the real, separate printing
    distinction instead, and it's an evergreen 3-value list, not a
    per-set-expanding one, so no exclusion-list caveat is needed.
  - **`searchYugioh`/`ygoQuery` (`cardSearch.js`) gained `setHint`/
    `rarityHint`/`numberHint` params** (previously took only `name`).
    `numberHint` maps to the printed set code (e.g. `LOB-005`, visible
    bottom-left on every real card) — a near-global unique key, so it's
    tried first; `setHint`/`rarityHint` are softer fallbacks. All three are
    soft, local, best-effort matches against the card's own already-
    returned `card_sets` array (`pickYugiohSetEntry`) — never a server-side
    filter — so a wrong/mismatched hint can never zero out a real result,
    same discipline as `preferRarity`. A confirmed pick's `set`/`rarity` now
    also back-fill the item's own fields, same Sprint-1-era backfill
    Magic/Pokemon already had (no `number` backfill — Yu-Gi-Oh's set code
    is tied to one specific printing, not a stable "the item's own number"
    the way Magic/Pokemon's collector number is).
  - **Deliberately stayed off `tcgplayer_data=yes`** — that mode
    additionally unlocks `set_edition`/`set_url` (which would otherwise
    backfill Printing and provide a listingUrl), but YGOPRODeck's own docs
    warn TCGplayer's Set Name/Rarity data under that mode "have occasionally
    made up Rarity names in the past and don't always conform to correct
    Card Set Names." Since accurate Set/Rarity backfill matters more than
    an extra listing link, this sticks with the default (reliable) internal
    data — no listingUrl for Yugioh today; the existing game-agnostic
    manual TCGPlayer search link already covers that gap the same way it
    does for every other provider that lacks one.
  - **Reliability**: `ygoQuery` now retries once on a genuine 5xx (same
    lighter 1-retry pattern as Scryfall — no confirmed flakiness report for
    this API either). Unlike Scryfall's confirmed-404 or pokemontcg.io's
    live-tested behavior, this API's exact "no results" status code isn't
    confirmed — rather than guess, a persistent non-5xx failure still
    returns `[]` (the original behavior) instead of throwing, so as not to
    misreport a real "no matches" as an error on unconfirmed information.
  - **`scan-binder-page`'s number/rarity guidance now branches for Yu-Gi-Oh
    too** — the printed set code's location/format (e.g. `LOB-005`, a
    global unique key, unlike a bare number), and rarity guidance based on
    WHERE the foil treatment sits (name-only/art-only/both/embossed/
    diagonal-rainbow/gold/ghostly, for Common through Ghost Rare) rather
    than overall art style. The five rarest tiers (Platinum Secret Rare
    through Quarter Century Secret Rare) are explicitly called out as
    visually similar enough to each other that the model should leave
    rarity blank rather than guess between them without a very clear photo.
    **Requires redeploying `scan-binder-page`** — schema/prompt changes are
    server-side.
- **One Piece (Sprint 3) — done.** Real research first (Bandai's own
  card-list site plus cross-referenced community rarity guides, since
  Egman's deckbuilder API itself has no public docs to research against —
  the shape of its response was already confirmed in an earlier sprint),
  then wired through the same places Pokemon/Magic/Yugioh already use:
  - **Structural finding**: a One Piece card's full printed code
    (`<set letters>-<number>`, e.g. `OP01-001` or `ST01-001` for a starter
    deck) is printed as ONE unit in the card's bottom-RIGHT corner, right
    next to a short rarity letter code (e.g. `OP01-121 SEC`) — a different
    layout from every other game done so far (Magic/Yu-Gi-Oh both use the
    bottom-LEFT corner). An expansion NAME is rarely printed on the card
    itself, unlike Magic/Pokemon, so the Set field's real content for this
    game is the set-code prefix (`OP01`), not a human-readable name — matches
    Egman's own `card_code`/`set_code` fields, which are codes, not names.
  - `RARITY_OPTIONS_BY_GAME["One Piece"]` (`cardUtils.js`): nine real,
    confirmed rarity codes/tiers — `Common`/`Uncommon`/`Rare`/`Super Rare`/
    `Secret Rare`/`Leader`/`Special Rare`/`Treasure Rare`/`Manga Rare`.
    Treasure Rare (`TR`) is English/Chinese/French-only, debuting OP-06
    booster sets onward (Japanese releases get a different chase mechanic
    instead); Manga Rare (`MR`) is technically always also a Secret Rare
    under the hood, but carries its own distinct printed code and Oda-manga-
    panel artwork, so it gets its own list entry rather than folding into
    plain Secret Rare — same "give a nested-but-distinct tier its own
    entry" call as several of Pokemon's tiers.
  - **Deliberately excludes "Parallel"/"Alternate Art" from the rarity
    list** — research confirmed these are the SAME thing (collectors and
    TCGPlayer use both names interchangeably for a card marked with a small
    star above its rarity code), and it's an overlay applied on top of ANY
    of the tiers above (a Common, an SR, even a Leader can get one),
    changing only the artwork/foil pattern, never the card's stats or the
    base rarity itself — a genuinely separate axis, not a rarity tier, same
    rarity-vs-finish split Yu-Gi-Oh's edition field already established
    (just the opposite direction: Yu-Gi-Oh's separate axis is edition,
    One Piece's is this alt-art overlay).
  - `PRINTING_OPTIONS_BY_GAME["One Piece"]`: `["Normal", "Alternate Art"]`.
    Like Yu-Gi-Oh, a One Piece print's base RARITY already implies its
    default foil treatment (Common/Uncommon non-foil, Rare gets an accent
    foil, Super Rare and above are full holo — confirmed via research), so
    there's no independent foil/nonfoil toggle to offer; the one real
    separate axis is the star-marked alt-art overlay described above,
    picking one name ("Alternate Art") to avoid offering duplicate options
    for what's confirmed to be a single real value.
  - **`searchOnePiece` (`cardSearch.js`) gained a `numberHint` param**
    (previously only `name, setHint, rarityHint`), matching the
    `(name, setHint, rarityHint, numberHint)` shape every other game's
    search function already uses. Threaded through `proxyQuery` (a new
    `numberHint` field in the `card-lookup-proxy` invoke body) and
    `card-lookup-proxy`'s `Deno.serve` handler down into `egmanQuery`, which
    now accepts a `numberHint` and matches it against the confirmed real
    `card_code` field's suffix after the last dash — accepting either a
    bare number (`"001"`, what the scanner reports) or the full code
    (`"OP01-001"`, what a staff member might type by hand) rather than
    forcing a guess about which form the caller supplies. Tried before
    setHint/rarityHint, same "number is the strongest disambiguator"
    priority used for Pokemon/Magic/Yu-Gi-Oh — narrows the match set first
    if it helps, and every later hint still only narrows further, never
    resets to zero. **Riftbound/Gundam don't pass a `numberHint` yet**
    (their own parity sprints haven't happened) — since `egmanQuery`
    treats a missing hint as a no-op, this is a purely additive, inert
    change for those two games today.
  - **Reliability**: `egmanQuery`'s two `fetch` calls (cards + prices) now
    retry once on a genuine 5xx via a new shared `fetchWithRetry` helper —
    the same lighter 1-retry pattern already used for Scryfall/Yu-Gi-Oh (no
    confirmed flakiness report for Egman's deckbuilder specifically, so
    this is a safety net, not an aggressive backoff). Applies to all three
    Egman-backed games (One Piece/Riftbound/Gundam) since it's a shared
    function — safe for the other two since it only improves reliability on
    a genuine server error, with zero behavior change on a normal response.
  - **`scan-binder-page`'s number/set/rarity guidance now branches for One
    Piece too** — told to read the full printed code in the card's
    bottom-right corner directly (not guess from visual style, unlike
    Magic/Pokemon): the number portion after the dash goes in the `number`
    field, the set-letters prefix goes in the `set` field (there's usually
    no expansion name to read instead), and the short rarity letter code
    next to it maps exactly to the nine values above (`C`→Common,
    `UC`→Uncommon, `R`→Rare, `SR`→Super Rare, `SEC`→Secret Rare, `L`→Leader,
    `SP`→Special Rare, `TR`→Treasure Rare, `MR`→Manga Rare). A star above
    the rarity code is called out as meaning "this print is also a
    parallel/alternate-art version" without changing which rarity value to
    report — there's no schema field yet to record that separately, same
    "UI-only Printing dropdown, no new scan-side detection field" scope
    limit Magic/Yu-Gi-Oh's printing/edition additions already accepted.
    **Requires redeploying `scan-binder-page`** — schema/prompt changes are
    server-side.
  - `EditModal`/`ScannerPanel` needed no changes at all — both already
    passed `number`/`rarity` generically to every game via `searchCardImage`,
    which already forwarded `numberHint` through to `searchOnePiece` once
    that function accepted it; adding One Piece's entries to `cardUtils.js`
    was enough to light up the same curated dropdowns Pokemon/Magic/Yugioh
    already had.
- **Lorcana (Sprint 4) — done.** Real research first (community rarity
  guides for the visual symbol system, plus a real Lorcast API card sample
  fetched via a GitHub-hosted archive of raw API snapshots, since
  Lorcast's own docs site is unreachable from this sandbox — same
  "triangulate a real sample instead of guessing" discipline as everywhere
  else in this doc), then wired through the same places Pokemon/Magic/
  Yugioh/One Piece already use:
  - **Structural finding**: unlike Yu-Gi-Oh/One Piece, Lorcana's rarity and
    finish (foil/nonfoil) ARE genuinely independent axes — confirmed via
    research that every card at Common through Legendary exists in both a
    foil and non-foil printing (the real sample's `prices.usd` vs.
    `prices.usd_foil` fields both existing on the same card object
    confirms both prints exist), with Enchanted being the one rarity
    that's foil-only. This puts Lorcana in the same rarity-vs-finish
    bucket as Magic/Pokemon, not Yu-Gi-Oh/One Piece.
  - `RARITY_OPTIONS_BY_GAME.Lorcana` (`cardUtils.js`): the six official
    tiers, each with its own distinct printed symbol shape (Common = gray/
    white circle, Uncommon = a book icon — the one exception to the
    "more sides = rarer" pattern, Rare = triangle, Super Rare = diamond,
    Legendary = pentagon, Enchanted = rainbow/holographic hexagon), plus a
    seventh real value, `Promo`, confirmed via the real sample: an entire
    promotional set's cards all reported `"rarity": "Promo"` rather than
    one of the six numbered-set tiers.
  - **Real data quirk found and normalized, not guessed around**: the
    same real sample's Super Rare cards report `"rarity": "Super_rare"` —
    an underscored, oddly-cased outlier next to every other tier's normal
    Title Case string (`Common`/`Uncommon`/`Rare`/`Legendary`). No code
    change was needed to handle it — `preferRarity`'s existing
    `normalizeRarityForMatch` (added for Pokemon's own `MEGA_ATTACK_RARE`
    quirk) already lowercases and turns underscores into spaces before
    comparing, so it transparently absorbs this one too.
  - `PRINTING_OPTIONS_BY_GAME.Lorcana`: `["Normal", "Foil"]` — the two
    real, evergreen finish values (see the structural finding above).
    Enchanted's foil-only-ness is already captured by picking "Enchanted"
    in Rarity, so no third option is needed here.
  - **`searchLorcana` (`cardSearch.js`) rewritten for full parity** —
    previously took only `name`; now `(name, setHint, rarityHint,
    numberHint)`, matching every other game's shape. Lorcast's own query
    syntax ("heavily influenced by Scryfall," confirmed via its docs) uses
    `s:`/`set:` for the set and `cn:`/`number:` for the collector number —
    and unlike Magic's setHint (which Scryfall's `set:` operator can't use
    because it wants a letter code this app doesn't store), Lorcana's is
    genuinely safe to wire up as a real server-side filter: Lorcana sets
    have no letter code at all, only a plain NUMBER (confirmed via
    research — e.g. `s:6` for Azurite Sea), which is exactly what this
    app's Set field holds for this game (see the scan-binder-page note
    below) and exactly what the operator expects. A tiered fallback tries
    name+set+number, then name+number, then name+set, then a broad
    name-only search, isolating each tier the same way Pokemon/Magic do —
    a narrower tier finding nothing falls through to a broader one rather
    than giving up. `rarityHint` stays a soft, client-side `preferRarity`
    reorder rather than a hard `rarity:` filter — that operator exists too,
    but its exact multi-word tokenization (given the real `"Super_rare"`
    formatting quirk above) isn't confirmed enough to risk as a hard
    filter that could zero out a real match on a mismatch this app can't
    detect.
  - **Real `listingUrl` added** — Lorcast's card object carries a real
    `purchase_uris.tcgplayer` field (confirmed via the same real sample),
    now mapped through same as Scryfall's/pokemontcg.io's/Egman's. This
    closes a gap the "Pricing section: manual listing-link fallback"
    section above previously documented as a real, undeliberate miss for
    this game specifically — Lorcana no longer needs that fallback in
    practice (Yugioh/SWU still do).
  - **Pricing**: new `lorcastPrice` falls back `usd` → `usd_foil` (the two
    real USD fields Lorcana's data carries — no etched/glossy equivalent
    the way Magic has), same nonfoil-first reasoning as `scryfallPrice`.
  - **Reliability**: `lorcastQuery` now retries once on a genuine 5xx (same
    lighter 1-retry pattern as Scryfall/Yu-Gi-Oh — no confirmed flakiness
    report for this endpoint either) and, since Lorcast's exact "zero
    results" status code isn't independently confirmed the way Scryfall's
    404 is, a persistent non-5xx failure still returns `[]` instead of
    throwing — same unconfirmed-status-code call already made for
    Yu-Gi-Oh, so a real "no matches" doesn't get misreported as an error
    on information this app doesn't actually have.
  - Candidates now carry structured `set`/`number`/`rarity` fields
    (previously only baked into the label) for the same Sprint-1-era
    backfill-on-pick every other game already has.
  - **`scan-binder-page`'s number/set/rarity guidance now branches for
    Lorcana too** — the collector number prints in the same bottom-left
    number/total-in-set format Pokemon uses (e.g. `154/204`); no expansion
    name is ever printed, only a bare set number in that same area
    (confirmed via research — matches exactly what Lorcast's `s:` operator
    expects, see above); and rarity is read from the small symbol's SHAPE
    next to the collector number (circle/book/triangle/diamond/pentagon/
    hexagon), with an unnumbered promotional card reported as `'Promo'`
    regardless of shape. **Requires redeploying `scan-binder-page`**
    (`supabase functions deploy scan-binder-page`) — schema/prompt changes
    are server-side.
  - `EditModal`/`ScannerPanel` needed no changes at all — both already
    passed `set`/`rarity`/`number` generically to every game via
    `searchCardImage`, which already forwarded all three through once
    `searchLorcana` accepted them; adding Lorcana's entries to
    `cardUtils.js` was enough to light up the same curated dropdowns every
    other parity-complete game already had.
- **SWU (Sprint 5) — done.** Real research first (community rarity/variant
  guides, plus a concrete real card listing on swu-db.com showing a Rare
  card's own Rarity vs. Variants fields — since api.swu-db.com itself is
  unreachable from this sandbox for a direct sample, same as Lorcast, so
  this was triangulated across several independent sources rather than
  taken from any single one), then wired through the same places
  Pokemon/Magic/Yugioh/One Piece/Lorcana already use:
  - **Structural finding, and a real contradiction resolved**: some
    community sources describe SWU's premium foil/art treatments
    (Hyperspace, Showcase, Prestige) as "separate rarities alongside the
    standard pull structure," while others describe them as a layer on
    top of a base rarity. A concrete, specific real example (swu-db.com's
    own "Hyperspace Disaster" card page: `Rarity: Rare`, with separate
    `variants` Original/Hyperspace/Foil/Hyperspace Foil) settled it in
    favor of the independent-axis model — the same rarity-vs-finish split
    Lorcana/Magic/Pokemon already use, not Yu-Gi-Oh/One Piece's model.
    Trusted the concrete real-card example over the vaguer blog claim it
    contradicted, per this doc's "get a real sample" discipline.
  - `RARITY_OPTIONS_BY_GAME.SWU` (`cardUtils.js`): the four real
    pull-structure tiers, each with its own gemstone symbol/color at the
    bottom of the card (grey/clear=Common, green=Uncommon, blue=Rare) —
    except Legendary, whose symbol is a gold/yellow STAR rather than a
    gemstone, the one shape break in that pattern. Plus a real fifth
    value, `Special` — confirmed via a direct quote of the swuapi.com
    docs describing the actual API's own `rarity` field as accepting it,
    independently corroborated by community sources describing a
    distinct Special rarity slot (including on some Leader cards).
    `Special` deliberately gets NO scan-detection visual guidance below —
    no confirmed distinguishing symbol/color was found for it the way the
    other four have one, so guessing at a visual tell would be worse than
    leaving it for staff to set by hand.
  - `PRINTING_OPTIONS_BY_GAME.SWU`: the six real, evergreen treatment
    names — `Normal`/`Foil`/`Hyperspace`/`Hyperspace Foil`/`Showcase`/
    `Prestige`. Deliberately excludes the promo/distribution-specific
    variant names also found in research (Serialized, Weekly Play Promo/
    Foil, Prerelease Promo, Convention Exclusive, Judge Promo) — same
    "ever-expanding, event-tied vocabulary belongs in the free-text
    escape hatch" call as Pokemon's Poke Ball pattern and Yu-Gi-Oh's
    Parallel Rare exclusion.
  - **`searchSwu`/the `swu` provider in `card-lookup-proxy` gained
    `rarityHint`/`numberHint`** (previously only `name, setHint`, and
    setHint itself was never actually used). Research confirmed the
    API's own query syntax DOES support `set:`/`rarity:` filter keywords
    server-side — but not whether they can safely combine with a plain
    fuzzy-text name search in the same query string, and this app's Set
    field for SWU holds whatever free text staff typed/the scanner read
    (almost always a full expansion name, not the short code those
    operators expect) — same mismatch risk that already keeps Magic's
    setHint unused. Rather than guess at that combination, setHint/
    rarityHint are instead applied as a soft, narrow-if-it-helps filter
    against the ALREADY-fetched name-matched results' own `Set`/`Rarity`
    fields — the same `egmanQuery`-style narrowing the three Egman-backed
    games use, just without a server-side query-string filter.
    `numberHint` is accepted for a consistent dispatch shape but stays a
    deliberate no-op — no confirmed collector-number field name to narrow
    by, and this app has never guessed a field name outright anywhere
    else in this file either.
  - **Reliability**: the `swu` provider's fetch now goes through the same
    shared `fetchWithRetry` helper added for One Piece/Riftbound/Gundam —
    a genuine, safe reliability improvement since it only changes
    behavior on an actual 5xx.
  - Candidates now carry structured `set`/`rarity` fields (previously
    only baked into the label) for the same backfill-on-pick every other
    parity-complete game already has. No `listingUrl` — still no
    confirmed purchase/listing URL field for this provider (unchanged
    from the original Sprint 4-era finding); the game-agnostic manual
    TCGPlayer search link continues to cover this gap, same as Yugioh.
  - **`scan-binder-page`'s rarity guidance now branches for SWU too** —
    reads the gemstone/star symbol's color/shape near the collector
    number, mapping to the four confirmed tiers, explicitly leaving
    `Special` and any premium-treatment card's underlying rarity
    unaffected by the treatment itself. **Requires redeploying
    `scan-binder-page`** — schema/prompt changes are server-side.
  - `EditModal`/`ScannerPanel` needed no changes at all — both already
    passed `rarity`/`number` generically to every game via
    `searchCardImage`, which already forwarded both through once
    `searchSwu` accepted them; adding SWU's entries to `cardUtils.js` was
    enough to light up the same curated dropdowns every other
    parity-complete game already had.
- **Riftbound (Sprint 6) — done.** Real research first (community rarity
  guides for the frame-style/gem-shape system, since Egman's deckbuilder
  API itself has no public docs to research against — the shape of its
  response was already confirmed in an earlier sprint, same as One
  Piece), then wired through the same places Pokemon/Magic/Yugioh/One
  Piece/Lorcana/SWU already use:
  - **Structural finding**: Riftbound's collector code is a THREE-part
    combo printed at the bottom of the card — set-code, number, and total
    — e.g. `OGN-310/298` (Origins, card 310, out of 298) — closer to a
    hybrid of One Piece's set-code-plus-number format and Pokemon's
    number-plus-total format than either alone. No expansion name is ever
    printed, matching One Piece/Lorcana's convention, so the Set field's
    real content is the short set-letters code (`OGN`), not a name.
  - **A genuine rarity-model contradiction found and resolved, same
    discipline as SWU's sprint**: some sources describe Riftbound's
    Alternate Art/Overnumbered/Signature collector versions as their own
    categories; research confirmed all three are actually sub-flavors
    that still report `Showcase` as their real `rarity` value, distinguished
    from each other only by their collector-number notation (an "a"
    suffix, an unmarked number above the set's total, or an asterisk) —
    not a separate rarity, and not an independent finish axis either
    (unlike SWU/Lorcana/Magic). This puts Riftbound in the same
    rarity-implies-treatment bucket as Yu-Gi-Oh/One Piece, just with the
    "treatment" being which Showcase print style rather than a foil
    detail.
  - `RARITY_OPTIONS_BY_GAME.Riftbound` (`cardUtils.js`): six real,
    confirmed values — the four functional/pull-structure tiers `Common`/
    `Uncommon`/`Rare`/`Epic` (each with its own frame style AND gem
    shape), plus `Showcase` (the chase rarity above Epic, foil-only, no
    colored frame — full art) and `Promo`.
  - `PRINTING_OPTIONS_BY_GAME.Riftbound`: `["Normal", "Alternate Art",
    "Overnumbered", "Signature"]` — per the structural finding above,
    these three real Showcase-rarity print styles are the genuinely
    separate axis for this game (not a foil/nonfoil toggle, which rarity
    already implies), plus the plain `Normal` default every non-Showcase
    card gets.
  - **`searchRiftbound` (`cardSearch.js`) gained a `numberHint` param**
    (previously only `name, setHint, rarityHint`) — the shared `egmanQuery`/
    `card-lookup-proxy` infrastructure already supported numberHint
    end-to-end since the One Piece sprint (it was already a documented,
    inert no-op for Riftbound specifically), so this sprint's wiring work
    was just passing it through the one missing link: `searchRiftbound`
    itself. Matches `card_code`'s suffix after the last dash, e.g. `310`
    from `OGN-310`, same convention as One Piece.
  - No changes needed to `card-lookup-proxy`, `egmanQuery`, or the
    `fetchWithRetry` reliability helper — all three were already shared,
    generic infrastructure covering Riftbound since the One Piece sprint;
    this game's own sprint only needed the client-side wiring plus the
    curated vocab and scan-binder-page prompt work below. A narrower scope
    than One Piece's own sprint, same "structural differences narrow later
    games' scope" pattern as Yu-Gi-Oh's sprint being narrower than Magic's.
  - **`scan-binder-page`'s number/set/rarity guidance now branches for
    Riftbound too** — reads the three-part bottom code directly (number
    portion only, set-letters prefix separately, no expansion name to
    fall back to), and rarity from BOTH the frame style and gem shape
    (bronze+round=Common, silver+triangular=Uncommon, gold full-art
    foil+square=Rare, minimal gold foil+pentagonal=Epic, no frame at
    all/full-bleed foil=Showcase, explicitly noting a Showcase card's
    Alternate Art/Overnumbered/Signature sub-flavor doesn't change the
    rarity value to report). **Requires redeploying `scan-binder-page`**
    — schema/prompt changes are server-side.
  - `EditModal`/`ScannerPanel` needed no changes at all — both already
    passed `number`/`rarity` generically to every game via
    `searchCardImage`, which already forwarded `numberHint` through to
    `searchRiftbound` once that function accepted it; adding Riftbound's
    entries to `cardUtils.js` was enough to light up the same curated
    dropdowns every other parity-complete game already had.
- **Gundam (Sprint 7) — done. Completes this initiative.** Real research
  first (community rarity guides for the letter-code system, cross-
  referenced for consistency, since Egman's deckbuilder API itself has no
  public docs — the shape of its response was already confirmed in the
  One Piece sprint), then wired through the same places every other
  parity-complete game already uses:
  - **Structural finding, same discipline as Riftbound's sprint**: Gundam
    prints an actual letter code (not a visual style to guess from) next
    to the collector number — confirmed via multiple sources as C/U/R/LR/
    SP/P — but the code's LOCATION is near the top-right of the card,
    unlike every other game in this doc so far, which print theirs near
    the bottom. The collector code itself follows the same
    `<set letters>-<number>` format as One Piece/Riftbound (e.g.
    `GD01-001`), so `egmanQuery`'s existing numberHint matching (suffix
    after the last dash) needed no changes to work for this game too.
  - `RARITY_OPTIONS_BY_GAME.Gundam` (`cardUtils.js`): six real, confirmed
    rarity codes mapped to full names — `Common`/`Uncommon`/`Rare`/
    `Legend Rare`/`Special`/`Promo`. `Special` (`SP`) is confirmed to be
    its own top-level rarity code (grouped with C/U/R/LR/P as one of the
    game's "official rarity abbreviations" by research), not a printing
    overlay — despite the name inviting confusion with other games'
    "Special" values, this one specifically means a premium alt-art
    REPRINT of an existing card that keeps that card's original number.
  - **Deliberately excludes the `+`/`++` alt-art suffix system** (e.g.
    `C+`, `LR++`) from rarity — confirmed via research to be an overlay
    applied on TOP of any of the six rarities above (an alt-art `LR+`
    still plays as, and shares its card number with, the base `LR` — only
    the art/foil differs), the exact same rarity-vs-finish split as One
    Piece's star-marked Parallel/Alternate Art overlay.
  - `PRINTING_OPTIONS_BY_GAME.Gundam`: `["Normal", "Alternate Art",
    "Alternate Art (Case Hit)"]`. Unlike some other exclusions in this
    doc (Pokemon's Poke Ball patterns, SWU's Serialized/promo variants),
    both alt-art tiers here are kept as their own curated entries rather
    than collapsed or excluded — research confirmed `+` and `++` are a
    real, stable, non-expanding pair present in every set (not a
    per-set-growing vocabulary), and `++` is confirmed to use a visually
    distinct GOLD foil treatment rather than just being a rarer copy of
    the same `+` look, the same "real, confirmed, evergreen distinction
    earns its own entry" bar Pokemon's Hyper Rare/SWU's Prestige tiers
    already cleared.
  - **`searchGundam` (`cardSearch.js`) gained a `numberHint` param**
    (previously only `name, setHint, rarityHint`) — same story as
    Riftbound's own sprint: the shared `egmanQuery`/`card-lookup-proxy`
    infrastructure (numberHint matching, retry-on-5xx, structured fields)
    already supported this generically since the One Piece sprint, so
    completing this initiative only needed the one missing client-side
    link plus the curated vocab and scan-binder-page prompt work — no
    changes to `card-lookup-proxy`, `egmanQuery`, or `fetchWithRetry`
    were needed at all.
  - **`scan-binder-page`'s number/set/rarity guidance now branches for
    Gundam too** — reads the letter code directly (same "exact printed
    code, not a visual guess" treatment as One Piece), explicitly noting
    the code's unusual top-right location for this game, and explicitly
    noting that a `+`/`++` suffix doesn't change which of the six rarity
    values to report. **Requires redeploying `scan-binder-page`** —
    schema/prompt changes are server-side.
  - `EditModal`/`ScannerPanel` needed no changes at all — both already
    passed `number`/`rarity` generically to every game via
    `searchCardImage`, which already forwarded `numberHint` through to
    `searchGundam` once that function accepted it; adding Gundam's
    entries to `cardUtils.js` was enough to light up the same curated
    dropdowns every other parity-complete game already had.
- **Every supported game with a real card database now has full parity**
  — Magic, Pokemon, Yugioh, Lorcana, One Piece, SWU, Riftbound, and
  Gundam. Only Sports Singles remains without curated Rarity/Printing
  vocab, and that's permanent by design (no card database exists for it
  to research against), not a remaining sprint.
- **`Promo` rarity — audited per game first, then added everywhere anyway
  per an explicit staff request.** Every game has promotional reprints,
  but that doesn't mean "Promo" is how each one's real `rarity` field
  models it — the audit found only Pokemon (and Lorcana/Riftbound/Gundam,
  already confirmed real in their own parity sprints) actually use it as
  a genuine rarity value:
  - **Pokemon** — confirmed real. pokemontcg.io's own `/rarities` endpoint
    lists `Promo` alongside every other real value, and a real card (Mew
    09/53, a WOTC Black Star Promo) reports exactly `"rarity": "Promo"`.
  - **Magic** — NOT a real rarity value. Scryfall's confirmed `rarity`
    field only ever takes the six values already listed
    (`RARITY_OPTIONS_BY_GAME.Magic`); a promo printing keeps its ORIGINAL
    rarity (a promo Rare stays `rarity: "rare"`). Promo-ness lives in a
    completely separate boolean (`is:promo`) and dedicated promo Sets.
  - **Yu-Gi-Oh** — NOT a real rarity value, same reasoning. A print's
    `set_rarity` (one entry per `card_sets[]`) is confirmed to always be a
    real functional tier (`"Ultra Rare"`, `"Secret Rare"`, etc.) even for
    printings from a promotional set — the promo-ness is which SET the
    printing belongs to, not a distinct rarity string.
  - **One Piece** — NOT a real rarity value, already confirmed correctly
    excluded when this game's own parity sprint ran. Research is explicit:
    "promos use a P-### serial prefix rather than a rarity tier — a promo
    card still carries a normal rarity underneath."
  - **SWU** — only weak evidence found (a third-party marketplace listing
    tag, not the actual API's own documented `rarity` field), short of the
    direct API-field confirmation every other addition in this doc
    otherwise requires.
  Despite that, the user explicitly asked for `Promo` to be added to
  Magic/Yugioh/One Piece/SWU's curated lists too, reasoning that floor
  staff naturally describe a card as "the promo version" regardless of
  what any API's rarity field says, and having it selectable makes that
  kind of item easier to find later via the Catalog's Rarity filter — a
  real, deliberate trade-off (findability over strict data-fidelity),
  not a research gap. Each of those four entries in `cardUtils.js` carries
  a comment explaining it's there by explicit request despite not
  matching that game's own confirmed rarity data, so a future pass doesn't
  mistake it for an oversight and "fix" it back out. `scan-binder-page`'s
  Pokemon rarity guidance also gained a one-line fallback: a
  black-star-symbol or otherwise standalone promotional card reports
  `Promo` regardless of its other visual traits — scoped to Pokemon only,
  since that's the one game where a promo card actually has a confirmed,
  detectable visual tell; the other four games' new `Promo` option is
  manual-select only, with no scanner-side auto-detection added, to avoid
  the AI guessing a value that could feed a bogus rarityHint into search.
  **Requires redeploying `scan-binder-page`** for the Pokemon prompt
  change to take effect.

## Scanner: merging duplicate physical copies into a quantity

Real-phone testing on a binder page with several identical promo copies
found the Scanner leaving each detected pocket as its own qty-1 review row
even when multiple pockets were unambiguously the same physical print —
staff then had to notice and manually consolidate them (delete the extras,
bump qty by hand) after every scan, "a case that's very common as
distributions tend to vary."

- **`mergeScanDuplicates` (`cardUtils.js`)** runs once, right after
  `handleScan` builds one row per detected pocket (crops included) and
  before the post-scan image/price auto-fill kicks off — so the auto-fill
  batch below only ever searches each distinct print once, not once per
  physical copy, as a free efficiency win. Two rows merge into one qty-N
  row only when **both** their Name and their Number match exactly (case/
  whitespace-insensitive on the name; leading zeros ignored on the number,
  so "0451" and "451" count as the same print) — **deliberately not Name
  alone**. Confirmed against a real photo showing why: three visually
  near-identical serialized "The One Ring" cards on the same page each
  carried a genuinely different collector number (each is its own
  one-of-one print, not three copies of anything), sitting next to three
  real physical copies of a promo that all shared one number — the same
  "a different Number usually means a genuinely different print" signal
  this doc already leans on everywhere else for disambiguation. A row with
  no Number captured at all (the scan's OCR on a small, blurry corner
  number frequently comes up empty) is left un-merged rather than guessed
  into a group on name alone — losing a real second copy of a distinct
  print to an incorrect merge is worse than leaving two rows that staff
  can merge themselves. Scoped to `game` too, defensively, so a
  same-name/same-number coincidence across two different games' cards on
  a mixed binder page can't merge them. When rows do merge, the kept row's
  `position` becomes a comma-joined list of every contributing pocket
  (e.g. "row2-col1, row2-col3, row3-col1"), and its `confidence` becomes
  the *lowest* of the merged copies' — one blurrily-detected copy among
  several still deserves a second look, and shouldn't get hidden behind a
  more-confident sibling that scanned first. Only every OTHER field (name/
  game/set/rarity/photo crop/etc.) is kept from whichever row was scanned
  first; the later duplicates' own crops are discarded since they're
  supposed to be the same print anyway. Purely a within-this-scan review-
  queue behavior — has nothing to do with matching a freshly scanned card
  against something already saved in the catalog (a separate feature,
  not built).
- **`ScanRow` gained a Qty number input** (`ScannerPanel.jsx`) — the row
  data model already had a `qty` field (used verbatim by `handleConfirm`),
  but there was previously no way to see or edit it in the UI at all; every
  scanned row silently saved as qty 1 regardless. Needed for the merge
  feature above to actually be visible/correctable, and as a side effect
  now also lets staff manually bump qty on a row added via "+ Add missed
  card" without a merge ever being involved. (Originally landed tucked into
  the second field row next to Price — see the layout pass right below for
  where it actually ended up.)

## Scanner review row layout pass

A follow-up UX pass on `ScanRow` (`ScannerPanel.jsx`) — regrouped the
fields into a clearer order and gave mobile its own dedicated one-field-
per-line layout instead of a wrap-when-it-fits row.

- **Two rows, deliberately regrouped**: row 1 is now Qty/Card name/Game/
  Set/Number (Qty moved next to the thumbnail, first in the row, instead
  of buried in the middle of row 2 next to Price where it was easy to miss
  after the qty-merge feature above started auto-filling it); row 2 is
  Rarity/Printing/Condition/Price, with the confidence badge and Remove
  button kept together at the end. Reads roughly as "what card is this"
  (row 1) then "what specific copy/condition is this" (row 2).
- **`.scan-field`**: each field is now a label+input pair (`.scan-field` /
  `.scan-field-label`), mirroring EditModal's `.field-group` — but the
  label stays hidden on desktop (`display: none`) where this queue is
  deliberately dense and a placeholder already identifies a blank field.
  It only renders on mobile, under the existing shared 640px breakpoint.
  `.sf`/`.sf-wide`/`.sf-auto` (the old flex-basis classes, applied straight
  to each input/select) are replaced by `.sf`/`.sf-wide`/`.sf-qty` applied
  to the new `.scan-field` wrapper instead, so the label can live alongside
  the input it describes.
  - **`.scan-row-meta`**: the confidence badge + Remove button are grouped
    into their own wrapper, explicitly kept OUT of the one-field-per-line
    treatment below — they're row-level metadata/actions, not something
    staff type into, so stacking them the same way as a text field would
    just add scroll height for no clarity benefit.
- **Mobile: one field per line, not wrap-when-it-fits.** The previous
  mobile behavior (`.scan-row-line { flex-wrap: wrap }`, each field
  `flex: 1 1 120px`) could still pack 2-3 narrow fields onto the same
  visual line if they happened to fit — real feedback found this cramped
  and uncomfortable to type into, especially once a field had real text in
  it rather than empty placeholder space to judge by. `.scan-row-line`
  becomes `flex-direction: column` on mobile instead, every `.scan-field`
  goes full-width, and its label becomes visible (`display: block`) so a
  long vertical stack of otherwise-identical-looking inputs stays
  identifiable — the same reasoning EditModal's always-visible field
  labels already rely on.
- **Verification**: this queue only ever renders after a real scan (a live
  Anthropic API call this sandbox has no network path to — see the
  existing "Manual QA note"), so it was checked the same throwaway-harness
  way documented elsewhere in this file: a temporary `devtest.html`/
  `src/devtest.jsx` rendering `ScanRow` directly with mock row data (a
  brief `export` added to `ScanRow` to reach it, reverted immediately
  after) under `UIProvider`, screenshotted via Playwright at a desktop and
  a mobile (390px) viewport, then deleted before committing — confirmed
  the new row grouping, spacing, and the mobile label/one-per-line
  behavior all render as intended.

## Pricing section: manual listing-link fallback

Real report: no clickable TCGPlayer link ever appeared for a Yugioh card
even once a Market Value was already showing. Confirmed as a real,
fixable gap, not (only) a data limitation — three providers currently
never return a `listingUrl`/`sourceUrl` at all:

- **Yugioh** — deliberate (see the per-game parity section above): enabling
  YGOPRODeck's `tcgplayer_data=yes` mode would unlock a listing URL, but
  its own docs warn that mode's Set Name/Rarity data can be inaccurate,
  and accurate Set/Rarity backfill mattered more than the extra link.
- **Lorcana** — at the time this was written, Lorcast's response was never
  read for one; not a deliberate omission, just never wired up. **Fixed in
  the Lorcana parity sprint below** — Lorcast's card object does carry a
  real `purchase_uris.tcgplayer` field (confirmed via a real sample), now
  mapped to `listingUrl` in `searchLorcana`. Lorcana no longer needs this
  fallback in practice, though the fallback itself stays in place as the
  general safety net for any provider that doesn't have one.
- **SWU** — the real API sample confirmed `Name`/`FrontArt`/`Set`/
  `MarketPrice`/`LowPrice`; no listing/product URL field was present to
  wire up.
(Magic/Pokemon/Lorcana/One Piece/Riftbound/Gundam all do have a real one
today — only Yugioh/SWU still rely on the manual-search fallback below.)

The actual bug wasn't the missing link itself (that's an accepted,
documented gap for those three) — it's that **EditModal's and
ScannerPanel's Pricing sections had no fallback for it**. Once
`basePrice`/`form.basePrice` is set, the old code only ever rendered the
"Check live TCGPlayer listing ↗" line `if (sourceUrl)` — with nothing in
its place when there wasn't one. The $25+ high-value warning right below
it made this worse: it told staff "worth checking the real current
listing" but gave them no way to actually do that. Fixed by falling back
to the same game-agnostic `tcgplayerSearchUrl` manual-search link already
used elsewhere (image-search-failed, price-search-found-no-price) instead
of leaving that line blank — the Pricing section's listing line now always
renders something clickable once a Market Value exists, real link or
manual-search fallback. The now-redundant "worth checking…" sentence in
the high-value warning was removed since the link right above it already
covers that.

## eBay as a second price reference

Explicit ask: add eBay alongside TCGPlayer as a second, independent price
check — evaluated two different versions of this before building anything,
since they have very different feasibility:

- **A real, automatically-pulled eBay price** (like `basePrice`/Market
  Value) — evaluated and **not viable today**. eBay's old Finding API
  (which used to support querying sold/completed prices) is deprecated;
  the replacement, the Marketplace Insights API, is "Limited Release" —
  gated behind a special business-level approval, not obtainable via a
  normal free developer account, the same "no credential exists yet"
  situation this doc already treats as parked for TCGPlayer's own frozen
  Pricing API. eBay's freely available API (Browse/Buy) only exposes
  ACTIVE listing prices (asking prices), not sold prices — a materially
  weaker signal, same caveat already documented for TCGPlayer's own
  low/high active-listing fallback. Scraping eBay's sold-listings pages
  directly breaks its ToS, and this project already evaluated and
  rejected exactly that once before (see "Known constraints" above).
- **A manual "check on eBay" search link, as its own standalone button —
  not a fallback tucked onto the TCGPlayer line.** Built as
  `ebaySoldSearchUrl` in `cardSearch.js`, using eBay's own documented URL
  filter for sold+completed listings specifically (`LH_Sold=1&
  LH_Complete=1`), not just any active listing — confirmed live, not
  guessed. First cut rendered it appended to whichever TCGPlayer link was
  showing, gated on a Market Value already existing (`form.basePrice != null`) —
  reworked after real feedback: eBay is a genuinely independent reference,
  not something staff only want to see once "Find market price" has
  already run or failed. It's now a real `<button>`-styled `<a>` ("Check
  eBay sold listings ↗") sitting right next to "Find market price" in
  `EditModal`'s Quantity & pricing section, and next to "Find another
  image"/"Find market price" in `ScannerPanel`'s `ScanRow` thumbnail
  column — both render unconditionally off the row/form's own name+set,
  independent of `basePrice`/`pendingPrice`/search state, so staff can
  jump straight to eBay without running (or waiting on) a market-price
  search first.
  - **Real caveat found while researching, not while building**: as of
    2026-07-22, eBay put its sold/completed listings behind a login wall
    — a signed-out browser gets redirected to `signin.ebay.com` instead of
    seeing results. Not worked around (there's no way to from a plain
    link) — just something to know if staff report the link "not
    working": it still does, it just needs an eBay account signed in
    first, unlike the TCGPlayer link, which assumes nothing about login.
    eBay has not said whether this is permanent.

## PriceCharting as a third price reference, and a reference-links layout pass

A third manual reference link, `priceChartingSearchUrl` in `cardSearch.js`,
alongside TCGPlayer/eBay — PriceCharting aggregates its own sale-price
index per card, a different methodology from either TCGPlayer's live-
listing snapshot or eBay's raw sold-listing search, so it's a genuinely
separate data point, not a duplicate of the other two. Same "manual link,
no automated fetch/API" shape as the other two — free to browse, no
account needed.

- **Not confirmed via a direct live visit, unlike TCGPlayer/eBay above** —
  `pricecharting.com` is blocked by this sandbox's egress proxy (confirmed
  both via a fetch attempt and a raw `curl`, both a hard block, not a
  transient failure). Corroborated instead via a third-party source (a
  scraper product's own documentation quoting a real PriceCharting search
  URL), confirming the search endpoint is `/search-products` with a
  `type=prices` and a `q=<query>` param. Other params that source also
  showed (sort/category/etc.) read as optional display preferences, not
  required for the search itself, so they're left out rather than guessed
  at. Flagged in the function's own comment as corroborated-not-verified —
  worth revisiting if a staff report ever suggests the link doesn't work.
- **Reference-links layout consolidated across all three call sites**, per
  real feedback that the previous layout was inconsistent and, in two of
  the three places, cramped: `EditModal`'s links were scattered across three
  separate spots (a TCGPlayer-only fallback under the image on search
  failure, an eBay button crammed next to "Find market price", and a
  TCGPlayer live-link line under the Market Value breakdown); `ScannerPanel`'s
  `ScanRow` and `QuoteLineItemRow` both stacked TCGPlayer/eBay as tiny
  buttons in the already-narrow 64px thumbnail column. All three now group
  TCGPlayer/eBay/PriceCharting into one row positioned under the price
  inputs — the same spot `EditModal`'s Market Value breakdown box already
  occupied (the "reference price... lays itself under the inputs" pattern
  this was modeled on) — always visible off the row/form's own name+set,
  independent of search/price state, so staff can jump to any of the three
  without running a search first. The two search-failure-specific TCGPlayer
  fallback links inside `EditModal` (shown only when an image/price search
  comes back empty) were left in place, unchanged — those are contextual
  "your search just failed, try this" prompts, a different purpose from the
  three always-on reference links.
  - `EditModal`'s TCGPlayer link still switches between a real listing
    (`sourceUrl`, once known) and a manual search — unchanged logic, just
    relocated into the new consolidated row and no longer gated on
    `basePrice != null` (that gate only ever applied to the old link's
    position inside the Market Value box, not to whether `sourceUrl` itself
    existed).
  - `QuoteLineItemRow` has no `sourceUrl`/`listingUrl` field on a quote
    item at all (never added — quote items never carried one), so its
    TCGPlayer link stays a manual search unconditionally, same as before
    this pass — only its position and the addition of PriceCharting
    changed.

## Quote tab — trade-in/buylist quoting

A new top-level tab, the reverse workflow of everything else in Ledger:
Catalog/Scanner/Import are about the shop's own *outbound* stock; this is
about *buying cards in* from a walk-in customer. Ported from a manual Excel
sheet the shop was already using (reverse-engineered from a real uploaded
copy, not guessed): a header block (customer info, date, employee, time
taken), a line-item grid, an auto-computed total and three offer tiers
(percentages of that total), and a final decision (Offer Status: Accepted
Cash / Accepted Store Credit / Rejected Offer, a Payout Amount, an
independent Paid Out checkbox).

- **One `quotes` row is both a "collection" and, once decided, the
  finalized transaction — no separate collection entity.** A "collection"
  (e.g. "Jake binder proposal") is just a quote row before its
  `offer_status` is set: staff can create it, add cards to it over time,
  and come back to it. Once `offer_status` becomes one of the two Accepted
  values or `'rejected'`, it's done — it stops showing up as a resumable
  collection. This was an explicit design call (confirmed with the user)
  over inventing a second table, since a quote row already models "staged,
  then decided" with nothing else needing to reference a collection
  independently of its eventual quote.
- **Line items live in a single `items` jsonb array on the `quotes` row**
  (`phase8_quotes.sql`), not a `quote_items` child table — matches this
  app's existing preference for denormalized snapshots over relational
  child tables (e.g. `sync_queue` tickets already snapshot fields rather
  than joining back to `catalog`), and line items are never queried
  independently of their parent quote. Each item: `{ id, name, game, set,
  number, rarity, printing, condition, basePrice, price, qty, notes }`.
  `quote_number` (a `bigserial`) is a human-friendly display id ("Quote
  #14") — the uuid primary key isn't something staff should ever need to
  read or type.
- **Condition is deliberately never defaulted** — not even to Near Mint,
  unlike every other Condition picker in the app. Staff make a real,
  on-the-spot physical assessment of a card they're about to pay for, and a
  silent default would stand in for that judgment call instead of forcing
  it. The field starts on its real placeholder (`SelectWithCustom`'s
  existing escape-hatch pattern, just with no pre-selected value) and
  `marketValueForCondition` already returns `null` for a blank condition —
  no code change was needed there, only in never pre-filling the value.
- **Offer tiers are a store-configurable setting, not a hardcoded
  constant** (unlike the source sheet, which hardcoded 50/60/70%
  everywhere) — a new `quote_settings` singleton row
  (`tier1_pct`/`tier2_pct`/`tier3_pct`, defaulting 50/60/70), same
  `id=1`/`maybeSingle()`/fallback-to-defaults pattern as `store_settings`'s
  condition multipliers (`dbLoadQuoteSettings`/`dbSaveQuoteSettings` in
  `db.js`). Kept as its own settings row rather than added to
  `store_settings` — condition multipliers are a Catalog pricing concern,
  tier percentages are a quoting concern. Editable via a small dedicated
  "Quote settings" modal in the Quote tab itself, not the existing Pricing
  Settings modal.
- **Two ways into a quote, then three ways to add cards to it** — an
  explicit design decision after real back-and-forth about UX (see the
  section below). "+ New Quote" offers **Create from collection** (resume
  an in-progress one, `offer_status IS NULL`) or **Create from scratch**
  (name it, create a blank quote). Inside a quote's detail view
  (`QuoteDetail.jsx`, one scrollable page matching the source sheet's own
  single-page feel), staff can add cards via:
  - **Manual entry** (`QuoteLineItemRow.jsx`) — same field set as
    `EditModal` (Game/Set/Number/Rarity/Printing/Condition) so an accepted
    item arrives in Catalog with good data. The Name field is a new
    **`CatalogItemPicker.jsx`** — a lightweight, client-side-only typeahead
    over the shop's own already-loaded `catalog` array (no network call at
    all) — picking a match backfills game/set/rarity/printing/basePrice;
    typing a name with no match is just as valid, staff fill in the rest by
    hand. This was an explicit, deliberate choice over reusing the live
    external card search (Scryfall/pokemontcg.io/etc.) that Scanner/
    EditModal use — the user's own words: "we work based on already
    established data not a hub with a search toolset like Scan or Import."
  - **Scan** — the existing `ScannerPanel` mounted as-is inside a modal,
    with its `onImport` callback redirected to append to this quote's items
    instead of writing to Catalog. `ScannerPanel` never touched `db.js`
    directly to begin with (its confirm flow already just calls whatever
    `onImport(cards, mode)` callback it's given — the same one `App.jsx`
    normally wires to the catalog-writing handler), so embedding it here
    needed no refactor — only a new, purely cosmetic `destinationLabel`
    prop (default `'catalog'`) so its button/description text can say
    "quote" instead when embedded, with zero change to the real Scanner
    tab's own wording.
  - **Import** — required one real extraction: the original
    `ImportExportPanel.jsx` bundled the CSV/XLSX import flow together with
    Export/Binder-QR/Reset-all-data in one file, none of which belong in a
    Quote context. Split into `ImportPanel.jsx` (the file-drop → sheet-pick
    → column-mapping → confirm flow, self-contained already, now takes an
    `embedded` prop that hides the "Replace entire catalog" import-mode
    option — destructive and catalog-only, meaningless for a quote's item
    list) and `ExportPanel.jsx` (Export/QR/Reset). `ImportExportPanel.jsx`
    is now a thin composer of both, so the real Import/Export tab's
    behavior is byte-for-byte unchanged.
  - Both Scan and Import route through a shared `quoteUtils.itemsFromCatalogRows(cards)`
    adapter — both already produce fully-formed `normalizeCard(...)`-shaped
    objects before calling `onImport`, so this just reshapes each one into
    a quote item, dropping the generated `sku` (quote items don't need
    one) and giving each a fresh client-side id. **`number` (collector
    number) is left blank by this adapter** — it was never part of
    `normalizeCard`'s saved shape to begin with (Scanner/Import already
    discard it as a transient, never-saved search-only hint before calling
    `onImport`, same as when they write straight to Catalog), so there's
    nothing to carry over; staff can still type it in by hand.
  - All three methods are freely mixable on the same quote — e.g. scan a
    binder page, then manually add a couple more cards — since they all
    just append to the same local `items` array before Save.
- **`GAMES` finally hoisted into `cardUtils.js` as a real export** —
  previously duplicated verbatim in `EditModal.jsx` and `ScannerPanel.jsx`
  with no single source of truth; a third consumer needing the identical
  list (`QuoteLineItemRow.jsx`) was the trigger to stop tripling it.
- **Accepted quotes auto-create Catalog rows** — the moment `offer_status`
  becomes `'accepted_cash'` or `'accepted_store_credit'` and the quote
  isn't already `converted_to_catalog`, `App.jsx`'s `handleSaveQuote`
  builds new catalog rows via `quoteUtils.buildCatalogItemsFromQuoteItems`
  (the exact same `normalizeCard(...)` shape `EditModal`/`ScannerPanel`
  already build, `basePrice` carried over so Market Value keeps working on
  the new row) and writes them with the same `dbUpsertCards` bulk-upsert
  ScannerPanel's own confirm flow already uses — no new catalog-write
  primitive needed. `converted_to_catalog` (set `true` right after) guards
  against creating duplicate Catalog rows if an already-accepted quote is
  edited and saved again.
- **Quote collections are never visible from Catalog** — an explicit user
  requirement. Every quote has its own dedicated view inside the Quote tab
  ("Quote #14 — Jake binder proposal"); Catalog only ever sees the cards
  that come out the other end, once Accepted.
- **No tracked "bounce"/counter-offer state** — confirmed with the user
  that a rejected-then-re-offered negotiation happens verbally and is never
  recorded; only the final Accepted/Rejected outcome and Payout Amount
  matter.
- **Realtime**: `quotes` extends the existing single `'ledger-realtime'`
  channel in `useRealtimeSync.js` (one more `.on('postgres_changes', ...)`
  registration, keyed by `id`) rather than a second channel — same
  reasoning as every other table already on it. Like `catalog`/
  `sync_queue` when they were first set up, `quotes` needs a one-time
  manual add to Supabase's `supabase_realtime` publication (Database →
  Replication) — not something any migration file in this repo does.
- **The "how should staff add cards" UX question went through two rounds**,
  worth recording since the first answer was reversed: the initial plan
  ruled out reusing Scanner/Import entirely (to avoid Quote becoming a
  second Scanner) in favor of manual-entry-plus-catalog-typeahead only.
  After the user described the full intended flow — cards get staged into
  a named collection first, then a quote is built from either an existing
  collection or from scratch, with staff choosing however they want to
  add cards — Scanner and Import were explicitly brought back in as two of
  three add-card methods, confirmed feasible with no deep refactor once
  actually checked (both already took an `onImport` callback prop rather
  than writing to `db.js` internally). The lesson wasn't "reuse
  everything" or "reuse nothing" — it was that the right amount of reuse
  depends on the actual intended workflow, which only became clear once
  the user walked through it end to end.

**Requires running `phase8_quotes.sql`** in the Supabase SQL Editor before
this code can save/read quotes (creates both `quotes` and
`quote_settings`), plus the manual Realtime-publication step above.

## Quote tab: real-usage fixes after first hands-on test

A first real test pass against a live Supabase project (not just the mock
harness) surfaced several real issues, fixed in one pass:

- **A new quote is no longer persisted the instant "Create" is clicked.**
  The original flow called `dbUpsertQuote` immediately, before the detail
  view even opened — so clicking "+ New Quote" → "Create" → Cancel still
  left a permanent blank row behind, and consumed a real `quote_number`
  from the sequence for a quote that was never actually used. `QuotesTab`
  now builds a client-only draft object (`id: null`) and only calls
  `onSaveQuote` on the first real Save inside `QuoteDetail` — matching how
  `EditModal` already treats a new catalog item (nothing exists until
  Save). `QuoteDetail`'s title reads "New quote — &lt;name&gt;" before that
  first save and "Quote #N — &lt;name&gt;" after; its Delete button only
  renders once `quote.id` is real, since there's nothing to delete before
  that.
  - **This also fixes what looked like a documentation bug but wasn't**:
    an earlier manual test checklist claimed "resuming a draft opens it
    with everything you'd already entered intact" after Cancel — that was
    simply wrong. Cancel has always discarded unsaved edits, matching
    every other modal's explicit-button-only-close convention in this
    app; the checklist description was corrected, not the behavior.
  - **`quote_number` gaps are still normal and expected** even with this
    fix (a genuinely abandoned mid-edit quote that reaches one real Save
    still consumes a number) — same as invoice/ticket numbers everywhere;
    a `bigserial` doesn't roll back on its own. Not treated as a bug.
- **`QuoteDetail`'s modal was too narrow for its own content.** It used
  `.modal.wide` (560px, tuned for `EditModal`'s image+form layout) for a
  line-item grid with *more* fields per row than `EditModal` has — real
  testing showed this as visibly cramped/truncated fields. New `.modal.xwide`
  (1040px) is used for `QuoteDetail`'s main modal and its embedded Scan/
  Import sub-modals instead — `.modal.wide` itself is untouched, still used
  by `EditModal` alone.
- **Employee field placeholder no longer shows a real staff name** — was
  `"e.g. Noah, or Noah / Richard"` (actual example names from earlier
  testing), now generic `"e.g. John Doe"`.
- **Quote line items now carry an image**, same dual-image model
  (`imageUrl`/`imageData`/`photoUrl`/`photoData`/`activeImage`) a catalog
  row already has, rendered via the same `activeImageSrc` helper — added
  to `normalizeQuoteItem`/`itemsFromCatalogRows`/
  `buildCatalogItemsFromQuoteItems` in `quoteUtils.js` so a picked catalog
  reference, a scanned crop, or a live "Find image" result all carry
  through to the row's thumbnail and, on Accept, onto the new Catalog row.
- **Live external card search is back on quote rows — "Find image"/
  "Find price" buttons, reusing `searchCardImage`** (Scryfall/pokemontcg.io/
  etc., the exact same function `EditModal`/`ScannerPanel` call) — plus the
  manual TCGPlayer/eBay fallback links, matching `ScanRow`'s own thumb-col
  layout. **This reverses this doc's own earlier "no live external card
  search for Quote" decision** — the catalog-only typeahead's real
  limitation is that a genuinely new trade-in card has no catalog history
  to reference at all, and real use found the live search "the most
  important time saver" once available elsewhere in the app. Search state
  (`candidates`/`candidateMode`/`activeSearch`) is scoped locally per
  `QuoteLineItemRow`, mirroring `EditModal`'s own local search state rather
  than lifting it into `QuoteDetail` — each row searches independently.
- **`QuotesTab`'s list gained status color-coding, a status filter, a
  search box, and sortable columns** — real feedback that a growing quote
  list needed to be scannable/filterable, not just chronological. Rows are
  tinted by outcome using the same semantic tokens as everywhere else in
  this app (`--amber-soft` in progress, `--green-soft` accepted,
  `--rust-soft` rejected — applied to `td`, not `tr`, so it isn't fought by
  the existing global `tbody tr:hover` rule). Status filter is a row of
  quick toggle buttons (All/In progress/Accepted Cash/Accepted Store
  Credit/Rejected), not a dropdown — matches "quick filter" as asked, not a
  slower two-click pick. Search matches collection name + customer name.
  Sortable column headers reuse the exact `.sortable`/click-to-toggle-
  direction pattern `CatalogTable` already established, with a small local
  `QUOTE_SORT_COLUMNS` key map (not exported/shared — Quote's column set is
  different enough from Catalog's own `SORT_COLUMNS` that a shared export
  wasn't worth it for five columns).
- **Clarified, not changed**: what the catalog typeahead actually does when
  picking a reference card — it only copies field *values* (game/set/
  rarity/printing/basePrice/image) onto the new quote line item; it never
  links to, modifies, or flags the original catalog row in any way. The
  shop's Catalog is a read-only reference for this picker, same as a live
  external search would be — building or editing a quote can never change
  anything already in Catalog.

## Quote tab: intake/release form, printing, and dropping the # from the list

Another round of real-usage feedback — quote numbers jumping unpredictably
in the list, and two new print features requested to replace a paper
process the shop was still doing by hand.

- **The quote list no longer shows `quote_number` at all** — a real
  `bigserial`, so gaps (e.g. #1 then #4) are normal and expected (an
  abandoned-but-saved quote still consumes one, same as invoice/ticket
  numbers anywhere), but showing a visibly gapped, non-meaningful number as
  the primary way to tell rows apart just read as broken. Collection name
  is the real identifier now — dropped from `QuotesTab`'s table columns,
  the sortable-columns list, and the "Resume a collection" picker inside
  "+ New Quote". Default sort changed from `quoteNumber` to `dateQuoted`
  (most recent first) to match. **Not removed everywhere** — `QuoteDetail`'s
  own title still reads "Quote #14 — &lt;name&gt;" once saved, since a
  stable short reference is still genuinely useful when staff are looking
  at (or printing) one specific quote, just not as a list column full of
  gaps.
- **New Release Form / intake fields** (`phase9_quote_intake_release.sql`):
  `customer_email`, `has_expected_price` (tri-state boolean — `null` means
  "not asked yet", never coerced to `false`), `expected_price_amount`
  (free text, not numeric — matches the paper form's own free-text blank,
  e.g. "$150" or "around 200"), and `intake_notes`. These map directly onto
  the shop's real paper "Quote Release Form" (a physical form signed when a
  customer drops cards off, before any pricing happens) — captured on the
  same `quotes` row rather than a separate intake entity, since an
  in-progress quote already represents exactly what the release form is
  about: cards currently in the shop's custody being evaluated. Surfaced in
  `QuoteDetail` as a new "Release form info" section — a Yes/No toggle pair
  for the price-expectation question (clicking the already-selected option
  again resets to unanswered) plus a conditional amount field, and a
  Description-of-product textarea.
- **Print Quote / Print Release Form** — two buttons in `QuoteDetail` that
  print off `draft` (whatever's on screen right now, saved or not — staff
  need the Release Form the moment cards arrive, often before there's any
  reason to have saved the quote yet). Implementation is deliberately the
  simplest thing that works: no PDF library, no new dependency — a
  `.print-sheet` element (`src/components/quotes/QuotePrintViews.jsx`,
  `QuotePrintSheet`/`ReleaseFormPrintSheet`) stays in the DOM at
  `display:none`, and a new `@media print` block in `index.css` hides
  everything else on the page (`visibility:hidden` on `body *`) and shows
  only the sheet, positioned `absolute` so it prints cleanly regardless of
  where it happens to sit in the component tree (nested inside an open
  modal, in this case). `printMode` state + a short `setTimeout` calls
  `window.print()` once the sheet has actually rendered; a window
  `afterprint` listener resets `printMode` back to `null` once the print
  dialog closes.
  - `ReleaseFormPrintSheet` reproduces the shop's real paper form verbatim
    (wording confirmed against an uploaded photo of the actual form, not
    paraphrased) — the Yes/No question is rendered as both words with the
    answered one bolded+underlined (both plain if `hasExpectedPrice` is
    still `null`), and **Signature is left as a blank underline on
    purpose** — this prints and gets physically signed with a pen, same as
    the original paper form; it's not a digital-signature feature.
  - `QuotePrintSheet` is a plainer internal record: header fields, every
    line item, the computed total/tier amounts, and the offer
    status/payout/paid-out decision — reuses `computeQuoteTotals`/
    `computeOfferTiers` from `quoteUtils.js` rather than duplicating that
    math.
  - Verified with a Vitest/RTL component test
    (`QuotePrintViews.test.jsx`) rather than e2e — asserting `window.print()`
    actually opens/closes a dialog isn't meaningfully testable in a headless
    browser, and the real risk here (wrong or missing pre-filled text) is
    exactly what a plain component render-and-assert test catches.

**Requires running `phase9_quote_intake_release.sql`** in the Supabase SQL
Editor before this code can save/read the new intake fields.

## Quote tab: field layout, print pagination fix, collapsible sections

A fourth round of real-usage feedback, this time from a screenshot of an
actual printed Quote for a large card list that cut off partway through.

- **Email field restyled to match Employee's** — was a bare `type="email"`
  input with no placeholder, visually inconsistent with every other text
  field in the section (Employee's `placeholder="e.g. John Doe"` was the
  template every other field in this section already follows). Now
  `type="text" placeholder="e.g. jane@email.com"` — a plain text input like
  the rest, not relying on the browser's native email-format validation
  UI, which this app doesn't use anywhere else either.
- **"Quote details" fields reordered**: Date quoted moves to its own
  full-width field-group at the end of the section (was paired with
  Employee); Time taken to quote takes over that now-vacant slot next to
  Employee instead. Purely a field-ordering change — no field
  added/removed/renamed.
- **Print Quote was silently truncating long quotes** — traced to
  `.print-sheet` (the hidden-until-`@media print` element `QuotePrintSheet`/
  `ReleaseFormPrintSheet` render into) being a DOM *descendant* of
  `.overlay show`, whose CSS is `position: fixed; inset: 0; overflow-y:
  auto` to bound the on-screen modal to the viewport. Overflow clipping on
  a fixed-position ancestor applies to everything painted within that
  subtree regardless of a descendant's own `position: absolute` — so a
  print sheet taller than the overlay's own on-screen scrollable box was
  getting cut off at print time exactly where the overlay's own bounds
  ended, which is what a screenshot of a long quote's printed output
  showed as "looks incomplete." Fixed by moving both print-sheet renders
  in `QuoteDetail.jsx` to be top-level siblings of the `.overlay` div
  (wrapping the component's whole return in a Fragment) instead of nested
  inside it — the sheet is invisible on screen either way (only `@media
  print` ever shows it), so this has zero visible effect outside of print,
  and print output now paginates normally regardless of quote length.
- **Collapsible sections**: `QuoteDetail`'s four `.form-section` blocks
  (Quote details / Release form info / Cards / Total & offer) can now each
  be independently collapsed via a click on their header — new local
  `openSections` state (`{details, release, cards, total}`, all default
  expanded so nothing changes for existing muscle memory) plus a small new
  `SectionHeader` component (a rotating `▶` chevron + click handler,
  replacing the previously-inert `.section-label` divider). Lets staff
  jump straight to, say, Total & offer on a long card-heavy quote without
  scrolling past the whole Cards list first — the actual ask, once a real
  quote's card list got long enough that "quickly move between" sections
  stopped being quick. No section is ever forced closed automatically
  (e.g. based on item count) — purely a manual toggle, so a section
  staff want open while editing (Cards, most of the time) just stays that
  way.
- Covered by a new e2e test (`e2e/quotes.spec.js`) asserting a section's
  fields actually disappear/reappear on toggle and that two sections
  collapse independently of each other. The print-pagination fix itself
  isn't independently e2e-tested — same reasoning already established for
  `QuotePrintViews.test.jsx`: asserting real paginated print output isn't
  meaningfully testable in a headless browser — it was verified by tracing
  the CSS root cause (`.overlay`'s `overflow-y: auto` clipping a nested
  absolutely-positioned descendant) rather than by a repro screenshot
  alone, and the DOM-nesting fix is a straightforward, low-risk structural
  change with no new runtime logic to test.

## Quote tab: Print buttons moved into their sections, Employee/Time taken reordered

A small round of real-usage UI feedback on `QuoteDetail.jsx`, independent of
the sections/print-pagination work above:

- **"Print Quote" and "Print Release Form" moved out of a shared button row
  at the top of the modal and into the section each one actually prints.**
  "Print Release Form" now sits at the top of the Release form info
  section's own `.form-section`; "Print Quote" sits the same way at the top
  of Total & offer's. Real feedback found the old shared row confusing once
  both buttons lived in one place with no visual tie to what they printed —
  each button now reads as part of the section it summarizes. Both still
  print off `draft` (whatever's on screen, saved or not) via the same
  `printMode` state/effect — this was a placement-only change, no print
  logic touched. A side effect worth knowing: since each button now lives
  inside its own collapsible section (see the round above), collapsing that
  section hides its Print button along with the rest of the section's
  fields — accepted as reasonable, since printing a section's content isn't
  meaningful with that section collapsed/hidden either.
- **Employee and Time taken to quote swapped order** in the Quote details
  field row — now Employee first, Time taken to quote second. Purely a
  field-ordering change, same as the earlier Date-quoted reorder in this
  section; no field added/removed/renamed.

## Sorting tab: multi-select and batch placement

Real feedback: sorting cards from the same quote one at a time was tedious
when a whole group was headed to the same binder/case anyway (e.g. a stack
of commons all going into the same bulk box, or several cards from one
quote all landing in the same binder) — staff wanted the same batch-select
pattern Catalog already has, applied here.

- **`SortingTab.jsx` gained per-row checkboxes, a "Select all" toggle, and a
  batch action bar** (reusing the existing `.batch-bar`/`.checkbox-row`
  styles Catalog's own `BatchBar.jsx` already established, rather than
  inventing new ones) — "Sort selected (N)" opens the same `SortItemModal`
  used by a single row's own "Sort" button, just with every selected item
  handed to it at once. Selecting/deselecting doesn't remove a row from the
  queue or otherwise change it — purely a selection state layered on top,
  same as Catalog's checkboxes.
- **`SortItemModal` now takes `items` (an array) instead of a single
  `item`** — one destination decision (Place individually vs. Add to Bulk,
  one binder/case, one set of channels in individual mode) applies to every
  item in the array. A single-item array (the per-row "Sort" button) renders
  byte-for-byte the same modal title/copy as before (`Sort: <name>`) so the
  existing e2e coverage needed no changes; a multi-item array instead shows
  `Sort <N> items` and a generic bulk-mode explainer, since per-item detail
  doesn't fit a batch header.
- **`App.jsx`'s `handleSortItem` renamed `handleSortItems` and now takes an
  array** — individual-mode placement reuses
  `buildCatalogItemsFromQuoteItems(items, destination)` as-is (it already
  accepted an array with one shared destination); bulk mode is processed
  sequentially, folding each result back into a working copy of `catalog`
  before the next item looks up its own `findBulkRow` — two items in the
  same batch sharing a (location, game) pair must increment ONE row, not
  each race against the same stale `catalog` snapshot and create two. The
  per-sku results are deduped before writing, so a shared bulk row is
  upserted once with its final accumulated qty, not once per contributing
  item. A mixed-game batch (e.g. sorting a Pokemon card and a Magic card
  into Bulk in the same click) still resolves correctly, since each item
  looks up its own row by its own game — same reasoning `buildBulkCatalogItem`
  already relied on for a single item.
- `quoteUtils.js`'s `buildCatalogItemsFromQuoteItems` comment updated to
  reflect that it's called with either a single- or multi-item array now,
  not just one row at a time — no code change there, since it already took
  an array.

## Sorting stage + Bulk item type (supersedes the accept-time destination modal)

Real staff feedback, just one round after the accept-time destination
modal shipped (PR #40): *"They need to be individual. Cards from the same
quote could go to several different places. Bulk also needs to be one of
those options and should not hold an inventory. but it should be after
they are accepted. not during the quote."* — a genuinely different
requirement, not a refinement of the same idea. **PR #40 was closed
unmerged** rather than iterated on, since its whole mechanism (one
location+channels decision for the entire quote, made at accept time) is
exactly what this replaces.

- **Accepting a quote now moves its items into a new "needs to process"
  stage instead of writing Catalog rows directly.** `sorting_queue`
  (`phase10_sorting_bulk.sql`) is a new table, one row per quote line item
  (its own qty carries over as one unit of work — a stack of 3 identical
  copies almost always gets sorted together, not one row per physical
  card). `App.jsx`'s `handleSaveQuote` calls
  `buildSortingItemsFromQuoteItems(items, quoteId, collectionName)`
  (`quoteUtils.js`) instead of `buildCatalogItemsFromQuoteItems` at
  accept time — the same guard field that used to gate the catalog
  conversion (`converted_to_catalog` in the DB, kept as-is rather than
  migrated — see below) now gates this move instead, renamed
  `movedToSorting` at the JS boundary so its current meaning is honest.
  Applies to **either** Accepted status (cash or credit) — this was never
  cash-only.
- **A sorted row is deleted from `sorting_queue` once resolved** — the
  resulting Catalog row (or the incremented Bulk row) is the durable
  record from then on, not this table, matching this app's general
  preference for "the current record is the source of truth" over parallel
  history. An explicit, deliberate choice over `sync_queue`'s
  keep-and-mark-complete pattern, since sorting has no equivalent
  multi-platform-stamp reason to keep a completed row visible.
- **New top-level "Sorting" tab** (`src/components/sorting/SortingTab.jsx`),
  same tier as Catalog/Sync Queue/Import-Export/Scan Binder/Quote — a flat
  list of everything still waiting, each row showing its thumbnail (same
  `activeImageSrc` dual-image model a quote item already carries),
  name/game/set/rarity/condition, which quote it came from
  (`quoteCollectionName`, snapshotted so the row still reads sensibly if
  that quote is later deleted — `sorting_queue.quote_id` uses `on delete
  set null`), and a Sort button. Count badge on the tab itself, same
  pattern as Sync Queue's pending count.
- **`src/components/sorting/SortItemModal.jsx`** — one card's placement
  decision, asked individually, reusing the same `LocationPicker` +
  channel-checkbox UI `EditModal`/the old `AcceptQuoteModal` used, now
  with an explicit mode toggle:
  - **"Place individually"** (default) — a real binder/case + the usual
    POS/TCG Player/Collectr checkboxes, same "follow the majority of this
    location's existing items until manually touched" default
    (`channelDefaultsForLocation`) as everywhere else. Becomes a real
    Catalog row (`itemType: 'single'`) via `buildCatalogItemsFromQuoteItems`
    — that function kept its `(items, destination)` shape from PR #40,
    just called with a single-item array from the Sorting flow instead of
    a whole quote's items at once.
  - **"Add to Bulk"** — only a binder/case, no channels at all (a pile of
    loose bulk cards isn't a sellable SKU on its own). Confirm is disabled
    until a location is picked; individual mode additionally requires at
    least one channel checked, same gate as PR #40's modal had.
  - The confirm button is always labeled "Confirm" (not "Sort"/"Add to
    Bulk") — an earlier draft echoed the mode-toggle button's own label,
    which made the two indistinguishable both visually and to
    `getByRole('button', {name})` in tests.
- **Bulk is a THIRD `catalog.item_type` value (`'single' | 'slab' |
  'bulk'`), not a separate table.** A Bulk "item" is a normal catalog row
  scoped to one **(location, game)** pair (confirmed with the user —
  not per-location-only, and not per-set/per-card), with `qty` as its
  running count — sorting a card into Bulk finds the existing
  `(location, game)` row and increments its `qty`, or creates one if this
  is the first card sorted there (`findBulkRow`/`buildBulkCatalogItem` in
  `cardUtils.js`). Deliberately reuses every bit of existing Catalog
  infrastructure (`CatalogTable`, export, realtime sync, selling it back
  down via the normal qty-decrement flow) instead of inventing a parallel
  `bulk_counts` table — a Bulk row genuinely IS a catalog row, just one
  representing a pile instead of a single print. Carries no per-print
  identity (no set/rarity/condition/price) and **never** has any channel
  enabled (`posChannel`/`tcgplayerChannel`/`collectrChannel` all
  explicitly `false` — the one place in this app a new item's channels
  don't default to "everywhere").
  - `normalizeCard`'s `itemType` coercion (`normalizeItemType` in
    `cardUtils.js`) now recognizes `'bulk'` alongside the existing `'slab'`
    substring check, falling back to `'single'` for anything else — same
    lenient-substring-match discipline as the original slab-only version,
    so a stray case/whitespace variant still lands correctly.
  - `CatalogToolbar`'s type filter gained a "Bulk only" option (plain
    string equality already worked automatically for the status filter —
    `CatalogPanel`'s `typeFilter !== c.itemType` check needed no change).
  - `CatalogTable`'s `deriveRow` gives a Bulk row with no set/condition/
    printing a subtitle of "Bulk lot — not tracked individually" instead
    of an empty string, and both the desktop table and mobile card views
    gained a `.badge.bulk` (amber, matching `.badge.slab`'s purple)
    alongside the existing Slab badge.
  - **Excluded from `catalog_public_view`** (`item_type <> 'bulk'` added
    to the view's `where` clause in `phase10_sorting_bulk.sql`) — a Bulk
    lot isn't a specific card a customer browses/buys off the public
    binder page, just an internal holding count.
  - **Deliberately NOT wired into `EditModal`** beyond not crashing — a
    Bulk row falls through the existing "not slab" path, showing normal
    single-item fields (Set/Rarity/Condition etc.) blank and technically
    editable. Accepted as a known v1 limitation rather than adding a
    third `isSlab`-style form-type toggle right away: Bulk rows are
    created/incremented via the Sorting flow, not manually via "+ Add
    item," so this only matters if staff go hand-editing a Bulk row's qty
    directly in Catalog instead of through Sorting — still works, just
    shows some irrelevant blank fields alongside it.
- **`converted_to_catalog` (the DB column) is unchanged** — renaming it
  would mean an extra migration on a column already run against the real
  project for arguably cosmetic reasons. Its real meaning today is "moved
  to Sorting," not "in Catalog," so the JS-side field is renamed
  `movedToSorting` in `db.js`'s `rowToQuote`/`quoteToRow`, with a comment
  at both mapping points explaining the DB/JS name mismatch is
  deliberate.
- Covered by `cardUtils.test.js` (`findBulkRow`/`buildBulkCatalogItem`,
  including the increment-vs-create branch and game canonicalization),
  `quoteUtils.test.js` (`buildSortingItemsFromQuoteItems`, and
  `buildCatalogItemsFromQuoteItems`'s per-item `destination` param), and a
  new `e2e/sorting.spec.js`: accepting moves items to Sorting (not
  Catalog) regardless of viewport, individual placement creates a real
  Catalog row at the chosen location, two Bulk sorts into the same
  binder+game increment one row rather than creating two, and cancelling
  the sort modal leaves the item untouched in the queue. `e2e/quotes.spec.js`'s
  own accept-flow test was updated to assert items land in **Sorting**
  now, not Catalog — its old assertion was checking behavior this PR
  intentionally replaces.
- **`phase10_sorting_bulk.sql` needs to be run** in the Supabase SQL
  Editor (creates `sorting_queue`, recreates `catalog_public_view` with
  the Bulk exclusion) before this code can move quote items to Sorting —
  no code-side default masks a missing table here. `sorting_queue` also
  needs the same one-time manual add to Supabase's `supabase_realtime`
  publication (Database → Publications) that `quotes` needed.

## Staff docs: Quote + Sorting sections added

The Quote tab and the Sorting stage/Bulk item type both shipped without any
staff-facing documentation — the no-login `?help=1` page (see "Staff
documentation" above) still only covered the original Catalog/Scanner/
Import feature set. Added two new section files following that page's
existing one-file-per-topic convention:

- **`QuoteSection.jsx`** (`#quote`, nav label "Quote") — starting a quote
  (resume vs. from scratch), the three add-card methods and how they mix,
  why Condition is never pre-filled, the total/tiers/offer-status flow,
  the accept → **Sorting** handoff (explicitly called out as a
  `DocsCallout kind="warn"`, since it's the single most likely thing to
  surprise someone expecting accepted cards to land straight in Catalog
  the way earlier features here did), Release form info, Print Quote/
  Print Release Form, and the list's search/filter/sort.
- **`SortingSection.jsx`** (`#sorting`, nav label "Sorting") — the two
  placement modes and, in its own `DocsCallout kind="warn"`, what Bulk
  actually is: scoped per binder+game, no per-print fields, never listed
  anywhere, excluded from the public binder page.
- Inserted into `StaffDocs.jsx`'s `SECTIONS` array right after Scan Binder
  and before Pricing settings — both Quote and Sorting reference Scan/
  Import by cross-reference link, so they read better placed after those
  rather than before.
- **The section label is "Quote", not "Quote (buying cards)"** — the
  parenthetical (originally in both the nav label and this file's own PR
  description) was dropped once writing the section, since
  `e2e/staff-docs.spec.js`'s existing stepper test builds a `RegExp` out
  of each section's title (`` `^Next: ${title}` ``) and unescaped
  parentheses in a title would be parsed as a regex capture group instead
  of literal characters, silently breaking that match. "Quote" alone
  also happens to match the app's own tab label exactly, which the
  parenthetical version didn't.
- `GlossarySection.jsx`'s existing "Single vs. slab" entry retitled to
  "Single vs. slab vs. bulk" with a one-line Bulk definition + link to
  `#sorting`, and `KnownQuirksSection.jsx` gained one new bullet (editing
  a Bulk row's now-irrelevant Set/Rarity/Condition fields directly in
  Catalog is harmless, not a bug — matches this section's existing
  "expected, not broken" framing).
- `e2e/staff-docs.spec.js`'s stepper test's hardcoded `titles` array
  updated to include both new titles at their real position (required —
  the test walks "Next" by exact title text); a new test covers the
  Quote→Sorting and Glossary→Sorting cross-reference links specifically,
  matching the file's existing per-cross-reference-link coverage.

## Catalog: click-to-select rows, per-row Sell removed, bigger Edit button

Real feedback: selecting rows one checkbox at a time was slower than it
needed to be, and the per-row Edit/Sell button pair left Edit (the more
commonly used of the two) as a small, easy-to-miss target next to Sell.

- **Clicking anywhere on a desktop table row now toggles its selection**,
  not just its checkbox — `CatalogTable.jsx`'s `<tr>` gets an `onClick`
  calling `onToggleSelected(sku, !isChecked)`, with every interactive child
  (the checkbox's own `<td>`, the thumbnail's zoom click, the source-link
  anchor, and the actions `<td>`) stopping propagation so clicking any of
  those does its own thing instead of also toggling the row. Scoped to
  desktop only — real feedback on mobile's existing tap-to-expand-a-card
  behavior found no appetite for changing it, and tapping a card to expand
  it was judged more valuable to preserve than adding click-to-select there
  too (mobile still selects via its own checkbox only, unchanged).
- **The per-row Sell button is gone.** Selling now goes exclusively through
  the same multi-select flow Delete already used: select one or more rows
  (checkbox, or now a row click on desktop), then click **Mark sold** in the
  batch action bar — works identically for one item or several at once, so
  there's no longer a special single-item path. `RowActions` dropped its
  `onSell` prop entirely; `SellModal.jsx` (and its test) — which handled the
  single-copy Yes/No vs. multi-copy quantity-stepper distinction — is no
  longer reachable from anywhere and was deleted outright rather than left
  as dead code, along with `App.jsx`'s `handleSellCard`/`onSellCard` and
  `CatalogPanel`'s `sellingSku` state.
  - **Real behavior change worth knowing**: the old per-row Sell flow
    supported selling a *partial* quantity (e.g. 2 of 5 copies) and always
    auto-created a Sync Queue ticket for exactly the amount sold. The batch
    bar's "Mark sold" (`App.jsx`'s `handleBatchSell`, unchanged by this)
    only ever sells a selected item's *entire* remaining quantity — there is
    now no UI path to sell a partial quantity while still getting an
    automatic Sync Queue ticket. A partial reduction is still possible by
    editing the Quantity field directly in Edit and saving, but that does
    **not** create a ticket the way Mark sold does (`handleSaveCard` only
    resets platform-status chips, it was never wired to `dbInsertTicket`).
    Accepted as part of this simplification rather than worked around —
    revisit if partial-quantity selling with a ticket turns out to still be
    needed in practice.
  - Staff docs (`SellingItemSection.jsx`) rewritten to describe the new
    select-then-Mark-sold flow and flag the partial-quantity gap explicitly
    via a `DocsCallout kind="warn"`; `CatalogSection.jsx`'s and
    `EditingItemSection.jsx`'s own stale "Sell button" references updated
    to match.
- **Edit's button grew from `.btn.secondary.small` to plain `.btn.secondary`**
  (both desktop table and mobile card views) — no new CSS needed, just
  dropping the `.small` modifier already gives real extra padding/font-size
  headroom (7px/13px vs. 4px/12px) now that it's the only per-row action
  left and, on desktop, sits inside a row that's otherwise an entire
  click-to-select surface.
- `e2e/catalog.spec.js`'s old single-copy-confirmation sell test (which
  drove the now-deleted `SellModal`) was replaced with a test selecting an
  item (checkbox on mobile, a row click on desktop) and confirming through
  the batch bar's Mark sold instead; a new desktop-only test asserts a row
  click selects it and that clicking Edit inside that row does not also
  toggle its selection.

## Quote line items gain Add image and Source link, matching EditModal

Real ask: a quote line item could already show a picked/scanned image and
run a live search, but had no manual fallback for either an image or a
listing link the way a catalog row's own EditModal does — a genuinely new
trade-in card with no automated match had no way to attach a photo or a
source URL by hand.

- **`QuoteLineItemRow.jsx` gained the same manual image controls EditModal's
  `.img-side` offers**: an **Add image** button (uploads a real photo of
  this exact copy — `resizeImageFile`, the same client-side resize
  EditModal/ScannerPanel already use, writing to the *photo* slot) plus a
  "…or paste a stock image URL" input (writes to the *stock* slot, no
  upload). A Photo/Stock toggle appears next to the thumbnail once both
  slots are actually populated, same as `ScanRow`'s own toggle — this row
  already had the full dual-image data model (`imageUrl`/`imageData`/
  `photoUrl`/`photoData`/`activeImage`, since a picked catalog reference or
  a scan/import could already carry one), just no manual way to set either
  slot directly. No pending/staging step, unlike EditModal — this row
  already patches every other field straight into the item on change (the
  whole quote only commits on `QuoteDetail`'s own Save), so there's nothing
  extra to defer here either. Remove stock/Remove photo buttons only appear
  once there's actually something in that slot, matching EditModal.
- **A quote item gained a real `sourceUrl` field** (`normalizeQuoteItem`),
  surfaced as a new **Source link** input + inline "open ↗" — same role as
  EditModal's "Source / product URL", just a plain `<a>` here instead of a
  `window.open()`-driven span, matching this row's existing link styling.
  Once set, the row's own TCGPlayer reference link (in the existing
  TCGPlayer/eBay/PriceCharting row) switches from a manual search to
  **"Check live TCGPlayer listing ↗"** pointing straight at it — the exact
  branching EditModal's own reference row already does off `sourceUrl`.
  `selectCandidate`/`handleCatalogPick` also back-fill it automatically
  (a search candidate's `listingUrl`, or a picked catalog card's own
  `sourceUrl`) whenever staff haven't already typed one themselves — same
  "never overwrite a manual entry" rule EditModal's own `selectCandidate`
  follows.
- **`sourceUrl` threaded through the item's whole life cycle, not just the
  Quote tab's own UI** — a trade-in card's source link should still be
  there once it becomes a real Catalog row, same as its image already is:
  - `quoteUtils.js`: `normalizeQuoteItem` (defaults `''`), `itemsFromCatalogRows`
    (carries a picked/scanned card's own `sourceUrl` in), and both
    `buildCatalogItemsFromQuoteItems`/`buildSortingItemsFromQuoteItems`
    (carry it back out) all gained the one field, mirroring exactly how
    every other dual-image field already flows through those same four
    functions.
  - **`sorting_queue` needed a real new column, unlike every other field
    on a quote item** — `quotes.items` is a jsonb array, so a new key just
    starts appearing there for free, but `sorting_queue`
    (`phase10_sorting_bulk.sql`) is a real relational table with one column
    per item field, and an accepted quote's items pass through it on their
    way to becoming a Catalog row. Without a column, `sourceUrl` would
    silently vanish at exactly that hop. New migration
    (`phase11_quote_source_url.sql`) adds `sorting_queue.source_url text
    not null default ''`; `db.js`'s `rowToSortingItem`/`sortingItemToRow`
    map it same as every other column there. **Bulk rows are deliberately
    NOT given a sourceUrl** — same reasoning `buildBulkCatalogItem` already
    applies to set/rarity/condition/price: a Bulk row has no per-print
    identity, so a specific listing link makes no sense on it either;
    nothing needed to change there since it never reads the field to begin
    with.
- Covered by new tests in `quoteUtils.test.js` (sourceUrl defaulting and
  carrying through all four conversion functions), `db.test.js` (a new
  describe block asserting `dbInsertSortingItems` actually sends
  `source_url` and that `rowToSortingItem` round-trips it back), and a new
  `e2e/quotes.spec.js` test driving the real Source link input and the
  paste-a-stock-image-URL fallback end to end, including the TCGPlayer
  reference link's live-vs-manual switch. The real photo upload path itself
  isn't e2e-tested — no test in this suite exercises a real file input
  anywhere yet (same gap already accepted for EditModal's own upload), so
  this doesn't newly regress test coverage, only carries the existing gap
  forward.
- **Found and fixed a real, pre-existing `.docs-callout` bug while writing
  the staff-docs update above** — the new, longer "Add image"/"Source link"
  callout in `QuoteSection.jsx` made the *existing* `e2e/staff-docs.spec.js`
  stepper test start failing on the Mobile project, at the Quote → Sorting
  "Next" click specifically, with Playwright reporting a `<p>` from
  elsewhere in the Quote section "intercepting pointer events" at the
  click point. Root cause, confirmed by direct `getBoundingClientRect()`/
  `scrollWidth` inspection rather than guessed from the symptom: `.docs-
  callout { display: flex; ... }` (no `flex-wrap`) had no icon or second
  item to justify being flex at all — `DocsCallout.jsx` just renders
  `<div className="docs-callout ...">{children}</div>`, and `children` is
  a section's own mix of raw text nodes and inline `<strong>`/`<a>`
  elements. Flexbox turns every one of those into its own flex item; with
  no wrap, they're forced onto a single non-wrapping row, each shrinking
  to its own min-content (roughly its longest unbreakable word) rather
  than the whole paragraph reflowing together — invisible for a short
  callout whose fragments' combined min-content still fit one row, but a
  real horizontal overflow once a callout got long enough (mine did,
  first). That overflow triggered a mobile-viewport auto-zoom-to-fit
  (`window.innerWidth`/`innerHeight` measurably grew to accommodate the
  overflowing content, confirmed directly rather than assumed), which
  desynced the page's actual on-screen layout from Playwright's scroll/
  click-point math for anything positioned far enough down the page —
  exactly the `docs-stepper` "Next" button on a now-tall Quote section.
  Fixed at the actual root — `.docs-callout` dropped `display: flex` (and
  the now-meaningless `gap: 10px`) entirely, since it only ever needed to
  be a plain padded text box. This was a latent bug in every multi-child
  `DocsCallout` already shipped throughout this file (several exist), not
  something new to Quote's own content — it simply hadn't hit a long
  enough callout to surface until now. Worth remembering: an e2e test
  failure on a page you didn't *functionally* change can still be a real
  bug the change happened to be long enough to expose, not a flake to
  work around — this one would have silently overflowed on a real phone
  too, not just in the test.

**Requires running `phase11_quote_source_url.sql`** in the Supabase SQL
Editor before an accepted quote's Source link survives the trip through
Sorting into Catalog — the Quote tab's own Source link field works
immediately either way (`quotes.items` needs no migration), but a value
typed there would silently be dropped once accepted without this column.

## Quote line item layout follow-up: Add image grouped with Find image, Paste URL collapsed, Source link labeled

Real feedback right after the feature above shipped, before anyone had used
it in anger:

- **"Add image" moved into `.scan-row-thumb-col`**, directly under "Find
  image" — the thumbnail-column button stack now reads Find image → Add
  image → Paste image URL → Find price, in that order. This deliberately
  reverses the "don't cram more into the narrow thumb column" lesson this
  file documented for the three reference links (TCGPlayer/eBay/
  PriceCharting, see "PriceCharting as a third price reference" above) —
  that lesson was about a *different kind* of control (external navigation
  links wanting real width for their text), not every control in general;
  a short action button is exactly what that column already holds, and
  real usage explicitly asked for these two to sit together.
- **"Paste image URL" is now a toggle button, not an always-visible
  input** — clicking it flips a local `showPasteUrl` state that reveals a
  `.scan-row-fields` panel (the URL input plus Remove stock/Remove photo,
  shown only when there's something to remove) below the Rarity/Printing/
  Condition/Price row; clicking again (button relabels itself "Hide URL
  field") collapses it. Keeps the common case — a card with no image
  problem to fix by hand — visually condensed, matching the same
  "collapsed unless needed" instinct already behind `SelectWithCustom`'s
  own "+ Enter a different ___…" escape hatches. The button itself follows
  the same filled/ghost toggle-state convention as this row's own Photo/
  Stock toggle (`btn small` filled when open, `btn ghost small` when
  collapsed) rather than inventing a new "active" class.
- **Source link gained a real, always-visible label to its left** —
  every other field in this row deliberately hides its label on desktop
  (`.scan-field-label { display: none }`, see "Scanner review row layout
  pass" above — a placeholder already identifies a blank dense-grid field)
  but real feedback found a bare, unlabeled full-width URL input read as
  oversized with no clue what it was for. Rather than fight that
  convention, this one field bypasses `.scan-field`/`.scan-field-label`
  entirely for a plain inline `<label>` styled to match `.field-group
  label`'s own look (monospace, uppercase, `--ink-soft`) — the one field
  in this row with a permanently visible identifier, by design, not an
  inconsistency to "fix" back to hidden later.
- `e2e/quotes.spec.js`'s Source-link/Add-image test updated to match:
  asserts the paste-URL input doesn't exist until "Paste image URL" is
  clicked, then fills it via its new plain "Paste a stock image URL"
  placeholder (the leading "…or " was dropped now that it's revealed by
  its own explicit toggle rather than always sitting next to the upload
  button).

## Testing

Sprint 3 turned into a real automated test suite (superseding the earlier,
informal "manual regression pass" plan) so mobile changes can be verified
without a physical phone every time.

- **Unit/component — Vitest + `@testing-library/react`** (`vitest.config.js`,
  jsdom environment). `npm test` (once) / `npm run test:watch`. Covers
  `src/lib/*.js`'s business logic (`cardUtils`, `db`, `cardSearch`,
  `importParse` — 96 tests across those four files) plus interactive
  component behavior for `SellModal`/`CatalogTable`/`EditModal` (mobile vs.
  desktop switch via a mocked `useIsMobile`, image-candidate selection,
  per-location channel defaults) — 111 tests total.
  - **`jsdom@30` requires Node ^22.22.2/^24.15.0/>=26** (its own
    `package.json` `engines` field) — CI's `test.yml` pins `node-version:
    22` for this reason. Node 20 fails with a cryptic `webidl.util.
    markAsUncloneable is not a function` deep in jsdom's bundled `undici`,
    and since this dev sandbox happens to run Node 22 already, that gap
    only showed up once the workflow actually ran in CI — worth remembering
    before dropping the pin back down.
  - `src/test/setup.js` stubs `window.matchMedia` (jsdom doesn't implement
    it) and explicitly wires up `@testing-library/react`'s `cleanup()` in an
    `afterEach` — that auto-cleanup only self-registers under Vitest's
    `globals: true`, which this project doesn't use (tests import
    `describe`/`it`/`expect` explicitly), so without this every test's
    rendered DOM would leak into the next test in the same file.
  - Not covered: `loadXlsxSheet`/`loadBinderPageFormat`/`readWorkbook` in
    `importParse.js` (need a real workbook fixture — exercised by manual
    testing only, per the existing "Manual QA note" above).
- **End-to-end — Playwright** (`playwright.config.js`, `e2e/*.spec.js`).
  `npm run test:e2e`. Runs the *real* app (`main.jsx`/`App.jsx`/
  `Login.jsx`/`BinderView.jsx`, completely unmodified) in a real Chromium
  browser at both a desktop and a mobile (`Pixel 7`) viewport — this is what
  actually verifies mobile CSS/layout, which jsdom component tests
  structurally cannot (no real layout engine, no `matchMedia`-driven
  reflow).
  - **The mock-data harness**: `src/test/harness/mockSupabaseClient.js` is a
    permanent, committed stand-in for `src/lib/supabase.js` — an in-memory
    `.from(table)` query builder plus `auth`/`channel`/`functions.invoke`
    stubs, keyed off `window.__HARNESS_SIGNED_IN__`/`window.__HARNESS_SEED__`
    (set via Playwright's `page.addInitScript`, see `e2e/fixtures.js`).
    `vite.config.js` only swaps it in under `vite --mode harness` — a mode
    only `playwright.config.js`'s `webServer` ever passes — via exact-string
    aliases (`./supabase.js`, `./lib/supabase.js`, `../lib/supabase.js`; one
    entry per relative form actually used in the codebase, since
    `@rollup/plugin-alias` matches the literal import specifier, not a
    resolved path). A normal `npm run dev`/`npm run build` never sets that
    mode, so production always gets the real Supabase client — confirmed by
    grepping the built `dist/` bundle for the harness's marker string.
    Deliberately *not* live-Supabase E2E, per an explicit decision: this
    sandbox has no network path to the real project, and pointing CI at a
    real backend would make the suite flaky/order-dependent and require
    shared-login credentials in a CI secret.
  - Covers: Catalog desktop-table vs. mobile-stacked-cards, add-item and
    select-then-Mark-sold flows, the public `BinderView` page (populated +
    empty states), and `Login` (form render, wrong-password error,
    successful sign-in) — all against the mocked backend, so they're
    deterministic and need no real credentials.
  - **Local Chromium path caveat**: this dev sandbox ships one pre-installed
    Chromium revision at a fixed path instead of one matching whatever
    `@playwright/test` version is in `package.json` — `playwright.config.js`
    only points `launchOptions.executablePath` at it when
    `PLAYWRIGHT_BROWSERS_PATH === '/opt/pw-browsers'` is set, which a real
    CI runner won't have, so CI downloads its own browser as normal via
    `npx playwright install --with-deps chromium`.
- **CI** (`.github/workflows/test.yml`): runs on every PR and push to
  `main` — a `unit` job (`npm test` + `npm run build`) and a separate `e2e`
  job (installs Chromium, `npm run test:e2e`), with the Playwright HTML
  report uploaded as an artifact on failure.

## Quote line items: "Find price" now backfills Set/Number/Rarity, and Rarity/Printing dropdowns default correctly on a new row

Real feedback: picking a result from "Find price" on a quote line item only
filled in price and the Source link, not Set/Rarity/Number — staff assumed
the app would need to "scan" TCGPlayer's page to get that data. It didn't
need to: the candidates both "Find image" and "Find price" show already
come from the same structured lookup (pokemontcg.io/Scryfall/YGOPRODeck/
etc.) that supplies the thumbnail and `listingUrl` in the first place —
nothing is ever read off TCGPlayer's actual page. Two separate, narrower
bugs, not a missing feature:

- **`QuoteLineItemRow.jsx`'s `selectCandidate` only backfilled Set/Number/
  Rarity on an image-mode pick**, unlike `EditModal.jsx`'s own
  `selectCandidate`, which backfills all three unconditionally regardless
  of which button (Find image vs. Find market price) triggered the search.
  A price-mode pick already had everything it needed (the candidate itself
  carries `set`/`number`/`rarity` whenever the provider returns them) — it
  just wasn't being applied. Fixed by hoisting that backfill above the
  price/image branch, matching EditModal exactly. Covered by a new
  `QuoteLineItemRow.test.jsx` (this component had no test file before),
  mirroring `EditModal.test.jsx`'s own candidate-selection coverage.
- **`SelectWithCustom.jsx` (shared by EditModal/ScannerPanel/
  QuoteLineItemRow) only decided dropdown-vs-free-text once, at mount** —
  a brand-new quote row starts with no Game picked yet, so Rarity/Printing
  have zero options at that instant and open in free-text mode; there was
  only ever logic for options *disappearing* (force free text), none for
  options *appearing* for the first time once Game gets set. Fixed by
  tracking the previous options length (`useRef`) and switching back to
  the dropdown when options go from empty to non-empty and the current
  value is still blank or already matches one of the new options — a
  genuine custom value typed through the escape hatch is left alone
  either way. This is a shared-component fix, not Quote-only: EditModal's
  own Rarity/Printing fields on a brand-new item had the identical defect
  and now default correctly too. Covered by two new cases in
  `SelectWithCustom.test.jsx`.

## Round price buttons

Staff ask: "a round price button would also be nice. Just to the nearest
dollar," refined in the same conversation to two explicit directions
("I can make it like 2 buttons to round up or down") rather than a single
nearest-dollar button — useful after an awkward computed Market Value
(e.g. $13.43) that staff would rather sell at a clean $13 or $14.

- **`roundPriceUp`/`roundPriceDown` (`cardUtils.js`)** — ceil/floor to the
  next whole dollar. Cents are rounded to a real integer first
  (`Math.round(price * 100) / 100`) before applying `Math.ceil`/`Math.floor`,
  so floating-point noise (e.g. `12.999999999998` from earlier arithmetic)
  doesn't push an already-whole price to the wrong neighbor — both
  functions are a no-op on a price that's already a whole dollar. `null`/
  `''`/non-finite values pass through unchanged rather than throwing, so a
  caller never needs to guard the input itself.
- **Wired into all three places Price is manually edited** — `EditModal.jsx`
  (Our price), `ScannerPanel.jsx`'s `ScanRow` (Price), and
  `QuoteLineItemRow.jsx` (Price), disabled whenever there's no price yet to
  round. Same "no separate scanner-only vs. catalog-only field behavior"
  parity this app applies to every other field-level feature (see the
  per-game parity section above) — confirmed with the user as wanting all
  three, not just one.
- **Two different layouts, by explicit request**: EditModal keeps labeled
  "Round down"/"Round up" buttons stacked below the input (there's room in
  its own dedicated field-group). ScannerPanel's `ScanRow` and
  `QuoteLineItemRow` — both dense, single-line row layouts — instead use
  `↓`/`↑` arrow buttons sitting directly to the right of the Price input
  in the same flex row, real staff feedback after the first cut found the
  labeled-button layout too tall for those two specific rows. Both arrow
  buttons keep a real accessible name (`aria-label`/`title` "Round down"/
  "Round up") despite the glyph-only visible label, so existing
  `getByRole('button', { name: 'Round down' })`-style test queries needed
  no changes when the layout changed.
- Covered by `cardUtils.test.js` (the two functions directly, including the
  floating-point and blank/non-finite cases) and new cases in
  `EditModal.test.jsx`/`QuoteLineItemRow.test.jsx` (button click rounds the
  field, both buttons disabled with no price). `ScannerPanel.jsx` has no
  component test file at all (see "Scanner review row layout pass" above —
  verified via a throwaway harness instead), so this follows that same
  existing gap rather than introducing new coverage infrastructure for one
  button.

## Quote tab: "+ Add misc. item" flat add-ons, excluded from the tier math

Real ask: a way to add something to a quote that isn't a card at all — a
playmat, a couple of binders the shop wants to offer a flat $5 for, or a
flat "$1 for 3 bulk V/ex" bundle — without it getting scaled down by the
50/60/70% tier percentages the way a real card's price does. The user's
own example: offering $5 for two binders should stay a full $5 in the
final payout, not $3 (a 60% tier applied to it).

- **A new `isAddOn` flag on a quote item** (`normalizeQuoteItem`, defaults
  `false`) — deliberately not a new item *type*/table, just a flag on the
  same `items` array every other quote item already lives in, so it needs
  no new migration (`quotes.items` is schema-less jsonb). Rendered via a
  new, much lighter **`AddOnLineItemRow.jsx`** instead of
  `QuoteLineItemRow.jsx` — just **Name**, **Description**, and **Price**
  (Description reuses the `notes` field every quote item already has but
  that `QuoteLineItemRow` never itself surfaces, so there's no conflict
  reusing it here) — no Game/Set/Rarity/Printing/Condition, no catalog
  typeahead, no live image/price search. A new **"+ Add misc. item"**
  button sits next to the three existing add-card buttons
  (`QuoteDetail.jsx`'s Cards section) and appends one of these rows mixed
  right into the same Cards list, visually distinct (no thumbnail, no
  search buttons) but otherwise just another row.
- **`computeQuoteTotals` (`quoteUtils.js`) now splits its sum in two** —
  `qty`/`total` (unchanged math, tier-relevant) skip any `isAddOn` item
  entirely; a new `addOnsTotal` return field sums just the add-on items'
  raw prices, same blank-price-excludes-the-row rule as `total` already
  had. `QuoteDetail.jsx`'s Total & offer section shows `addOnsTotal` as its
  own stat right next to the three tier amounts, with an **"Add to
  payout"** button (disabled when there's nothing to add) that does
  `payoutAmount = round2((payoutAmount || 0) + addOnsTotal)` — a one-click
  action, not a live-recomputed formula, matching this app's "never
  silently overwrite a manual entry" discipline the tier buttons' own
  "Use" already follows. `round2` is now exported from `quoteUtils.js`
  specifically for this (adding two already-cent-rounded floats back
  together can still reintroduce floating-point noise).
- **Confirmed with the user: add-ons are pricing-only and never become
  real inventory** — asked explicitly rather than assumed, since the
  user's own examples (binders, bulk cards) are physical goods a shop
  would often want tracked. `buildSortingItemsFromQuoteItems` now filters
  out every `isAddOn` item before building `sorting_queue` rows, so
  accepting a quote with add-ons only ever moves its *real* card items to
  Sorting — the add-on's dollar amount already did its one job (padding
  Payout amount, if staff clicked "Add to payout") and leaves no further
  trace. `QuoteDetail.jsx`'s own "Saving will move N item(s) to Sorting"
  status line was fixed to count real items only (it previously counted
  `draft.items.length`, which would have overstated the number once
  add-ons existed), with an extra sentence when the two counts differ.
- `QuotePrintSheet` gained one new summary row, "Add-ons total" — reuses
  `computeQuoteTotals` same as its existing rows, so the printed record
  stays consistent with what's on screen (an add-on's price still appears
  in the per-item table too, just excluded from "Total quoted value" like
  on screen).
- Covered by new tests in `quoteUtils.test.js` (isAddOn defaulting,
  `computeQuoteTotals`'s split sums including the blank-price case,
  `buildSortingItemsFromQuoteItems` dropping add-ons entirely), a new
  `AddOnLineItemRow.test.jsx`, an added case in `QuotePrintViews.test.jsx`,
  and a new `e2e/quotes.spec.js` test driving the full flow: add a card and
  an add-on, confirm the tier total excludes the add-on, click "Add to
  payout", accept, and confirm only the card (not the add-on) reaches
  Sorting.

## Quote tab: "Remove from payout" toggle, and "+ Add card as Bulk" in its own section

Two follow-ups to the misc. item add-ons feature above, right after it
shipped:

- **"Add to payout" was a one-way, infinitely-repeatable action** — nothing
  stopped staff clicking it twice and stacking the same add-ons total into
  Payout amount more than once. `QuoteDetail.jsx` now tracks
  `addOnsApplied` (the exact amount currently folded in, 0 = not applied):
  the button reads "Add to payout" while `addOnsApplied` is 0, flips to
  **"Remove from payout"** once clicked (which subtracts that same exact
  amount back out and resets to 0), so the two actions are a real toggle
  instead of an endlessly-repeatable one-way button. Deliberately tracks
  the *applied amount*, not a live-recomputed `addOnsTotal` — editing an
  add-on's price after applying it doesn't retroactively change what
  "Remove" undoes, matching this app's "a one-click action, not a
  live-recomputed formula" discipline (same reasoning as the tier buttons'
  own "Use").
- **A new "+ Add card as Bulk" option**, in its own **"Bulk items"**
  section below Cards — for a real card staff already know is going
  straight into a Bulk pile, with no reason to fill in Set/Rarity/
  Printing/Condition for it individually. A new `isBulk` flag on a quote
  item (same free, no-migration-needed pattern as `isAddOn` — just another
  key in `quotes.items`' jsonb) rendered via a new, light
  **`BulkLineItemRow.jsx`**: just Game, Qty, and Price (per-card, same
  qty×price convention every other line item already uses — deliberately
  NOT a flat-total-for-the-lot like the misc. add-on's price, since this
  item type has a real, meaningful per-unit quantity the way a
  non-card accessory doesn't).
  - **Meaningfully different from `isAddOn` in both directions that
    matter**: a Bulk item *does* count toward `computeQuoteTotals`'
    tier-relevant `qty`/`total` (it's real card value, unlike a playmat or
    a binder) — no change needed to that function, since only `isAddOn`
    items are excluded there and a Bulk item simply isn't one. It also
    *does* flow through `buildSortingItemsFromQuoteItems` to Sorting on
    accept, same as any other item — no change needed there either.
    `isBulk` carries **zero functional meaning past the Quote tab's own
    UI** — it exists purely to pick which lightweight form/section an item
    is edited in at quote time; once in Sorting, a card that started as a
    Bulk-flagged quote item is placed through the exact same "Add to Bulk"
    option in `SortItemModal` that already exists for any item regardless
    of origin — consistent with the standing "Bulk placement happens at
    Sorting time, one item at a time" architecture decision (see the
    "Sorting stage + Bulk item type" section above, and PR #40's closure
    for why that's deliberate).
  - `QuoteDetail.jsx`'s Cards list now renders `nonBulkItems` (everything
    except `isBulk` — real cards and misc. add-ons still mix together
    there, unchanged) while a new "Bulk items (N)" section renders
    `bulkItems` separately, with its own `+ Add card as Bulk` button and
    its own `openSections` toggle key.
- Covered by new tests in `quoteUtils.test.js` (`isBulk` defaulting,
  `computeQuoteTotals` counting Bulk items like a normal card while still
  excluding add-ons, `buildSortingItemsFromQuoteItems` keeping Bulk items
  while still dropping add-ons), a new `BulkLineItemRow.test.jsx`, and two
  new `e2e/quotes.spec.js` tests (the Add/Remove from payout toggle
  round-trip, and a Bulk item counting toward the tier total while still
  reaching Sorting on accept).

## Quote tab: Bulk reclassified as flat-priced and tier-excluded (reverses the above), Qty added to misc. items

Real feedback, immediately after the above shipped: **"Bulk should be
treated as a misc item, meaning we shouldn't apply % to it."** — the
previous sprint's call that a Bulk item *should* count toward the 50/60/70%
tier math (reasoning it was "real card value") was wrong in practice: staff
want to add a whole stack of bulk cards (e.g. 20 commons) under one flat
price ("$5 for the lot") and have that exact number be what's offered,
the same way a misc. add-on's price already works — not a per-card price
scaled up by quantity and then shaved down by a tier percentage.

- **`computeQuoteTotals` (`quoteUtils.js`) now excludes `isBulk` items from
  tier-relevant `qty`/`total` the same way it already excluded `isAddOn`
  items**, summing them into a new, separate `bulkTotal` return field
  instead (not merged into `addOnsTotal` — see below for why). This is a
  straight reversal of the previous sprint's explicit "no change needed,
  a Bulk item counts like a normal card" call, once real usage showed that
  reasoning didn't hold — the `qty`/`total` branch's `continue` (already
  used for `isAddOn`) is now shared by both flags.
- **Qty is a new field on BOTH `AddOnLineItemRow` and `BulkLineItemRow`,
  and on both it's deliberately a record only — never a price multiplier.**
  A misc. add-on previously had no Qty field at all (always implicitly 1);
  staff wanted to note "this was 3 cards" without the app silently turning
  a flat $5 into $15. Bulk's own Qty (previously the real per-unit quantity
  multiplied into its line total under the old, now-reversed per-card
  model) keeps the same *field* but changes meaning entirely — it no
  longer multiplies anything; `computeQuoteTotals` sums `price` alone for
  both `isAddOn` and `isBulk` branches regardless of `qty`'s value. This
  was deliberately checked against the standing "I wouldn't want the
  machine to add $3 to the offer, just a full $5" principle from the
  original misc.-item feature, so the new Qty field couldn't quietly
  reintroduce the exact problem that principle was meant to prevent.
- **`BulkLineItemRow.jsx` rewritten to mirror `AddOnLineItemRow.jsx`'s
  field shape**: Qty → Game → **Lot name** (a free-text input, replacing
  Bulk's old implicit "no name" — the per-example ask was a row reading
  "20 cards, in 'Pokemon surge bulk', ... and price $$$") → **Description**
  (reuses `notes`, same as a misc. item's own Description field) → Price
  (now a flat lot total, not a per-card price). `Game` is the one field
  kept from the old per-card shape rather than dropped to fully match
  `AddOnLineItemRow` — `findBulkRow`/`buildBulkCatalogItem` (see "Sorting
  stage + Bulk item type" above) key a Bulk catalog row on **(location,
  game)**, so Game has to survive the trip through Sorting for the eventual
  placement to even be possible; Name/Description, by contrast, describe
  the lot at quote time only and carry no functional meaning past it (same
  as `isBulk` itself, per the previous section).
- **Bulk keeps its own, independent Add-to-payout/Remove-from-payout
  toggle — a new `bulkApplied` state in `QuoteDetail.jsx`, parallel to but
  separate from `addOnsApplied`**, not a shared pot with the misc. add-ons'
  own total. Matches the explicit ask ("added only on demand and removable
  if we want to offer it individually") — staff may want to apply one
  total to Payout amount without the other, so a shared toggle would have
  been the wrong shape even though the two mechanics are otherwise
  identical. The "Bulk total" stat sits right next to "Add-ons total" in
  the Total & offer section, same layout, same toggle button labels.
- **`QuotePrintSheet`'s per-item "Line total" column** (`QuotePrintViews.jsx`)
  now branches on `isAddOn`/`isBulk` — both render their flat `price`
  verbatim instead of `price × qty`, since Qty is no longer a multiplier
  for either type on the printed record either. A new "Bulk total" summary
  row was added next to the existing "Add-ons total" one, same pattern.
- **`sorting_queue`/`buildSortingItemsFromQuoteItems` needed no changes** —
  a Bulk-flagged item still flows to Sorting on accept exactly as before;
  only its *pricing* treatment reversed, not its inventory-routing
  behavior. The stated reason for "treat as misc item" was specifically
  about not applying tier percentages, not about whether the card itself
  becomes real inventory — removing the Sorting trip entirely would have
  made the whole "Add card as Bulk" feature pointless as a path to a real
  Bulk catalog row.
- Existing tests from the previous sprint were corrected rather than left
  stale: `quoteUtils.test.js`'s "counts isBulk items toward qty/total like
  a normal card" case was replaced with one asserting the opposite
  (excluded from `qty`/`total`, summed flatly into `bulkTotal`), plus new
  cases for Qty-never-multiplies on both `isAddOn`/`isBulk` and for
  `bulkTotal`'s own blank-price exclusion; `e2e/quotes.spec.js`'s Bulk test
  (renamed to "...are excluded from the tier total...") was rewritten to
  assert Total quoted value stays unaffected by a Bulk lot and that Bulk's
  own Add-to-payout/Remove-from-payout toggle round-trips independently of
  the misc.-add-ons one. `QuoteSection.jsx` (staff docs) and this file's
  own previous section were both corrected in place rather than left to
  describe behavior that no longer exists, per this project's standing
  "amend/supersede, don't silently rewrite" convention for a reversed
  decision — see this section itself as that correction for the "Bulk
  items... Sorting stage + Bulk item type" and "Remove from payout
  toggle..." sections above, whose own Bulk-related claims about counting
  toward the tier math are now out of date and superseded by this one.

## Quote tab: per-item payout percentages — Bulk/Misc "Apply a %?", card-level "Alter %?"

Real staff ask (Discord): "I may calculate the worth of several $1-$5 cards
that I'd pay out 60% of and I don't want to break out a calculator and
remember the pricing for each one" — plus, separately, "there may even be
cards that I would want at a different percentage due to condition,
rarity, ease of sale, etc." Two distinct mechanisms, both about skipping
manual percentage math:

- **Bulk/Misc items get their own opt-in payout percentage**
  (`pctEnabled`/`pctValue` on a quote item, `flatItemAmount(item)` in
  `quoteUtils.js`) — check "Apply a %?" on an `AddOnLineItemRow`/
  `BulkLineItemRow`, type a percentage, and the item's own flat value is
  multiplied by it for `addOnsTotal`/`bulkTotal` purposes (and the printed
  record). Deliberately a free-form number, not locked to the three
  configured tiers — "60%, 70%, 100%, etc." was explicit in the ask, so a
  dropdown of just the three tiers would have been wrong. Unchecked (the
  default) behaves exactly as before this feature — the raw entered value,
  untouched. `flatItemAmount` is exported specifically so the row
  component, `computeQuoteTotals`, and `QuotePrintSheet` all compute the
  same number rather than three slightly-different copies of this math.
- **A specific Cards-list item can deviate from the quote's own tier rate**
  (`pctAltered`/`pctDelta` on a quote item) — "Alter %?" on
  `QuoteLineItemRow` reveals a signed `+/-X%` input. This is a DELTA in
  percentage points relative to whichever tier ends up used, not an
  absolute override (+10 on a 60% tier pays that one card at 70%, -20 pays
  it at 40%) — matches how the old manual workaround was described
  ("change the asking price by the percent off/on I wanted"), and is a
  different shape from the Bulk/Misc mechanism above on purpose: Bulk/Misc
  items have no "blanket tier" to be relative to (they're excluded from
  the tier math entirely, per the section above), so their own percentage
  has to be an absolute multiplier instead.
  - **This required changing `computeOfferTiers`'s signature** from
    `(total, tierSettings)` to `(items, tierSettings)` — the three tier
    amounts used to be a single `total × pct` multiplication, which has no
    way to let one card deviate from the blanket rate. It now walks every
    non-flat item and sums `price × qty × (tierPct + delta)/100` per tier
    (clamped to a 0-100% effective rate so a large negative delta can't go
    negative), computed for all three tiers at once — not just whichever
    one staff eventually click "Use" on — so every number shown is already
    correct regardless of which tier gets picked. Confirmed with the user
    before building this specific shape (all three tiers recomputed live,
    rather than adding a separate "which tier is this quote's base rate"
    setting) since it changes core offer math, not just adds a new field
    on the side like most other additions in this doc.
  - Both call sites (`QuoteDetail.jsx`'s live tier display,
    `QuotePrintViews.jsx`'s printed record) were updated to pass `items`
    instead of a pre-computed `total`; `QuotePrintSheet`'s Price column
    also appends `(+10%)`/`(-20%)` next to an altered card's price so the
    printed record shows why that row's own math looks different.
- Covered by new tests in `quoteUtils.test.js` (`flatItemAmount` directly;
  `computeQuoteTotals` applying an add-on/bulk item's own percentage;
  `computeOfferTiers`'s new item-based signature, including the clamp and
  the isAddOn/isBulk-skip behavior), new cases in
  `AddOnLineItemRow.test.jsx`/`BulkLineItemRow.test.jsx`/
  `QuoteLineItemRow.test.jsx` for the two new checkbox+input controls, a
  new case in `QuotePrintViews.test.jsx` for the delta annotation and the
  Bulk/Misc percentage reflected in Line total, and two new
  `e2e/quotes.spec.js` tests (a Bulk lot's opted-in percentage changing
  its contribution to Bulk total; a card's Alter % changing its
  contribution to a live tier amount).

## App renamed: Ledger → Card Cove

Per explicit instruction: the app's own brand name changes from "Ledger"
to **Card Cove**, with **"by Board Game Paradise"** appended only in
footer-type spots, not wherever the name appears on its own (topbar, login
screen, staff docs header, export format labels). See this file's own
Branding section above for the specifics of what changed and what was
deliberately left alone (historical prose, the repo/Pages URL).

## Rarity additions: Lorcana "Epic", SWU "Serialized" and "Prestige Foil"

Three curated-rarity/printing additions requested directly by staff,
confirmed with the user before implementing since two of them touch
previously-documented, researched architecture calls in this file:

- **Lorcana `RARITY_OPTIONS_BY_GAME` gained "Epic"** — not one of the six
  rarity tiers this file's own Lorcana research confirmed via a real
  Lorcast API sample (Common/Uncommon/Rare/Super Rare/Legendary/
  Enchanted). Added anyway on staff's explicit confirmation that it's a
  real tier they've seen on physical cards — its position in the list
  (between Super Rare and Legendary) is a best guess, not verified against
  a real sample the way the other six were. Revisit the ordering if a real
  Lorcast response for an Epic card ever surfaces.
- **SWU `RARITY_OPTIONS_BY_GAME` gained "Serialized"** — this reverses part
  of an earlier, explicit research call in this same file, which evaluated
  "Serialized" and deliberately excluded it from SWU's curated *Printing*
  list as event/distribution-tied vocabulary (grouped with Weekly Play
  Promo/Foil, Prerelease Promo, Convention Exclusive, Judge Promo — all
  still excluded). Staff specifically asked for it to be selectable as a
  **Rarity** instead, not a Printing/finish value, so it now lives in
  `RARITY_OPTIONS_BY_GAME.SWU` rather than being un-excluded from Printing.
- **SWU `PRINTING_OPTIONS_BY_GAME` gained "Prestige Foil"**, alongside the
  existing "Prestige" entry — same foiled/non-foiled pairing pattern as the
  existing Hyperspace/Hyperspace Foil pair. This one does **not** reverse
  anything: Prestige was already, and remains, modeled as a Printing/finish
  value (a separate axis from Rarity, per the real swu-db.com card listing
  this file's SWU research cites), so its foiled variant belongs in the
  same list.
- All three are explicit staff-confirmation additions, not independently
  re-verified against a new API sample — matching this file's existing
  "Promo added everywhere despite weak/no API confirmation, per explicit
  staff request" precedent rather than the stricter research-first bar
  used for e.g. the original per-game parity sprints. Comments at each
  array in `cardUtils.js` flag this so a future pass doesn't mistake these
  for independently-researched values or "fix" them back out.
- Updated `cardUtils.test.js`'s exact-array assertions for
  `RARITY_OPTIONS_BY_GAME.Lorcana`/`.SWU` and
  `PRINTING_OPTIONS_BY_GAME.SWU` to match.

## Sales reporting, Feature A of the price-tracking/reporting roadmap

First PR of a two-feature initiative (sales reporting, then price-spike
tracking) planned out and confirmed with the user before building: a
durable record of what's actually sold, for a future monthly/yearly
revenue report. This PR is deliberately scoped to just the data model and
the write hook — no report UI yet, that's the next PR.

- **New `sales` table** (`phase12_sales_history.sql`) — one row per Mark
  Sold event: `sku`, `name`, `game`, `condition`, `qty_sold`, `sale_price`,
  `sold_at`. Append-only, never updated or deleted, independent of both
  `catalog` (whose rows can be edited/deleted after the fact — a report
  must never retroactively change) and `sync_queue` (which tracks
  in-flight cross-platform listing cleanup and gets its rows deleted once
  resolved — a genuinely different lifetime and purpose). Deliberately
  snapshots only what a revenue/volume-by-game report needs, not every
  catalog field (no set/printing/rarity/location) — add columns later if
  an actual report needs them, rather than guessing a full schema now.
  No realtime-publication step needed, unlike `quotes`/`sorting_queue` —
  reports are pull-based, nothing needs to see a sale land live.
- **Scope decision, confirmed with the user**: only the batch "Mark sold"
  flow (`App.jsx`'s `handleBatchSell`) writes a sales record — editing
  Quantity down directly in Edit does **not**, matching the exact same
  boundary this app already drew for `sync_queue` tickets (see the
  "Catalog: click-to-select rows, per-row Sell removed" section above,
  which documents that a direct Quantity edit was never wired to ticket
  creation either). Kept the two flows' behavior consistent rather than
  inventing a new rule just for sales reporting.
- **`db.js` gained `dbInsertSales`** (plus an internal `saleToRow`,
  unexported — matches `ticketToRow`'s own pattern, no external caller
  needs the row shape directly), called from `handleBatchSell` right
  alongside the existing `dbInsertTickets` call — same event, two
  independent writes, since the two tables serve different purposes.
  `handleBatchSell` also now shares one `soldAt` timestamp across every
  item in the same batch action (previously each item's ticket/`
  lastUpdated` called `Date.now()` separately) — a minor correctness fix
  motivated directly by this feature: several items marked sold in the
  same click should report as sold at the same moment, not microseconds
  apart.
- **Explicit profit/cost-basis scope cut**: this table has no cost/basis
  column — confirmed with the user as an explicitly separate, larger
  initiative (most inbound paths — Scanner, Import — never capture what
  the shop paid for an item at all; only Quote-tab trade-ins have a real
  payout amount). This PR only supports revenue/volume reporting.
- `src/test/harness/mockSupabaseClient.js` and `e2e/fixtures.js`'s
  `catalogSeed` both gained a `sales: []` table entry, same as every other
  real table, so e2e specs touching Mark Sold don't hit an unseeded table.
- Covered by new tests in `db.test.js` (`dbInsertSales`'s row shape, the
  empty-array no-op, and the error-to-toast path) and an extended
  assertion in `e2e/catalog.spec.js`'s existing Mark Sold test, reading
  `window.__HARNESS_DB__.sales` directly to confirm the write actually
  happened — the first e2e spec in this app to inspect harness DB state
  directly rather than only the rendered UI, since there's no UI yet to
  assert against (that's the next PR).

**Requires running `phase12_sales_history.sql`** in the Supabase SQL
Editor before this code can write sales records — no code-side default
masks a missing table here, so Mark Sold would start throwing a real
insert error rather than silently skipping the record.

## Sales reporting, PR 2: the Reports tab

Second and final PR of Feature A — a new top-level **Reports** tab
rendering the revenue/volume report PR 1's `sales` table was written for.
No cost-basis/profit here either (same explicit scope cut as PR 1); this
reads `sales` as-is.

- **`src/lib/reportUtils.js`** — the report's pure, unit-tested logic,
  deliberately kept separate from `quoteUtils.js` despite the superficially
  similar "sum some money" shape (sales reporting and Quote-tab offer math
  are unrelated features that happen to both total currency; coupling them
  would make neither easier to change later). `computeSalesReport(sales)`
  sums `revenue`/`units` and breaks them down `byGame` (sorted by revenue,
  descending) — a blank/missing `game` groups under `"Unknown"` rather than
  being dropped, and a sale with a null `salePrice` still counts its `qty`
  toward units (the sale genuinely happened, even if the price wasn't
  captured). `presetDateRange('month'|'year', now?)` and
  `customDateRangeToBounds(fromStr, toStr)` compute the `[from, to)` ISO
  bounds `dbLoadSales` expects — the custom-range helper bumps the end date
  one day forward so the picked end date is itself included, matching how
  a person reads "Jan 1 to Jan 31" (both days counted), not an exact-
  midnight cutoff that would silently exclude the last day.
- **`db.js` gained `dbLoadSales(fromISO, toISO, toast)`/`rowToSale`** —
  deliberately **not** added to `dbLoadAll`'s eager, sign-in-time load the
  way `catalog`/`sync_queue`/`quotes`/`sorting_queue` are. Every one of
  those has a natural cap (an in-flight queue drains, a quote resolves) —
  `sales` only ever grows, forever, with no equivalent ceiling, so eagerly
  pulling the whole table into memory on every login doesn't scale the way
  it does for those. `dbLoadSales` fetches only the date range the Reports
  tab is actually showing, still routed through the existing
  `fetchAllRows` paging helper so a wide range (e.g. "this year" for a
  genuinely busy shop) pages correctly past 1000 rows instead of silently
  truncating — the exact production bug this app already hit once with a
  bare `.select()` (see "Known constraints" above).
- **`ReportsTab.jsx`** fetches on demand via a `fromISO, toISO) => Promise`
  prop (`App.jsx`'s `handleLoadSalesReport`, a thin passthrough to
  `dbLoadSales`) rather than receiving a pre-loaded `sales` array the way
  `SortingTab`/`QuotesTab` receive their data — this is the one tab in the
  app that owns its own data-fetching trigger, since "fetch only what's
  being looked at" is the entire point of not eager-loading this table.
  Like every other tab, it's mounted unconditionally (just hidden via
  `.panel`'s CSS, not conditionally rendered) — so its default "this
  month" range is fetched once at app load regardless of whether staff
  ever open the tab, the same trade-off `quotes`/`sorting_queue` already
  make by eager-loading in full; the difference here is it is scoped to
  one month's rows, not the whole table.
  - **Date range**: three choices — **This month** (default), **This
    year**, or **Custom** (two `<input type="date">` fields, the only date-
    picker pattern already used elsewhere in this app, e.g.
    `QuoteDetail.jsx`'s Date quoted field). Picking Custom with one or both
    dates still blank shows an explicit "Pick both dates" prompt rather
    than quietly loading nothing or erroring.
  - **Display**: Units sold/Revenue as two stat tiles (same uppercase-
    label-plus-monospace-value inline style `QuoteDetail.jsx`'s own
    Total & offer stats already use, for visual consistency with the
    closest existing "a few money numbers side by side" pattern in the
    app), then a plain `<table>` breaking totals down by game. An empty
    result shows "Nothing sold in this range," distinct from the Custom-
    range blank-dates prompt.
- **`mockSupabaseClient.js` gained `gte`/`lt` filter support** — needed for
  the harness to actually honor `dbLoadSales`'s date-range query under e2e;
  previously the mock only understood `eq`/`neq`/`in`. String comparison on
  the ISO timestamp values is enough, since they sort the same way as
  plain strings that Postgres's own timestamp comparison would.
- Covered by `reportUtils.test.js` (every pure function: the revenue/units/
  byGame math including the null-price and blank-game edge cases, both
  preset ranges, and the custom-range inclusive-end-date behavior), new
  `db.test.js` cases (`rowToSale`, `dbLoadSales`'s gte/lt call shape, its
  own 1000-row pagination, and its error-to-empty-array-plus-toast path),
  and a new `e2e/reports.spec.js`: the default month view's totals and
  sorted by-game breakdown, the real empty state for a range with nothing
  sold, and the Custom range's pick-both-dates prompt followed by a real
  (empty) result once both dates are filled.

## Sales reporting: one-time backfill from sync_queue

A real gap raised right after PR 1 shipped: every `sync_queue` ticket
already sitting in the real project predates the `sales` table, so none
of that real sales history had a `sales` row — the Reports tab (PR 2)
would only ever show sales from the moment this feature went live
forward, not the shop's actual history. `backfill_sales_from_sync_queue.sql`
is a one-time **data** backfill, not a schema migration — it belongs in
`supabase/migrations/` anyway, matching this repo's existing convention
of tracking every manually-run SQL action as a file with instructions
(e.g. `phase_qr_public_binder_view.sql`/`phase_security_rls_review.sql`,
both already non-phase-numbered one-offs for the same reason).

- **`game` has to be recovered via a join back to `catalog` on `sku`** —
  `sync_queue` never stored a `game` column at all (confirmed against
  `db.js`'s `rowToTicket`/`ticketToRow`), so there's no historical value
  to copy directly. This backfills the CURRENT `catalog.game` instead —
  fine in virtually every real case since Game rarely changes after an
  item's created, but it's a present-day proxy, not a true historical
  snapshot. A `sku` whose catalog row has since been deleted backfills
  with a blank game, which `computeSalesReport` already groups under
  `"Unknown"` rather than erroring — same handling as any other blank
  game value.
- **`price`/`qty_sold` are a direct, lossless copy, not an approximation**
  — `handleBatchSell` (`App.jsx`) has always set both the ticket's and the
  (now) sale record's price/qty from the exact same `c.price`/`qtySold`
  values in the same loop, so a historical ticket's own `price`/`qty_sold`
  columns are exactly what a `sales` row would have recorded had the table
  existed at the time.
- **Double-counting guard**: any real Mark Sold test performed against
  this project *after* `phase12_sales_history.sql` was deployed already
  wrote a row to both `sync_queue` and `sales` (the write hook fires on
  both, going forward) — blindly backfilling every `sync_queue` row would
  double those. The script only backfills tickets older than the
  earliest `sold_at` already present in `sales` (or everything, if `sales`
  is still empty) — self-adjusting, no manual cutoff date needed.
- **Run once** — includes a preview `select` (identical shape to the
  `insert`) to sanity-check row count/contents before committing to the
  actual `insert`. There's no unique-constraint protection against
  re-running the `insert` a second time, since a `sync_queue` ticket has
  no reciprocal link back to a `sales` row to de-duplicate on — the
  script's own header comment calls this out explicitly.

## Reports tab: click a game row to drill into its individual sold cards

Real ask right after the backfill above made the by-game breakdown actually
useful: volume/revenue per game is a good summary, but staff wanted to see
*which* cards made up that number without leaving the tab.

- **`ReportsTab.jsx`'s by-game `<table>` rows are now clickable** — a new
  `expandedGame` state (one game at a time, not a Set of several open at
  once) toggles on row click; the open row's chevron flips `▶`→`▼` and an
  inline nested `<table>` renders directly below it (as a sibling `<tr>`
  with a single `colSpan={3}` cell) listing that game's own sold cards —
  Name/Condition/Qty/Price/Sold date, newest first. Clicking a different
  game's row switches straight to it without needing to collapse the first
  one by hand; clicking the same row again collapses it.
- **No new fetch — filtered client-side from the already-loaded `sales`
  array**, the same array `computeSalesReport` already summed for the
  table's own numbers. The drill-down's own filter
  (`(s.game || 'Unknown') === g.game`) deliberately mirrors
  `computeSalesReport`'s identical blank-game→`"Unknown"` grouping rule
  (`reportUtils.js`) so the rows shown under a game are always exactly the
  ones that were summed into that row's own Units/Revenue — no separate
  grouping logic to drift out of sync with the totals above it.
  `expandedGame` is reset to `null` whenever the date range changes (same
  effect that re-fetches `sales`), so a stale expansion naming a game that
  might not even appear in the new range's results can't linger.
- A sale with no captured price still renders `—` in the drill-down's Price
  column (matching `computeSalesReport`'s own null-price handling, which
  counts it toward units but contributes 0 revenue) rather than `$NaN` or a
  blank cell with no explanation.
- Covered by a new `e2e/reports.spec.js` test: two games' sales seeded,
  nothing shown until a row is clicked, clicking Pokemon's row reveals only
  its own cards (not Magic's), clicking Magic's row switches the drill-down
  over without a manual collapse step first, and clicking the same row
  again collapses it.

## Price tracking & spike alerts, Feature B of the price-tracking/reporting roadmap

First PR of the second feature in the two-feature roadmap confirmed with the
user alongside Feature A (sales reporting, above): a reliable way to notice
when a card's market price has jumped, so staff know to adjust their own
price rather than keep selling at a stale, now-too-low number. Six open
questions were confirmed with the user before building:

- **Only a Mark Sold event, not a manual Quantity edit-down, counts toward
  reporting** — irrelevant to this PR specifically, but recorded here since
  it was answered in the same round (see Feature A's own section above for
  where it actually applies).
- **Revenue/volume only for sales reporting, profit/cost-basis is a
  separate, later extension** — same note, applies to Feature A not this PR.
- **Price tracking is opt-in via a price floor** (an adjustable "high cost"
  threshold, not every item) — a shop's bulk commons spiking 20% in dollar
  terms is noise; a $200 card spiking 20% is $40 worth of margin left on the
  table. `price_tracking_settings.floor_price` (default $25, store-
  configurable) gates which catalog rows get checked at all.
- **Refresh cadence: GitHub Actions**, not Supabase's own scheduler —
  matches this project's existing CI tooling rather than introducing a
  second scheduling system, and keeps the schedule's definition
  (`.github/workflows/price-check.yml`) version-controlled in the same repo
  as everything else.
- **Spike direction: up only, for v1** — a price drop isn't something staff
  need to be alerted to adjust *up* for; flagging drops too is a plausible
  future addition, not built here.
- **Alert delivery: an in-app badge, for v1** — no Discord webhook/email yet
  (the `sales` table's own write hook already established "ship the
  minimal, independently-useful version first" for this roadmap).
- **Scope, confirmed before writing PR 1's code**: all 8 games with a real
  price-lookup function get tracked from v1 (not a staged Pokemon-then-
  Magic rollout the way the original per-game parity initiative was staged)
  — Sports Singles has no card database to check against at all, same
  accepted drawback documented elsewhere in this file.

This PR is deliberately scoped to just the data model and the scheduled
checker — no in-app UI yet (that's PR 2), mirroring exactly how Feature A's
own PR 1/PR 2 split worked.

- **New tables** (`phase13_price_tracking.sql`): `price_history` (one row
  per scheduled check per tracked item, append-only like `sales`, kept for
  a future trend/sparkline view — nothing reads it yet), `price_alerts` (one
  row per detected spike, `acknowledged` boolean driving PR 2's in-app badge
  count — never deleted once resolved, unlike `sorting_queue`, since "we got
  notified about this on this date" is itself a useful historical record),
  and `price_tracking_settings` (a singleton row, `floor_price`/`spike_pct`,
  same `id=1`/own-dedicated-row pattern `quote_settings` already established
  over bolting onto `store_settings` — this is a price-tracking concern, not
  a Catalog condition-multiplier concern).
- **New Edge Function, `supabase/functions/price-check`** — the first Edge
  Function in this repo that reads/writes Postgres directly, rather than
  only proxying an external lookup. Uses the service-role client Supabase
  auto-injects into every Edge Function (`SUPABASE_URL`/
  `SUPABASE_SERVICE_ROLE_KEY` env vars — no `supabase secrets set` needed
  for those two specifically) so it bypasses RLS to read/write across the
  whole catalog regardless of which user (if any) triggered it. Per
  invocation: loads `price_tracking_settings` (falling back to $25/20% if
  the row is somehow missing, same resilience `dbLoadSettings` already
  applies to `store_settings`), loads every non-bulk catalog row with a
  `base_price` at or above the floor (ordered by `base_price` descending,
  capped at 200 items per run — see below), looks up a fresh price per item
  with limited concurrency (cap 3, same `runWithConcurrency` pattern already
  used client-side for CSV import/scanner auto-fill), writes a
  `price_history` row for every item actually priced, and inserts a
  `price_alerts` row when the fresh price exceeds the item's own
  `base_price` by at least `spike_pct` — **unless an unacknowledged alert
  for that sku already exists**, so a sustained spike doesn't pile up a
  fresh alert every single day it stays elevated; one unacknowledged alert
  per sku is enough to drive the badge, resolved by staff dismissing it or
  updating the price (which this PR does NOT do automatically — `base_price`
  is never silently overwritten by the scheduled check, matching this app's
  standing "never silently overwrite a manual entry" / "deliberate pricing
  decisions are expected" rule from the original Market Value feature).
  - **Per-game price lookups are a deliberately simpler, single-shot version
    of `cardSearch.js`'s own interactive multi-tier fallback ladders** — this
    runs unattended against the whole tracked catalog on a schedule, so
    request budget across potentially hundreds of items matters more than
    getting any one item exactly right on the first try. A wrong/no match
    for one item just skips it until the next scheduled run, not a blocking
    failure. Field names/endpoints mirror `cardSearch.js`'s own
    already-confirmed shapes exactly (same real APIs, same response fields
    — `scryfallPrice`'s usd→usd_foil→usd_etched→usd_glossy fallback,
    `pokemonTcgplayerPrice`'s market→mid→avg(low,high)→low/high fallback,
    YGOPRODeck's `card_prices[0].tcgplayer_price`, Lorcast's
    usd→usd_foil, and the Egman-backed games' card-list-plus-price-list
    join by `card_code`) — not re-guessed from scratch for this new file.
  - **`MAX_ITEMS_PER_RUN = 200`, a defensive cap** — Edge Functions have a
    real execution time limit, and a shop whose tracked (above-floor)
    catalog eventually grows past this will need a different approach
    (e.g. splitting the check across more frequent runs) rather than
    silently timing out partway through an unbounded batch. Ordered by
    `base_price` descending so the highest-value, highest-spike-risk items
    get checked first if a run ever does have to truncate. Not expected to
    bind for a while at this shop's current catalog size — revisit if it
    ever does, same "parked until it's a real problem" discipline used
    elsewhere in this file.
  - No CORS allowlist, unlike `scan-binder-page`/`card-lookup-proxy` —
    this function is never called from a browser, only from the GitHub
    Actions workflow below.
  - Deploy with `supabase functions deploy price-check`.
- **New GitHub Actions workflow, `.github/workflows/price-check.yml`** —
  daily cron (`7 13 * * *`, a few minutes off the hour to avoid the
  on-the-hour traffic spike most scheduled jobs land on) plus
  `workflow_dispatch` for an on-demand manual run, both just `curl -X POST`
  to the Edge Function's URL. **Requires a `SUPABASE_SERVICE_ROLE_KEY`
  repository secret** (Settings → Secrets and variables → Actions) — used as
  the request's Authorization bearer token so the call passes Supabase's
  default per-function JWT check. This is a genuinely sensitive credential
  (full database bypass, same key the Edge Function itself already has
  automatically) — it must never be logged/echoed, and this is the first
  place in this repo a GitHub Actions secret of this sensitivity is needed
  (contrast with `deploy.yml`, which needs no secrets at all for a static
  GitHub Pages deploy).
- **No in-app UI yet** — db.js gained no new functions in this PR,
  mirroring exactly how Feature A's PR 1 added `dbInsertSales` (the write
  path, called from app code) but not `dbLoadSales` (the read path, which
  landed in PR 2 alongside its UI). Here, the entire write path lives
  inside the Edge Function, not app code, so there's nothing for db.js to
  gain yet — the read-side functions PR 2's in-app badge needs (loading
  settings, loading/acknowledging alerts) are deferred to that PR, same
  split.
- **No automated test coverage for the Edge Function itself** — matches the
  existing, already-accepted gap for `scan-binder-page`/`card-lookup-proxy`
  (Deno, not covered by the Vitest/Playwright suites, and this sandbox has
  no network path to a real Supabase project to exercise it against either
  — see the standing "Manual QA note"). Verified instead by syntax-checking
  the file and manually tracing each provider's request/response shape
  against `cardSearch.js`'s own already-confirmed fields.

**Requires running `phase13_price_tracking.sql`** in the Supabase SQL
Editor, **deploying `price-check`** (`supabase functions deploy
price-check`), and **setting the `SUPABASE_SERVICE_ROLE_KEY` GitHub Actions
repository secret** before the daily check can run at all — no code-side
default masks any of these three being missing.

## Price tracking: fixed a real `catalog.number` crash found on the first manual trigger run

The user's first manual `workflow_dispatch` run after completing PR 1's setup
steps failed immediately: `{"error":"column catalog.number does not
exist"}`. A real bug, not a flake — caught by the user's own manual test,
exactly the kind of real-world verification this project's "Manual QA note"
already relies on for anything this sandbox can't reach Supabase to check
itself.

- **Root cause**: `price-check/index.ts`'s catalog query selected a
  `number` column that was never actually added to `catalog` — confirmed by
  grepping every `alter table catalog add column` migration in this repo:
  only `base_price` (`phase5_market_value.sql`) and `rarity`
  (`phase7_rarity_column.sql`) were ever added. Collector number has always
  been a transient, never-saved search-hint field everywhere else in this
  app (`EditModal`, `ScannerPanel`, the Quote tab's `itemsFromCatalogRows`
  adapter all explicitly discard it before anything gets saved — see those
  sections above) — PR 1 incorrectly assumed it was persisted when writing
  the scheduled checker's own catalog query and per-game numberHint
  narrowing, the one real guess that slipped past this file's own "never
  guess, get a real sample first" discipline.
- **Fix**: dropped `number` from the `catalog` select entirely, and removed
  the now-impossible numberHint narrowing from `pokemonPrice`/`egmanPrice`
  (both now name-match only, same as every other provider in this file
  always was). No other provider function referenced `item.number`, so this
  was the only place affected.
- **Impact going forward**: without a number hint, a same-name/different-
  print disambiguation (e.g. two different printings of the same card name)
  can occasionally pick the wrong print's price — an accepted, pre-existing
  limitation of this scheduled checker's deliberately simpler single-shot
  lookups (see PR 1's own "deliberately simpler... than cardSearch.js's own
  interactive multi-tier fallback ladders" framing above), not a new
  regression from this fix. A wrong-print price only ever affects whether
  *this run's* comparison triggers a spike alert — it's never saved back
  onto the catalog row itself (`base_price` is still never silently
  overwritten by this checker).
- Verified the same way PR 1 itself was (no network path from this sandbox
  to the real Supabase project): syntax-checked the file and grepped for
  any remaining `item.number`/`.number` reference after the edit, finding
  none. Real verification is the next manual `workflow_dispatch` run once
  this fix is deployed.

**Requires redeploying `price-check`** (`supabase functions deploy
price-check`) for this fix to take effect — the previous deploy still has
the crashing query live.

## Price tracking: tracks against `price` ("Our Price"), not `base_price`

The `number`-column fix above got `price-check` running without erroring,
but the very next real manual `workflow_dispatch` run returned
`{"total":0,"checked":0,"spikes":0,"failed":0}` — no crash, but nothing
matched the floor query either. A second real finding, same "the user's own
manual test catches what this sandbox can't" pattern as the fix above.

- **Confirmed, not guessed, before touching any code**: a direct query
  against the real project (`select count(*) filter (where base_price is
  not null) ...`) showed **0 of 599 real catalog items had `base_price`
  set at all.** `base_price` is only ever populated when staff run "Find
  stock image"/"Find market price" and pick a candidate (Sprint 5's Market
  Value feature) — unlike `sales`, there's no backfill script that
  populates it for pre-existing inventory, so a shop whose items were
  mostly added via Import/Scanner without staff separately running a price
  search has essentially nothing with `base_price` set. PR 1's choice to
  gate/compare on `base_price` was a reasonable first guess but didn't
  match this shop's actual data.
- **Fix, confirmed with the user as correct, not just a workaround**:
  `price-check` now gates (`price >= floor_price`) and compares
  (`pctChange` against the fresh lookup) using `catalog.price` ("Our
  Price") instead of `base_price` — every real item has this, since it's
  what the item is actually listed for sale at. The user explicitly agreed
  this is the right comparison for the actual goal here, not merely an
  acceptable substitute: the point of a spike alert is "our listed price is
  now stale relative to the market," which comparing against what's
  currently charged answers more directly than a possibly-never-captured
  reference price would have. `price_alerts.previous_price` now holds the
  item's `price` at check time, not `base_price`. Never writes back to
  `price` — same "never silently overwrite a manual entry" rule already
  documented for the original `base_price` design.
- `price_history` itself is unaffected — it already just logged whatever
  fresh price was fetched, independent of what it gets compared against.
- Not treated as a reversal of PR 1's core design (`price_tracking_settings`
  still exists, same floor/spike-pct shape) — just a correction to which
  existing catalog column the checker reads against, caught by real usage
  immediately after the `number` fix above, in the same first week of
  actual use this feature has had.

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect.

## Price tracking: reduced the failed-lookup count (Pokemon retry budget, excluded ungoverned games)

The first full-volume real run after the `price` fix above succeeded with
no crash and real spikes detected (`{"total":200,"checked":44,"spikes":8,
"failed":156}`), but a 156/200 failure rate was still high enough to dig
into properly rather than ship as-is — same "get a real number before
guessing" approach as the two fixes above.

- **Confirmed via a real query, not guessed**: `select game, count(*) ...`
  against the live project showed the 241 total above-floor items break
  down as 166 Pokemon / 36 Magic / 12 "Other" / 10 One Piece / 9 SWU / 8
  Lorcana — ruling out the canonicalization-mismatch theory considered
  first (every value is a real, legitimate `GAMES` entry, not a stray
  alias `cardToRow`'s own no-op-on-write would have let slip through).
  Two real causes instead:
  - **`"Other"` has no entry in `PRICE_LOOKUPS` at all** — a real,
    legitimate `canonicalizeGame` fallback value (for a game string it
    doesn't recognize), not a bug in itself, but those 12 items could never
    succeed and were only burning slots in the 200-item cap. The user
    separately flagged that some of these are Quote-tab-originated items
    landing in "Other" — a real, separate bug in the Quote→Catalog
    conversion path worth investigating on its own, not guessed at or
    fixed here since it's outside `price-check` entirely.
  - **Pokemon is ~70% of the tracked catalog by volume**, and
    `cardSearch.js` already documents pokemontcg.io's key-less public tier
    as needing anywhere from 3 to 12 *consecutive* 5xx retries in real live
    testing (see that file's own `pokemonQueryUncached` comment) — far more
    than `price-check`'s original single-retry `fetchWithRetry`. With
    Pokemon this dominant, that gap alone plausibly explains most of the
    156 failures.
- **Fix 1 — `fetchWithPokemonRetry`**: a dedicated 4-attempt backoff
  (400ms/1.0s/2.2s, matching `pokemonQueryUncached`'s own proven delays
  exactly) used only for the Pokemon lookup — every other provider keeps
  the lighter single-retry `fetchWithRetry`, since none of them have a
  documented flakiness report anywhere near this severe.
- **Fix 2 — the catalog query now filters `.in("game",
  Object.keys(PRICE_LOOKUPS))`** — excludes "Other" (and Sports Singles,
  which already had no lookup either) at the query level instead of
  wasting a checked slot on something guaranteed to fail. Frees up the
  200-item cap for games that can actually succeed, and makes `failed`
  mean "a real lookup attempt came back empty," not "doomed from the
  start."
- **`failedByGame` added to the response** — a per-game tally of failures,
  so a future high-failure run can be diagnosed straight from the
  workflow's own output instead of needing another round-trip to a SQL
  query, the same way this round's diagnosis required one.
- Real verification is the next manual `workflow_dispatch` run once this
  is deployed — same no-network-path-from-this-sandbox constraint as every
  other fix in this section.

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect.

## Price tracking: added per-failure reason + sample diagnostics instead of guessing a fourth fix blind

The Pokemon retry budget + ungoverned-game filtering above helped
(`failed` dropped from 156 to 144) but didn't come close to fixing it —
and the next run's own `failedByGame` breakdown (`{"Pokemon":99,"Magic":25,
"Lorcana":7,"SWU":9,"One Piece":4}`) raised a new question this app's own
"never guess, get real data" discipline couldn't answer yet: *why* are 99
Pokemon lookups still failing even with a 4-attempt retry? A transient 5xx,
a genuine "no card matched this name," and "found the card but it has no
price data" are three completely different problems with three completely
different fixes — and `failedByGame` alone can't tell them apart.

- **Every per-game lookup function now returns `{ price, reason }`
  instead of a bare price-or-null** — `reason` is one of `fetch_failed`
  (the request never succeeded even after retrying), `no_match` (a real
  response came back with zero results for that name), or `no_price` (a
  card was found, but it carries no usable price field in that provider's
  response) — plus `no_lookup` (the game has no entry in `PRICE_LOOKUPS`,
  shouldn't occur anymore now that the catalog query filters on exactly
  those keys) and `exception` (an uncaught error, same as the plain `catch`
  this already had) from `lookupPrice` itself.
- **The response now also includes `failedByReason` and a capped
  `sampleFailures` list** (15 real `{sku, name, game, reason}` entries) —
  so the *next* high-failure run can be diagnosed straight from its own
  JSON output, without another SQL round-trip the way this round (and the
  `base_price`/`"Other"` rounds before it) needed. Concretely: if the next
  run's `failedByReason` is dominated by `no_match`, the real fix is
  probably in how catalog item names compare to what these APIs actually
  index (special characters, possessive apostrophes — already a
  documented, hard-won problem for Pokemon specifically in `cardSearch.js`
  — or extra qualifying text in a catalog name that isn't part of the
  card's official name); if it's `fetch_failed`, the retry budget itself
  still isn't enough; if it's `no_price`, the cards are being found
  correctly and this is a real, accepted data-coverage gap like the
  Mega Gengar ex/Lillie's Clefairy ex cases already documented elsewhere
  in this file, not a bug to chase further.
- **Deliberately not a fourth guessed fix** — porting `cardSearch.js`'s
  full apostrophe-handling/fallback-ladder logic into this Edge Function
  on spec, without first confirming that's actually what's causing the 99
  Pokemon failures, risks repeating the exact mistake this doc's own
  "never guess an external platform's exact capability" rule exists to
  prevent (see "Workflow conventions" below) — it would also be a real
  chunk of duplicated complexity if the real cause turns out to be
  something else entirely (e.g. a lot of these specific 99 names
  genuinely have no pokemontcg.io entry at all).

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect. The next manual
`workflow_dispatch` run's `failedByReason`/`sampleFailures` output is what
determines what (if anything) gets fixed next.

## Price tracking: found and fixed the real cause (catalog.name has extra text baked in, not an API-reliability problem)

The diagnostics above paid off immediately — the very next run
(`{"failed":142,"failedByReason":{"no_match":96,"fetch_failed":42,
"no_price":4},"sampleFailures":[...]}`) gave real `{name, game, reason}`
examples, and a clear, consistent pattern fell out of them on inspection.
This was never a retry-budget or API-flakiness problem at all — the
previous two rounds' fixes (Pokemon's 4-attempt retry, excluding ungoverned
games) were real, correct improvements, but they couldn't have fixed this
because this was never what was failing.

- **The real cause, confirmed from the actual failing names, not guessed**:
  `catalog.name` routinely has extra text typed straight into it that isn't
  part of a card's real, indexed name —
  - **A collector number**: `"Charizard 4/102"`, `"Blastoise 02"`,
    `"Snorlax - 051"`, `"Vaporeon ex - 149/131"`, `"Dragonite EX -
    098/087"`. Unsurprising once named: `catalog.number` was never a real
    column (see the `catalog.number` crash fix above) — staff had nowhere
    else to put a collector number but Name itself.
  - **A rarity/variant note**: `"Dialga EX (122 Secret Rare)"`, `"Pongo -
    Determined Father (Enchanted)"`.
  - **Several of these stacked**: `"Vampiric Tutor (JP Alternate Art)
    (Silver Scroll Foil)"`, `"Leonardo, the Balance (0083) (Borderless)
    (Surge Foil)"`.
  An exact/near-exact name search on pokemontcg.io (and friends) simply
  never matches a real card's clean name against this extra text — that's
  `no_match`, not a retry-able failure. Separately, **Scryfall's own query
  syntax treats literal parentheses as search-grouping syntax, not plain
  text** — every single Magic `fetch_failed` sample was a parenthetical-
  heavy name, plausibly explaining why Magic (a game with no documented
  API-flakiness report at all, per this app's own `cardSearch.js` notes)
  had a disproportionate share of `fetch_failed` results: not the API
  being down, but a malformed query the parentheses broke.
- **Fix: `cleanCardName(name)`**, applied uniformly to every provider
  (same "apply equally across every game" discipline this app uses for
  every other field-level feature) right before building each search
  query. Strips (1) one or more trailing parenthetical groups, then (2) a
  trailing bare or dash-prefixed collector number (optionally `n/m`).
  Verified directly against all 14 real sample names from the two
  diagnostic runs before shipping (not just reasoned about in the
  abstract) — every noisy name cleaned to its real card name exactly as
  expected.
  - **Deliberately does NOT strip a bare `" - <Words>"` suffix with no
    trailing number** — two of the real sample names are genuine official
    card names in that exact format once their own noise is removed
    (SWU's `"Cad Bane - He Who Needs No Introduction"`, Lorcana's `"Pongo
    - Determined Father"` after stripping its own `"(Enchanted)"` suffix)
    — stripping every dash would have broken those instead of fixing
    anything. Confirmed both are left untouched by the verification pass
    above.
  - **SWU's own `"Cad Bane - He Who Needs No Introduction"` failure stays
    unexplained** — it has neither embedded number nor parenthetical
    noise, so this fix doesn't address it specifically; left for the next
    round's `failedDetail`/`sampleFailures` to reveal if it's still
    failing, rather than guessing a SWU-specific cause now.
- **`failedDetail` added to the response** (a per-game, per-reason
  cross-tabulation, e.g. `{Pokemon: {no_match: 90}, Magic: {fetch_failed:
  20}}`) — this round's diagnosis required manually cross-referencing
  `failedByGame` against `sampleFailures` to notice Magic's failures were
  disproportionately `fetch_failed` while Pokemon's were disproportionately
  `no_match`; this gives that cross-tabulation directly next time.
- Verified the same way every fix in this section has been (no network
  path from this sandbox to any of these providers or to Supabase):
  syntax-checked the file, and ran `cleanCardName` standalone against all
  14 real names collected across both diagnostic rounds, confirming every
  noisy one cleaned correctly and both legitimate dash-containing names
  were left alone.

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect. The next manual
`workflow_dispatch` run's `failed`/`failedDetail` output confirms how much
of the remaining failure count this actually resolved.

## Price tracking: bracket/mid-string-paren stripping, Pokemon Lucene escaping, dash-subtitle fallback tier

The `cleanCardName` fix above worked — `checked` climbed from 58 to 133 and
`failed` dropped from 142 to 67 on the very next real run. Its own
`failedByReason`/`sampleFailures` output (`{"no_match":37,"no_price":10,
"fetch_failed":20}`, 15 real examples) pointed at three more distinct, real
gaps — not retry-budget or volume noise this time, confirmed by inspecting
the actual failing names rather than guessed:

- **A bracketed annotation survived untouched** — `cleanCardName` only ever
  stripped `(...)` groups, never `[...]` ones. `"Misty's Psyduck [W
  Stamped]"` (a grading/stamp annotation, same category as every other
  bracket/paren annotation already stripped elsewhere in this file) went to
  pokemontcg.io completely unstripped.
- **A *mid-string* parenthetical group survived too** — the original regex
  anchored to a trailing run of groups at the very end of the string, so
  `"Sheoldred, the Apocalypse (Textured Foil) - Dominaria United (DMU)"`
  only had its trailing `(DMU)` stripped; the non-paren `" - Dominaria
  United"` text broke the anchor, leaving `(Textured Foil)` in place to trip
  Scryfall's own literal-parens-as-grouping-syntax problem again (this
  file's own already-documented cause of Magic's disproportionate
  `fetch_failed` share). Every parenthetical/bracketed group seen across
  every real sample collected in this whole debugging arc has been an
  extraneous annotation, never part of a card's actual name — so
  `cleanCardName` now strips every such group anywhere in the string
  (`replace(/\([^)]*\)/g, ...)`/`replace(/\[[^\]]*\]/g, ...)`), not just a
  trailing run of them. A safe generalization of the same already-verified
  assumption, not a new guess.
- **`pokemonPrice` never applied any of cardSearch.js's own already-
  confirmed Lucene-escaping fixes** — it wrapped the cleaned name directly
  in a `name:"..."` field with zero sanitization, despite this exact file
  documenting (`sanitizeStrippingPossessive`) that pokemontcg.io's `q=` is a
  Lucene-like query string where an unescaped apostrophe/bracket/etc. can
  break the query outright, confirmed via extensive real live testing for
  the interactive search. Ported `sanitizeForPokemonQuery` (strip a trailing
  possessive `'s`, then every other Lucene special character) directly into
  `pokemonPrice`'s query building — this file's own header already says
  every provider's shapes mirror cardSearch.js's already-confirmed ones
  instead of being rebuilt from scratch, so this is a port, not a guess.
- **A real dash-subtitle card name still failed `no_match` after every
  cleanup above** — `"Pongo - Determined Father"` (Lorcana) and `"Cad Bane -
  He Who Needs No Introduction"` (SWU) are both confirmed-real card names
  (not noise to strip), and both have now failed three consecutive real
  runs as a single exact-phrase query. Rather than guess at either
  provider's exact matching behavior, added a second, narrower fallback
  tier (`dashFallbackNames`/`withNameFallback`) — if the full cleaned name
  comes back `no_match`/`fetch_failed`, retry once with just the text
  before the first `" - "`. Same "narrower tier fails, fall through to a
  broader one" ladder discipline cardSearch.js's own interactive search
  already uses everywhere, applied generically across every provider
  (including Magic, where it turns out to also fix
  `"Sheoldred, the Apocalypse - Dominaria United"` — once its two paren
  groups are stripped, the dash-fallback's second tier is exactly
  `"Sheoldred, the Apocalypse"`, the correct real card name). Only tried
  when the full name already failed, so it can never override a query that
  already succeeds, and a confirmed match (including a `no_price` one —
  found the real card, just no usable price field) stops the ladder
  immediately rather than risking a second, possibly-wrong card.
- **Verified against all 15 real sample names from this round before
  shipping**, same discipline as the `cleanCardName` fix itself — ran
  `cleanCardName`/`dashFallbackNames`/`sanitizeForPokemonQuery` standalone
  and confirmed: the bracket and mid-string-paren cases clean correctly,
  the dash-subtitle fallback produces exactly the right second-tier name
  for `Cad Bane`/`Pongo`/`Sheoldred`, and no previously-working name (plain
  single-word names, "ex"/"VSTAR"-suffixed Pokemon names with no dash) is
  affected by any of these changes.
- **Deliberately left unfixed, not guessed at**: the Pokemon-GX hyphen
  question (`"Moltres & Zapdos & Articuno GX"`/`"Pikachu & Zekrom GX"` —
  pokemontcg.io's own card names for this era are widely reported to use a
  hyphen directly before `GX`/`EX`, e.g. `"-GX"`, not a space) has no
  precedent anywhere in this codebase to port the way the Lucene-escaping
  fix did, and guessing the exact hyphenation rule risks the same mistake
  this file's own "never guess an external platform's exact capability"
  rule exists to prevent. Left as a documented, accepted gap — revisit with
  a real confirmed sample if it's still showing up in a future run's
  `sampleFailures`. A card with genuinely no usable price anywhere on the
  provider (`"Mega Greninja ex"`, same documented data-gap class as the
  Mega Gengar ex/Lillie's Clefairy ex cases elsewhere in this file) and a
  handful of Pokemon `fetch_failed`s on plain, unremarkable names (e.g.
  `"Gengar"`) under this run's much higher real request volume (133
  checked, vs. 58 the run before) are both treated as the accepted residual
  noise this file already expects, not something to chase further.

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect. The next manual
`workflow_dispatch` run's `failed`/`failedByReason`/`sampleFailures` output
confirms how much of the remaining 67 this actually resolved.

## Price tracking: hit Supabase's real 150s idle timeout, fixed with an in-run wall-clock deadline

The very next manual trigger after the fix above didn't return a price
report at all — it returned a real platform error instead:
`curl: (22) The requested URL returned error: 504` /
`{"code":"IDLE_TIMEOUT","message":"Request idle timeout limit (150s)
reached"}`. Not a guess to diagnose — Supabase names the exact limit in the
error itself: Edge Functions have a hard, non-adjustable 150-second idle
timeout per invocation.

- **Why this showed up now, not earlier**: every fix before this one made
  *more* lookups actually succeed (`checked` climbed from 58 to 133 on the
  same 200-item run two fixes ago) — more successful lookups means more
  total request/retry time spent, not less, since a successful match still
  has to make the request(s) first. The dash-subtitle fallback tier added
  last round doubles the request count for any name containing `" - "`
  that doesn't match on the first try, and Pokemon's existing 4-attempt
  backoff can burn up to ~3.6s of pure delay on a single item before
  failing. None of this was wrong on its own — each fix was a real,
  verified improvement — but their combined cost finally pushed one run's
  total wall-clock time past the platform's hard wall.
- **`MAX_ITEMS_PER_RUN` alone can't prevent this** — it bounds how much
  work might be *attempted*, not how long that work actually *takes*, and
  per-item latency varies enormously (a plain single-request match vs. a
  Pokemon item needing its full retry budget vs. a dash-fallback's second
  request). Lowering it would only mask the problem until catalog
  composition or provider latency shifted again.
- **Fix: `RUN_DEADLINE_MS` (120000ms), a real wall-clock budget checked
  inside the run itself** — before starting each item's lookup, the
  worker now checks elapsed time since the run began; once it crosses
  120s (a 30s margin under the documented 150s limit, left for the final
  DB round-trips and response serialization), no new lookups start. An
  already-in-flight request at that moment is allowed to finish naturally
  (`runWithConcurrency` doesn't cancel in-flight work) — only *new* work
  stops, so total time can't keep climbing past the deadline. Items that
  never got started this way are simply left unchecked; they're picked up
  on the next scheduled run, same as anything that fell outside
  `MAX_ITEMS_PER_RUN`'s own cap.
- **`truncated`/`skippedForTime` added to the response** — same
  diagnose-from-the-response-alone philosophy as `failedByReason`/
  `sampleFailures` above: a non-zero `skippedForTime` on a future run is
  the real, direct signal that `MAX_ITEMS_PER_RUN`/`CONCURRENCY` need
  tuning (or that catalog growth has outpaced a single daily run, the
  scenario `MAX_ITEMS_PER_RUN`'s own original comment already anticipated
  — "a shop whose tracked catalog grows past this will need a different
  approach, e.g. splitting across more frequent runs") — instead of
  waiting for another 504 to notice.
- **Deliberately not a concurrency increase** — raising `CONCURRENCY`
  above 3 would also cut wall-clock time, but it would do so by firing
  more simultaneous requests at providers this file has already spent
  several rounds proving need *conservative* request pacing (pokemontcg.io
  specifically — see its own documented flakiness under load elsewhere in
  this file). A time budget inside the run achieves the same "don't blow
  past 150s" goal without touching the concurrency level that keeps those
  providers reliable.
- Verified the same way every fix in this section has been (no network
  path from this sandbox to Supabase or any of these providers):
  syntax-checked the file and traced the deadline-check placement by hand
  to confirm it sits before the network call within the worker (so a
  skipped item genuinely makes zero requests) and that `skippedForTime`
  increments exactly once per skipped item.

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect. The next manual
`workflow_dispatch` run's `truncated`/`skippedForTime` fields confirm
whether this run actually needed the budget, or completed well within it.

## Price tracking: split into several batched invocations instead of one, with a self-healing offset

The very next manual trigger after the deadline fix above confirmed it
worked (no more 504), but also surfaced the real, deeper problem the
deadline could only paper over: `{"total":200,"checked":70,"failed":31,
"truncated":true,"skippedForTime":99,...}` — only 101 of 200 scoped items
ever got attempted. Asked directly: is there a way to reduce
`skippedForTime`? The honest answer led to a bigger realization than a
simple tuning knob — the catalog query (`order by price desc`, a fixed
start at offset 0) and the worker's own in-array-order consumption mean
the same ~101 highest-priced items get processed on *every* run, and the
same ~99 lowest-priced-within-the-200-cap items get skipped on *every*
run, forever — not "picked up next time" the way the deadline fix's own
original comment assumed. A skipped item only gets a second chance if
something about the run actually changes, and nothing about a daily
re-run of the same query does.

- **Fix: batch the catalog into several smaller Edge Function invocations
  instead of one, each getting its own fresh 150s clock** — the user's own
  proposed shape (split into batches of ~99-100, then join the results).
  `price-check`'s `Deno.serve` handler now reads `offset`/`limit` from the
  POST body (`{"offset": 100, "limit": 100}`), using them in a real
  `.range(offset, offset + limit - 1)` instead of the old fixed
  `.limit(MAX_ITEMS_PER_RUN)` — `limit` is still clamped to
  `MAX_ITEMS_PER_RUN` (200) regardless of what's requested, and both
  default to `{offset: 0, limit: MAX_ITEMS_PER_RUN}` when no body is sent
  at all, so an ad-hoc manual curl with no body still behaves exactly like
  before this change.
- **The orchestrating loop lives in `.github/workflows/price-check.yml`,
  not the Edge Function** — a bash loop POSTs successive `{offset, limit}`
  bodies (`BATCH_SIZE` defaults to 100, overridable via a
  `workflow_dispatch` input), reading each batch's JSON response with `jq`
  (preinstalled on GitHub-hosted runners) and accumulating `checked`/
  `spikes`/`failed`/`skippedForTime` into one combined summary printed at
  the end — the actual "join" asked for, not just back-to-back logs. Each
  batch is its own real Edge Function invocation with its own fresh 150s
  idle-timeout clock, so a batch sized well under the catalog's observed
  throughput (100 items took ~120s in the run that surfaced this) should
  normally complete without even needing `RUN_DEADLINE_MS` to trip.
- **The critical design choice: the next batch's offset advances by the
  previous batch's own `attempted` count (`checked + failed`, now returned
  in the response), not by a fixed `BATCH_SIZE`.** This is what makes a
  batch's own internal truncation self-healing instead of a second,
  compounding skip: if a batch still somehow runs long and
  `RUN_DEADLINE_MS` trips partway through it, that batch's untouched tail
  simply becomes the start of the very next batch, automatically, with no
  separate retry logic needed. Verified with a standalone bash simulation
  (three mock batch responses, the first deliberately truncated at
  `attempted: 85` of a requested 100) before shipping — confirmed the
  second batch's logged offset was exactly 85, not 100, and the final
  combined totals summed correctly across all three.
- **The loop stops once a batch's `total` (the real row count returned for
  that slice) comes back smaller than the requested `BATCH_SIZE`** — that
  slice reached the end of the above-floor, governed-game catalog, so
  there's nothing left to join. A `MAX_BATCHES` safety cap (20, covering up
  to 2000 tracked items at the default batch size) guards against an
  unbounded loop the same defensive-cap reasoning `MAX_ITEMS_PER_RUN`
  itself already documents, just moved up a level now that a single run
  can span several invocations; a separate `attempted <= 0` guard stops the
  loop outright if a batch somehow makes zero progress, rather than looping
  forever on an offset that never advances.
- **A real side effect, not the original goal**: this removes the old
  fixed 200-item-per-day ceiling entirely. The previous design could never
  check more than the top 200 above-floor items by price no matter what —
  a real, separate starvation gap for anything ranked 201st or lower (the
  live project had 241 such items a few rounds back). Walking the catalog
  in batches until a short page is returned means the *whole* tracked
  catalog gets checked every day now, not just a fixed-size head of it.
- **Deliberately not a concurrency increase** — same reasoning already
  documented in the deadline-fix section above: raising `CONCURRENCY`
  would also help throughput, but at the cost of firing more simultaneous
  requests at providers (pokemontcg.io specifically) this file has already
  spent several rounds proving need conservative pacing. Splitting into
  more invocations achieves more total throughput per day without
  touching the request rate any single provider sees at once.
- Verified the same way every fix in this section has been (no network
  path from this sandbox to Supabase or any of these providers):
  syntax-checked the Edge Function file, and ran the orchestrating bash
  logic standalone against three mocked batch responses (including the
  deliberately-truncated-first-batch case above) to confirm the offset
  math, the short-page stop condition, and the combined-totals join all
  behave as intended before touching the real workflow file.

**Requires redeploying `price-check`** (`supabase functions deploy
price-check`) for the `offset`/`limit`/`attempted` changes to take effect —
the workflow's new batching loop depends on the Edge Function actually
honoring those request fields. The next scheduled or manual run's combined
summary (and the per-batch logs above it) confirm whether `skippedForTime`
is finally zero across a full day's catalog.

## Price tracking: batching worked — `skippedForTime: 0`, and ported the missing half of Pokemon's possessive-name fix

The first real manual trigger run after the batching fix deployed
confirmed it fully worked: three batches (100/100/33, covering the whole
233-item above-floor governed-game catalog) each came back
`"skippedForTime":0`, with real spikes finally detected (7) — the
core reliability problem this whole arc has been chasing (504s, then
permanent per-run starvation) is resolved.

Inspecting the combined 54 real failures across all three batches'
`sampleFailures` surfaced one more real, well-evidenced cluster, not
generic noise: **`"Cynthia's Garchomp ex"`, `"Ethan's Ho-Oh ex"`, `"Lillie's
Clefairy ex"`, `"Rocket's Wobbuffet"`, `"N's Zoroark ex"`, `"Lillie's
Ribombee"`, `"Iono's Kilowattrel"`, `"Misty's Psyduck"`** — every
possessive Pokemon trainer name in the batch failed `no_match`.

- **Root cause: this file only ever ported half of cardSearch.js's own
  already-proven possessive-name fix.** `cardSearch.js`'s `searchPokemon`
  (see its own extensively-documented history earlier in this file) found
  that neither "strip the possessive `'s` outright" nor "keep the
  apostrophe literally" is correct on its own for pokemontcg.io's index —
  it hedges by trying BOTH representations at every precision tier. This
  file's own `sanitizeForPokemonQuery` (added in the previous
  "bracket/mid-string-paren" fix) only ever implemented the *stripping*
  half — functionally identical to cardSearch.js's `sanitizeStrippingPossessive`,
  despite being named after the plainer, no-possessive-handling function —
  and never tried the "keep the apostrophe" fallback at all.
- **Fix**: renamed that function to `sanitizeStrippingPossessive` (matching
  what it actually does) and added the missing `sanitizeKeepingApostrophe`
  counterpart, both ported verbatim from `cardSearch.js`. `pokemonPrice`
  now tries both representations in order (stripped first, same as
  `searchPokemon`'s own tier order), stopping at the first one that finds a
  real match or a confirmed no-price result — identical to the dash-subtitle
  fallback's own "stop at first real signal" rule. For the overwhelming
  majority of names with no apostrophe at all, both representations are
  identical, so this costs the same single request as before; only a
  possessive name pays for a second attempt, and only until one succeeds.
- **Verified against all 10 real possessive-name failures from this run
  before shipping** (plus a plain non-possessive control name) — confirmed
  every one now produces two distinct, sensible query variants, and that
  the common case (`"Gengar"`) still collapses to a single request
  unaffected by this change.
- **Left everything else from this run's failures as accepted, already-
  documented residual noise**: the Pokemon `-EX`/`-GX` hyphen question
  (`"Virizion EX (Full Art)"`, `"Dialga GX (Full Art)"`, `"M Blastoise EX
  (Full Art)"`, `"Sylveon GX"`, `"Giratina EX"` — all parked in the
  previous round, still no confirmed sample to act on), genuine no-price
  data gaps on real matched cards (`"Strip Mine"`, `"Pokemon Breeder"`,
  `"Brain Freeze"`, `"Mega Greninja ex"`), a literal multi-card bundle with
  no single-card entry to match (`"Legendary Birds Promo Pack"`), and a
  catalog entry with a placeholder name (`"______'s Pikachu"`) — none of
  these are new, and none have a real precedent to port the way the
  possessive fix did.

**Requires redeploying `price-check`** again (`supabase functions deploy
price-check`) for this fix to take effect. The next run's combined
`failedByReason`/`sampleFailures` output confirms how much of the
possessive-name cluster this actually resolved.

## Cost tracking: a `cost` field for tax/profit reporting, deferred from the original sales-reporting scope cut

Real ask, while the price-check investigation above was in progress: include
what the shop paid for a sold item alongside what it sold for, so the
Reports tab can feed a real tax/profit breakdown, not just revenue/volume.
This is the explicitly deferred initiative both "Sales reporting" and
"Price tracking & spike alerts" above flagged as a separate, later
extension — "most inbound paths (Scanner, Import) never capture what the
shop paid for an item at all; only Quote-tab trade-ins have a real payout
amount." Two design forks were confirmed with the user before building,
since this feeds a number people may file taxes from — not something to
guess at:

- **Quote-trade-in items auto-fill Cost from the quote's real payout
  math** (not left manual like everything else) — the one inbound path
  where the real cost is already knowable without extra staff work.
- **CSV/XLSX import stays manual-entry-only for this first version** — no
  Cost column added to the import mapping screen yet, matching this
  roadmap's own established "ship the minimal, independently-useful
  version first" pattern (the `sales` table's own write hook, Feature B's
  in-app-badge-only v1, etc.).

**Schema** (`phase14_cost_tracking.sql`): `cost numeric`, nullable, no
default, added to `catalog`, `sales`, and `sorting_queue` — same "never
force a value" discipline as `catalog.base_price`. `sorting_queue` needs
its own real column (not just `quotes.items`' schema-less jsonb) for the
same reason `source_url` did (`phase11_quote_source_url.sql`): an accepted
quote's items pass through that relational table on their way to becoming
a Catalog row, and a value with no column there is silently dropped at
that hop. `cost` is a **per-unit** figure throughout, same convention as
`price` — `computeSalesReport` multiplies both by `qtySold` to reach a
sale's real totals, exactly mirroring how it already treats `salePrice`.

- **Manual entry**: a new Cost ($) field in `EditModal`'s Quantity &
  pricing section, right under Our price — optional, blank by default,
  staff fill it in by hand wherever known (Scanner/Import/manually-added
  items have no other way to get one). `normalizeCard`/`cardToRow`/
  `rowToCard` carry it through the same way `basePrice` already does.
- **Quote-trade-in auto-fill — `computeQuoteItemCosts` in
  `quoteUtils.js`**, called from `App.jsx`'s `handleSaveQuote` right
  before `buildSortingItemsFromQuoteItems`, at the moment a quote is
  accepted. The real problem this function has to work around: a quote's
  own `payoutAmount` is the one real "what we actually paid" number, but
  it's a single lump sum with **no per-item "selected tier" ever
  persisted** — `QuoteDetail.jsx`'s own `addOnsApplied`/`bulkApplied`
  toggles are local component state only, reset every time the modal
  reopens, never saved onto the quote row. Rather than guess at a field
  that doesn't exist, the function instead: (1) picks whichever of the
  three configured tiers' live totals (`computeOfferTiers`) is numerically
  closest to the real `payoutAmount` — the tier staff most likely actually
  used, possibly with a small manual adjustment; (2) allocates the real
  payout proportionally across every non-add-on item, weighted by that
  item's own value **at that tier** (so a card with its own Alter %
  delta — `pctAltered`/`pctDelta` — gets a proportionally bigger/smaller
  slice, same as it already does in the live tier display), scaled so the
  per-item shares always sum to exactly `payoutAmount` regardless of any
  manual rounding or a fully hand-typed payout; (3) divides each item's
  allocated line share by its own `qty`, since `cost` is per-unit, not
  per-line. A bulk-flagged item's weight is its own `flatItemAmount` (the
  flat lot value), not a per-card price × qty, matching how
  `computeOfferTiers` already treats it. Returns a new items array;
  `isAddOn` items pass through completely unchanged (they never reach
  Sorting/Catalog, so cost has no meaning for them).
  - **A known, accepted imprecision, not a bug**: this does NOT try to
    exclude whatever portion of `payoutAmount` came from add-ons folded in
    via "Add to payout" — that amount isn't separately recoverable once
    folded into the single `payoutAmount` figure (see the
    `addOnsApplied`/`bulkApplied` local-state problem above), so a quote
    with add-ons applied will slightly overstate real cards' allocated
    cost. Flagged here rather than silently assumed away.
  - `buildSortingItemsFromQuoteItems`/`buildCatalogItemsFromQuoteItems`
    both carry `item.cost` through to their output, same mechanical
    pattern `sourceUrl` already established — a Sorting-placed-individually
    item's cost survives the trip; a Bulk-placed item's does not, since
    `buildBulkCatalogItem` never reads/writes `cost` at all (no per-print
    identity on a Bulk row, same reasoning it already excludes price/set/
    rarity/sourceUrl).
- **`sales.cost`** is snapshotted from `catalog.cost` at Mark Sold time
  (`App.jsx`'s `handleBatchSell`), same "snapshot at the time" discipline
  `sale_price`/`qty_sold`/`condition` already use on this table — a sale's
  recorded cost must never retroactively change just because the
  (possibly already-deleted) catalog row's own cost gets edited later.
- **`computeSalesReport` (`reportUtils.js`)** now also returns `cost`
  (sum of `cost × qtySold` over sales that actually have one), `profit`
  (`revenue - cost`), and `costUnknownCount` (how many sale rows have no
  recorded cost) — both overall and per-game in `byGame`. A sale with a
  null cost contributes 0 to the cost sum (same null-handling rule
  `salePrice` already has) but is also separately counted in
  `costUnknownCount`, so the Reports tab can show an honest "N sales have
  no recorded cost" caveat instead of implying `profit` is complete when
  some of the underlying sales simply never had a cost captured.
- **`ReportsTab.jsx`** gained Cost/Profit stat tiles next to the existing
  Units/Revenue ones, a Cost/Profit column in the by-game breakdown table,
  a Cost column in the per-sale drill-down (rendering `—` for a null cost,
  same convention the Price column already uses), and the
  `costUnknownCount` caveat line. The toolbar's explanatory text was
  rewritten from "not a profit report (no cost basis is tracked yet)" to
  describe what Cost/Profit actually reflect now.
- Covered by new tests in `reportUtils.test.js` (cost/profit summation
  including the per-unit × qty multiplication, the null-cost-excluded-but-
  counted behavior, and the per-game breakdown), `quoteUtils.test.js`
  (`computeQuoteItemCosts` directly — the closest-tier pick, proportional
  allocation matching a real payout exactly, the Alter %-delta weighting,
  bulk-item flat-value weighting, per-unit division for a multi-qty item,
  and `isAddOn` items passing through untouched), `cardUtils.test.js`
  (`normalizeCard`'s cost parsing), and a new `e2e/reports.spec.js` test.
  - **Verification note**: this sandbox has no network path to
    `cdn.sheetjs.com` (the `xlsx` dependency's CDN source — see "Known
    constraints" above), which blocks `npm install`/`npm run build`/
    `npm run test:e2e` entirely in this environment, not just anything
    import-related. Unit tests were run successfully (342 passing,
    including every new case above) by temporarily stripping `xlsx` from
    `package.json` for a local-only install, never committed. The new e2e
    test could not be run end-to-end here for the same reason — confirmed
    by a real attempt, which failed at the same page-load step for every
    spec in the file (including the three pre-existing, already-passing
    ones), not just the new test, pointing at the missing `xlsx` dependency
    breaking the whole app bundle rather than anything in this change.

**Requires running `phase14_cost_tracking.sql`** in the Supabase SQL
Editor before this code can save/read `cost` on `catalog`/`sales`/
`sorting_queue` — no code-side default masks a missing column here, so an
Edit save, a Mark Sold, or an accepted quote's Sorting handoff would start
throwing a real insert/update error rather than silently dropping the
value.

## Cost tracking: fixed CI — Cost/Profit stat tiles need their own locator, not a bare text match

The Cost/Profit PR's own CI run came back red on real failures, not sandbox
noise this time (this repo's `npm ci` has working `cdn.sheetjs.com` access
in CI, unlike this sandbox) — `unit` was green, `e2e` failed four of five
specs in `reports.spec.js` on both the Desktop and Mobile projects.

- **Root cause**: every new Cost/Profit number this feature added can
  render a dollar string that already exists somewhere else on the same
  page, and this file's e2e tests asserted on `page.getByText('$X.XX')`
  with no scoping — a bare text match against the *whole page*, not a
  specific element. Two real collisions: (1) when a sale has no recorded
  cost, `cost` is 0 and `profit` equals `revenue` exactly — the pre-existing
  "this month's totals" test's own `getByText('$145.00')` started matching
  both the Revenue tile and the new Profit tile; (2) the new Cost/Profit
  test's `getByText('$20.00')` matched both the new Cost stat tile *and*
  the by-game table's own Cost column for Pokemon, which happens to show
  the identical figure for a single-sale-per-game seed. Playwright's text
  locators match hidden *and* visible elements with no visibility filter by
  default, and `toBeVisible()`/`toHaveCount()` against a multi-match
  locator is a real strict-mode violation, not a flake — this would have
  failed consistently, every run.
- **Fix**: `ReportsTab.jsx`'s four stat tiles (`Units sold`/`Revenue`/
  `Cost`/`Profit`) each gained a dedicated `className`
  (`stat-tile stat-units`/`stat-revenue`/`stat-cost`/`stat-profit` — plain
  marker classes, no new CSS rules) specifically so a test can address one
  tile without depending on which other number on the page happens to
  render the same string. `reports.spec.js`'s two affected assertions now
  scope to `page.locator('.stat-revenue')`/`.stat-cost`/`.stat-profit`
  instead of a bare `getByText`, matching the already-established
  `.n-name`/`.n-sub`-style scoped-locator pattern used throughout this
  suite's other spec files rather than introducing a new pattern.
- **A fifth CI failure that run, `[Mobile] e2e/catalog.spec.js:21`
  (`getByText('Edit')` expected 0, got 1), was first assumed unrelated to
  this PR** — reasoned (wrongly) from `main`'s own most recent push run
  independently failing its `unit` job on an unrelated flake
  (`CatalogTable.test.jsx`'s 400-row render test timing out at Vitest's
  default 5s limit), taken as evidence this repo's CI already carries some
  flakiness. **That reasoning didn't hold up**: a direct check of that same
  main-branch run's own `e2e` job (not just the failing `unit` job) showed
  it passed cleanly — so the Mobile catalog test was never flaky on the
  commit this PR branched from, and the failure reappeared identically
  (not just once but across both the initial attempt and its retry) once
  this PR's commits were on top of it. That's a real regression this PR
  caused, confirmed by checking the base commit's actual job outcome
  instead of inferring unrelatedness from a different job's own failure.
- **Real root cause**: `ReportsTab.jsx`'s always-visible toolbar paragraph
  (describing what Cost/Profit reflect) contained the literal substring
  "Edit" — `"...entered on their catalog row (Edit modal) or auto-filled
  ..."`. Every tab in this app stays mounted at all times (just hidden via
  `.panel`'s CSS, never conditionally rendered — see the Reports tab's own
  design note above), and Playwright's `getByText()` matches hidden DOM
  content with no visibility filter, same lesson as the stat-tile fix
  above just manifesting on a completely different tab's test. Catalog's
  own pre-existing Mobile test asserts `page.getByText('Edit')).toHaveCount(0)`
  with no scoping at all, so once Reports' own (unrelated, always-mounted)
  copy started containing that substring too, the count went from the
  real 0 to a real 1 — not from anything Catalog itself changed.
- **Fix, two parts**: (1) reworded the actual source — `ReportsTab.jsx`'s
  toolbar text now reads `"...entered on their catalog row (via the item's
  detail screen) or auto-filled..."`, removing the colliding substring
  entirely (checked case-insensitively too, since Playwright's default
  text match isn't case-sensitive — no stray lowercase "edit" either).
  (2) hardened `catalog.spec.js`'s own assertion defensively, since the
  underlying fragility (a bare page-wide `getByText` in an app where every
  tab's content is always in the DOM) will keep producing this exact bug
  class as more tabs accumulate more copy — scoped both of that test's
  `getByText('Edit')` calls to `page.locator('.catalog-card')` instead of
  the whole page, matching the same scoped-locator pattern the stat-tile
  fix above already established.
- Verified locally the same way every e2e-adjacent fix in this file has
  been given this sandbox's lack of `cdn.sheetjs.com` access: grepped
  every component for a remaining "Edit"/"edit" substring that could
  collide with an always-mounted tab (only `StaffDocs`' own section files
  still say it, but those render on a completely separate `?help=1` route
  never mounted alongside the main tabbed app, so they can't collide the
  same way) — real confirmation is CI's own next run on the real bundle.

## Reports: Edit Sale on the per-game drill-down, to correct a past sale

Real ask right after Cost/Profit shipped, before merge: a way to fix a
mistake on an already-recorded sale (a typo'd Name/Condition, a wrong
Price/Cost, a misrecorded Sold date) without going into the Supabase SQL
Editor by hand — the same manual-backfill route this doc's own "Cost
tracking" section above describes for historical sales that predate the
`cost` column entirely.

- **Editing a `sales` row is safe despite this table's own "append-only,
  never updated or deleted" framing** (`phase12_sales_history.sql`'s header
  comment, quoted verbatim earlier in this file) — that framing was about
  the *app* never silently rewriting a sale's history on its own (e.g. if
  the source catalog row later changes), not a hard rule against a staff
  member correcting a real mistake they typed in by hand. Confirmed, not
  assumed, before writing any code: the migration's own RLS policy
  (`"authenticated full access" ... for all ... using (true) ... with check
  (true)`) already grants `authenticated` full UPDATE access — the table was
  never actually locked down to insert-only at the database layer, so this
  needed no new migration, just application code that previously chose not
  to use that access.
- **`db.js` gained `dbUpdateSale(sale, toast)`**, reusing the existing
  `saleToRow` mapper `dbInsertSales` already has (an update and an insert
  land on the same columns) — `.update(saleToRow(sale)).eq('id', sale.id)`,
  same void-return/toast-on-error convention as this file's other
  `dbUpdate*` functions (`dbUpdateTicketStamp`/`dbUpdatePlatformStatus`).
- **Scope: every stored field except `id`/`sku` is editable** — Name, Game,
  Condition, Qty sold, Sale price, Cost, and Sold date, via a new
  `EditSaleModal.jsx` (same `.overlay`/`.modal` system, explicit Cancel/Save
  buttons, no backdrop-close, matching this app's standing modal
  convention). Game uses the same canonical `GAMES` list every other Game
  field in this app does. Sold date is edited as a plain `<input
  type="date">` (losing intraday precision, matching every other date-only
  picker already in this app, e.g. Quote's Date quoted field) — the fix
  keeps the sale's original time-of-day and only replaces the calendar
  date, so two sales corrected onto the same day don't lose their relative
  ordering within it. `sku` is shown nowhere in the form — it's an internal
  reference that may no longer point at a real catalog row at all, not a
  human-correctable field.
  - **A real, deliberate side effect of allowing Game/Sold-date edits**: if
    a correction moves a sale's Game or Sold date, that row can simply stop
    appearing in the currently-open drill-down or date range after the
    save — the same "it moved, not a bug" behavior a real correction should
    have, not a defect to guard against.
  - **Found and fixed a real accessibility gap while building this
    modal, not after**: this app already hit the "a `<label>` that's a
    visual sibling with no `htmlFor` isn't actually associated with its
    input" problem once before (`LocationPicker`'s own unlabeled `<select>`,
    see the "Rarity field gained a `<datalist>`..." section above) — rather
    than reintroduce that same gap in a brand-new modal, every field here
    uses a real `htmlFor`/`id` pair from the start, which is also what lets
    its own e2e test locate the Cost field via `getByLabel('Cost ($)')`
    instead of a fragile position- or placeholder-based locator.
- **`ReportsTab.jsx`** gained an `editingSale` state and an Edit button in
  each drill-down row (next to Sold date) — clicking it opens
  `EditSaleModal` for that one sale. On Save, `ReportsTab` patches its own
  local `sales` array by `id` immediately (there's no Realtime subscription
  on this table — see the Reports tab's own on-demand-fetch design note
  earlier in this file — so nothing else would reflect the correction
  otherwise) and fires the real `dbUpdateSale` write in parallel through a
  new `onUpdateSale` prop (`App.jsx`'s `handleUpdateSale`, a thin
  passthrough — `sales` isn't top-level App.jsx state, so there's nothing
  else for that handler to update). `editingSale` resets to `null`
  whenever the date range changes, same as the existing `expandedGame`
  reset, so a stale edit targeting a row from a previous fetch can't linger.
- Covered by new tests in `db.test.js` (`dbUpdateSale`'s row shape matched
  by id, and its error-to-toast path) and a new `e2e/reports.spec.js` test:
  opens a seeded Pokemon sale's drill-down, edits its Cost via the real
  modal, confirms the Cost/Profit stat tiles update live with no reload,
  and reads `window.__HARNESS_DB__.sales` directly to confirm the real
  write landed, not just local state — same direct-DB-read pattern already
  established for the Mark Sold test in `e2e/catalog.spec.js`.
  - **Not independently verified end-to-end in this sandbox**, same
    standing constraint as every other e2e-adjacent change in this file:
    no network path to `cdn.sheetjs.com` blocks a real `npm install`/
    `test:e2e` run here. A local attempt via the usual temporary
    xlsx-stripped install reproduced the same whole-bundle-broken state
    already documented elsewhere (every spec in the file fails at the same
    first-tab-click step, including the five pre-existing, already-passing
    ones) — confirming nothing about this change specifically is reachable
    to verify here. Real confirmation is CI's own next run.

## Reports: fixed CI — Edit Sale's own drill-down table needed .table-scroll on Mobile

That "not independently verified end-to-end" caveat right above turned out
to matter: CI came back with `unit` green but `e2e` red on exactly one
spec, `[Mobile] e2e/reports.spec.js` — "Edit sale corrects a past sale" —
failing (both its initial attempt and its retry) at the very first step,
clicking the new Edit button, with Playwright reporting a `<td>` (the Sold
date cell) and the `costUnknownCount` `.status-line` div "intercepting
pointer events" at the click point.

- **Root cause**: the drill-down table gained a 7th column (the new Edit
  button) with no mobile-specific handling at all — unlike `CatalogTable`,
  which swaps to a whole different card layout under its own 700px
  breakpoint, this table (and the by-game table above it) has always just
  been a plain `<table>`, never wrapped in the `.table-scroll` class this
  app already uses elsewhere (`CatalogTable`'s own table, `QuotesTab`'s)
  specifically to let an overly-wide table scroll within its own bounded
  box instead of overflowing the page. Six narrow columns apparently stayed
  under the threshold that would force real page overflow on a 390px
  (Pixel 7) viewport; the 7th (Edit button) tipped it over. The resulting
  symptom — an unrelated element elsewhere on the page "intercepting"
  clicks meant for something further down — is the exact same signature
  this app already diagnosed once before for `.docs-callout`'s own overflow
  bug (see that section above): real horizontal overflow forces a mobile
  browser's auto-zoom-to-fit, which desyncs the page's actual on-screen
  layout from Playwright's precomputed click coordinates. `body`'s own
  `overflow-x: hidden` safety net (added for that earlier bug) only clips
  overflow at the very top level — it doesn't stop a table nested several
  levels down from forcing its own row, and therefore the page, wider in
  the first place.
- **Fix**: wrapped both this table and the nested drill-down table in
  `<div className="table-scroll">`, the same already-established pattern
  (`overflow-x: auto`, unconditional, not gated to a breakpoint) —
  consistent with `CatalogTable`'s own usage, not a new pattern. No test
  changes needed; `table tbody tr`-style locators still resolve the same
  way with one extra `<div>` ancestor.
- Verified the same way every e2e-adjacent fix in this file has been given
  this sandbox's lack of `cdn.sheetjs.com` access: confirmed `.table-scroll`
  is an unconditional (not breakpoint-gated) rule already proven to work
  for `CatalogTable`/`QuotesTab`, and that nothing else in this spec file's
  locators depends on the table's exact DOM ancestry — real confirmation is
  CI's own next run.

## Quote/Sorting: fixed a real catalog-duplication bug — unguarded confirm buttons let a repeated click fire the write twice

Real staff report via Discord: an accepted quote's cards showed up multiple
times in the catalog ("Ephemerate" had 4 entries from one MTG quote where
only 1 copy was bought; a separate Pokemon quote's cards doubled). Diagnosed
and replicated before fixing, per this project's own "never guess, confirm
first" discipline — tracing the actual code rather than assuming a math bug
in the accept/convert pipeline.

- **Root cause, confirmed by reading the code, not inferred from the
  symptom**: `SortItemModal`'s Confirm button (`App.jsx`'s Sorting tab —
  where an accepted quote's items land to be placed into a real
  binder/case or Bulk, see "Sorting stage + Bulk item type" above) called
  `onConfirm(...)` with no `await` and no disabled-while-saving state —
  unlike `ScannerPanel`'s own Confirm button, which correctly sets a
  `saving` flag synchronously before its own async write. A second click
  while the first click's `App.jsx` `handleSortItems` → `dbUpsertCards`
  write was still in flight fired `buildCatalogItemsFromQuoteItems` again
  for the same items — and that function stamps a fresh
  `quote-${Date.now()}-${i}` sku on every call (`quoteUtils.js`), so a
  second (or third, or fourth) concurrent call creates a genuinely
  separate duplicate catalog row each time, not a harmless overwrite of
  the same row. This explains the variable multiplier across the two real
  reports (4x vs 2x) — a code-level math bug would produce the same
  multiple every time, but a double-click race produces however many
  times the impatient staff member actually clicked, which naturally
  varies by batch size/network latency. Pokemon imports/sorts are the
  likeliest to trigger it given this app's own documented pokemontcg.io
  retry latency elsewhere in this file.
- **`ImportPanel`'s "Import rows" button had the identical gap**,
  confirmed during the same investigation — no `importing`/`saving` state
  at all, and `handleConfirmImport` can run a real multi-second
  per-row image-search loop (`runWithConcurrency`) before ever calling
  `onImport`. Used by both the real Import tab and the Quote tab's
  embedded "+ Add cards by import" — real-usage testing confirmed this
  path is reachable but secondary to the Sorting one for this specific
  bug (duplicates added to a quote this way can still be caught and
  removed before the quote is accepted; a duplicate created at Sorting
  time lands directly in the catalog with no review step in between).
- **Fix**: both buttons now follow the exact pattern `ScannerPanel`'s
  Confirm button already used correctly — a local `saving`/`importing`
  state set synchronously before the async call, the button `disabled`
  and its label flipped ("Saving…"/"Importing…") for the duration.
  `SortItemModal`'s Cancel button is also disabled while saving, closing
  off the one other escape hatch that could re-open the same still-listed
  Sorting row and submit it a second time concurrently.
- Verified with the full unit suite (344 passing, same pre-existing
  `xlsx`/`cdn.sheetjs.com` sandbox gap as every other change in this file)
  and a direct `esbuild` parse of both edited files — no component test
  file exists for either `SortItemModal` or `ImportPanel` (same accepted
  gap already noted for `ScannerPanel` under Testing above).

## Mark Sold: restored partial-quantity selling, and EditModal's own "Mark as sold" checkbox now reports like the batch flow

Two real Discord reports (Noah/Rafa) about the same underlying gap —
selling fewer than a card's full quantity had no path that both actually
left the remainder in stock *and* reported the sale — diagnosed by reading
the code, then confirmed with the user before fixing since both are real
behavior changes, not one-line bugs:

- **Partial-quantity selling was a real, confirmed gap, not a bug in
  existing code.** `CatalogTable`'s per-row Sell button was removed
  entirely in an earlier PR (see "Catalog: click-to-select rows, per-row
  Sell removed" above) in favor of the batch-select-then-"Mark sold" flow
  — but `App.jsx`'s `handleBatchSell` only ever sells a selected item's
  *entire* remaining qty, with no UI path to sell e.g. 2 of 7 copies while
  keeping the other 5 listed under the same SKU. That removal's own PR
  description flagged this exact trade-off explicitly ("revisit if
  partial-quantity selling... turns out to still be needed in practice")
  — now confirmed needed. **Fix**: a new `handleSellPartial(sku, qtySold)`
  in `App.jsx`, deliberately kept separate from `handleBatchSell` rather
  than folded into it — the two have genuinely different end states (qty
  decremented, item stays unsold vs. qty zeroed, item flips `sold: true`)
  and `handleSellPartial` only ever runs for exactly one card, so
  branching the existing, already-tested batch path on this edge case
  would have been the wrong shape. It writes the same `sync_queue` ticket
  and `sales` record `handleBatchSell` already writes for a full sale,
  just for the entered quantity instead of the row's whole `qty`. A new
  **`SellQuantityModal.jsx`** (same `.overlay`/`.modal` system, explicit
  Cancel/Confirm, no backdrop-close) opens — in place of the existing
  plain yes/no `showConfirm` — only when `CatalogPanel.jsx`'s
  `handleBatchSell` sees exactly one selected item with `qty > 1`; a
  qty-1 item or a multi-item batch still go straight to the unchanged
  plain confirm, since there's nothing to pick a quantity for in either
  case. The modal's own Confirm routes to `onBatchSell` (unchanged, full
  amount) when the entered quantity equals the card's full qty, or the
  new `onSellPartial` otherwise — same `saving`-state-guards-the-button
  pattern this file has already fixed into `SortItemModal`/`ImportPanel`
  above, applied to a brand-new async confirm button from the start
  rather than needing a second round to add it.
- **EditModal's own standalone "Mark as sold" checkbox** (`id="f_sold"`,
  in the Notes & status section) used to flip `record.sold` with no
  reporting at all — confirmed by reading `handleSaveCard`, which only
  ever reset the platform-status chips on any save, never wrote a
  `sync_queue` ticket or a `sales` row regardless of what changed. This is
  exactly what both real reports described: an item entered and
  immediately marked sold through Edit "disappeared" (no Catalog row,
  since qty wasn't being zeroed either) and never showed up in Reports,
  because nothing downstream of that checkbox ever ran the same write
  `handleBatchSell` does. **Fix, confirmed with the user as "fire the same
  sales-record + ticket writes `handleBatchSell` does, so both controls
  behave identically"**: `handleSaveCard` now detects a real `false` →
  `true` transition on `record.sold` (or a brand-new item saved as already
  sold, since `existing` is `null` in that case) with `qty > 0`, and when
  it fires, zeroes `qty`, builds the same `sync_queue` ticket and `sales`
  row shape `handleBatchSell` builds (same field set, same single
  `soldAt` timestamp sourced from `record.lastUpdated` so a sale corrected
  after the fact still timestamps consistently), and writes both via the
  same `dbInsertTickets`/`dbInsertSales` calls. A save where `sold` was
  already `true` (no transition) or `qty` is already `0` is a no-op here,
  matching `handleBatchSell`'s own identical qty<=0 skip-guard — editing
  an already-sold item doesn't re-fire a second ticket/sale.
- Both fixes share the same real root class this file has now hit twice
  (see the Sorting/Import duplication-bug section above) — a feature
  quietly bypassing the one, already-correct reference implementation
  (`handleBatchSell`) instead of reusing or matching it — but are
  otherwise unrelated bugs with unrelated fixes, not two symptoms of one
  root cause.
- Verified with the full unit suite (344 passing, same pre-existing
  `xlsx`/`cdn.sheetjs.com` sandbox gap as every other change in this file)
  and a direct `esbuild` bundle of `App.jsx` (which transitively pulls in
  `CatalogPanel.jsx`/`SellQuantityModal.jsx`), confirming all three edited/
  new files parse and resolve correctly. No component test file exists for
  `CatalogPanel`/`SellQuantityModal` (same accepted gap already noted for
  `ScannerPanel`/`SortItemModal`/`ImportPanel` elsewhere in this file) —
  the quantity-picker branch logic (1 item + qty>1 → modal; everything
  else → unchanged plain confirm) was additionally traced by hand against
  `CatalogPanel.jsx`'s own `handleBatchSell` before shipping.

## Pokemon: pokemontcg.io → TCGdex migration

pokemontcg.io is folding into the paid Scrydex service, and its key-less
public tier was failing outright by the time this was picked back up (a
plain `name:charizard` query returned a 502 on the very first request,
2026-10-14). Every Pokemon lookup in the app — `searchPokemon` in
`cardSearch.js` (EditModal/Scanner/Import/Quote) and `pokemonPrice` in the
`price-check` Edge Function — now uses **TCGdex** (`api.tcgdex.net`)
instead. **A full switch, no pokemontcg.io fallback** — confirmed with the
user, since pokemontcg.io is going away regardless. This supersedes the
pokemontcg.io-specific mechanics described in earlier sections of this
file (the 4-attempt retry backoff, the Lucene query sanitizing, the
two-representation possessive-apostrophe hedge, `fetchWithPokemonRetry`) —
those sections are left as written, as history.

The investigation was paused once before, and no notes survived that
pause — the research was redone from scratch. This time every fact below
was confirmed against the live API and TCGdex's own docs (filtering/
sorting/pagination, single card, searching, markets/pricing, assets), not
guessed:

- **CORS is `Access-Control-Allow-Origin: *`**, on both REST and GraphQL —
  called directly from the browser, like Scryfall/Lorcast. No proxy.
- **Search = one GraphQL request; price = one REST request per card.** The
  GraphQL endpoint (`POST /v2/graphql`, `cards(filters:{name})`) returns
  every matching card (unpaginated by default) with `localId`/`rarity`/
  `set{name}`/`image` in a single request — but its `Card` type has no
  `pricing` field. Pricing only exists on the REST single-card object
  (`GET /v2/en/cards/{id}`), so `searchPokemon` narrows/orders first, caps
  at **20 candidates**, then prices only those (concurrency 4, cached per
  card id for the session). A pricing failure leaves that one candidate
  unpriced rather than failing the search. The REST list endpoint
  (`/v2/en/cards?name=`) was considered and rejected — it only returns
  `{id, localId, name, image}`, no set/rarity to narrow on.
- **Name filtering is a case-insensitive "contains" match by default**
  (`eq:` for strict, `name*` for prefix — per the filtering docs, and
  confirmed live: `localId=4` matched 21 cards, `set.name=Base Set` also
  matched "Expedition Base Set"). A GraphQL *variable* carries the name
  verbatim, so possessive names ("Lillie's Clefairy ex", "Cynthia's
  Garchomp ex") just work with a plain straight apostrophe — the entire
  apostrophe-hedging history above is moot for TCGdex. A **curly `’`
  returns zero results**, so it's normalized to `'` first.
- ~~**The parked `-EX`/`-GX` hyphen question is moot** — TCGdex names use
  a space ("Dialga GX", "Giratina EX").~~ **Wrong, corrected in the
  follow-up below**: XY/Sun & Moon-era names use a space, but Black &
  White-era EX cards are hyphenated ("Virizion-EX") — found by the first
  real price-check run on TCGdex. Now handled by a spelling-variant retry.
- **TCG Pocket (the mobile game) cards share the same database** (serie
  `tcgp`, set ids like `A2b`, image path `/en/tcgp/...`) — digital-only,
  never in a binder, so they're filtered out by image path. Cards with no
  image are dropped too, same as before.
- **Pricing** lives at `pricing.tcgplayer.<variant>` with `{productId,
  lowPrice, midPrice, highPrice, marketPrice, directLowPrice}`. **The docs
  and the live API disagree on variant key names** — the docs' example
  shows `holo`/`reverse`, live responses use `holofoil`/`reverse-holofoil`/
  `1st-edition-holofoil`/`unlimited-holofoil` — so both spellings are
  accepted, and any unknown variant key is still tried after the known
  ones. Same most-reliable-first fallback within a variant as before
  (market → mid → avg(low, high) → low → high). `pricing.cardmarket` (EUR)
  is ignored. The `productId` gives a real direct listing link,
  `https://www.tcgplayer.com/product/{productId}` (confirmed live).
- **Images**: TCGdex image URLs are extension-less by design; `/high.webp`
  (600×825, the docs' recommended web format) is appended.
- **Better price coverage, concretely**: Mega Gengar ex's Mega Attack Rare
  print (`me02.5-269`) — documented above as a permanent "no `prices` key
  at all" gap on pokemontcg.io — has a real $33.46 market price on TCGdex,
  and Lillie's Clefairy ex #280 (also documented above as having no
  pricing) shows $119.77.
- **Search narrowing**, all soft (a hint that matches nothing is ignored,
  never zeroes the search): an exact name match ranks above names that
  merely contain it ("Charizard" before "Blaine's Charizard"); then
  number+exact set, number+loose set, number alone, exact set, loose set —
  an exact set name beats a loose one so "Base Set" doesn't pick "Base
  Set 2" (a real live-test finding). Number comparison strips a `/total`
  denominator and leading zeros (TCGdex pads some sets: `"076"`). If the
  full name matches nothing, a first-word prefix search (`Charizard*`)
  runs, and the last dropped word is tried as a number hint if staff gave
  none — "Charizard EX XY121" finds the XY121 promo.
- **Rarity is translated into the app's existing (pokemontcg.io-era)
  vocabulary**, confirmed with the user over adopting TCGdex's names — the
  Rarity dropdown, the scanner prompt, and every already-saved catalog
  value use the old names, and switching would leave them mixed in the
  Catalog's Rarity filter. `pokemonRarityFromTcgdex` in `cardSearch.js`:
  capitalization-only differences are Title Cased ("Double rare" → "Double
  Rare", "Special illustration rare" → "Special Illustration Rare"), plus
  explicit renames ("Holo Rare" → "Rare Holo", "Holo Rare V/VMAX/VSTAR" →
  "Rare Holo V/VMAX/VSTAR", "Secret Rare" → "Rare Secret" — only used
  pre-Scarlet & Violet). **TCGdex's "Ultra Rare" is genuinely ambiguous**
  and handled per era (from a per-serie breakdown of every real "Ultra
  Rare" card, not a guess): Scarlet & Violet → "Ultra Rare"; Sword &
  Shield → "Rare Ultra"; but XY/Sun & Moon/Black & White use it for BOTH a
  regular-art EX/GX and its full-art version (confirmed live — `xy7-57`
  and `xy7-93`, regular and full-art Giratina EX, both report "Ultra
  Rare"), and the Mega era uses it for Mega Attack Rare too (`me02.5-269`).
  For those, the candidate's `rarity` is left **blank**, so picking it
  never overwrites the item's own Rarity with a guess (EditModal/Scanner/
  Quote's pick handlers all only back-fill a non-empty value — checked),
  and the plausible values go in a new `rarityAliases` array that
  `preferRarity` matches a hint against (ordering only, never saved).
  `RARITY_OPTIONS_BY_GAME.Pokemon` and `scan-binder-page`'s prompt are
  unchanged.
- **Reliability**: TCGdex answered every live test request, so it gets the
  same light 1-retry-on-5xx as Scryfall/YGOPRODeck/Lorcast — not
  pokemontcg.io's 4-attempt backoff (`fetchWithPokemonRetry` was deleted
  from `price-check`). A persistent failure still throws, so an outage
  reports honestly instead of as "no matches."
- **`price-check`'s `pokemonPrice`**: same GraphQL search + REST price
  shape, two requests per item instead of one (the batched workflow
  absorbs this). The catalog select now also reads `set_name`, and a print
  from the item's own set is preferred among same-name matches — TCGdex
  returns matches oldest-first, so without this a reprinted name would
  always be priced off its oldest print. Still no collector number (never
  saved on a catalog row), so among several prints in the *same* set it
  takes the first — e.g. "Lillie's Clefairy ex" in Ascended Heroes prices
  off #076 (Double Rare, $1.45), not #280 (SIR). Same accepted limitation
  the pokemontcg.io version had. Verified live against seven real catalog
  names that failed under pokemontcg.io (the possessive-name cluster,
  "Misty's Psyduck [W Stamped]", "Dialga EX (122 Secret Rare)", "Charizard
  4/102", plain "Gengar") — all seven now return a price.
- **Verification**: unlike most Pokemon work in this file, this sandbox
  *can* reach TCGdex, so `searchPokemon` and `pokemonPrice` were both run
  against the live API (a scratch copy with the Supabase import stubbed
  out), not just traced by hand. Unit tests were rewritten for TCGdex's
  response shapes (`cardSearch.test.js`, including
  `pokemonRarityFromTcgdex` directly). No e2e spec exercises card search,
  so no e2e changes.

**Requires redeploying `price-check`** (`supabase functions deploy
price-check`) for the daily price check to switch to TCGdex — the app-side
search switches as soon as GitHub Pages redeploys. No migration, no new
secret, no `scan-binder-page` redeploy.

## TCGdex follow-up: first real price-check run, and fixes for what it surfaced

The first real daily run after the migration deployed confirmed it: 262
tracked items, **221 checked / 41 failed, zero `fetch_failed`** (the last
pokemontcg.io run: 179 of 233 checked, 54 failed, with a steady stream of
`fetch_failed`), and the entire possessive-name cluster gone. Its own
`sampleFailures` were then each checked against the live API (not guessed)
and fell into three fixable patterns plus a few genuine gaps — confirmed
with the user before building:

1. **`price-check` was pricing unpriced prints.** It took TCGdex's first
   match, which is oldest-first and very often an imageless, unpriced
   collection reprint — plain "Charizard" landed on "McDonald's Collection
   2024", "Pikachu & Zekrom GX"/"Arceus VSTAR" on "30th Classic
   Collection". Fixed: imageless cards are skipped (same as the in-app
   search already did), and if the best guess has no TCGPlayer price, up
   to 3 prints are tried (`POKEMON_MAX_PRICE_TRIES`) before reporting
   `no_price`.
2. **The collector number typed into a name was being thrown away.**
   `cleanCardName` strips "Charizard 4/102", "Miraidon ex - 102/078",
   "Mewtwo - 052", "Cyndaquil (105)" down to the bare name so the search
   can match — `numberFromRawName` now reads the number off the RAW name
   first, and prints are ranked number-match (2) + exact-set-match (1),
   ties kept in TCGdex's order. A trailing number wins over a digits-only
   parenthetical; any other parenthetical ("(122 Secret Rare)", "(1st
   Ed.)") is ignored. Better accuracy, not just fewer failures.
3. **Spelling differences**, handled by `pokemonSpellingVariant` — in
   both `price-check` and the in-app `searchPokemon` (same rule set,
   duplicated per this repo's no-shared-code-between-client-and-Edge-
   Function convention). One alternative spelling, tried only after the
   name as typed finds nothing (in `searchPokemon`, before the first-word
   fallback; the dropped-code number hint still only applies to that
   first-word tier):
   - **Accents**: TCGdex's name match is accent-sensitive — "Pokemon
     Trader"/"Pokemon Breeder" find nothing, "Pokémon Trader" does.
   - **EX/GX hyphenation** (corrects the migration section above): Black &
     White-era EX cards are hyphenated ("Virizion-EX"), XY/Sun & Moon ones
     use a space. The variant swaps whichever form was typed. Only
     uppercase EX/GX — the modern lowercase "ex" is never hyphenated.
   - **Symbols**: "Nidoran F/M" → "Nidoran♀/♂", "... Star" → "... ★".
- **Result, re-run live against the 27 Pokemon names that failed**: 20 now
  price (was 0). The other 7 are genuine gaps, not bugs: "Red Cheek
  Pikachu" (a collector nickname — the real card is Base Set Pikachu #58;
  renaming the catalog row fixes it), Palkia LV.X / Gardevoir LV.X (TCGdex
  has other LV.X cards, not these two), "Legendary Birds Promo Pack" (a
  multi-card bundle), and Umbreon ★ / Virizion-EX (found now, but TCGdex
  carries no TCGPlayer price for those prints). The remaining Magic
  `no_price` items (Strip Mine/Watery Grave/Brain Freeze borderless) come
  from Scryfall's own data, unrelated to TCGdex.
- **Japanese Pokemon items are now skipped by `price-check` entirely** —
  decided with the user, "until we have a price checker for JP cards."
  Fixes 1–3 above briefly made "Mew ex (JP)" price off the *English* print
  (the "(JP)" annotation is stripped like any other parenthetical), which
  could produce false spike alerts. `isSkippedJapaneseItem` — game is
  Pokemon AND the raw name matches `JAPANESE_ITEM_RE` (`\bJPN?\b` or
  `Japanese`, case-insensitive) — skips the item before any lookup.
  **Pokemon only, by explicit user decision**: a first cut applied it to
  every game, and the user narrowed it, since how Scryfall (or any other
  provider) handles a Japanese print was never investigated — so Magic's
  "Brain Freeze (JP Alternate Art)" etc. are still looked up as before,
  not skipped on an untested assumption. Skipped items are counted in a
  new `skippedJapanese` response field (also summed in the workflow's
  combined totals), not as failures, and they count toward `attempted` so
  the workflow's batch offset still advances past them.
- **LV.X — checked, deliberately not "fixed"**: the user found a real
  TCGPlayer listing for Palkia LV.X (DP18, product 87920) and suggested
  normalizing "LV.X" → "LVX". Checked live first: TCGdex spells LV.X with
  the dot when it keeps it at all ("Palkia G LV.X", "Arceus LV.X" — no
  "LVX" anywhere), but stores the DP18 promo as plain **"Palkia"** (DP
  Black Star Promos), and that entry — like DP27, the other Palkia promo —
  has **no TCGPlayer pricing on TCGdex at all**. No name rewrite can
  surface a price that doesn't exist, and stripping "LV.X" to match plain
  "Palkia" would silently price an LV.X off one of ~40 unrelated ordinary
  Palkia prints — a wrong number feeding spike alerts, worse than an
  honest `no_match`. Left as a known data gap.
- Covered by new `cardSearch.test.js` cases (`pokemonSpellingVariant`
  directly, the spelling-variant tier in `searchPokemon`, and that a
  variant match doesn't trigger the dropped-code number hint). The
  `price-check` changes were verified live against the real failing names
  above (Edge Function code has no unit tests, same accepted gap as
  before).

**Requires redeploying `price-check`** (`supabase functions deploy
price-check`); the in-app search side ships with the GitHub Pages deploy.
The follow-up run after it deployed: **244 checked / 14 failed** (was 41),
every remaining failure one of the known gaps above, 4 JP items skipped.

## Price tracking, PR 2: the in-app alerts UI

The second half of Feature B (see "Price tracking & spike alerts" above,
whose PR 1 wrote alerts but had no UI to read them). Four design calls
confirmed with the user before building — placement, what "Update price"
does, editable thresholds, and merging the TCGdex follow-up PR first:

- **Topbar badge + Catalog row markers, not a new tab.** A blue
  `.price-alerts-badge` ("▲ N price alerts") sits next to "N pending sync"
  (the two are now grouped in `.topbar-badges` — `.topbar` is
  `space-between`, so a second badge would otherwise float mid-bar), so
  alerts are visible from every tab. It only renders when there's at least
  one open alert — no "0 price alerts" noise. Clicking it opens
  `PriceAlertsModal.jsx`: every open alert, biggest % jump first, showing
  Our Price (the item's *current* catalog price, falling back to the
  alert's `previous_price` snapshot) → the market price found → % change,
  plus the detected date. Catalog rows with an open alert get a small blue
  `▲` (`.price-alert-marker`, `CatalogTable.jsx`'s `PriceAlertMarker`) next
  to the price on both the desktop table and the mobile cards, with the
  market price/% in its tooltip. Blue because that's this app's
  informational role — a market rise is something to review, not a
  warning (amber, already "pending sync") or a danger/sold state (rust);
  the border uses the same 65%-soft/35%-fg blend as the other badges.
- **"Update price" opens the item's normal Edit screen, never prefilled.**
  `App.jsx`'s `handleUpdatePriceFromAlert` closes the modal, switches to
  the Catalog tab (required — every tab stays mounted but CSS-hidden, so
  an Edit modal opened inside a hidden Catalog panel would be invisible),
  and sets an `editRequest` that `CatalogPanel` turns into its own
  `editingSku`. `EditModal` gets the alert as a `priceAlert` prop and shows
  a `.price-alert-ref` box right under Our price: the market price found,
  the % vs. the price at the time, the date, and "Saving this item clears
  the alert." Our Price is left exactly as it was — the user's explicit
  choice, consistent with this app's standing "never silently overwrite a
  manual entry" rule.
- **Saving an item clears its alert; Dismiss clears it without a save.**
  `handleSaveCard` acknowledges any open alert for the saved sku (old or
  new sku, in case it was renamed) after a successful save — any save
  counts as "reviewed," even one that keeps the same price. "Dismiss" (and
  "Dismiss all", behind a confirm) acknowledges without touching the
  item. Either way the row is **acknowledged, never deleted**
  (`dbAcknowledgePriceAlerts`), keeping `price_alerts` as the historical
  record PR 1 designed it to be. An alert whose item has since been
  deleted shows "no longer in the catalog" with Update price disabled and
  Dismiss still available.
- **The two thresholds are editable in Pricing settings** (previously SQL
  Editor only): "Track items priced at or above ($)" and "Alert when
  market is up at least (%)", saved to `price_tracking_settings` row id 1
  (`dbLoadPriceTrackingSettings`/`dbSavePriceTrackingSettings`), same
  singleton pattern as `store_settings`/`quote_settings`, defaulting to
  $25/20% (`DEFAULT_PRICE_TRACKING` in the new `priceAlertUtils.js`) until
  the real row loads. Real `htmlFor`/`id` labels from the start, per the
  accessibility lesson recorded elsewhere in this file. Takes effect from
  the next daily run.
- **Loaded once at sign-in, no realtime.** `dbLoadPriceAlerts` loads only
  unacknowledged rows (through `fetchAllRows`, newest first). Alerts only
  change once a day, so `price_alerts` was deliberately not added to the
  realtime channel (which would also need the manual Supabase publication
  step). Accepted consequence: a dismissal on one device shows on another
  only after a reload.
- `priceAlertUtils.js` holds the shared shaping — `alertsBySku` (one alert
  per sku, the most recent if there are ever two), `formatPctChange`,
  `formatMoney` — so the badge, modal, row marker and Edit box can't
  disagree. Writing its tests caught a real bug: `formatPctChange(null)`
  rendered "+0%" because `Number(null)` is 0.
- Staff docs: a "Price alerts" subsection in `PricingSettingsSection.jsx`.
- Covered by `priceAlertUtils.test.js`, new `db.test.js` cases (row
  mapping, unacknowledged-only load, acknowledge-not-delete, settings
  load/default/save), and a new `e2e/price-alerts.spec.js` (Desktop +
  Mobile): no badge without open alerts; badge + row marker + modal
  contents; Update price → Edit shows the reference box with Our Price
  untouched, and saving acknowledges the alert and removes the badge and
  marker; Dismiss acknowledges without changing the price; a deleted
  item's alert can be dismissed but not updated; Pricing settings writes
  both thresholds. The mock harness and `catalogSeed` gained
  `price_alerts`/`price_tracking_settings` tables. Visually checked at
  desktop and mobile widths via throwaway Playwright screenshots (deleted
  before committing), which caught the alert list's name running into its
  game tag.

No migration, no Edge Function redeploy for the UI itself — both tables
already exist from `phase13_price_tracking.sql`, and their RLS already
grants `authenticated` full access. (The follow-up below, in the same PR,
does need both.)

## Price alerts: matched card, Find card, and no alerts on guessed matches

Real report from reviewing the UI above against live data: **46 open
alerts where ~5 were expected**, many on generic names like "Mew", with no
way to tell whether an alert compared our card against the right print.
Two causes, confirmed rather than guessed:

- **Alerts never recorded which card the check matched** — only name and
  old/new price — so a wrong-print comparison was invisible.
- **A generic name priced off an arbitrary print.** Confirmed live: a bare
  "Mew" with no Set was priced off the **Southern Islands Mew at $644.58**.
  (Older alerts from the pokemontcg.io-era runs also accumulate — the check
  only skips a sku that already has an *open* alert — which is why the
  count was so far above a single run's spikes.)

Decided with the user (three questions): record the matched card on every
alert; don't alert on guessed matches; and a **"Find card"** button that
"just jumps into the card detail view" — which is exactly what the earlier
"Update price" already did, so that button was **renamed to Find card**
rather than adding a second button with identical behavior.

- **`phase15_price_alert_match.sql`** adds `matched_name`/`matched_set`/
  `matched_number`/`matched_image`/`matched_url`/`match_basis` (all text,
  default `''`) to `price_alerts`. **Must run before redeploying
  `price-check`** — the new function writes these columns.
- **Every provider's lookup now returns a `match`** alongside the price,
  using only field paths already confirmed elsewhere in this codebase
  (`cardSearch.js`/`card-lookup-proxy`): Pokemon (TCGdex `name`/`set.name`/
  `localId`/`image` + `/low.webp`, TCGPlayer product link), Magic
  (`name`/`set_name`/`collector_number`/`image_uris.normal` or first face/
  `purchase_uris.tcgplayer`), Lorcana (`name`+`version`/`set.name`/
  `collector_number`/`image_uris.digital`/`purchase_uris.tcgplayer`),
  Yu-Gi-Oh (`name`/`card_images[0].image_url` only — one YGOPRODeck entry
  covers every printing, so there's no set/number to report), Egman games
  (`name`/`set_code`/`card_code`/`_defaultImagePath` image/`tcgplayer_url`),
  SWU (`Name`/`Set`/`FrontArt`).
- **`match.basis` — how solidly the print was identified — Pokemon only**:
  `number` (the number typed into the name), `set` (the item's own Set),
  `only_print` (the only print with that name), else `guess`. **A spike on
  a `guess` match is logged to `price_history` but never raised as an
  alert** — counted as `guessedSpikes` (with a capped `sampleGuessedSpikes`
  list) in the response and the workflow's combined totals. Pokemon only,
  same reasoning as the JP skip: it's the only provider whose lookup ranks
  prints and therefore knows *why* it picked one; every other game takes
  the first search result with `basis: null` and alerts as before.
- **Two more wrong-print bugs found while verifying live, both fixed**:
  - **"Charizard 4/102" matched Base Set 2 #4.** The "/102" is the set's
    printed card count (Base Set has 102, Base Set 2 has 130), so
    `numberFromRawName` now also returns that total and prints whose set
    `cardCount.official` equals it score higher (TCGdex GraphQL exposes
    `set { cardCount { official } }` — confirmed). Now matches Base Set #4.
  - **Magic "Sol Ring" was priced as "Searing Soloist".** Scryfall's plain
    search matches each word separately and returns results
    alphabetically; the check took the first. `magicPrice` now prefers a
    result whose name — or a double-faced card's front face — equals the
    searched name, falling back to the first only if none does.
  - Also: Scryfall requests from `price-check` now send an explicit
    `User-Agent`/`Accept`, per Scryfall's API rules — confirmed it rejects
    Node's default User-Agent with a 400 `generic_user_agent` (Deno's
    default has been accepted so far, so this was defensive, not a fix for
    an observed production failure).
- **An alert insert that fails is no longer silent** — counted as
  `alertInsertErrors` with `firstAlertInsertError`, and only successful
  inserts count toward `spikes`.
- **UI — `PriceAlertMatch.jsx`**, shown in both the alerts list and Edit's
  `.price-alert-ref` box: "Compared against: **Mew** — Southern Islands #1",
  a thumbnail (click to zoom; hidden if the image fails to load), how it
  was matched ("matched by this item's Set", "matched by the number in the
  name", "the only print with this name", else "first search result"), and
  a "View listing ↗" link. Alerts raised before this migration say
  "Compared against: not recorded" instead of showing nothing.
- Staff docs (`PricingSettingsSection.jsx`): Find card, the Compared
  against check, and a note that a Pokemon item with no Set won't raise
  alerts — fill its Set in to have it tracked.
- **Verified live** (TCGdex/Scryfall reachable from this sandbox) against
  real catalog names: bare "Mew" → `guess` (no alert); "Mew ex" + Set
  "151" → `set`, 151 #151; "Charizard 4/102" → `number`, Base Set #4;
  "Miraidon ex - 102/078" → `guess` (TCGdex has no English #102 — 078 is a
  Japanese set size); "Sol Ring" → Sol Ring. Plus `db.test.js` (match
  mapping) and two new `e2e/price-alerts.spec.js` cases (the Compared
  against block in the list and in Edit; the not-recorded fallback).
- **The existing open alerts predate all of this** — they show "not
  recorded" and include guessed matches. "Dismiss all" once after the
  redeploy lets the next run repopulate with recorded, non-guessed matches
  only.

- **Condition-aware comparison** — real report while reviewing this PR: a
  Damaged Gengar (Fossil #5) alerting because its price was compared
  against a **Near Mint** market price. Every provider price is NM, but our
  catalog prices each copy for its own condition. `price-check` now loads
  the store's condition multipliers (`store_settings`, the same table the
  app's Market Value uses, defaults NM 100/LP 85/MP 65/HP 45/DMG 25) and
  compares Our Price against `NM price × that tier's %` (same rounding as
  `marketValueForCondition`). `canonicalizeCondition` and its alias table
  are duplicated from `cardUtils.js` per the no-shared-code convention.
  **A blank or unrecognized condition is compared as Near Mint and still
  alerts** — decided with the user, reversing a first cut that (following
  the app's own Market Value rule) logged the price but held the alert
  back: an alert on a condition-less item is exactly what prompts staff to
  add the missing condition. Such alerts store `condition: 'NONE'` and the
  app shows "no Condition set on this item — compared as Near Mint" in
  amber. `price_history` keeps the raw NM price.
  Alerts record `condition` (the tier) and `market_nm_price`, with
  `new_price` now the condition-adjusted estimate actually compared —
  added to the same `phase15_price_alert_match.sql` since it hadn't been
  run yet. The UI shows it via `alertConditionNote` ("est. for Damaged · NM
  $223.38", "Near Mint", the missing-condition note, or "compared as Near
  Mint (older alert)"). Verified live: Gengar + Set "Fossil" → Fossil #5,
  NM $223.38 → $55.85 for Damaged. The migration was made idempotent
  (`add column if not exists` throughout) since it was extended after the
  user had already run it once. Covered by
  `priceAlertUtils.test.js`, `db.test.js` and a new
  `e2e/price-alerts.spec.js` case.

**Requires, in order:** running `phase15_price_alert_match.sql` in the
Supabase SQL Editor, then `supabase functions deploy price-check`.

## Stack scanner: scan single cards one after another into a stack

New feature (a rework of the Scanner tab): scan individual cards quickly
into a stack, review it, then add the whole stack to the catalog at once —
the user's ask, modeled on ManaBox/Mythic Tools.

- **Research first** (their own docs/listings, not guessed): ManaBox's
  scanner detects and identifies each card from the live camera
  automatically, drops it into a **session list**, and keeps the camera
  open; session-wide defaults (foil, set lock, language, copies) are set
  up front; **Quick Mode** auto-picks the first matching version, otherwise
  it asks on ambiguity; at the end you review/bulk-edit the session and
  save. Scrytics/Grimoria work the same way (continuous session, review,
  commit in one tap). Mythic Tools documents almost nothing about its
  scanner beyond "point your camera at the card," switching printings when
  it guesses wrong, and saving scans to a collection. **The key
  difference**: all of these are native apps recognizing cards *instantly,
  on-device*, from a model trained on 100,000+ card images — not something
  a web app can ship across 8 games. So the *experience* was copied, not
  the recognition: the card goes into the stack the instant it's snapped,
  and recognition (the same vision model as the binder scanner, one call
  per card) runs in a background queue while staff keep scanning.
- **Decided with the user** (four questions): a **mode in the existing
  Scan Binder tab** ("Binder page" / "Stack"), not a new tab — so the
  Quote tab's embedded Scan gets it for free; **tap-to-capture** for v1
  (auto-capture later); the stack kept **on this device** (IndexedDB), not
  a shared table; and the **same model and prompt** as the binder scanner
  (`scan-binder-page` handles a single-card photo unchanged. Its prompt
  caching came later, see below). Accepted trade-off: one AI call per card,
  so up to ~9× the calls of scanning a 9-card page as one photo.
- **Refactor first, so the two modes can't drift**: `ScanRow`,
  `detectedToRow`, `findImageCandidates` and `HIGH_VALUE_THRESHOLD` moved
  verbatim from `ScannerPanel.jsx` into **`scanShared.jsx`**, plus a new
  **`ScanReview`** component — the review section both modes end in
  (binder/case picker, channels with `channelDefaultsForLocation`, the
  review rows and their actions, "+ Add missed card", and the
  `normalizeCard` → `onImport` hand-off that used to be inline).
  `ScannerPanel` is now a thin mode switch over `BinderPageScanner` (the
  original flow, behavior unchanged) and `StackScanner`; its props didn't
  change, so `QuoteDetail`'s embed needed nothing. `mergeScanDuplicates`'s
  identity rule was extracted as **`scanDuplicateKey`** (`cardUtils.js`) so
  the stack can ask "is this card already in the stack?" one card at a time
  with the exact same rule (game + name + number, never name alone).
- **`StackScanner.jsx`**:
  - **Live camera** via `getUserMedia` (rear camera preferred), shown with
    `object-fit: cover` and a card-shaped guide (63×88 —
    `CARD_ASPECT`). Tapping the preview captures the guide region:
    `cameraCapture.js`'s `coverRectToVideoRect` maps the on-screen guide
    back into real video pixels (undoing the cover scaling/centering, unit
    tested), with a 6% margin, downscaled to 1024px JPEG. Feedback: a
    white flash (respects reduced motion), `navigator.vibrate` where
    supported, and a Web Audio beep (toggle: "Scan sound").
  - **The camera never runs in the background**: it stops on
    `visibilitychange` (phone locked / tab switched), when the Scanner
    panel stops being displayed (every app tab stays mounted, just hidden —
    an `IntersectionObserver` plus `getClientRects().length === 0` tells a
    hidden panel apart from merely scrolled away), on mode switch and on
    unmount. There's always an explicit "Start camera".
  - **Fallbacks**: "Take photo" (OS camera, one card per photo) and
    "Upload photos" (several at once) feed the same capture path — also
    how the e2e suite drives it, and the answer for any browser where a
    live camera isn't available or permitted (the error message says so).
  - **Background recognition queue**: 2 calls in flight
    (`RECOGNITION_CONCURRENCY`), oldest first. Each result becomes a normal
    review row (`detectedToRow`) whose "real photo" is the capture itself
    (no bbox crop needed), then the usual image/price lookup fills it in.
    A card already in the stack (same `scanDuplicateKey`) bumps that row's
    qty instead, with a toast ("Another X — now ×2").
  - **Session defaults** (Game / Condition / Printing below the camera,
    ManaBox's "set it up first" menu) are snapshotted onto each card at
    capture time, so changing them between cards affects only later cards.
    A chosen Game overrides the model's guess; Condition/Printing only fill
    what the scan left blank.
  - **A card the model can't read** becomes a full, blank review row
    (`markFailed`) with its photo and a "Retry" — never a dead entry.
  - **The stack persists on this device** — `stackStore.js`, IndexedDB
    (each card's photo is ~50-150 KB, which would blow through
    localStorage's ~5 MB), keyed per destination (`stack:catalog` vs.
    `stack:quote`) so a quote's stack and the catalog's never mix. Saves
    are debounced; every call is best-effort (missing/blocked IndexedDB
    just means no persistence). Cards that were mid-recognition at reload
    are re-queued automatically.
  - **Review & commit**: `ScanReview` with a `renderRow` override (a
    still-recognizing card shows a thumbnail + spinner + remove; a failed
    one shows its note + Retry above the normal row) and
    `confirmBlockedReason` (the Add button waits until nothing is still
    being recognized). "Clear stack" (with confirm) discards it.
- **A real race found by the new e2e test, fixed**: the saved stack loads
  asynchronously, and a capture made before it finished loading was wiped
  out when the load *replaced* the stack. The load now merges with
  anything already captured. (A person tapping right after opening Stack
  mode could have hit this too, not just the test.)
- **Testing**: `cameraCapture.test.js` (cover-fit crop math incl.
  clamping), `stackStore.test.js` (graceful no-IndexedDB fallback),
  `scanDuplicateKey` cases in `cardUtils.test.js`, and a new
  `e2e/stack-scanner.spec.js` (Desktop + Mobile): upload-path scanning
  with a repeat card merging into qty 2 and a session Condition applied
  through to the saved catalog rows; a failed recognition becoming a blank
  row and recovering via Retry; the stack surviving a reload (real
  IndexedDB in Chromium); and the **live camera path** end to end using
  Chromium's built-in fake camera (`--use-fake-device-for-media-stream`,
  auto-granted permission) — start camera, tap, card recognized into the
  stack, stop camera. The harness's `functions.invoke` mock gained a
  scriptable `scan-binder-page` (`window.__HARNESS_SCAN_QUEUE__`, one
  detected-cards array per call). Also visually checked via screenshots
  at phone and desktop widths with the fake camera.
- Staff docs: a "Stack mode" subsection in `ScannerSection.jsx`.

### Stack scanner: cost, prompt caching, and "+1 same card"

Before real testing, the user asked what one-call-per-card does to cost.
The estimate, at `claude-sonnet-5` pricing ($2/MTok input, $10/MTok output):
every call resends the full tool schema plus `PROMPT_TEXT`, about 7,500
tokens, which is far more than a single card photo (~1,000-1,400 tokens).
That fixed overhead dominates. Per 1,000 cards: about $4-6 for binder pages,
since 9 cards share one call, versus roughly $20-40 for the stack. The
user's real volume is "hundreds, never close to 1000". Two changes followed,
confirmed with the user:

- **Prompt caching in `scan-binder-page`.** `PROMPT_TEXT` moved from the
  user message into `system`, with `cache_control: {type: "ephemeral"}` on
  that block. Caching covers tools, then system, so the tool schema and the
  instructions are cached together. That's about 7,500 tokens, well over
  Sonnet's 1,024-token minimum. The user message is now just the image plus
  a one-line "report every card in this photo" instruction. A cache read
  costs ~10% of normal input and lasts 5 minutes, refreshed on every hit, so
  a scanning session pays full price for the prefix once. After that, each
  card pays mostly for its own image. Binder-page scans benefit too, though
  less, since they make fewer calls. **This is an estimate, not yet
  measured**: the function now returns the API's `usage` object next to
  `cards`, and also logs it. Check `cache_read_input_tokens` on a real
  second scan to confirm the cache actually hits; the client ignores the
  extra field. Model, forced `tool_choice`, and schema are unchanged.
- **"+1 same card"** (stack mode only). This saves tokens specific to the
  stack: an extra copy of the card just scanned costs **zero** AI calls.
  `addSameAgain` bumps the newest stack entry's qty immediately (flash,
  vibrate, beep, toast). It appears on the camera overlay (`.stack-again`,
  bottom-left) and in the toolbar when the camera is off. It works even
  while that card is still recognizing, because `recognize` now reads the
  entry's current qty from `itemsRef` when the result lands, instead of the
  qty captured when it was queued. Without that, a "+1" tapped
  mid-recognition would have been overwritten back to 1. Covered by a new
  e2e test asserting qty 3 after two taps and exactly one
  `scan-binder-page` call (the harness counts calls in
  `window.__HARNESS_SCAN_CALLS__`).
- **Considered and not done**: shrinking the capture below 1024px. The image
  is already the smaller part of each call once caching is in, and
  set-symbol/number reading is already the weakest field. Also not done:
  trimming the per-game schema or prompt for single-card photos. It's cached
  anyway, and a second prompt would drift from the binder one.

**Requires redeploying `scan-binder-page`** (`supabase functions deploy
scan-binder-page`) for caching and the `usage` passthrough. Stack mode and
"+1 same card" work without it, just without the caching discount.

## Undo a sale: from the toast, and from the Sync Queue

Staff ask: undo a sale right after confirming it (a pop-up like "Sold 1
Kyogre EX - Undo?") and later from the Sync Queue. Undo puts the quantity
back and removes both the Sync Queue ticket and the Reports entry, with as
little friction as possible for the existing data setup.

- **No migration.** There's no link column between a ticket and its sales
  row, but every sell path (`handleBatchSell`, `handleSellPartial`, Edit's
  Mark as sold in `handleSaveCard`) stamps the ticket's `ts` and the sale's
  `sold_at` from the same timestamp, and the sync_queue backfill copied
  `ts` into `sold_at` too. So **sku + that timestamp identifies the pair**:
  `dbDeleteSaleForTicket` deletes `sales` where `sku` and `sold_at` match
  the ticket, returning how many rows it removed. `dbDeleteTickets` deletes
  tickets by id. Both rely on the existing `authenticated full access` RLS
  policies (the same ones the Edit Sale feature confirmed).
- **`undoSales(tickets, snapshots)` in `App.jsx`** is the one undo path for
  both triggers: for each ticket it adds `qtySold` back onto the catalog
  row, sets `sold: false`, deletes the tickets, and deletes the matching
  sales rows. It reads the catalog through `catalogRef`, because the toast's
  click handler is created at sell time and would otherwise act on a stale
  catalog. `undoingRef` blocks a double tap, or the toast and the queue
  button racing on the same ticket.
  - **Status chips (P/T/C)**: selling resets them. The toast's undo passes
    the pre-sale catalog rows as `snapshots`, so it puts the chips back
    exactly as they were. The Sync Queue's undo has no snapshot, so the
    chips stay unchecked and staff re-check them. If a platform stamp on
    the ticket was already done, the confirm dialog says to put the listing
    back there.
  - **Honest results**: if the catalog row was deleted after the sale, the
    ticket and sales row are still removed but the qty can't be restored,
    and the toast says so (shown as an error). Same if no sales row matched,
    e.g. its Sold date was changed with Edit Sale in Reports. The toast then
    says to remove it there.
- **Toast with an action** (`UIContext`/`Toast.jsx`):
  `toast(msg, isErr, { action: { label, onClick } })` adds a button and
  keeps the toast up 8 seconds instead of 2.4. The action is one-shot (the
  toast hides before running it). `.toast` still has `pointer-events: none`
  (see Mobile polish round 3); only `.toast-action` takes clicks, and it's
  only rendered while the toast shows, so an invisible toast never eats a
  click. The toast became a content-sized flex row (`width: max-content`,
  capped at the screen width): with `left: 50%` it previously laid out in
  half the screen and wrapped the button under the text on a phone.
  Toasts are still single-slot, so a later toast replaces an unused Undo.
  That's acceptable because the Sync Queue undo is always there.
- Sell messages changed from "Marked N item(s) sold" to `Sold 1 Kyogre EX`
  (or `Sold 3 items`) + Undo. Edit's Mark as sold now shows the same toast
  instead of "Saved X" (any price warnings are appended to it).
- **Reports refresh**: `ReportsTab` takes a `refreshKey` (`salesRevision`
  in `App.jsx`, bumped on every sell and undo) and re-fetches when it
  changes, so an undone sale doesn't linger there. The open game drill-down
  only resets when the date range changes, not on a refresh.
- **Sync Queue**: each ticket (pending and completed) has an "Undo sale"
  button, with a confirm.
- Staff docs: "Undoing a sale" in `SellingItemSection.jsx` and a paragraph
  in `SyncQueueSection.jsx`. The Selling section's old warning that Mark
  sold always sells the whole quantity was stale since partial-quantity
  selling came back, and was corrected in the same change.
- Covered by `db.test.js` (both new helpers, including the sku + sold_at
  filter) and `e2e/undo-sale.spec.js` (Desktop + Mobile): the toast undo
  restores qty, sold flag and the POS chip and empties sync_queue/sales; the
  Sync Queue undo restores qty 1 → 3 and removes only the sales row with
  that ticket's timestamp; the stamped-platform warning, with Cancel leaving
  everything untouched. The harness's `delete()` gained `.select()`
  returning support so `dbDeleteSaleForTicket`'s row count works under e2e.

No migration, no Edge Function redeploy.

## Duplicate an item

Staff ask: when another copy of a card comes in (e.g. a "Gecko Moria" that
sold last week), look up the old entry, select it, and duplicate it into the
edit window with everything already filled in.

- **`BatchBar.jsx`** shows a **Duplicate** button only when exactly one
  item is selected. It works on sold items too, which is the main case.
  `CatalogPanel.handleDuplicate` remembers the selected sku
  (`duplicateSku`), clears the selection, and opens EditModal in its
  normal "new item" mode (`editingSku === null`) with a new `template`
  prop. The modal is keyed per open (`new-<sku>`) so its form state
  re-initializes from the template every time.
- **`EditModal`'s `template`** (ignored whenever `card` is set) feeds
  `initFormFromTemplate`: `initForm(template)` with what belonged to the
  old physical copy reset. That's the SKU (blank, so Save generates a new
  `sku-<timestamp>`), qty (1), sold (false), cost (blank, since this copy's
  cost is its own), a slab's cert number (blank, since certs are unique),
  and the real photo (the stock image carries over through
  `stockBase = card || tpl`; the photo slot stays tied to `card` only, so
  it starts empty, and `activeImage` starts on `stock`). Everything else
  carries over as-is: name, game, set, rarity, condition, printing, price,
  base price, source URL, binder/case, notes, and channels. Channels start
  as "already chosen" (`channelsTouched = !!tpl`), so the binder-majority
  default doesn't overwrite the original's channels. Sync chips start
  unchecked (a new item isn't listed anywhere yet). Title is "Duplicate
  item", and the subtitle says the original isn't changed. Save goes
  through the same `onSave(record, null)` path as Add item, so nothing new
  was needed in `App.jsx`.
- **Phone layout fix found along the way**: with four buttons, the
  selection bar ran off the screen on a phone ("Clear selection" was cut
  off). `.batch-bar.show` now wraps under the shared 640px breakpoint,
  with the "N selected" count on its own line.
- Staff docs: "Duplicating an item" in `CatalogSection.jsx`. Also
  corrected a stale line in `EditingItemSection.jsx` that still said
  Edit's Mark as sold doesn't create a Sync Queue ticket (it has since the
  partial-quantity selling fix, and now also offers Undo).
- Covered by two new `EditModal.test.jsx` cases (the prefilled form, and
  the saved record: new sku, qty 1, unsold, no cost or photo, same
  channels/price/location/stock image) and `e2e/duplicate-item.spec.js`
  (Desktop + Mobile: duplicating a sold item saves a second, separate row
  and leaves the original sold at qty 0; Duplicate only shows with exactly
  one item selected).

No migration, no Edge Function redeploy.

## Staging environment

A second, separate copy of the app and its database for testing a change
before it reaches the live shop. Decided with the user: staging is
**hosted** (so it works on a phone, camera included), starts as a **full
copy of production's data** (refreshable any time), and uses the **same
login email with a staging-only password**.

- **A second Supabase project** (`card-cove-staging`) holds the staging
  database, login and Edge Functions. Its public URL and publishable key
  live in **`.env.staging`** (committed; same kind of public values
  `src/lib/supabase.js` hardcodes for production, never a service-role key
  or password).
- **Builds pick their project by mode.** `npm run build`/`npm run dev` are
  production, unchanged (production's URL/key stay hardcoded).
  `npm run dev:staging`/`npm run build:staging` (`vite --mode staging`)
  load `.env.staging`, serve under `/card-cove/staging/`, and read the
  project from it (`src/lib/appEnv.js`'s `IS_STAGING`). A staging build
  never falls back to production: `vite.config.js` stops the build while
  `.env.staging` still has its `YOUR_` placeholders, and `supabase.js`
  throws if the values are missing. Verified: a staging bundle contains no
  reference to the production project at all, and a production bundle
  contains none of the staging code.
- **`StagingBanner.jsx`**: an amber strip across every page of a staging
  build (app, binder page, staff docs), plus "STAGING ·" in the tab title.
  Renders nothing in production.
- **Same web origin, separate on-device storage.** Staging is served from
  `supportbgp.github.io` like production, and browser storage is per
  origin, so the stack scanner's IndexedDB database is
  `card-cove-staging` on staging (`stackStore.js`); otherwise a stack
  scanned on staging would appear in production. Supabase's own login
  session is already separate (its storage key includes the project ref).
  The Edge Functions' CORS allowlist already covers staging (same origin).
- **Hosting: one Pages site, two folders.** Pages replaces the whole site
  on every deploy, so `deploy.yml` builds both on every run: production
  from `main` into `/card-cove/`, and the `staging` branch (if it exists)
  with `build:staging` into `/card-cove/staging/`. A staging build failure
  is `continue-on-error`: production still deploys, without `/staging/`,
  and the run shows a warning. Pushing the `staging` branch triggers
  `staging-deploy.yml`, which starts `deploy.yml` **on main** with
  `gh workflow run` (the `github-pages` environment only accepts deploys
  from main, and a `workflow_dispatch` is one of the few events the
  workflow token is allowed to start). Binder QR codes made on staging
  point at staging (`qr.js` uses `BASE_URL`).
- **`scripts/copy-prod-to-staging.ps1`** (the user runs it; it asks for
  both connection strings and passwords itself, so they never pass through
  this conversation). It `pg_dump`s production's `public` schema (read
  only) and restores it into staging in **one transaction**, so a failure
  leaves staging exactly as it was. Safety: the staging ref comes from
  `.env.staging`; each connection string must contain its own project's
  ref and not the other's; and you must type "staging" first. Details
  found by actually running it (against a throwaway local Postgres set up
  like Supabase: roles, Realtime publication, Supabase-style default
  privileges, RLS, a view, a sequence, FKs, a trigger, multi-MB rows):
  - `--schema=public` makes `pg_dump` emit `CREATE SCHEMA public`, its
    comment and its grants, which fail on a project that already has
    them: filtered out.
  - `pg_dump` writes each table's grants assuming it starts with none, but
    Supabase auto-grants new tables to `anon`/`authenticated`/
    `service_role`, so production's revokes (e.g. `anon` on `catalog`)
    silently came back on staging. The script switches those automatic
    grants off for the duration of the restore, and production's own
    default grants (for `postgres`) are re-applied from the dump at the
    end; the `supabase_admin` ones are skipped (not changeable by
    `postgres`, and identical in every project). Verified: every table's
    access and the default grants match production exactly.
  - It first clears staging's public schema (tables, views, sequences,
    functions, enum/domain types; never anything owned by an extension),
    then adds the same tables to Realtime that production has.
  - The dump holds real customer data: it's written to `.staging-copy/`
    (gitignored) and deleted afterwards unless `-KeepDump`.
  - Also tested: a staging string given as production (and the reverse) is
    refused, a wrong confirmation changes nothing, and a restore that fails
    halfway rolls back with staging untouched.
  - Not copied: logins (`auth`), Edge Functions and their secrets, Storage
    (unused). Production's daily `price-check` workflow stays
    production-only.
- **How to use it** (also under Workflow conventions below):
  - Test a branch: `git push origin <branch>:staging --force`, then open
    `https://supportbgp.github.io/card-cove/staging/` once the Pages deploy
    finishes. The branch must include this setup (merge main into it first).
  - A new migration runs on **staging first**, then on production right
    before merging.
  - Refresh staging's data from production: run the script again.
  - Edge Function changes: deploy to staging with `--project-ref <staging
    ref>` first.

## Backlog

Open items not yet scheduled into a sprint, consolidated here so a new
session — a different conversation, a different model — doesn't have to
re-derive them by grepping this whole file for "parked"/"revisit"/
"provisional" every time. This section is an index: where a fuller
writeup already exists elsewhere in this file, it's linked by name rather
than repeated.

- **Ready to build, just needs a kickoff**: the TCG Player draft-catalog
  export's actual upload-ready export format (see "Next sprints" above).
  Blocked only on getting TCG Player's real required column layout first —
  never guess it.
- **Needs the user's decision before any code gets written**:
  - Cumulus POS SKU import (Phase 4) — needs a go/no-go plus a real
    Cumulus export/import file sample (see "Known constraints" above).
  - Collectr bulk-upload export — no bulk-upload/bulk-create API has been
    found for Collectr; stays manual-entry-aid only unless one surfaces.
  - TCGPlayer's own Pricing API — frozen to new applicants since late
    2024; parked unless a real seller API key for this shop turns up.
- **Confirmed real bug, not yet investigated**: some Quote-tab-converted
  items land in `"Other"` as their game in Catalog — flagged as a side
  effect of the price-tracking failure-rate investigation (see "Price
  tracking: reduced the failed-lookup count" above) but never chased down
  on its own, since it was outside that fix's scope.
- **Parked pending more real-world data — revisit if new evidence shows
  up, don't guess in the meantime**:
  - Mobile multi-sheet `.xlsx` import silently loads the first sheet
    instead of showing the sheet picker (desktop shows it correctly) — no
    repro yet with synthetic files; needs a real device repro or the
    actual file involved.
  - SWU's `"Cad Bane - He Who Needs No Introduction"` still fails price
    lookup for an unexplained reason, after every other cleanup in that
    debugging arc.
  - Pokemon set-symbol scan accuracy — near-always blank in real testing;
    a real fix means deterministic icon-matching against a reference
    library, a much bigger investment than the field's current yield
    justifies.
  - Japanese-print price coverage — no verified data source yet. TCGdex
    (now the Pokemon source) serves other languages under its own
    language-prefixed endpoints (`/v2/ja/...`), but whether those carry
    TCGPlayer pricing is unconfirmed; check a real sample before relying
    on it. Until one exists, `price-check` skips Japanese items entirely
    (see "TCGdex follow-up" above) — removing that skip is the first step
    once a JP price source is in place (Pokemon only — other games' JP items
    are still looked up as before).
- **Stack scanner, next steps (see "Stack scanner" above)**:
  - Auto-capture — snap when a steady card is in the guide, instead of a
    tap; deliberately left for after tap-to-capture is proven in real use.
  - Try a faster/cheaper model for single-card recognition, compared
    against the current one on real cards before switching.
  - The review rows are tall on a phone (one field per line) — fine for a
    handful of cards, long for a 50-card stack; consider a compact
    collapsed row once real stacks show whether it's a problem.
- **Provisional feature, keep-or-drop pending actual usage**: Import's
  "Skip automatic image search" checkbox (see "Known constraints" above)
  — shipped for one specific bulk/test-data import, never decided as a
  permanent feature either way.
- **Explicitly scoped out of Cost tracking for a future version**: a
  Cost ($) column on CSV/XLSX import — Cost today only supports manual
  entry (EditModal) and auto-fill from an accepted Quote trade-in; bulk
  import was deliberately left out of v1 (see "Cost tracking" above).

Keep this section current: when an item here gets built, or a parked
question gets a real answer, move/remove it in the same change that
resolves it — the same "amend/supersede, don't let a doc go stale"
discipline this file already follows everywhere else.

## Workflow conventions

- Feature/bugfix work goes through a PR; trivial single-line fixes may go
  straight to `main`.
- A pure documentation update (e.g. this Backlog section, a reference
  index) that the user explicitly asks to ship as a short, direct commit
  also goes straight to `main`, same as a trivial single-line code fix —
  the user's explicit request for a short commit is what licenses
  skipping a PR here, not a blanket assumption that every doc change
  qualifies.
- After every merge: sync the feature branch with `main`
  (`git fetch origin main && git merge origin/main`), rebuild to confirm,
  then continue — skipping this once caused a squash-merge to silently
  revert a file (see git history around PR #3).
- Never guess an external platform's exact file format/API capability when
  wrong-ness risk is high — get a real sample or do the research first
  (this burned us once on TCG Player/Collectr bulk-upload assumptions).
- **Staging before production** (see "Staging environment"): anything that
  needs real data or a real phone to check gets pushed to the `staging`
  branch and tested at `/card-cove/staging/` before merging. Migrations
  and Edge Function deploys go to the staging project first, production
  second.
- **Verification cadence while iterating on an open PR**: run `npm test`
  (unit) and `npm run build` on every push — they're fast. Only run the
  full `npm run test:e2e` suite (~3 min) right before actually merging, not
  on every intermediate push — run just the specific `e2e/*.spec.js` file(s)
  that cover the area touched, if one exists, otherwise skip e2e for that
  push. Do the full e2e run as the last step before merge regardless.
