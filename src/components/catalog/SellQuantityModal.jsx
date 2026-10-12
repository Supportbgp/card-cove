import { useState } from 'react';

// Restores partial-quantity selling for a single multi-copy item, removed
// along with the old per-row Sell button/SellModal.jsx (see CLAUDE.md's
// "Catalog: click-to-select rows, per-row Sell removed" section) and
// brought back after a real Discord report: staff selling 2 of 7 copies of
// a card had no way to do that — "Mark sold" always sold a selected item's
// entire remaining qty. Only shown when exactly one item is selected and
// its qty > 1 (CatalogPanel.jsx's own handleBatchSell decides that) — a
// qty-1 item or a multi-item batch keep the existing plain yes/no confirm,
// since there's nothing to pick a quantity for in either of those cases.
export default function SellQuantityModal({ card, onConfirmFull, onConfirmPartial, onCancel }) {
  const [qty, setQty] = useState(card.qty);
  const [saving, setSaving] = useState(false);

  const n = Number(qty);
  const valid = Number.isInteger(n) && n > 0 && n <= card.qty;

  async function handleConfirm() {
    if (!valid) return;
    setSaving(true);
    try {
      if (n === card.qty) {
        await onConfirmFull();
      } else {
        await onConfirmPartial(n);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head">
          <div className="name">Mark sold: {card.name}</div>
          <div className="meta">{card.qty} in stock — how many sold?</div>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label>Quantity sold</label>
            <input
              type="number"
              min={1}
              max={card.qty}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              style={{ width: '100px' }}
            />
            {!valid && <div className="status-line err" style={{ marginTop: '4px' }}>Enter a number from 1 to {card.qty}.</div>}
            {valid && n < card.qty && (
              <div className="status-line" style={{ marginTop: '4px' }}>
                The remaining {card.qty - n} will stay in stock under this same SKU.
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn secondary" disabled={saving} onClick={() => { if (!saving) onCancel(); }}>Cancel</button>
          <button className="btn" disabled={!valid || saving} onClick={handleConfirm}>{saving ? 'Saving…' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}
