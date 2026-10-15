import { useState } from 'react';
import { GAME_TAG_CLASS } from '../lib/cardUtils.js';
import { formatMoney, formatPctChange, alertConditionNote } from '../lib/priceAlertUtils.js';
import { useUI } from '../context/UIContext.jsx';
import PriceAlertMatch from './PriceAlertMatch.jsx';

// Opened from the topbar's "N price alerts" badge. Lists every open
// (unacknowledged) alert from the daily price check, biggest jump first.
// Each alert shows which card the check actually compared against, so a
// wrong-print match is visible before anyone acts on it. "Find card" jumps to
// the item's own detail (Edit) screen — which repeats that comparison next to
// Our Price, lets staff correct the item's details, and clears the alert on
// save — and never changes a price by itself. "Dismiss" just acknowledges.
export default function PriceAlertsModal({ alerts, catalog, onClose, onFindCard, onDismiss }) {
  const { showConfirm, openLightbox } = useUI();
  const [busy, setBusy] = useState(false);
  const bySku = new Map(catalog.map(c => [c.sku, c]));
  const sorted = alerts.slice().sort((a, b) => (b.pctChange ?? 0) - (a.pctChange ?? 0));

  async function dismiss(ids) {
    setBusy(true);
    await onDismiss(ids);
    setBusy(false);
  }

  async function dismissAll() {
    if (!(await showConfirm(`Dismiss all ${alerts.length} price alert(s)? Our prices stay as they are.`))) return;
    await dismiss(alerts.map(a => a.id));
  }

  return (
    <div className="overlay show">
      <div className="modal wide">
        <div className="modal-head">
          <div className="name">Price alerts ({alerts.length})</div>
          <div className="meta">
            Items whose market price has risen well above Our Price since the daily price check last looked.
            Check the card each one was compared against — a different print means a false alarm. Nothing
            changes until you update a price yourself.
          </div>
        </div>
        <div className="modal-body">
          {sorted.length === 0 ? (
            <div className="empty" style={{ padding: '18px 0' }}>
              <span className="mark">No open alerts</span>
              Every price is within range of the market.
            </div>
          ) : (
            <div className="price-alert-list">
              {sorted.map(a => {
                const card = bySku.get(a.sku);
                const ourPrice = card && card.price != null ? card.price : a.previousPrice;
                return (
                  <div className="price-alert-row" key={a.id}>
                    <div className="price-alert-main">
                      <div className="n-name">
                        {a.name}
                        {a.game && <span className={`badge ${GAME_TAG_CLASS[a.game] || 'tag-neutral'}`}>{a.game}</span>}
                      </div>
                      <div className="price-alert-prices mono">
                        <span title="Our Price">{formatMoney(ourPrice)}</span>
                        <span aria-hidden="true">→</span>
                        <span title="Market price found by the daily check">{formatMoney(a.newPrice)}</span>
                        <span className="price-alert-pct">{formatPctChange(a.pctChange)}</span>
                        <span className="price-alert-cond">{alertConditionNote(a)}</span>
                      </div>
                      <div className="price-alert-meta">
                        Detected {a.detectedAt ? new Date(a.detectedAt).toLocaleDateString() : '—'}
                        {!card && ' · no longer in the catalog'}
                      </div>
                      <PriceAlertMatch alert={a} onZoom={openLightbox} />
                    </div>
                    <div className="row-actions price-alert-actions">
                      <button
                        type="button" className="btn secondary small"
                        disabled={!card || busy}
                        onClick={() => onFindCard(a.sku)}
                      >Find card</button>
                      <button
                        type="button" className="btn ghost small"
                        disabled={busy}
                        onClick={() => dismiss([a.id])}
                      >Dismiss</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost small" onClick={onClose}>Close</button>
          {alerts.length > 0 && (
            <button className="btn secondary small" disabled={busy} onClick={dismissAll}>Dismiss all</button>
          )}
        </div>
      </div>
    </div>
  );
}
