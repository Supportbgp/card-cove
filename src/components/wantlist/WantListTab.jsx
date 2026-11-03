import { useMemo, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import {
  WANT_STATUS_LABELS, wantDetailLine, wantPriceLabel, wantStockMatches,
} from '../../lib/wantList.js';
import WantRequestModal from './WantRequestModal.jsx';

const FILTERS = ['open', 'fulfilled', 'rejected', 'all'];

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

// The want list (CLAUDE.md "Want list"): cards customers asked us to look
// for, who asked and how to reach them, whether we already have the card,
// and Mark fulfilled / Reject. Anyone on duty can contact the customer; the
// app only keeps the record.
export default function WantListTab({ requests, catalog, onSave, onSetStatus, onRefresh }) {
  const { toast, showConfirm } = useUI();
  const [filter, setFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // null = closed, {} = adding, a request = editing it.
  const [editing, setEditing] = useState(null);

  const publicUrl = `${window.location.origin}${import.meta.env.BASE_URL}?shop=1&view=wanted`;

  const counts = useMemo(() => {
    const c = { all: requests.length };
    for (const w of requests) c[w.status] = (c[w.status] || 0) + 1;
    return c;
  }, [requests]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter(w => {
      if (filter !== 'all' && w.status !== filter) return false;
      if (q && !`${w.name} ${w.set} ${w.customerName} ${w.customerContact} ${w.responsible}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, filter, query]);

  async function setStatus(w, status) {
    if (status === 'rejected'
      && !(await showConfirm(`Reject the request for ${w.name} from ${w.customerName || 'this customer'}? It leaves the open list and the public Wanted page.`, 'Reject request'))) return;
    setBusyId(w.id);
    await onSetStatus(w, status);
    setBusyId(null);
  }

  async function save(form) {
    const ok = await onSave(form);
    if (ok) setEditing(null);
    return ok;
  }

  async function refresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast('Copied the public Wanted link');
    } catch {
      toast(`Couldn't copy it. The link is ${publicUrl}`, true);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <div className="status-line" style={{ margin: 0, flex: 1 }}>
          Cards customers asked us to look for. A request stays until it's fulfilled or rejected. Quotes and Sorting
          flag a card that's on this list.
        </div>
        <button className="btn ghost small" disabled={refreshing} onClick={refresh}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
        <button className="btn small" onClick={() => setEditing({})}>+ Add request</button>
      </div>
      <div className="want-share">
        <span>Public Wanted list (cards only, no customer details):</span>
        <a href={publicUrl} target="_blank" rel="noopener noreferrer">Open</a>
        <button type="button" className="btn ghost small" onClick={copyLink}>Copy link</button>
      </div>
      <div className="want-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            className={`btn small${filter === f ? '' : ' ghost'}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : WANT_STATUS_LABELS[f]} ({counts[f] || 0})
          </button>
        ))}
      </div>
      <input
        type="search"
        aria-label="Search the want list"
        placeholder="Search by card, customer or staff"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ margin: '8px 0', width: '100%', maxWidth: 360 }}
      />
      {rows.length === 0 ? (
        <div className="empty"><span className="mark">Nothing here</span>{filter === 'open' ? 'Add a request when a customer asks for a card we don\'t have.' : ''}</div>
      ) : (
        <div className="table-scroll">
          <table className="want-table">
            <thead>
              <tr><th></th><th>Card</th><th>Customer</th><th>Price</th><th>Responsible</th><th>Added</th><th>Status</th><th>In stock</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(w => {
                const inStock = wantStockMatches(w, catalog);
                const qty = inStock.reduce((n, c) => n + c.qty, 0);
                return (
                  <tr key={w.id}>
                    <td>{w.imageUrl ? <img className="want-thumb" src={w.imageUrl} alt="" /> : null}</td>
                    <td>
                      <div className="n-name">{w.name}</div>
                      <div className="n-sub">{[w.game, wantDetailLine(w)].filter(Boolean).join(' · ')}</div>
                      {w.notes && <div className="n-sub">“{w.notes}”</div>}
                      {!w.showPublic && <div className="n-sub">Not on the public list</div>}
                    </td>
                    <td>
                      <div>{w.customerName || '—'}</div>
                      {w.customerContact && <div className="n-sub">{w.customerContact}</div>}
                    </td>
                    <td className="mono">{wantPriceLabel(w)}</td>
                    <td>{w.responsible || '—'}</td>
                    <td className="mono">{formatDate(w.createdAt)}</td>
                    <td>
                      <span className={`badge want-state-${w.status}`}>{WANT_STATUS_LABELS[w.status]}</span>
                      {w.closedAt && <div className="n-sub">{formatDate(w.closedAt)}</div>}
                    </td>
                    <td>
                      {qty > 0
                        ? <span className="want-in-stock" title={inStock.map(c => `${c.qty} × ${c.location || 'no location'}`).join(', ')}>{qty} in stock</span>
                        : <span className="n-sub">—</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn ghost small" disabled={busyId === w.id} onClick={() => setEditing(w)}>Edit</button>
                        {w.status === 'open' ? (
                          <>
                            <button className="btn secondary small" disabled={busyId === w.id} onClick={() => setStatus(w, 'fulfilled')}>Fulfilled</button>
                            <button className="btn ghost small" disabled={busyId === w.id} onClick={() => setStatus(w, 'rejected')}>Reject</button>
                          </>
                        ) : (
                          <button className="btn ghost small" disabled={busyId === w.id} onClick={() => setStatus(w, 'open')}>Reopen</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && <WantRequestModal want={editing.id ? editing : null} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}
