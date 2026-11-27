import { useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { GAMES } from '../../lib/cardUtils.js';
import { normalizeQuoteItem, itemsFromCatalogRows } from '../../lib/quoteUtils.js';
import {
  OPENING_REASONS, normalizeOpening, computeOpeningTotals, computeOpeningItemCosts,
  fillGameFromOpening, formatSigned, openingLabel,
} from '../../lib/openingUtils.js';
import QuoteLineItemRow from '../quotes/QuoteLineItemRow.jsx';
import BulkLineItemRow from '../quotes/BulkLineItemRow.jsx';
import ScannerPanel from '../scanner/ScannerPanel.jsx';
import ImportPanel from '../importexport/ImportPanel.jsx';

// "2026-11-26T14:05" for a datetime-local input, in local time.
function toLocalInput(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function money(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}

function moneyInput(v) {
  return v === '' ? null : Number(v);
}

// One opening: what was opened, the pulls (valued per card, like a quote),
// and the totals. Rendered with key={opening.id} by OpeningsTab, so
// switching openings remounts it fresh.
export default function OpeningDetail({ opening, catalog, wantRequests, hotIndex, locations, multipliers, onSave, onDelete, onClose }) {
  const { showConfirm } = useUI();
  const [draft, setDraft] = useState(() => normalizeOpening(opening));
  const [addMode, setAddMode] = useState(null); // null | 'scan' | 'import'
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setDraft(d => ({ ...d, [field]: value }));
  }
  function addItem(extra) {
    setDraft(d => ({ ...d, items: [...d.items, normalizeQuoteItem({ game: d.game, ...extra })] }));
  }
  function updateItem(id, next) {
    setDraft(d => ({ ...d, items: d.items.map(it => (it.id === id ? next : it)) }));
  }
  function removeItem(id) {
    setDraft(d => ({ ...d, items: d.items.filter(it => it.id !== id) }));
  }
  function appendFromCards(cards) {
    setDraft(d => ({ ...d, items: [...d.items, ...itemsFromCatalogRows(cards)] }));
    setAddMode(null);
  }

  const singles = draft.items.filter(i => !i.isBulk);
  const bulk = draft.items.filter(i => i.isBulk);
  const totals = computeOpeningTotals(draft.items, draft.expectedValue);
  const vsSealed = draft.sealedValue == null ? null : Math.round((totals.actualTotal - draft.sealedValue) * 100) / 100;

  // Marking Done moves the pulls to Sorting. A pull with no Game (and no
  // opening Game to fall back on) would land in Catalog as "Other", so that
  // blocks it, same rule as accepting a quote.
  const movingNow = draft.status === 'done' && !draft.movedToSorting;
  const withGames = fillGameFromOpening(draft.items, draft.game);
  const missingGame = withGames.filter(i => !(i.game || '').trim());
  const missingGameBlocks = movingNow && missingGame.length > 0;
  const costed = movingNow ? computeOpeningItemCosts(withGames, draft.sealedValue) : [];
  const costedCount = costed.filter(i => i.cost != null).length;

  async function handleSave() {
    if (missingGameBlocks || saving) return;
    setSaving(true);
    const saved = await onSave(draft);
    setSaving(false);
    if (saved) onClose();
  }

  async function handleDelete() {
    if (!(await showConfirm(`Delete ${openingLabel(draft)}? Cards already sent to Sorting or Catalog stay where they are. This can't be undone.`))) return;
    if (await onDelete(opening.id)) onClose();
  }

  const diffClass = totals.difference == null ? '' : totals.difference >= 0 ? ' up' : ' down';

  return (
    <div className="overlay show">
      <div className="modal xwide">
        <div className="modal-head">
          <div className="name">{opening.id ? openingLabel(draft) : `New opening${draft.productName ? `: ${draft.productName}` : ''}`}</div>
          <div className="meta">
            {!opening.id ? 'Not saved yet. Nothing is kept until you hit Save'
              : draft.movedToSorting ? 'Done. Pulls were sent to Sorting' : 'In progress. Save any time, come back later'}
          </div>
        </div>
        <div className="modal-body">
          <div className="section-label">What was opened</div>
          <div className="form-section">
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="op-product">Name of product</label>
                <input id="op-product" type="text" placeholder="e.g. Surging Sparks Booster Box" value={draft.productName} onChange={(e) => set('productName', e.target.value)} />
              </div>
              <div className="field-row2">
                <div className="field-group">
                  <label htmlFor="op-qty">Quantity</label>
                  <input id="op-qty" type="number" min="1" value={draft.productQty} onChange={(e) => set('productQty', Math.max(1, Number(e.target.value) || 1))} />
                </div>
                <div className="field-group">
                  <label htmlFor="op-game">Game</label>
                  <select id="op-game" value={draft.game} onChange={(e) => set('game', e.target.value)}>
                    <option value="">— Game —</option>
                    {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="op-date">Date and time</label>
                <input
                  id="op-date" type="datetime-local" value={toLocalInput(draft.openedAt)}
                  onChange={(e) => { const d = new Date(e.target.value); if (!Number.isNaN(d.getTime())) set('openedAt', d.toISOString()); }}
                />
              </div>
              <div className="field-group">
                <label htmlFor="op-employee">Employee opening</label>
                <input id="op-employee" type="text" placeholder="e.g. John Doe" value={draft.employee} onChange={(e) => set('employee', e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="op-reason">Reason for opening</label>
              <input id="op-reason" type="text" list="op-reason-options" placeholder="Pick one or type your own" value={draft.reason} onChange={(e) => set('reason', e.target.value)} />
              <datalist id="op-reason-options">
                {OPENING_REASONS.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="op-sealed">Value of sealed product ($)</label>
                <input id="op-sealed" type="number" step="0.01" min="0" placeholder={draft.productQty > 1 ? `For all ${draft.productQty}` : ''} value={draft.sealedValue ?? ''} onChange={(e) => set('sealedValue', moneyInput(e.target.value))} />
              </div>
              <div className="field-group">
                <label htmlFor="op-expected">Expected value ($)</label>
                <input id="op-expected" type="number" step="0.01" min="0" placeholder="What you expect the pulls to be worth" value={draft.expectedValue ?? ''} onChange={(e) => set('expectedValue', moneyInput(e.target.value))} />
              </div>
            </div>
            <div className="opening-hint">
              Sealed value is split across the pulls as their Cost when the opening is marked Done. Enter it for the whole quantity.
            </div>
          </div>

          <div className="section-label">Singles pulled ({singles.length})</div>
          <div className="form-section">
            <div className="opening-items">
              {singles.map(item => (
                <QuoteLineItemRow
                  key={item.id}
                  item={item}
                  forOpening
                  flagMissingGame={missingGameBlocks}
                  catalog={catalog}
                  wantRequests={wantRequests}
                  hotIndex={hotIndex}
                  multipliers={multipliers}
                  onChange={(next) => updateItem(item.id, next)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
            <div className="opening-add">
              <button className="btn secondary small" onClick={() => addItem({})}>+ Add card manually</button>
              <button className="btn secondary small" onClick={() => setAddMode('scan')}>+ Add cards by scanning</button>
              <button className="btn secondary small" onClick={() => setAddMode('import')}>+ Add cards by import</button>
            </div>
          </div>

          <div className="section-label">Bulk ({bulk.length})</div>
          <div className="form-section">
            <div className="opening-items">
              {bulk.map(item => (
                <BulkLineItemRow
                  key={item.id}
                  item={item}
                  forOpening
                  flagMissingGame={missingGameBlocks}
                  onChange={(next) => updateItem(item.id, next)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </div>
            <button className="btn secondary small" onClick={() => addItem({ isBulk: true })}>+ Add bulk lot</button>
          </div>

          <div className="section-label">Value</div>
          <div className="form-section">
            <div className="opening-stats">
              <Stat label="Sealed product" value={money(draft.sealedValue)} />
              <Stat label="Expected" value={money(draft.expectedValue)} />
              <Stat label="Actual, singles" value={money(totals.singlesValue)} testId="op-singles" />
              <Stat label="Bulk" value={money(totals.bulkValue)} testId="op-bulk" />
              <Stat label="Actual total" value={money(totals.actualTotal)} testId="op-total" />
              <Stat
                label="Difference vs. expected"
                value={totals.difference == null ? 'Enter Expected' : `${formatSigned(totals.difference)}${totals.differencePct != null ? ` (${totals.differencePct > 0 ? '+' : ''}${totals.differencePct}%)` : ''}`}
                className={`opening-diff${diffClass}`}
                testId="op-diff"
              />
            </div>
            {vsSealed != null && (
              <div className="opening-hint">Pulls vs. sealed value: <span className="mono">{formatSigned(vsSealed)}</span></div>
            )}
            {totals.unpriced > 0 && (
              <div className="status-line" style={{ marginTop: '6px' }}>
                {totals.unpriced} pull(s) have no price yet and aren't counted.
              </div>
            )}
            <div className="field-group" style={{ marginTop: '10px' }}>
              <label htmlFor="op-diff-reason">Reason for the difference</label>
              <textarea id="op-diff-reason" rows={2} placeholder="e.g. no chase card in this box" value={draft.differenceReason} onChange={(e) => set('differenceReason', e.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="op-notes">Notes</label>
              <textarea id="op-notes" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="op-status">Status</label>
              <select
                id="op-status" value={draft.status} disabled={draft.movedToSorting}
                onChange={(e) => set('status', e.target.value)}
              >
                <option value="open">In progress</option>
                <option value="done">Done: send pulls to Sorting</option>
              </select>
            </div>
            {missingGameBlocks && (
              <div className="status-line err">
                Pick a Game for {missingGame.length} pull(s), or set the opening's Game, before marking it Done:{' '}
                {missingGame.slice(0, 5).map(i => i.name || '(no name)').join(', ')}
                {missingGame.length > 5 ? `, and ${missingGame.length - 5} more` : ''}.
              </div>
            )}
            {movingNow && !missingGameBlocks && (
              <div className="status-line ok">
                Saving will move {draft.items.length} pull(s) to Sorting
                {draft.sealedValue != null && costedCount > 0
                  ? `, with the sealed value (${money(draft.sealedValue)}) split across ${costedCount} of them as Cost.`
                  : '. Without a sealed value (or prices on the pulls), they get no Cost.'}
              </div>
            )}
            {draft.movedToSorting && (
              <div className="opening-hint">
                These pulls are already in Sorting or Catalog. Changes here only update this record.
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          {opening.id ? <button className="btn ghost" onClick={handleDelete}>Delete</button> : <span />}
          <div style={{ flex: 1 }} />
          <button className="btn secondary" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving || missingGameBlocks} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {addMode && (
        <div className="overlay show">
          <div className="modal xwide">
            <div className="modal-head">
              <div className="name">{addMode === 'scan' ? 'Scan pulls' : 'Import pulls'}</div>
              <div className="meta">Cards are added to this opening, not the catalog</div>
            </div>
            <div className="modal-body">
              {addMode === 'scan' ? (
                <ScannerPanel
                  catalog={catalog} locations={locations} multipliers={multipliers}
                  destinationLabel="opening"
                  onImport={async (cards) => appendFromCards(cards)}
                />
              ) : (
                <ImportPanel
                  catalog={catalog} locations={locations} embedded
                  onImport={async (cards) => appendFromCards(cards)}
                />
              )}
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setAddMode(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, className = '', testId }) {
  return (
    <div className={`opening-stat ${className}`} data-testid={testId}>
      <div className="opening-stat-label">{label}</div>
      <div className="opening-stat-value">{value}</div>
    </div>
  );
}
