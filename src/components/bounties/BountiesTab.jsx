import { useMemo, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import {
  BOUNTY_STATE_LABELS, bountyState, bountyDaysLeft, bountyDetailLine, bountyPriceLabel, bountyStockMatches,
} from '../../lib/bounties.js';

const FILTERS = ['open', 'expired', 'fulfilled', 'cancelled', 'removed', 'all'];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

// Staff view of every bounty (CLAUDE.md "Bounties"): who asked (their
// Discord name, never shown publicly), whether the catalog already has the
// card, and Mark fulfilled / Remove.
export default function BountiesTab({ bounties, catalog, onAction, onRefresh }) {
  const { showConfirm } = useUI();
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(() => {
    const c = { all: bounties.length };
    for (const b of bounties) { const s = bountyState(b); c[s] = (c[s] || 0) + 1; }
    return c;
  }, [bounties]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bounties.filter(b => {
      if (filter !== 'all' && bountyState(b) !== filter) return false;
      if (q && !`${b.name} ${b.set} ${b.discordName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bounties, filter, query]);

  async function act(b, action) {
    const question = action === 'fulfill'
      ? `Mark the bounty for ${b.name} as fulfilled? ${b.discordName || 'The member'} is pinged in Discord that the card is in.`
      : `Remove the bounty for ${b.name}? It's taken off the website. Nothing is posted in Discord.`;
    if (!(await showConfirm(question, action === 'fulfill' ? 'Mark fulfilled' : 'Remove'))) return;
    setBusyId(b.id);
    await onAction(b, action);
    setBusyId(null);
  }

  async function refresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <div>
      <div className="toolbar">
        <div className="status-line" style={{ margin: 0, flex: 1 }}>
          Cards BGP Discord members are looking for. Members post them from the public stock page's Wanted view; each
          stays open 60 days. Their Discord name is only shown here.
        </div>
        <button className="btn ghost small" disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="bounty-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            className={`btn small${filter === f ? '' : ' ghost'}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : BOUNTY_STATE_LABELS[f]} ({counts[f] || 0})
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Search bounties"
        placeholder="Search by card or member"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ margin: '8px 0', width: '100%', maxWidth: 360 }}
      />
      {rows.length === 0 ? (
        <div className="empty"><span className="mark">No bounties here</span></div>
      ) : (
        <div className="table-scroll">
          <table className="bounties-table">
            <thead>
              <tr><th></th><th>Card</th><th>Max price</th><th>Member</th><th>Posted</th><th>Status</th><th>In stock</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(b => {
                const state = bountyState(b);
                const days = bountyDaysLeft(b);
                const inStock = bountyStockMatches(b, catalog);
                const qty = inStock.reduce((n, c) => n + c.qty, 0);
                return (
                  <tr key={b.id}>
                    <td>{b.imageUrl ? <img className="bounty-thumb" src={b.imageUrl} alt="" /> : null}</td>
                    <td>
                      <div className="n-name">{b.name}</div>
                      <div className="n-sub">{[b.game, bountyDetailLine(b)].filter(Boolean).join(' · ')}</div>
                      {b.notes && <div className="n-sub">“{b.notes}”</div>}
                    </td>
                    <td className="mono">{bountyPriceLabel(b)}</td>
                    <td>{b.discordName || '—'}</td>
                    <td className="mono">{formatDate(b.createdAt)}</td>
                    <td>
                      <span className={`badge bounty-state-${state}`}>{BOUNTY_STATE_LABELS[state]}</span>
                      {state === 'open' && days != null && <div className="n-sub">{days === 0 ? 'expires today' : `${days} days left`}</div>}
                      {b.closedAt && <div className="n-sub">{formatDate(b.closedAt)}</div>}
                    </td>
                    <td>
                      {qty > 0
                        ? <span className="bounty-in-stock" title={inStock.map(c => `${c.qty} × ${c.location || 'no location'}`).join(', ')}>{qty} in stock</span>
                        : <span className="n-sub">—</span>}
                    </td>
                    <td>
                      {(state === 'open' || state === 'expired') && (
                        <div className="row-actions">
                          <button className="btn secondary small" disabled={busyId === b.id} onClick={() => act(b, 'fulfill')}>Mark fulfilled</button>
                          <button className="btn ghost small" disabled={busyId === b.id} onClick={() => act(b, 'remove')}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
