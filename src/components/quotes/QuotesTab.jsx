import { useEffect, useMemo, useState } from 'react';
import { computeQuoteTotals } from '../../lib/quoteUtils.js';
import QuoteDetail from './QuoteDetail.jsx';

const STATUS_LABELS = {
  accepted_cash: 'Accepted Cash',
  accepted_store_credit: 'Accepted Store Credit',
  rejected: 'Rejected Offer',
};

function statusLabel(quote) {
  return quote.offerStatus ? STATUS_LABELS[quote.offerStatus] : 'In progress';
}

// Row background by outcome — same semantic colors used everywhere else in
// the app (amber=pending, green=success, rust=danger), just applied to a
// whole row instead of a badge, so a long quote list scans by color.
function statusRowClass(quote) {
  if (!quote.offerStatus) return 'quote-row-progress';
  if (quote.offerStatus === 'rejected') return 'quote-row-rejected';
  return 'quote-row-accepted';
}

const STATUS_FILTERS = [
  { key: '', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'accepted_cash', label: 'Accepted Cash' },
  { key: 'accepted_store_credit', label: 'Accepted Store Credit' },
  { key: 'rejected', label: 'Rejected' },
];

const QUOTE_SORT_COLUMNS = {
  collectionName: q => (q.collectionName || '').toLowerCase(),
  customerName: q => (q.customerName || '').toLowerCase(),
  dateQuoted: q => q.dateQuoted || '',
  total: q => computeQuoteTotals(q.items).total,
  status: q => statusLabel(q),
};

// Landing view for the Quote tab (trade-in/buylist quoting) — a list of
// quotes, a "+ New Quote" button offering the two confirmed entry points
// (resume an in-progress collection, or start a brand-new one), and the
// single-quote detail view (QuoteDetail) for whichever quote is open.
export default function QuotesTab({
  quotes, catalog, locations, multipliers, tierSettings, onSaveQuote, onDeleteQuote, onSaveTierSettings,
  openRequest = null, onOpenRequestHandled = () => {},
}) {
  const [selectedId, setSelectedId] = useState(null);
  // A brand-new quote is never written to the database on "Create" — only
  // on its first real Save inside QuoteDetail. This client-only draft
  // (id: null) is what's open until that happens; picking one of the real
  // quotes below (`selectedId`) is the other, mutually-exclusive case.
  // Deliberately NOT persisting eagerly avoids two real problems found in
  // testing: (1) clicking "Create" then immediately Cancel used to still
  // leave a permanent blank row in the quotes list/quote_number sequence,
  // and (2) it made "Cancel discards your edits" read as if resuming later
  // would somehow restore them — it never did, since only a Save persists.
  const [newDraft, setNewDraft] = useState(null);
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newName, setNewName] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortState, setSortState] = useState({ col: 'dateQuoted', dir: -1 });

  // Another tab asked to open one quote (Catalog's "View quote" on an item
  // bought in it).
  useEffect(() => {
    if (!openRequest) return;
    setNewDraft(null);
    setShowNewFlow(false);
    setSelectedId(openRequest.id);
    onOpenRequestHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRequest]);

  const inProgress = quotes.filter(q => !q.offerStatus);
  const selected = selectedId ? quotes.find(q => q.id === selectedId) : null;
  const openQuote = selected || newDraft;

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(quote => {
      if (statusFilter === 'in_progress' && quote.offerStatus) return false;
      if (statusFilter && statusFilter !== 'in_progress' && quote.offerStatus !== statusFilter) return false;
      if (q && !`${quote.collectionName} ${quote.customerName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [quotes, search, statusFilter]);

  const sortedQuotes = useMemo(() => {
    const keyFn = QUOTE_SORT_COLUMNS[sortState.col] || QUOTE_SORT_COLUMNS.dateQuoted;
    const rows = filteredQuotes.slice();
    rows.sort((a, b) => {
      const av = keyFn(a), bv = keyFn(b);
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av > bv ? 1 : av < bv ? -1 : 0);
      return cmp * sortState.dir;
    });
    return rows;
  }, [filteredQuotes, sortState]);

  function setSort(col) {
    setSortState(s => (s.col === col ? { col, dir: s.dir * -1 } : { col, dir: 1 }));
  }

  function handleCreateFromScratch() {
    const collectionName = newName.trim();
    if (!collectionName) return;
    setShowNewFlow(false);
    setNewName('');
    setNewDraft({
      id: null, quoteNumber: null, collectionName,
      customerName: '', customerId: '', phone: '', customerEmail: '', employee: '', timeTaken: '',
      hasExpectedPrice: null, expectedPriceAmount: '', intakeNotes: '',
      dateQuoted: new Date().toISOString().slice(0, 10),
      items: [], offerStatus: null, payoutAmount: null, paidOut: false, movedToSorting: false,
    });
  }

  function resumeCollection(id) {
    setShowNewFlow(false);
    setSelectedId(id);
  }

  function closeOpenQuote() {
    setSelectedId(null);
    setNewDraft(null);
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div className="section-label" style={{ marginBottom: 0 }}>Quotes</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn secondary small" onClick={() => setShowSettings(true)}>Quote settings</button>
            <button className="btn" onClick={() => setShowNewFlow(true)}>+ New Quote</button>
          </div>
        </div>
        {quotes.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>No quotes yet — start one with "+ New Quote."</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
              <input
                type="text" className="search-input" placeholder="Search collection or customer…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ maxWidth: '260px' }}
              />
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {STATUS_FILTERS.map(f => (
                  <button
                    key={f.key} type="button"
                    className={`btn small${statusFilter === f.key ? '' : ' ghost'}`}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {sortedQuotes.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--ink-faint)' }}>No quotes match this search/filter.</div>
            ) : (
              <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => setSort('collectionName')}>Collection{sortState.col === 'collectionName' ? (sortState.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                    <th className="sortable" onClick={() => setSort('customerName')}>Customer{sortState.col === 'customerName' ? (sortState.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                    <th className="sortable" onClick={() => setSort('dateQuoted')}>Date{sortState.col === 'dateQuoted' ? (sortState.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                    <th className="sortable" onClick={() => setSort('total')}>Total{sortState.col === 'total' ? (sortState.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                    <th className="sortable" onClick={() => setSort('status')}>Status{sortState.col === 'status' ? (sortState.dir === 1 ? ' ▲' : ' ▼') : ''}</th>
                    <th>Paid out</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuotes.map(q => {
                    const { total } = computeQuoteTotals(q.items);
                    return (
                      <tr key={q.id} className={statusRowClass(q)} style={{ cursor: 'pointer' }} onClick={() => setSelectedId(q.id)}>
                        <td>{q.collectionName}</td>
                        <td>{q.customerName || '—'}</td>
                        <td>{q.dateQuoted}</td>
                        <td>${total.toFixed(2)}</td>
                        <td>{statusLabel(q)}</td>
                        <td>{q.paidOut ? 'Yes' : 'No'}</td>
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

      {showNewFlow && (
        <div className="overlay show">
          <div className="modal">
            <div className="modal-head">
              <div className="name">New quote</div>
              <div className="meta">Resume an in-progress collection, or start a new one</div>
            </div>
            <div className="modal-body">
              {inProgress.length > 0 && (
                <>
                  <div className="section-label">Resume a collection</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                    {inProgress.map(q => (
                      <button
                        key={q.id} type="button" className="btn secondary small"
                        style={{ textAlign: 'left' }}
                        onClick={() => resumeCollection(q.id)}
                      >
                        {q.collectionName}{q.customerName ? ` (${q.customerName})` : ''}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="section-label">Start a new collection</div>
              <div className="field-group">
                <label>Collection name</label>
                <input
                  type="text" placeholder="e.g. Jake binder proposal" value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn secondary" onClick={() => setShowNewFlow(false)}>Cancel</button>
              <button className="btn" disabled={!newName.trim()} onClick={handleCreateFromScratch}>Create</button>
            </div>
          </div>
        </div>
      )}

      {openQuote && (
        <QuoteDetail
          key={openQuote.id || 'new-draft'}
          quote={openQuote}
          catalog={catalog}
          locations={locations}
          multipliers={multipliers}
          tierSettings={tierSettings}
          onSave={onSaveQuote}
          onDelete={onDeleteQuote}
          onClose={closeOpenQuote}
        />
      )}

      {showSettings && (
        <QuoteSettingsModal
          tierSettings={tierSettings}
          onSave={onSaveTierSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// Small, dedicated settings modal for the three offer-tier percentages —
// deliberately separate from the existing Pricing Settings modal
// (condition multipliers are a Catalog pricing concern; these are a
// quoting concern).
function QuoteSettingsModal({ tierSettings, onSave, onClose }) {
  const [form, setForm] = useState({ ...tierSettings });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    onClose();
  }

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head">
          <div className="name">Quote settings</div>
          <div className="meta">The three offer tiers shown as a % of a quote's total value</div>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label>Tier 1 (%)</label>
            <input type="number" min="0" max="100" value={form.tier1} onChange={(e) => setForm(f => ({ ...f, tier1: Number(e.target.value) || 0 }))} />
          </div>
          <div className="field-group">
            <label>Tier 2 (%)</label>
            <input type="number" min="0" max="100" value={form.tier2} onChange={(e) => setForm(f => ({ ...f, tier2: Number(e.target.value) || 0 }))} />
          </div>
          <div className="field-group">
            <label>Tier 3 (%)</label>
            <input type="number" min="0" max="100" value={form.tier3} onChange={(e) => setForm(f => ({ ...f, tier3: Number(e.target.value) || 0 }))} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
