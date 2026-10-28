import { Fragment, useEffect, useState } from 'react';
import { computeSalesReport, presetDateRange, customDateRangeToBounds, lossReasonLabel } from '../../lib/reportUtils.js';
import { useUI } from '../../context/UIContext.jsx';
import EditSaleModal from './EditSaleModal.jsx';

// "-$17.00" rather than "$-17.00" (Profit can go negative, e.g. a month
// with only losses).
function money(n) {
  const v = Number(n) || 0;
  return `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
}

const PRESETS = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom' },
];

// Revenue/volume reporting (Feature A, PR 2 — see CLAUDE.md's "Sales
// reporting" section). Deliberately queries only the selected date range on
// demand via `onLoadSales` rather than holding the whole sales history in
// App.jsx's top-level state the way catalog/quotes/sorting are — sales only
// ever grows, with no natural cap, so eagerly loading all of it on every
// sign-in doesn't scale the way it does for those.
export default function ReportsTab({ onLoadSales, onLoadLosses = async () => [], onUpdateSale, onDeleteLoss = async () => {}, refreshKey }) {
  const { showConfirm } = useUI();
  const [preset, setPreset] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [sales, setSales] = useState([]);
  // Lost/stolen cards in the same range (inventory_losses), subtracted from
  // Profit. See CLAUDE.md's "Lost / stolen cards".
  const [losses, setLosses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedGame, setExpandedGame] = useState(null);
  const [editingSale, setEditingSale] = useState(null);

  const range = preset === 'custom' ? customDateRangeToBounds(customFrom, customTo) : presetDateRange(preset);

  useEffect(() => {
    if (!range) { setSales([]); setLosses([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([onLoadSales(range.from, range.to), onLoadLosses(range.from, range.to)]).then(([rows, lossRows]) => {
      if (!cancelled) { setSales(rows); setLosses(lossRows); setLoading(false); }
    });
    return () => { cancelled = true; };
    // onLoadSales is a plain function recreated on every App.jsx render
    // (this app doesn't use useCallback anywhere) — depending on the
    // range's own primitive values instead is what actually determines
    // when a re-fetch is needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range?.from, range?.to, refreshKey]);

  // A new range starts collapsed; a refresh after a sale or an undo
  // (refreshKey) keeps whichever game is open.
  useEffect(() => {
    setExpandedGame(null);
    setEditingSale(null);
  }, [range?.from, range?.to]);

  const report = computeSalesReport(sales, losses);

  async function handleRemoveLoss(loss) {
    const msg = `Remove this loss record (${loss.qty} × ${loss.name}, $${loss.lossAmount.toFixed(2)})?`
      + (loss.refunded ? ' Its sale counts as revenue again (no longer refunded).' : '')
      + (loss.saleId ? '' : " The card's quantity isn't put back; fix it on the card if needed.");
    if (!(await showConfirm(msg, 'Remove loss'))) return;
    setLosses(prev => prev.filter(l => l.id !== loss.id));
    await onDeleteLoss(loss);
  }

  // Patches the local sales array immediately (there's no realtime
  // subscription on this table — see the Reports tab's own on-demand-fetch
  // design note above — so nothing else will reflect the correction unless
  // this does) and fires the real write in parallel. A corrected sale whose
  // Game or Sold date moved it outside the currently-open drill-down/range
  // simply stops appearing there on the next render — the same "it moved,
  // not a bug" behavior a Game/date edit should have.
  async function handleSaveSale(updated) {
    setSales(prev => prev.map(s => (s.id === updated.id ? updated : s)));
    await onUpdateSale(updated);
  }

  return (
    <div>
      <div className="toolbar">
        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', maxWidth: '560px' }}>
          Revenue, volume, and cost/profit from Mark Sold events only. Cost only counts items with a Cost entered on
          their catalog row (via the item's detail screen) or auto-filled from an accepted Quote trade-in — a sale
          with no recorded cost still counts toward Units, just not toward Cost/Profit below. Lost / stolen cards
          (reported from a card's detail screen) are subtracted from Profit at their Cost.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {PRESETS.map(p => (
            <button
              key={p.key} type="button"
              className={`btn small${preset === p.key ? '' : ' ghost'}`}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <span style={{ color: 'var(--ink-faint)' }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="empty"><span className="mark">Loading…</span></div>
      ) : preset === 'custom' && !range ? (
        <div className="empty"><span className="mark">Pick both dates</span>Choose a From and To date to see that range's report.</div>
      ) : sales.length === 0 && losses.length === 0 ? (
        <div className="empty"><span className="mark">Nothing sold in this range</span></div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', marginBottom: '16px' }}>
            <div className="stat-tile stat-units">
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Units sold</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' }}>{report.units}</div>
            </div>
            <div className="stat-tile stat-revenue">
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Revenue</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' }}>${report.revenue.toFixed(2)}</div>
            </div>
            <div className="stat-tile stat-cost">
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Cost</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' }}>${report.cost.toFixed(2)}</div>
            </div>
            <div className="stat-tile stat-losses">
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Losses</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' }}>${report.losses.toFixed(2)}</div>
            </div>
            <div className="stat-tile stat-profit">
              <div style={{ fontSize: '11px', color: 'var(--ink-faint)', textTransform: 'uppercase' }}>Profit</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '14px' }}>{money(report.profit)}</div>
            </div>
          </div>

          {report.refundedCount > 0 && (
            <div className="status-line" style={{ marginBottom: '12px' }}>
              {report.refundedCount} refunded sale(s) (${report.refundedRevenue.toFixed(2)}) are left out of Revenue,
              Cost and Units; their cards count under Losses instead.
            </div>
          )}
          {report.costUnknownCount > 0 && (
            <div className="status-line" style={{ marginBottom: '12px' }}>
              {report.costUnknownCount} sale(s) in this range have no recorded cost — Cost/Profit above only reflect
              the sales that do.
            </div>
          )}

          {/* .table-scroll (not a bare <table>) on both this table and the
              nested drill-down below — a narrow mobile viewport has no
              other mobile-specific handling here (unlike CatalogTable's
              full card-layout swap), so letting a too-wide row scroll
              within its own bounded container, instead of overflowing the
              page, is what keeps body's own overflow-x:hidden safety net
              from ever needing to kick in at the page level (see that
              rule's own comment in index.css for why a page-level overflow
              here specifically risks the same mobile zoom-to-fit/Playwright-
              click-desync bug this app already hit once with .docs-callout). */}
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Game</th><th>Units</th><th>Revenue</th><th>Cost</th><th>Losses</th><th>Profit</th></tr>
              </thead>
              <tbody>
                {report.byGame.map(g => {
                  const isOpen = expandedGame === g.game;
                  // Mirrors computeSalesReport's own blank-game->"Unknown"
                  // grouping so the drill-down matches exactly the rows that
                  // were summed into this game's totals above.
                  const items = sales
                    .filter(s => (s.game || 'Unknown') === g.game)
                    .slice()
                    .sort((a, b) => b.soldAt - a.soldAt);
                  return (
                    <Fragment key={g.game}>
                      <tr
                        onClick={() => setExpandedGame(isOpen ? null : g.game)}
                        style={{ cursor: 'pointer' }}
                        aria-expanded={isOpen}
                      >
                        <td>{isOpen ? '▼' : '▶'} {g.game}</td>
                        <td>{g.units}</td>
                        <td>${g.revenue.toFixed(2)}</td>
                        <td>${g.cost.toFixed(2)}</td>
                        <td>{g.losses ? `$${g.losses.toFixed(2)}` : '—'}</td>
                        <td>{money(g.profit)}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={6} style={{ padding: '0 0 12px 24px', background: 'var(--surface-alt)' }}>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr><th>Name</th><th>Condition</th><th>Qty</th><th>Price</th><th>Cost</th><th>Sold</th><th></th></tr>
                                </thead>
                                <tbody>
                                  {items.map(s => (
                                    <tr key={s.id} className={s.refundedAt ? 'sale-refunded' : undefined}>
                                      <td>
                                        {s.name}
                                        {s.refundedAt && <span className="badge refunded-badge">Refunded</span>}
                                      </td>
                                      <td>{s.condition || '—'}</td>
                                      <td>{s.qtySold}</td>
                                      <td>{s.salePrice == null ? '—' : `$${Number(s.salePrice).toFixed(2)}`}</td>
                                      <td>{s.cost == null ? '—' : `$${Number(s.cost).toFixed(2)}`}</td>
                                      <td>{new Date(s.soldAt).toLocaleDateString()}</td>
                                      <td>
                                        <button className="btn secondary small" onClick={() => setEditingSale(s)}>Edit</button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {losses.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: '20px' }}>Lost / stolen</div>
              <div className="table-scroll">
                <table className="losses-table">
                  <thead>
                    <tr><th>Date</th><th>Card</th><th>Reason</th><th>Qty</th><th>Loss</th><th>Notes</th><th></th></tr>
                  </thead>
                  <tbody>
                    {losses.slice().sort((a, b) => b.occurredAt - a.occurredAt).map(l => (
                      <tr key={l.id}>
                        <td>{new Date(l.occurredAt).toLocaleDateString()}</td>
                        <td>{l.name}{l.game ? ` (${l.game})` : ''}</td>
                        <td>
                          {lossReasonLabel(l.reason)}
                          {l.refunded && <span className="badge refunded-badge">Customer refunded</span>}
                        </td>
                        <td>{l.qty}</td>
                        <td>${l.lossAmount.toFixed(2)}</td>
                        <td>{l.notes || '—'}</td>
                        <td>
                          <button className="btn ghost small" onClick={() => handleRemoveLoss(l)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {editingSale && (
        <EditSaleModal
          sale={editingSale}
          onClose={() => setEditingSale(null)}
          onSave={handleSaveSale}
        />
      )}
    </div>
  );
}
