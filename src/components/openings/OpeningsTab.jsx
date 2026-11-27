import { useEffect, useMemo, useState } from 'react';
import { GAMES } from '../../lib/cardUtils.js';
import { computeOpeningTotals, normalizeOpening, formatSigned } from '../../lib/openingUtils.js';
import OpeningDetail from './OpeningDetail.jsx';

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'In progress' },
  { key: 'done', label: 'Done' },
];

const SORT_COLUMNS = {
  openedAt: o => o.openedAt || '',
  product: o => (o.productName || '').toLowerCase(),
  game: o => (o.game || '').toLowerCase(),
  actual: o => computeOpeningTotals(o.items, o.expectedValue).actualTotal,
  difference: o => computeOpeningTotals(o.items, o.expectedValue).difference ?? -Infinity,
};

function formatWhen(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function money(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}

// Sealed product the store opens itself (CLAUDE.md "Openings"): a list,
// and one opening's detail view at a time.
export default function OpeningsTab({
  openings, catalog, wantRequests, hotIndex = null, locations, multipliers, onSave, onDelete,
  openRequest = null, onOpenRequestHandled = () => {},
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [newDraft, setNewDraft] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [gameFilter, setGameFilter] = useState('');
  const [sortState, setSortState] = useState({ col: 'openedAt', dir: -1 });

  // "View opening" from a catalog item's edit screen.
  useEffect(() => {
    if (!openRequest) return;
    setNewDraft(null);
    setSelectedId(openRequest.id);
    onOpenRequestHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const keyFn = SORT_COLUMNS[sortState.col] || SORT_COLUMNS.openedAt;
    return openings
      .filter(o => {
        if (statusFilter && o.status !== statusFilter) return false;
        if (gameFilter && o.game !== gameFilter) return false;
        if (q && !`${o.productName} ${o.employee} ${o.reason} ${o.openingNumber ?? ''}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        const av = keyFn(a), bv = keyFn(b);
        const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av > bv ? 1 : av < bv ? -1 : 0);
        return cmp * sortState.dir;
      });
  }, [openings, search, statusFilter, gameFilter, sortState]);

  const gamesInUse = useMemo(() => GAMES.filter(g => openings.some(o => o.game === g)), [openings]);
  const selected = selectedId ? openings.find(o => o.id === selectedId) : null;
  const open = selected || newDraft;

  function setSort(col) {
    setSortState(s => (s.col === col ? { col, dir: s.dir * -1 } : { col, dir: 1 }));
  }
  function arrow(col) {
    return sortState.col === col ? (sortState.dir === 1 ? ' ▲' : ' ▼') : '';
  }
  function close() {
    setSelectedId(null);
    setNewDraft(null);
  }

  return (
    <div>
      <div className="card card-pad">
        <div className="openings-head">
          <div className="section-label" style={{ marginBottom: 0 }}>Openings</div>
          <button className="btn" onClick={() => { setSelectedId(null); setNewDraft(normalizeOpening({})); }}>+ New opening</button>
        </div>
        <div className="opening-hint" style={{ marginBottom: '12px' }}>
          Sealed product we open ourselves for singles and bulk. List what was pulled and value each card, then mark it Done to send the pulls to Sorting.
        </div>
        {openings.length === 0 ? (
          <div className="empty"><span className="mark">No openings yet</span>Start one with "+ New opening".</div>
        ) : (
          <>
            <div className="openings-filters">
              <input
                type="search" className="search-input" placeholder="Search product, employee, reason…"
                aria-label="Search openings" value={search} onChange={(e) => setSearch(e.target.value)}
              />
              {gamesInUse.length > 1 && (
                <select aria-label="Game" value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
                  <option value="">All games</option>
                  {gamesInUse.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <div className="openings-status-filter">
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.key} type="button" aria-pressed={statusFilter === f.key}
                    className={`btn small${statusFilter === f.key ? '' : ' ghost'}`}
                    onClick={() => setStatusFilter(f.key)}
                  >{f.label}</button>
                ))}
              </div>
            </div>
            {rows.length === 0 ? (
              <div className="opening-hint">No openings match this search/filter.</div>
            ) : (
              <div className="table-scroll">
                <table className="openings-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => setSort('openedAt')}>Opened{arrow('openedAt')}</th>
                      <th className="sortable" onClick={() => setSort('product')}>Product{arrow('product')}</th>
                      <th className="sortable" onClick={() => setSort('game')}>Game{arrow('game')}</th>
                      <th>Sealed</th>
                      <th className="sortable" onClick={() => setSort('actual')}>Actual{arrow('actual')}</th>
                      <th className="sortable" onClick={() => setSort('difference')}>vs. expected{arrow('difference')}</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(o => {
                      const t = computeOpeningTotals(o.items, o.expectedValue);
                      return (
                        <tr key={o.id} className={o.status === 'done' ? 'opening-row-done' : 'opening-row-open'} onClick={() => setSelectedId(o.id)}>
                          <td>{formatWhen(o.openedAt)}</td>
                          <td>
                            <span className="opening-num">#{o.openingNumber}</span>{' '}
                            {o.productQty > 1 ? `${o.productQty}× ` : ''}{o.productName || '(no name)'}
                            {o.employee ? <div className="opening-sub">{o.employee}{o.reason ? ` · ${o.reason}` : ''}</div> : null}
                          </td>
                          <td>{o.game || '—'}</td>
                          <td className="mono">{money(o.sealedValue)}</td>
                          <td className="mono">{money(t.actualTotal)}</td>
                          <td className={`mono opening-diff${!t.difference ? '' : t.difference > 0 ? ' up' : ' down'}`}>{formatSigned(t.difference)}</td>
                          <td>{o.status === 'done' ? 'Done' : 'In progress'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {open && (
        <OpeningDetail
          key={open.id || 'new-opening'}
          opening={open}
          catalog={catalog}
          wantRequests={wantRequests}
          hotIndex={hotIndex}
          locations={locations}
          multipliers={multipliers}
          onSave={onSave}
          onDelete={onDelete}
          onClose={close}
        />
      )}
    </div>
  );
}
