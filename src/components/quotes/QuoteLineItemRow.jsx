import { useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { GAMES, RARITY_OPTIONS_BY_GAME, PRINTING_OPTIONS_BY_GAME, CONDITION_OPTIONS, marketValueForCondition, roundPriceUp, roundPriceDown, activeImageSrc } from '../../lib/cardUtils.js';
import { searchCardImage, tcgplayerSearchUrl, ebaySoldSearchUrl, priceChartingSearchUrl } from '../../lib/cardSearch.js';
import { resizeImageFile } from '../../lib/image.js';
import CatalogItemPicker from './CatalogItemPicker.jsx';
import SelectWithCustom from '../SelectWithCustom.jsx';

// Same url/data convention as cardUtils.js's own (unexported) resolveSrc —
// url === 'local' means the real image lives in the data field, otherwise
// url is used directly if it's a real http(s) link. Duplicated locally
// rather than exported from cardUtils.js for this one caller, same
// "a few genuinely similar lines is fine" call already made for
// EditModal's own pendingSrc/ScannerPanel's stockSrc.
function resolveImgSrc(url, data) {
  if (url === 'local' && data) return data;
  if (url && url.startsWith('http')) return url;
  return null;
}

// One line item in a quote's build view. Same field set as EditModal
// (Game/Set/Number/Rarity/Printing/Condition) so an accepted item arrives
// in Catalog with good data — reuses the exact same dense
// .scan-row/.scan-field layout ScannerPanel's ScanRow already uses
// (desktop: compact single-line grid; mobile: one field per line via the
// same shared breakpoint), rather than a third near-identical row layout.
//
// The catalog typeahead (CatalogItemPicker) is the fast path when a card's
// already been handled before, but a genuinely new trade-in card has no
// catalog history to reference — "Find image"/"Find market price" reuse
// the same live external search (Scryfall/TCGdex/etc.) EditModal/
// Scanner already use, scoped locally to this one row (self-contained
// search state, same pattern as EditModal's own candidates/candidateMode).
export default function QuoteLineItemRow({ item, onChange, onRemove, catalog, multipliers }) {
  const { openLightbox } = useUI();
  const [candidates, setCandidates] = useState([]);
  const [candidateMode, setCandidateMode] = useState('image'); // 'image' | 'price'
  const [activeSearch, setActiveSearch] = useState(null); // null | 'image' | 'price'
  const [status, setStatus] = useState({ text: '', kind: '' });
  // Manual "paste a stock image URL" input, same role as EditModal's own
  // manualUrl — local-only text state, not part of the item itself until
  // it's actually a non-empty value staff typed.
  const [manualUrl, setManualUrl] = useState('');
  // The paste-URL input (plus the Remove stock/Remove photo buttons) stays
  // collapsed behind its own toggle button — real feedback found the row
  // too busy with an always-visible input most items never touch. Purely
  // a disclosure state, not part of the item.
  const [showPasteUrl, setShowPasteUrl] = useState(false);

  function patch(p) {
    onChange({ ...item, ...p });
  }

  function handleCatalogPick(card) {
    const p = {
      name: card.name || item.name,
      game: card.game || item.game,
      set: card.set || item.set,
      rarity: card.rarity || item.rarity,
      printing: card.printing || item.printing,
      basePrice: card.basePrice ?? item.basePrice,
      imageUrl: card.imageUrl || item.imageUrl,
      imageData: card.imageData || item.imageData,
      photoUrl: card.photoUrl || item.photoUrl,
      photoData: card.photoData || item.photoData,
      activeImage: card.activeImage || item.activeImage,
      sourceUrl: card.sourceUrl || item.sourceUrl,
    };
    // Only auto-fill price if staff hasn't already typed one — a picked
    // reference card is a starting point, never something that should
    // silently overwrite a value already entered.
    if (item.price == null) {
      const mv = marketValueForCondition(p.basePrice, item.condition, multipliers);
      if (mv != null) p.price = mv;
    }
    patch(p);
  }

  function handleConditionChange(condition) {
    const p = { condition };
    if (item.price == null) {
      const mv = marketValueForCondition(item.basePrice, condition, multipliers);
      if (mv != null) p.price = mv;
    }
    patch(p);
  }

  async function runSearch(mode) {
    setCandidateMode(mode);
    setActiveSearch(mode);
    setStatus({ text: '', kind: '' });
    try {
      const results = await searchCardImage(item.game, item.name.trim(), item.set.trim(), item.rarity.trim(), item.number.trim());
      if (results === null) {
        setCandidates([]);
        setStatus({ text: `No lookup available for ${item.game || 'this game'} yet.`, kind: 'err' });
      } else if (!results.length) {
        setCandidates([]);
        setStatus({ text: 'No matches found.', kind: 'err' });
      } else {
        setCandidates(results);
        setStatus({ text: `${results.length} possible match(es) — pick the one that matches your card.`, kind: 'ok' });
      }
    } catch {
      setCandidates([]);
      setStatus({ text: 'Search failed — try again.', kind: 'err' });
    }
    setActiveSearch(null);
  }

  function selectCandidate(c) {
    // A direct link to the real listing, same as EditModal's own
    // selectCandidate — auto-filled only if staff haven't already put
    // something in Source link themselves, never overwriting a manual
    // entry. Applies in both modes, same reasoning as EditModal: a
    // price-search pick still means staff have identified the exact print.
    const sourceUrlPatch = (c.listingUrl && !item.sourceUrl.trim()) ? { sourceUrl: c.listingUrl } : {};
    // Once staff visually confirm a candidate, that print's own Set/Number/
    // Rarity is more trustworthy than whatever's already in the fields —
    // back-fill whichever of these the candidate actually carries,
    // regardless of which button (Find image or Find price) triggered the
    // search. Previously this only ran on an image-mode pick, silently
    // skipping it for a price-mode pick even though the same search result
    // already carries the same structured data — matches EditModal's own
    // selectCandidate, which backfills unconditionally.
    const backfillPatch = {
      ...(c.set ? { set: c.set } : {}),
      ...(c.number ? { number: c.number } : {}),
      ...(c.rarity ? { rarity: c.rarity } : {}),
    };
    if (candidateMode === 'price') {
      const p = { basePrice: c.price ?? item.basePrice, ...backfillPatch, ...sourceUrlPatch };
      if (item.price == null && p.basePrice != null) {
        const mv = marketValueForCondition(p.basePrice, item.condition, multipliers);
        if (mv != null) p.price = mv;
      }
      patch(p);
    } else {
      patch({
        imageUrl: c.url, imageData: '', activeImage: 'stock',
        ...backfillPatch,
        ...sourceUrlPatch,
      });
    }
    setCandidates([]);
    setStatus({ text: '', kind: '' });
  }

  // "Add image" — a manual real-photo upload, same role as EditModal's own
  // "Upload real photo" (writes to the *photo* slot, resized client-side —
  // resizeImageFile is the exact same helper EditModal/ScannerPanel use).
  // No pending/staging step here, unlike EditModal — this row already
  // patches every other field straight into the item on change, and the
  // whole quote only actually commits when QuoteDetail's own Save is
  // clicked, so there's nothing extra to defer.
  async function handleUploadFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 500, 0.82);
      patch({ photoData: dataUrl, photoUrl: 'local', activeImage: 'photo' });
    } catch (err) {
      setStatus({ text: err.message, kind: 'err' });
    }
  }

  // Pasting a stock image URL writes to the *stock* slot instead — same
  // split EditModal's own manualUrl/stockPending draws between a real photo
  // (uploaded) and a stock reference image (a URL, never uploaded here).
  function handleManualUrlChange(e) {
    const url = e.target.value.trim();
    setManualUrl(e.target.value);
    if (!url) return;
    patch({ imageUrl: url, imageData: '', activeImage: 'stock' });
  }

  const stockSrc = resolveImgSrc(item.imageUrl, item.imageData);
  const photoSrc = resolveImgSrc(item.photoUrl, item.photoData);
  const displaySrc = activeImageSrc(item);
  const searching = activeSearch !== null;

  return (
    <div className="scan-row">
      <div className="scan-row-thumb-col">
        <div
          className="scan-row-thumb"
          onClick={() => { if (displaySrc) openLightbox(displaySrc); }}
          style={{ cursor: displaySrc ? 'pointer' : 'default' }}
          title={displaySrc ? 'Click to zoom' : ''}
        >
          {displaySrc ? <img src={displaySrc} /> : <span style={{ fontSize: '9px', color: 'var(--ink-faint)', textAlign: 'center' }}>{item.game || 'No image'}</span>}
        </div>
        {stockSrc && photoSrc && (
          <div style={{ display: 'flex', gap: '3px', marginTop: '2px' }}>
            <button
              type="button" className={`btn small${item.activeImage === 'photo' ? '' : ' ghost'}`}
              style={{ fontSize: '10px', padding: '2px 5px' }}
              onClick={() => patch({ activeImage: 'photo' })}
            >Photo</button>
            <button
              type="button" className={`btn small${item.activeImage === 'stock' ? '' : ' ghost'}`}
              style={{ fontSize: '10px', padding: '2px 5px' }}
              onClick={() => patch({ activeImage: 'stock' })}
            >Stock</button>
          </div>
        )}
        <button
          className="btn ghost small" style={{ fontSize: '10.5px', padding: '2px 6px', marginTop: '4px' }}
          disabled={searching} onClick={() => runSearch('image')}
        >
          {activeSearch === 'image' ? (<><span className="spinner" style={{ width: '10px', height: '10px' }} /> Searching…</>) : 'Find image'}
        </button>
        {/* Add image / Paste image URL — same manual actions EditModal's
            own img-side offers (a real-photo upload, and a stock-URL
            paste), grouped with Find image/Find price in this one column
            per real feedback, instead of spread into the wider fields
            area. Paste image URL only toggles the input open (see the
            collapsed panel below in .scan-row-fields) — keeps this row
            condensed for the common case where nobody needs it. */}
        <button
          className="btn ghost small" style={{ fontSize: '10.5px', padding: '2px 6px', marginTop: '3px' }}
          onClick={() => document.getElementById(`qliAddImage-${item.id}`).click()}
        >Add image</button>
        <input type="file" id={`qliAddImage-${item.id}`} accept="image/*" style={{ display: 'none' }} onChange={handleUploadFile} />
        <button
          type="button" className={`btn small${showPasteUrl ? '' : ' ghost'}`}
          style={{ fontSize: '10.5px', padding: '2px 6px', marginTop: '3px' }}
          onClick={() => setShowPasteUrl(v => !v)}
        >{showPasteUrl ? 'Hide URL field' : 'Paste image URL'}</button>
        <button
          className="btn ghost small" style={{ fontSize: '10.5px', padding: '2px 6px', marginTop: '3px' }}
          disabled={searching} onClick={() => runSearch('price')}
        >
          {activeSearch === 'price' ? (<><span className="spinner" style={{ width: '10px', height: '10px' }} /> Searching…</>) : 'Find price'}
        </button>
      </div>

      <div className="scan-row-fields">
        <div className="scan-row-line">
          <div className="scan-field sf-qty">
            <label className="scan-field-label">Qty</label>
            <input
              type="number" min="1" placeholder="Qty" value={item.qty}
              onChange={(e) => patch({ qty: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="scan-field sf-wide">
            <label className="scan-field-label">Card name</label>
            <CatalogItemPicker
              catalog={catalog}
              value={item.name}
              onChange={(name) => patch({ name })}
              onSelectCatalogItem={handleCatalogPick}
              ariaLabel="Card name"
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Game</label>
            <select value={item.game} onChange={(e) => patch({ game: e.target.value })}>
              <option value="">— Game —</option>
              {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Set</label>
            <input type="text" placeholder="Set" value={item.set} onChange={(e) => patch({ set: e.target.value })} />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Number</label>
            <input type="text" placeholder="Number" value={item.number} onChange={(e) => patch({ number: e.target.value })} />
          </div>
        </div>
        <div className="scan-row-line">
          <div className="scan-field sf">
            <label className="scan-field-label">Rarity</label>
            <SelectWithCustom
              options={RARITY_OPTIONS_BY_GAME[item.game] || []}
              value={item.rarity}
              onChange={(v) => patch({ rarity: v })}
              ariaLabel="Rarity"
              selectPlaceholder="— Rarity —"
              addNewLabel="+ Enter a different rarity…"
              customPlaceholder="Rarity"
              backLabel="← Choose from the list instead"
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Printing / finish</label>
            <SelectWithCustom
              options={PRINTING_OPTIONS_BY_GAME[item.game] || []}
              value={item.printing}
              onChange={(v) => patch({ printing: v })}
              ariaLabel="Printing / finish"
              selectPlaceholder="— Printing —"
              addNewLabel="+ Enter a different printing…"
              customPlaceholder="Printing"
              backLabel="← Choose from the list instead"
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Condition</label>
            {/* Deliberately no default — a genuine physical assessment
                staff make when buying the card, never assumed. */}
            <SelectWithCustom
              options={CONDITION_OPTIONS}
              value={item.condition}
              onChange={(v) => handleConditionChange(v)}
              ariaLabel="Condition"
              selectPlaceholder="— Select condition —"
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
                type="number" placeholder="Price" step="0.01" value={item.price ?? ''}
                onChange={(e) => patch({ price: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                type="button" className="btn ghost small" style={{ padding: '2px 8px' }}
                title="Round down" aria-label="Round down"
                disabled={item.price == null} onClick={() => patch({ price: roundPriceDown(item.price) })}
              >↓</button>
              <button
                type="button" className="btn ghost small" style={{ padding: '2px 8px' }}
                title="Round up" aria-label="Round up"
                disabled={item.price == null} onClick={() => patch({ price: roundPriceUp(item.price) })}
              >↑</button>
            </div>
          </div>
          <div className="scan-row-meta">
            <button className="icon-btn" title="Remove" onClick={onRemove}>✕</button>
          </div>
        </div>
        {/* Alter % — a card that deserves a different payout rate than
            whatever tier the whole quote ends up bought at (condition,
            rarity, ease of resale), without hand-editing the price and
            leaving a note to remember the "real" value. pctDelta is a
            signed delta in PERCENTAGE POINTS relative to whichever tier
            gets used below (+10 on a 60% tier pays this card at 70%), not
            an absolute override — see computeOfferTiers in quoteUtils.js,
            which already folds this into all three tier amounts shown in
            Total & offer. */}
        <div className="scan-row-line" style={{ alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="checkbox-row" style={{ margin: 0 }}>
            <input
              type="checkbox" id={`qli-pctAltered-${item.id}`} checked={item.pctAltered}
              onChange={(e) => patch({ pctAltered: e.target.checked })}
            />
            <label htmlFor={`qli-pctAltered-${item.id}`} style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>Alter %?</label>
          </div>
          {item.pctAltered && (
            <>
              <input
                type="number" placeholder="e.g. +10 or -20" value={item.pctDelta ?? ''}
                onChange={(e) => patch({ pctDelta: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '110px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                percentage points relative to whichever tier you use below — e.g. +10 on a 60% tier pays this card at 70%.
              </span>
            </>
          )}
        </div>
        {/* Source link — same role as a catalog row's own "Source / product
            URL" field in EditModal. Given a visible label of its own
            (unlike every other field here, whose label stays hidden on
            desktop) since a bare, unlabeled full-width URL input read as
            oversized/unclear what it was for — real feedback. */}
        <div className="scan-row-line">
          <label style={{
            fontSize: '11px', fontFamily: "'IBM Plex Mono', monospace", textTransform: 'uppercase',
            letterSpacing: '0.03em', color: 'var(--ink-soft)', whiteSpace: 'nowrap', flexShrink: 0,
          }}>Source link</label>
          <input
            type="url" placeholder="e.g. TCGplayer product page link" value={item.sourceUrl}
            onChange={(e) => patch({ sourceUrl: e.target.value })}
            style={{ flex: 1, minWidth: 0 }}
          />
          {item.sourceUrl && (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', fontWeight: 600, color: 'var(--blue)', whiteSpace: 'nowrap' }}>
              open ↗
            </a>
          )}
        </div>
        {/* Collapsed behind "Paste image URL" above — the URL input itself
            plus Remove stock/Remove photo (shown once there's actually
            something to remove, same as EditModal), condensed out of the
            way for the common item that never needs them. */}
        {showPasteUrl && (
          <div className="scan-row-line" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <input
              type="url" placeholder="Paste a stock image URL" value={manualUrl} onChange={handleManualUrlChange}
              style={{ flex: '1 1 200px', minWidth: 0 }}
            />
            {stockSrc && <button type="button" className="btn ghost small" onClick={() => patch({ imageUrl: '', imageData: '' })}>Remove stock</button>}
            {photoSrc && <button type="button" className="btn ghost small" onClick={() => patch({ photoUrl: '', photoData: '' })}>Remove photo</button>}
          </div>
        )}
        {/* Three independent, always-available price references, grouped
            under the fields — moved out of the cramped thumbnail column,
            same links/reasoning as EditModal's/ScanRow's own "Reference
            prices" block. TCGPlayer switches between a real listing link
            (once item.sourceUrl is known, via Source link above) and a
            manual search — same logic as EditModal's own reference row,
            now that a quote item actually carries a sourceUrl. */}
        <div className="scan-row-line" style={{ fontSize: '11.5px', color: 'var(--ink-soft)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {item.sourceUrl.trim() ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue)', fontWeight: 600 }}>
              Check live TCGPlayer listing ↗
            </a>
          ) : (
            <a
              href={tcgplayerSearchUrl(item.name, item.set)} target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--blue)', fontWeight: 600 }}
            >TCGPlayer ↗</a>
          )}
          <a
            href={ebaySoldSearchUrl(item.name, item.set)} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--blue)', fontWeight: 600 }}
            title="Requires being signed into eBay to see results."
          >eBay sold ↗</a>
          <a
            href={priceChartingSearchUrl(item.name, item.set)} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--blue)', fontWeight: 600 }}
          >PriceCharting ↗</a>
        </div>
        {status.text && <div className={`status-line ${status.kind}`} style={{ fontSize: '11.5px' }}>{status.text}</div>}
        {candidates.length > 0 && (
          <div className="img-candidates">
            {candidates.map((c, i) => (
              <img key={i} src={c.url} title={c.label} onClick={() => selectCandidate(c)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
