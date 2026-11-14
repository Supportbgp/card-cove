import { describeHistory, formatHistoryTime } from '../../lib/cardHistory.js';

const ACTION_LABELS = { insert: 'Added', update: 'Changed', delete: 'Deleted' };

// A list of catalog_history entries (CLAUDE.md "Change history and safer
// saves"). `showCard` adds the card's name and SKU to each entry, for the
// catalog-wide window.
export default function CardHistoryList({ entries, showCard = false, emptyText = 'No changes recorded yet.' }) {
  if (!entries.length) return <p className="history-empty">{emptyText}</p>;
  return (
    <ol className="history-list">
      {entries.map((e) => (
        <li key={e.id} className={`history-entry history-${e.action}`}>
          <div className="history-head">
            <span className={`history-action history-action-${e.action}`}>{ACTION_LABELS[e.action] || e.action}</span>
            {showCard && <strong className="history-card">{e.name || '(no name)'}</strong>}
            {showCard && <span className="history-sku">{e.sku}</span>}
            <span className="history-time">{formatHistoryTime(e.changedAt)}</span>
          </div>
          <ul className="history-changes">
            {describeHistory(e).map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </li>
      ))}
    </ol>
  );
}
