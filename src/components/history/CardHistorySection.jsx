import { useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { dbLoadCardHistory } from '../../lib/db.js';
import CardHistoryList from './CardHistoryList.jsx';

// "Change history" on a card's Edit screen: every recorded change to this
// card, newest first. Loaded when opened, not with the card.
export default function CardHistorySection({ sku }) {
  const { toast } = useUI();
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setEntries(await dbLoadCardHistory(sku, toast));
    setLoading(false);
  }

  return (
    <div className="history-section">
      {entries === null ? (
        <button type="button" className="btn secondary small" disabled={loading} onClick={load}>
          {loading ? 'Loading…' : 'Show change history'}
        </button>
      ) : (
        <>
          <CardHistoryList entries={entries} emptyText="No changes recorded for this card yet (history starts when it was turned on)." />
          <button type="button" className="btn ghost small" onClick={() => setEntries(null)}>Hide change history</button>
        </>
      )}
    </div>
  );
}
