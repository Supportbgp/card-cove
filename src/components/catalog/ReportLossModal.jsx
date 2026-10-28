import { useEffect, useState } from 'react';
import { LOSS_REASONS, computeLossAmount } from '../../lib/reportUtils.js';

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

// "Report lost / stolen", opened from a card's Edit screen (see CLAUDE.md's
// "Lost / stolen cards"). Two situations, decided with the user:
//   - "stock": copies missing from stock (the card's qty goes down, and a
//     Sync Queue ticket reminds staff to take the listing down);
//   - "sale": a card that was sold and then lost in shipment, picked from
//     its own sales. "Customer refunded" takes that sale out of Reports'
//     revenue.
// The loss is valued at Cost x qty. With no Cost on the card (or the sale),
// the window says so and asks for it right here; the cost is saved on the
// card too.
export default function ReportLossModal({ card, onLoadSales, onConfirm, onCancel }) {
  const inStock = (Number(card.qty) || 0) > 0;
  const [mode, setMode] = useState(inStock ? 'stock' : 'sale');
  const [sales, setSales] = useState(null); // null = still loading
  const [saleId, setSaleId] = useState('');
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState(inStock ? '' : 'lost_in_shipment');
  const [notes, setNotes] = useState('');
  const [refunded, setRefunded] = useState(false);
  const [costInput, setCostInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onLoadSales(card.sku).then(rows => {
      if (cancelled) return;
      // A sale already refunded for a loss can't be reported again.
      const open = rows.filter(s => !s.refundedAt);
      setSales(open);
      if (open.length) setSaleId(open[0].id);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.sku]);

  function chooseMode(next) {
    setMode(next);
    if (next === 'sale' && !reason) setReason('lost_in_shipment');
  }

  const sale = mode === 'sale' && sales ? sales.find(s => s.id === saleId) || null : null;
  const lossQty = mode === 'sale' ? (sale ? Number(sale.qtySold) || 1 : 0) : qty;
  const knownCost = mode === 'sale' && sale && sale.cost != null ? sale.cost : card.cost;
  const needsCost = knownCost === null || knownCost === undefined || knownCost === '';
  const costEach = needsCost ? (costInput === '' ? null : Number(costInput)) : Number(knownCost);
  const lossAmount = computeLossAmount(costEach, lossQty);
  const saleRevenue = sale && sale.salePrice != null ? Number(sale.salePrice) * (Number(sale.qtySold) || 0) : null;

  let blocked = '';
  if (mode === 'stock' && !(qty >= 1 && qty <= card.qty)) blocked = `Pick between 1 and ${card.qty}.`;
  else if (mode === 'sale' && sales && !sales.length) blocked = 'This card has no sales to pick from.';
  else if (mode === 'sale' && !sale) blocked = 'Pick the sale this loss belongs to.';
  else if (!reason) blocked = 'Pick a reason.';
  else if (lossAmount === null) blocked = 'Enter the Cost so the loss can be calculated.';

  async function handleConfirm() {
    if (blocked || saving) return;
    setSaving(true);
    try {
      await onConfirm({
        mode, qty: lossQty, reason, notes: notes.trim(),
        costEach, costEntered: needsCost, lossAmount,
        sale: mode === 'sale' ? sale : null,
        refunded: mode === 'sale' && refunded,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head">
          <div className="name">Report lost / stolen: {card.name}</div>
          <div className="meta">{[card.game, card.set, card.condition].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label>What happened?</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button type="button" className={`btn small${mode === 'stock' ? '' : ' ghost'}`} disabled={!inStock}
                onClick={() => chooseMode('stock')}>Missing from stock</button>
              <button type="button" className={`btn small${mode === 'sale' ? '' : ' ghost'}`}
                onClick={() => chooseMode('sale')}>Lost after a sale</button>
            </div>
            {!inStock && (
              <div className="status-line" style={{ marginTop: '6px' }}>None in stock, so only a sold copy can be reported.</div>
            )}
          </div>

          {mode === 'stock' && (
            <div className="field-group">
              <label htmlFor="rl_qty">How many?</label>
              <input id="rl_qty" type="number" min="1" max={card.qty} value={qty}
                onChange={(e) => setQty(Math.floor(Number(e.target.value)) || 0)} style={{ maxWidth: '120px' }} />
              <div className="status-line" style={{ marginTop: '4px' }}>
                {card.qty} in stock. Their listings get a Sync Queue ticket to take them down.
              </div>
            </div>
          )}

          {mode === 'sale' && (
            <div className="field-group">
              <label>Which sale?</label>
              {sales === null ? (
                <div className="status-line"><span className="spinner" /> Loading this card's sales…</div>
              ) : sales.length === 0 ? (
                <div className="status-line err">No sales recorded for this card.</div>
              ) : (
                <div className="loss-sales">
                  {sales.map(s => (
                    <label key={s.id} className="loss-sale">
                      <input type="radio" name="rl_sale" checked={saleId === s.id} onChange={() => setSaleId(s.id)} />
                      <span>
                        {new Date(s.soldAt).toLocaleDateString()} · {s.qtySold} × {s.salePrice == null ? '—' : money(s.salePrice)}
                        {s.condition ? ` · ${s.condition}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {sale && (
                <div className="checkbox-row" style={{ marginTop: '8px', marginBottom: 0 }}>
                  <input type="checkbox" id="rl_refunded" checked={refunded} onChange={(e) => setRefunded(e.target.checked)} />
                  <label htmlFor="rl_refunded" className="checkbox-label-plain">Customer was refunded</label>
                </div>
              )}
            </div>
          )}

          <div className="field-group">
            <label htmlFor="rl_reason">Reason</label>
            <select id="rl_reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">— Pick a reason —</option>
              {LOSS_REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label htmlFor="rl_notes">Notes (optional)</label>
            <input id="rl_notes" type="text" placeholder="e.g. USPS tracking stopped, order #1234" value={notes}
              onChange={(e) => setNotes(e.target.value)} />
          </div>

          {needsCost && (
            <div className="field-group">
              <div className="loss-cost-missing">
                This card has no <b>Cost</b>, so the loss can't be calculated. Enter what the shop paid per copy; it's
                saved on the card too.
              </div>
              <label htmlFor="rl_cost">Cost per copy ($)</label>
              <input id="rl_cost" type="number" min="0" step="0.01" value={costInput}
                className={costInput === '' ? 'field-missing' : undefined}
                onChange={(e) => setCostInput(e.target.value)} style={{ maxWidth: '160px' }} />
            </div>
          )}

          <div className="loss-summary">
            {lossAmount === null ? (
              <span>Loss: <b>—</b> (needs a Cost)</span>
            ) : (
              <span>Loss: <b>{money(lossAmount)}</b> ({lossQty} × {money(costEach)} cost)</span>
            )}
            {mode === 'sale' && refunded && saleRevenue != null && (
              <div>The sale's {money(saleRevenue)} revenue comes out of Reports (refunded).</div>
            )}
          </div>
          {blocked && <div className="status-line" style={{ marginTop: '6px' }}>{blocked}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" disabled={saving} onClick={() => { if (!saving) onCancel(); }}>Cancel</button>
          <button className="btn danger" disabled={!!blocked || saving} onClick={handleConfirm}>
            {saving ? 'Saving…' : 'Report loss'}
          </button>
        </div>
      </div>
    </div>
  );
}
