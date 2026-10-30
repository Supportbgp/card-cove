import { useMemo, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import {
  BOUNTY_STATE_LABELS, bountyState, bountyDaysLeft, bountyDetailLine, bountyPriceLabel, bountyStockMatches,
  offerDetailLine, offerLapsed,
} from '../../lib/bounties.js';
import OfferModal from './OfferModal.jsx';

const FILTERS = ['open', 'offered', 'accepted', 'expired', 'fulfilled', 'cancelled', 'removed', 'all'];

const CONFIRM = {
  fulfill: (b, state) => [state === 'accepted'
    ? `Mark the bounty for ${b.name} as fulfilled? Do this once ${b.discordName || 'the member'} has paid and picked it up (sell the card with Mark sold in Catalog as usual). They're thanked in Discord.`
    : `Mark the bounty for ${b.name} as fulfilled? ${b.discordName || 'The member'} is pinged in Discord that the card is in.`, 'Mark fulfilled'],
  remove: (b) => [`Remove the bounty for ${b.name}? It's taken off the website and any held card is released. Nothing is posted in Discord.`, 'Remove'],
  withdraw: (b) => [`Withdraw the offer for ${b.name}? The held card goes back on sale. Nothing is posted in Discord.`, 'Withdraw offer'],
};

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

// Staff view of every bounty (CLAUDE.md "Bounties"): who asked (their
// Discord name, never shown publicly), whether the catalog already has the
// card, the shop's offer and the member's answer (Phase 4), and Make offer /
// Withdraw / Mark fulfilled / Remove.
export default function BountiesTab({ bounties, catalog, onAction, onRefresh }) {
  const { showConfirm } = useUI();
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [offering, setOffering] = useState(null);

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
    const [question, title] = CONFIRM[action](b, bountyState(b));
    if (!(await showConfirm(question, title))) return;
    setBusyId(b.id);
    await onAction(b, action);
    setBusyId(null);
  }

  async function sendOffer(sku, price, note) {
    const ok = await onAction(offering, 'offer', { sku, price, note });
    if (ok) setOffering(null);
    return ok;
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
          stays open 60 days. Their Discord name is only shown here. Make offer holds a catalog card for them while
          they accept or decline on the website.
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
                      {(state === 'offered' || state === 'accepted') && (
                        <div className="n-sub bounty-offer-line">
                          {b.offerName} {offerDetailLine(b) && `(${offerDetailLine(b)})`} at ${b.offerPrice == null ? '—' : b.offerPrice.toFixed(2)}
                          {b.offerLocation && ` · ${b.offerLocation}`}
                          <br />
                          {state === 'offered' ? `Waiting for an answer until ${formatDate(b.offerExpiresAt)}` : `Pick up by ${formatDate(b.offerExpiresAt)}`}
                        </div>
                      )}
                      {offerLapsed(b) && <div className="n-sub">Offer ran out unanswered</div>}
                      {(state === 'open' || state === 'expired') && b.offerStatus === 'declined' && <div className="n-sub">Declined the last offer</div>}
                      {b.closedAt && <div className="n-sub">{formatDate(b.closedAt)}</div>}
                    </td>
                    <td>
                      {qty > 0
                        ? <span className="bounty-in-stock" title={inStock.map(c => `${c.qty} × ${c.location || 'no location'}`).join(', ')}>{qty} in stock</span>
                        : <span className="n-sub">—</span>}
                    </td>
                    <td>
                      {['open', 'expired', 'offered', 'accepted'].includes(state) && (
                        <div className="row-actions">
                          {(state === 'open' || state === 'expired') && (
                            <button className="btn small" disabled={busyId === b.id} onClick={() => setOffering(b)}>Make offer</button>
                          )}
                          {(state === 'offered' || state === 'accepted') && (
                            <button className="btn ghost small" disabled={busyId === b.id} onClick={() => act(b, 'withdraw')}>Withdraw offer</button>
                          )}
                          <button className={`btn small${state === 'accepted' ? '' : ' secondary'}`} disabled={busyId === b.id} onClick={() => act(b, 'fulfill')}>Mark fulfilled</button>
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
      {offering && <OfferModal bounty={offering} catalog={catalog} onOffer={sendOffer} onClose={() => setOffering(null)} />}
    </div>
  );
}
