import { GAMES } from '../../lib/cardUtils.js';
import { flatItemAmount } from '../../lib/quoteUtils.js';

// A whole bulk lot — e.g. 20 Pokemon commons, priced as one flat amount
// ("$5 for the lot"), not per card. Treated exactly like a misc. add-on
// for pricing purposes: Qty is informational record-keeping only (never
// multiplied into price), and the price is excluded from the 50/60/70%
// tier math entirely (see computeQuoteTotals's isBulk branch in
// quoteUtils.js) — it only reaches the final offer if staff explicitly
// click "Add to payout" for it in the Total & offer section below, same
// mechanic as a misc. add-on.
//
// Unlike a misc. add-on, this DOES still flow to Sorting on accept, since
// it's a real card destined for real inventory — Game is kept as a real
// field (unlike AddOnLineItemRow) specifically because Bulk placement at
// Sorting time is keyed on (location, game); Name/Description (reusing
// `notes`) describe the lot itself, e.g. "Pokemon surge bulk" / "all
// Pikachus in different conditions".
//
// "Apply a %?" (pctEnabled/pctValue, via flatItemAmount in quoteUtils.js) —
// same mechanic and reasoning as AddOnLineItemRow's own: enter the lot's
// full assessed value, check the box, and let the app work out "60% of
// this" instead of doing it by hand.
export default function BulkLineItemRow({ item, onChange, onRemove, flagMissingGame = false }) {
  function patch(p) {
    onChange({ ...item, ...p });
  }

  const amount = flatItemAmount(item);

  return (
    <div className="scan-row">
      <div className="scan-row-fields">
        <div className="scan-row-line">
          <div className="scan-field sf-qty">
            <label className="scan-field-label">Qty</label>
            <input
              type="number" min="1" placeholder="Qty" value={item.qty}
              onChange={(e) => patch({ qty: Number(e.target.value) || 1 })}
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Game</label>
            <select
              value={item.game}
              className={flagMissingGame && !item.game ? 'field-missing' : undefined}
              aria-invalid={flagMissingGame && !item.game ? true : undefined}
              onChange={(e) => patch({ game: e.target.value })}
            >
              <option value="">— Game —</option>
              {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="scan-field sf-wide">
            <label className="scan-field-label">Lot name</label>
            <input
              type="text" placeholder="e.g. Pokemon surge bulk" value={item.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </div>
          <div className="scan-field sf-wide">
            <label className="scan-field-label">Description</label>
            <input
              type="text" placeholder="e.g. all Pikachus in different conditions" value={item.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </div>
          <div className="scan-field sf">
            <label className="scan-field-label">Price</label>
            <input
              type="number" placeholder="Price" step="0.01" value={item.price ?? ''}
              onChange={(e) => patch({ price: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <div className="scan-row-meta">
            <button className="icon-btn" title="Remove" onClick={onRemove}>✕</button>
          </div>
        </div>
        <div className="scan-row-line" style={{ alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div className="checkbox-row" style={{ margin: 0 }}>
            <input
              type="checkbox" id={`bulk-pct-${item.id}`} checked={item.pctEnabled}
              onChange={(e) => patch({ pctEnabled: e.target.checked })}
            />
            <label htmlFor={`bulk-pct-${item.id}`} style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>Apply a %?</label>
          </div>
          {item.pctEnabled && (
            <>
              <input
                type="number" placeholder="e.g. 60" value={item.pctValue ?? ''}
                onChange={(e) => patch({ pctValue: e.target.value === '' ? null : Number(e.target.value) })}
                style={{ width: '70px' }}
              />
              <span style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>%</span>
              {amount != null && (
                <span style={{ fontSize: '11.5px', fontFamily: "'IBM Plex Mono', monospace" }}>= ${amount.toFixed(2)}</span>
              )}
            </>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
          Flat lot price — Qty is a record only (never multiplies the price). Excluded from the tier % offers below, same as a misc. item; only affects Payout amount if you click "Add to payout." Still goes to Sorting on accept — place it into Bulk there. Check "Apply a %?" to offer only part of the entered value.
        </div>
      </div>
    </div>
  );
}
