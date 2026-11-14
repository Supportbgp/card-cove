import { useEffect, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { dbLoadRecentHistory } from '../../lib/db.js';
import CardHistoryList from './CardHistoryList.jsx';

// Import / Export → "Change history…": the latest changes across the whole
// catalog, deleted cards included, searchable by card name, SKU or binder
// ("where did the Power Packs cards go?").
export default function ChangeHistoryModal({ onClose }) {
  const { toast } = useUI();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    let live = true;
    setEntries(null);
    dbLoadRecentHistory(query, toast).then((rows) => { if (live) setEntries(rows); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div className="overlay show">
      <div className="modal xwide history-modal">
        <div className="modal-head">
          <div className="name">Change history</div>
          <div className="meta">
            Every change to a catalog card: added, moved, edited, sold or deleted, with the time. Newest first.
          </div>
        </div>
        <div className="modal-body">
          <form className="history-search" onSubmit={(e) => { e.preventDefault(); setQuery(search); }}>
            <label htmlFor="history_search">Card name, SKU or binder</label>
            <div className="history-search-row">
              <input id="history_search" type="search" value={search} placeholder="e.g. Kangaskhan or Power Packs"
                onChange={(e) => setSearch(e.target.value)} />
              <button type="submit" className="btn">Search</button>
              {query && <button type="button" className="btn ghost" onClick={() => { setSearch(''); setQuery(''); }}>Clear</button>}
            </div>
          </form>
          {entries === null
            ? <p className="history-empty">Loading…</p>
            : <CardHistoryList entries={entries} showCard emptyText={query ? 'No changes match that search.' : 'No changes recorded yet.'} />}
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
