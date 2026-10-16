import { useEffect, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { searchCardImage, tcgplayerSearchUrl, ebaySoldSearchUrl, priceChartingSearchUrl } from '../../lib/cardSearch.js';
import { normalizeCard, channelDefaultsForLocation, marketValueForCondition, canonicalizeCondition, roundPriceUp, roundPriceDown, RARITY_OPTIONS_BY_GAME, CONDITION_OPTIONS, PRINTING_OPTIONS_BY_GAME, GAMES } from '../../lib/cardUtils.js';
import LocationPicker from '../LocationPicker.jsx';
import SelectWithCustom from '../SelectWithCustom.jsx';

// Shared by both Scanner modes — the binder-page scanner (ScannerPanel's
// BinderPageScanner) and the stack scanner (StackScanner.jsx): the row
// shape a detected card becomes, the image/price lookup, the editable
// review row, and the review section that adds everything to the catalog.
// Moved here verbatim from ScannerPanel.jsx when the stack scanner was
// added, so the two modes can't drift apart.

let nextRowId = 1;

// Same reasoning as EditModal's HIGH_VALUE_THRESHOLD — a flat condition
// percentage is a population average, not this specific card's real going
// rate, and the dollar error grows with the card's price. Batches make this
// worse, not better — the same misestimate repeats across every copy.
export const HIGH_VALUE_THRESHOLD = 25;

export function detectedToRow(card) {
  return {
    id: nextRowId++,
    position: card.position || '',
    name: card.name || '',
    game: GAMES.includes(card.game) ? card.game : 'Other',
    set: card.set || '',
    // Best-guess only — the vision model isn't always right about it, same
    // as name/game/set, which is why it's a plain editable field here too.
    // Narrows the image search (see findImageCandidates) same as before, but
    // rarity is now also a real saved catalog attribute (see
    // phase7_rarity_column.sql) — handleConfirm passes it straight through.
    // number stays scratch-only, never saved: the strongest of the two
    // signals (a printed collector number narrows a same-name/alt-art card
    // to essentially one exact print), currently only acted on for Pokemon
    // — see searchPokemon in cardSearch.js.
    rarity: card.rarity || '',
    number: card.number || '',
    // Deliberately ignores the model's own `foil` guess (still present in
    // scan-binder-page's detection schema) rather than pre-filling this from
    // it — Sprint 4 explicitly decided the model's foil guess isn't reliable
    // enough to build on, and a blank field defaulting into the new
    // Printing/finish dropdown below reads as "please tell us," while a
    // pre-filled guess would misleadingly read as already known.
    printing: '',
    confidence: card.confidence || 'medium',
    qty: 1,
    price: '',
    // basePrice/listingUrl are what the Pricing section actually reads —
    // stay null until "Find market price" explicitly reveals them.
    // pendingPrice/pendingListingUrl silently track whichever candidate is
    // backing imageUrl right now (auto-picked or manually chosen), so
    // "Find market price" can reveal them with no extra search — the data
    // was already fetched alongside the image.
    basePrice: null,
    listingUrl: '',
    pendingPrice: null,
    pendingListingUrl: '',
    condition: '',
    imageUrl: '',
    imageStatus: 'searching', // 'searching' | 'found' | 'none'
    imageCandidates: [],
    showCandidates: false,
    // The "real photo" slot — a crop of this exact card out of the full
    // binder-page photo, made from the vision model's bbox for this card
    // (see cropImageRegion). Stays blank for manually added rows, or if the
    // model didn't return a usable bbox.
    photoUrl: '',
    photoData: '',
    // Same stock/photo preference toggle as EditModal's dual-image model —
    // defaults to the crop (matches resolveActiveImage's default), but
    // picking a stock candidate below switches it to 'stock' so the pick is
    // actually visible instead of silently staying hidden behind the crop.
    activeImage: 'photo',
  };
}

// Full candidate list, not just the top pick — reused both for the automatic
// pre-fill right after a scan and for a manual re-search (e.g. after staff
// corrects a name/game the scan got wrong). rarityHint is best-effort only
// (see searchCardImage) — it re-sorts matches that report their own rarity,
// it never excludes anything, so a wrong/unrecognized guess can't zero out
// the results.
export async function findImageCandidates(name, game, set, rarityHint, numberHint) {
  if (!name) return [];
  try {
    return (await searchCardImage(game, name, set, rarityHint, numberHint)) || [];
  } catch {
    return [];
  }
}

export function ScanRow({ row, entranceDelay = 0, multipliers, onChange, onRemove, onFindAnotherImage, onFindMarketPrice }) {
  const { openLightbox } = useUI();
  const conditionTier = canonicalizeCondition(row.condition);
  const conditionPct = conditionTier === "NM" ? 100 : (conditionTier && multipliers && multipliers[conditionTier]);
  const marketValue = marketValueForCondition(row.basePrice, row.condition, multipliers);
  // Same dual-image model as EditModal — stock candidate vs. the crop of
  // this exact copy — with the same fallback rule when only one exists.
  const stockSrc = row.imageStatus === 'found' ? row.imageUrl : null;
  const photoSrc = row.photoData || null;
  const displaySrc = row.activeImage === 'stock' ? (stockSrc || photoSrc) : (photoSrc || stockSrc);
  const canZoom = !!displaySrc;
  return (
    // Capped so a big page's later rows don't queue behind a silly-long
    // delay — the fade-in itself is what reads as "one by one," not how
    // long the last one waits.
    <div className="scan-row" style={{ animationDelay: `${Math.min(entranceDelay, 10) * 60}ms` }}>
      <div className="scan-row-thumb-col">
        <div
          className="scan-row-thumb"
          onClick={() => { if (canZoom) openLightbox(displaySrc); }}
          style={{ cursor: canZoom ? 'pointer' : 'default' }}
          title={canZoom ? 'Click to zoom' : ''}
        >
          {displaySrc ? (
            <img src={displaySrc} />
          ) : row.imageStatus === 'searching' ? (
            <span style={{ fontSize: '10px', color: 'var(--ink-faint)' }}>…</span>
          ) : (
            <span style={{ fontSize: '9px', color: 'var(--ink-faint)', textAlign: 'center' }}>{row.game}</span>
          )}
        </div>
        {stockSrc && photoSrc ? (
          <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
            <button
              type="button" className={`btn small${row.activeImage === 'photo' ? '' : ' ghost'}`}
              style={{ fontSize: '10px', padding: '2px 5px' }}
              onClick={(e) => { e.stopPropagation(); onChange({ activeImage: 'photo' }); }}
            >Photo</button>
            <button
              type="button" className={`btn small${row.activeImage === 'stock' ? '' : ' ghost'}`}
              style={{ fontSize: '10px', padding: '2px 5px' }}
              onClick={(e) => { e.stopPropagation(); onChange({ activeImage: 'stock' }); }}
            >Stock</button>
          </div>
        ) : photoSrc ? (
          <div style={{ fontSize: '9px', color: 'var(--ink-faint)', textAlign: 'center' }}>real photo</div>
        ) : null}
        {/* Disabled while this row's own search is in flight — guards
            against a double-tap firing two overlapping searches for the
            same row, same reasoning as EditModal's shared `searching` gate. */}
        <button
          className="btn ghost small" style={{ fontSize: '10.5px', padding: '2px 6px' }}
          disabled={row.imageStatus === 'searching'}
          onClick={onFindAnotherImage}
        >
          {row.imageStatus === 'searching' ? (<><span className="spinner" style={{ width: '10px', height: '10px' }} /> Searching…</>) : 'Find another image'}
        </button>
        {row.basePrice == null && (
          <button
            className="btn ghost small" style={{ fontSize: '10.5px', padding: '2px 6px', marginTop: '4px' }}
            disabled={row.imageStatus === 'searching'}
            onClick={onFindMarketPrice}
          >Find market price</button>
        )}
      </div>

      <div className="scan-row-fields">
        <div className="scan-row-line">
          <div className="scan-field sf-qty">
            <label className="scan-field-label">Qty</label>
            <input
              type="number" min="1" placeholder="Qty" value={row.qty}
              title="Defaults to 1 per detected pocket — automatically bumped when this same print (matching Name + Number) was spotted more than once on this page. Edit freely."
              onChange={(e) => onChange({ qty: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="scan-field sf-wide">
            <label className="scan-field-label">Card name</label>
            <input type="text" placeholder="Card name" value={row.name} onChange={(e) => onChange({ name: e.target.value })} />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Game</label>
            <select value={row.game} onChange={(e) => onChange({ game: e.target.value })}>
              {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Set</label>
            <input type="text" placeholder="Set" value={row.set} onChange={(e) => onChange({ set: e.target.value })} />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Number</label>
            <input
              type="text" placeholder="Number" value={row.number}
              title="Optional — the printed collector number or set code (e.g. 150, 280/217, or LOB-005). The strongest signal for telling apart same-name/alt-art prints; used to narrow both the initial automatic fill and 'Find another image' below"
              onChange={(e) => onChange({ number: e.target.value })}
            />
          </div>
        </div>
        <div className="scan-row-line">
          <div className="scan-field sf">
            <label className="scan-field-label">Rarity</label>
            <SelectWithCustom
              options={RARITY_OPTIONS_BY_GAME[row.game] || []}
              value={row.rarity}
              onChange={(v) => onChange({ rarity: v })}
              ariaLabel="Rarity"
              title="Optional — narrows both the initial automatic fill and 'Find another image' below, same as Set/Number, for cards that reprint the same name/set at different rarities. Pick a suggestion or enter your own."
              selectPlaceholder="— Rarity —"
              addNewLabel="+ Enter a different rarity…"
              customPlaceholder="Rarity"
              backLabel="← Choose from the list instead"
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Printing / finish</label>
            <SelectWithCustom
              options={PRINTING_OPTIONS_BY_GAME[row.game] || []}
              value={row.printing}
              onChange={(v) => onChange({ printing: v })}
              ariaLabel="Printing / finish"
              title="Optional. Special reverse-holo patterns (Poke Ball, Master Ball, etc.) aren't in the list since new ones ship almost every set — use 'Enter a different printing' for those."
              selectPlaceholder="— Printing —"
              addNewLabel="+ Enter a different printing…"
              customPlaceholder="Printing"
              backLabel="← Choose from the list instead"
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Condition</label>
            <SelectWithCustom
              options={CONDITION_OPTIONS}
              value={row.condition}
              onChange={(v) => onChange({ condition: v })}
              ariaLabel="Condition"
              selectPlaceholder="— Condition —"
              addNewLabel="+ Enter a different condition…"
              customPlaceholder="Condition"
              backLabel="← Choose from the list instead"
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Price</label>
            {/* Real staff ask: round an awkward computed price to a clean
                whole dollar, in whichever direction staff pick — arrow
                buttons right of the input here (EditModal's own Our Price
                field keeps the earlier labeled-button layout). */}
            <div style={{ display: 'flex', gap: '4px', alignItems: 'stretch' }}>
              <input
                type="number" placeholder="Price" step="0.01" value={row.price}
                onChange={(e) => onChange({ price: e.target.value })}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button" className="btn ghost small" style={{ padding: '2px 8px' }}
                title="Round down" aria-label="Round down"
                disabled={row.price === '' || row.price == null || isNaN(Number(row.price))}
                onClick={() => onChange({ price: roundPriceDown(Number(row.price)) })}
              >↓</button>
              <button
                type="button" className="btn ghost small" style={{ padding: '2px 8px' }}
                title="Round up" aria-label="Round up"
                disabled={row.price === '' || row.price == null || isNaN(Number(row.price))}
                onClick={() => onChange({ price: roundPriceUp(Number(row.price)) })}
              >↑</button>
            </div>
          </div>
          <div className="scan-row-meta">
            <span className={`badge confidence-${row.confidence}`} title="How confident the scan was about this card">
              {row.confidence}
            </span>
            <button className="icon-btn" title="Remove" onClick={onRemove}>✕</button>
          </div>
        </div>
        {row.basePrice != null && (
          <div className="scan-row-line" style={{ fontSize: '11.5px', color: 'var(--ink-soft)' }}>
            NM ${Number(row.basePrice).toFixed(2)}
            {' · '}
            {conditionPct != null ? `${conditionTier} ${conditionPct}%` : 'set a condition'}
            {' · '}
            {marketValue != null ? (
              <>
                Market value ${marketValue.toFixed(2)}
                <button type="button" className="btn ghost small" style={{ marginLeft: '8px' }} onClick={() => onChange({ price: marketValue })}>Use this</button>
              </>
            ) : 'market value —'}
          </div>
        )}
        {Number(row.basePrice) >= HIGH_VALUE_THRESHOLD && (
          <div className="scan-row-line" style={{ fontSize: '11.5px', color: 'var(--rust)' }}>
            Market value above is an estimate (NM price × a flat condition %), not real per-condition sales
            data — on a ${HIGH_VALUE_THRESHOLD}+ card that gap can be real money.
          </div>
        )}
        {/* Three independent, always-available price references, grouped
            under the fields (same spot the NM/Market value line above lays
            itself in) rather than stacked as tiny buttons in the cramped
            thumbnail column — same links/reasoning as EditModal's own
            "Reference prices" block. TCGPlayer switches between a real
            listing link (once row.listingUrl is known) and a manual-search
            fallback; eBay/PriceCharting are always manual-search links. */}
        <div className="scan-row-line" style={{ fontSize: '11.5px', color: 'var(--ink-soft)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {row.listingUrl ? (
            <span style={{ cursor: 'pointer', color: 'var(--blue)', fontWeight: 600 }} onClick={() => window.open(row.listingUrl, '_blank')}>
              Check live TCGPlayer listing ↗
            </span>
          ) : (
            // Some providers (Yugioh, SWU today) never return a direct
            // per-print listing link — a manual search still gets staff
            // most of the way there instead of leaving nothing to click.
            <a
              href={tcgplayerSearchUrl(row.name, row.set)} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--blue)', fontWeight: 600 }}
            >
              Search TCGPlayer manually ↗
            </a>
          )}
          <a
            href={ebaySoldSearchUrl(row.name, row.set)} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--blue)', fontWeight: 600 }}
            title="Requires being signed into eBay to see results."
          >
            Check eBay sold listings ↗
          </a>
          <a
            href={priceChartingSearchUrl(row.name, row.set)} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--blue)', fontWeight: 600 }}
          >
            Check PriceCharting ↗
          </a>
        </div>
        {row.showCandidates && row.imageCandidates.length > 0 && (
          <div className="img-candidates">
            {row.imageCandidates.map((c, i) => (
              <img
                key={i} src={c.url} title={c.label}
                onClick={() => onChange({
                  imageUrl: c.url, imageStatus: 'found', showCandidates: false,
                  pendingPrice: c.price ?? null, pendingListingUrl: c.listingUrl || '',
                  // Clear any already-revealed price — it belonged to the
                  // previous image and would be misleading attached to this
                  // one. Find market price re-reveals it for the new pick.
                  basePrice: null, listingUrl: '',
                  // See findAnotherImageForRow — otherwise this pick could
                  // silently stay invisible behind an existing photo crop.
                  activeImage: 'stock',
                  // Once staff visually confirm a candidate, that print's own
                  // Set/Number/Rarity from the card database is more trustworthy
                  // than the scan's guess — back-fill whichever of these the
                  // candidate actually carries (falls back to the scan's own
                  // value when a candidate doesn't have one, e.g. every
                  // non-Pokemon game today). Same reasoning as EditModal's
                  // selectCandidate.
                  set: c.set || row.set,
                  number: c.number || row.number,
                  rarity: c.rarity || row.rarity,
                })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// The review section both Scanner modes end in: one binder/case + channel
// choice for the whole batch, every row editable via ScanRow, and one
// "Add N item(s)" button. Owns the row actions (re-search, reveal price,
// remove, add a missed card) and the final normalizeCard → onImport hand-off
// that used to live inline in ScannerPanel. `rows`/`setRows` stay with the
// parent, which decides what a "batch" is (one binder page, or a stack).
//
// - renderRow(row, i, defaultRow): lets the stack scanner wrap or replace a
//   row (a card still being recognized has nothing to edit yet).
// - confirmBlockedReason: when set, the Add button is disabled and this is
//   shown instead (e.g. cards still being recognized).
// - onAdded(): called after a successful add, so the parent can reset.
export function ScanReview({
  rows, setRows, catalog, locations, multipliers, onImport, onAdded,
  destinationLabel = 'catalog', title = 'Review before adding', locationLabel = 'Binder / case / collection',
  addedMessage = (n) => `Added ${n} item(s)`, confirmBlockedReason = null, renderRow, idPrefix = 's',
}) {
  const { toast } = useUI();
  const [location, setLocation] = useState(locations[0] || '');
  const [saving, setSaving] = useState(false);
  const [channels, setChannels] = useState({ posChannel: true, tcgplayerChannel: true, collectrChannel: true });
  const [channelsTouched, setChannelsTouched] = useState(false);

  // One batch is one location — so just like the Edit modal, follow
  // whatever channels that binder/case already uses until staff manually
  // override it for this batch.
  useEffect(() => {
    if (channelsTouched) return;
    setChannels(channelDefaultsForLocation(catalog, location.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  function setChannel(key, val) {
    setChannelsTouched(true);
    setChannels(c => ({ ...c, [key]: val }));
  }

  function updateRow(id, patch) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  // Searches for alternative prints/art using whatever name/set/game staff
  // have already corrected, and shows the candidate grid so they can pick a
  // different one — image only. Picking a candidate updates the pending
  // price/listing behind the scenes (see the click handler in ScanRow) but
  // doesn't reveal it; that's "Find market price" below. Uses every hint
  // available — see CLAUDE.md's "Find another image ... briefly went
  // name-only, then reverted" for why hints aren't dropped here.
  async function findAnotherImageForRow(id) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    updateRow(id, { imageStatus: 'searching', showCandidates: true });
    const results = await findImageCandidates(row.name, row.game, row.set, row.rarity, row.number);
    updateRow(id, {
      imageCandidates: results,
      imageUrl: results[0]?.url || row.imageUrl,
      imageStatus: results.length ? 'found' : 'none',
      pendingPrice: results[0]?.price ?? row.pendingPrice,
      pendingListingUrl: results[0]?.listingUrl || row.pendingListingUrl,
      // Otherwise the top match here would silently never show if the row
      // already had a photo — same reasoning as EditModal's selectCandidate
      // switching the toggle when a stock pick is made.
      activeImage: results.length ? 'stock' : row.activeImage,
    });
    if (!results.length) toast(`No matches found for "${row.name || 'this card'}" — check the name/set.`, true);
  }

  // No search — the price/listing for whatever's currently shown as the
  // image was already fetched alongside it. This just reveals it, on the
  // explicit assumption staff have now looked at the image and confirmed
  // it's the right card.
  function findMarketPriceForRow(id) {
    const row = rows.find(r => r.id === id);
    if (!row) return;
    if (row.pendingPrice == null) {
      toast(`No market price available for "${row.name || 'this card'}" — this game/print may not have price data, or try Find another image first.`, true);
      return;
    }
    updateRow(id, { basePrice: row.pendingPrice, listingUrl: row.pendingListingUrl });
  }

  function removeRow(id) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function addBlankRow() {
    setRows(prev => [...(prev || []), { ...detectedToRow({ confidence: 'high' }), imageStatus: 'none' }]);
  }

  async function handleConfirm() {
    if (!rows || !rows.length || saving || confirmBlockedReason) return;
    const batchLocation = location.trim();
    const newCards = rows.map((r, i) => normalizeCard({
      sku: 'scan-' + Date.now() + '-' + i,
      name: r.name,
      game: r.game,
      set: r.set,
      condition: r.condition,
      printing: r.printing,
      rarity: r.rarity,
      qty: r.qty,
      price: r.price,
      basePrice: r.basePrice,
      sourceUrl: r.listingUrl,
      location: batchLocation,
      imageUrl: r.imageUrl,
      photoUrl: r.photoUrl,
      photoData: r.photoData,
      activeImage: r.activeImage,
      lastUpdated: Date.now(),
      posChannel: channels.posChannel,
      tcgplayerChannel: channels.tcgplayerChannel,
      collectrChannel: channels.collectrChannel,
    }));
    setSaving(true);
    await onImport(newCards, 'merge');
    setSaving(false);
    toast(addedMessage(newCards.length));
    if (onAdded) onAdded();
  }

  const defaultRow = (row, i) => (
    <ScanRow
      key={row.id}
      row={row}
      entranceDelay={i}
      multipliers={multipliers}
      onChange={(patch) => updateRow(row.id, patch)}
      onRemove={() => removeRow(row.id)}
      onFindAnotherImage={() => findAnotherImageForRow(row.id)}
      onFindMarketPrice={() => findMarketPriceForRow(row.id)}
    />
  );

  const CHANNEL_FIELDS = [['posChannel', 'In-store / POS'], ['tcgplayerChannel', 'TCG Player'], ['collectrChannel', 'Collectr']];
  return (
    <>
      <div className="section-label">{title} ({rows.length})</div>
      <div className="field-group" style={{ maxWidth: '420px' }}>
        <label>{locationLabel}</label>
        <LocationPicker locations={locations} value={location} onChange={setLocation} ariaLabel={locationLabel} />
      </div>
      <div className="field-group" style={{ maxWidth: '420px' }}>
        <label>Where do these live?</label>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          {CHANNEL_FIELDS.map(([key, label]) => (
            <div className="checkbox-row" style={{ marginBottom: 0 }} key={key}>
              <input type="checkbox" id={`${idPrefix}_${key}`} checked={channels[key]} onChange={(e) => setChannel(key, e.target.checked)} />
              <label htmlFor={`${idPrefix}_${key}`} className="checkbox-label-plain">{label}</label>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '4px' }}>
          Applies to every card added from this batch — edit an individual item afterward if one differs.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {rows.map((row, i) => (renderRow ? renderRow(row, i, defaultRow) : defaultRow(row, i)))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn secondary small" onClick={addBlankRow}>+ Add missed card</button>
        <div style={{ flex: 1 }} />
        {confirmBlockedReason && <span className="status-line" style={{ margin: 0 }}>{confirmBlockedReason}</span>}
        <button className="btn" disabled={saving || !!confirmBlockedReason} onClick={handleConfirm}>
          {saving ? 'Adding…' : `Add ${rows.length} item(s) to ${destinationLabel}`}
        </button>
      </div>
    </>
  );
}
