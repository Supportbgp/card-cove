import { useEffect, useState } from 'react';
import { channelDefaultsForLocation } from '../../lib/cardUtils.js';
import LocationPicker from '../LocationPicker.jsx';

// One placement decision for `items` — either a single Sorting-queue row
// (the row's own "Sort" button) or several batch-selected rows headed to
// the same binder/case at once (Catalog's own multi-select pattern, applied
// here since real use found staff sorting a whole group of cards from the
// same quote into one collection at a time). Real feedback on the earlier
// whole-quote AcceptQuoteModal (see CLAUDE.md's "Sorting stage" section):
// cards from the same quote can go to several different places, so this
// can't be a single decision forced on an entire quote — batch-selecting a
// subset here is an opt-in convenience, not a return to that all-or-nothing
// model. Two modes:
//   - "individual": a real binder/case + the same POS/TCG Player/Collectr
//     channel checkboxes EditModal uses — each item becomes its own real
//     Catalog row (itemType 'single').
//   - "bulk": just a binder/case — no channels, since a pile of loose bulk
//     cards isn't a sellable SKU on its own. Finds/increments the running
//     count for each item's own (binder, game) pair instead of creating a
//     per-print row (see findBulkRow/buildBulkCatalogItem in cardUtils.js) —
//     a mixed-game batch still resolves correctly since each item looks up
//     its own row by its own game.
export default function SortItemModal({ items, catalog, locations, onConfirm, onCancel }) {
  const [mode, setMode] = useState('individual');
  const [location, setLocation] = useState('');
  const [channels, setChannels] = useState({ posChannel: false, tcgplayerChannel: false, collectrChannel: false });
  const [channelsTouched, setChannelsTouched] = useState(false);
  // Guards against the real duplication bug this was found to cause: with
  // no disabled-while-saving state, a click here while onConfirm's upsert
  // was still in flight fired a second buildCatalogItemsFromQuoteItems call
  // for the same items — which stamps a fresh `quote-${Date.now()}-${i}`
  // sku every call, so a second click created genuinely separate duplicate
  // catalog rows, not a harmless overwrite of the first. Same pattern
  // ScannerPanel.jsx's own Confirm button already uses correctly.
  const [saving, setSaving] = useState(false);

  // Same "follow the majority of this binder/case's existing items until
  // staff manually touch a checkbox" pattern EditModal already uses —
  // only relevant in individual mode, since bulk has no channels at all.
  useEffect(() => {
    if (mode !== 'individual' || channelsTouched) return;
    if (!location.trim()) {
      setChannels({ posChannel: false, tcgplayerChannel: false, collectrChannel: false });
      return;
    }
    setChannels(channelDefaultsForLocation(catalog, location.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, mode]);

  function setChannel(field, value) {
    setChannelsTouched(true);
    setChannels(c => ({ ...c, [field]: value }));
  }

  const hasLocation = location.trim().length > 0;
  const hasChannel = channels.posChannel || channels.tcgplayerChannel || channels.collectrChannel;
  const canSave = mode === 'bulk' ? hasLocation : (hasLocation && hasChannel);

  async function handleConfirm() {
    setSaving(true);
    try {
      await onConfirm({
        mode,
        location: location.trim(),
        posChannel: channels.posChannel,
        tcgplayerChannel: channels.tcgplayerChannel,
        collectrChannel: channels.collectrChannel,
      });
    } finally {
      setSaving(false);
    }
  }

  const single = items.length === 1 ? items[0] : null;

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head">
          <div className="name">
            {single ? <>Sort: {single.name}{single.qty > 1 ? ` × ${single.qty}` : ''}</> : `Sort ${items.length} items`}
          </div>
          <div className="meta">
            {single
              ? ([single.game, single.set, single.condition].filter(Boolean).join(' · ') || 'Where is this going?')
              : `${items.map(i => i.name).join(', ')} — where are they going?`}
          </div>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label>Placement</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button" className={`btn small${mode === 'individual' ? '' : ' ghost'}`}
                onClick={() => setMode('individual')}
              >Place individually</button>
              <button
                type="button" className={`btn small${mode === 'bulk' ? '' : ' ghost'}`}
                onClick={() => setMode('bulk')}
              >Add to Bulk</button>
            </div>
            {mode === 'bulk' && (
              <div className="status-line" style={{ marginTop: '6px' }}>
                {single
                  ? `Adds ${single.qty} to a running Bulk count for ${single.game || 'this game'} in the binder/case below — not tracked as an individual card.`
                  : "Adds each selected card to a running Bulk count for its own game in the binder/case below — not tracked as individual cards."}
              </div>
            )}
          </div>
          <div className="field-group">
            <label>Binder / case / collection</label>
            <LocationPicker
              locations={locations}
              value={location}
              onChange={setLocation}
              ariaLabel="Binder / case / collection"
            />
          </div>
          {mode === 'individual' && (
            <div className="field-group">
              <label>Where does this live?</label>
              <div className="checkbox-row">
                <input type="checkbox" id="si_posChannel" checked={channels.posChannel} onChange={(e) => setChannel('posChannel', e.target.checked)} />
                <label htmlFor="si_posChannel" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>In-store / POS</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" id="si_tcgplayerChannel" checked={channels.tcgplayerChannel} onChange={(e) => setChannel('tcgplayerChannel', e.target.checked)} />
                <label htmlFor="si_tcgplayerChannel" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>TCG Player</label>
              </div>
              <div className="checkbox-row">
                <input type="checkbox" id="si_collectrChannel" checked={channels.collectrChannel} onChange={(e) => setChannel('collectrChannel', e.target.checked)} />
                <label htmlFor="si_collectrChannel" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>Collectr</label>
              </div>
              {!hasChannel && <div className="status-line" style={{ marginTop: '4px' }}>Select at least one.</div>}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" disabled={saving} onClick={() => { if (!saving) onCancel(); }}>Cancel</button>
          <button className="btn" disabled={!canSave || saving} onClick={handleConfirm}>{saving ? 'Saving…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
