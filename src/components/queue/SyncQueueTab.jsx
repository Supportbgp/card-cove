import { useMemo, useState } from 'react';
import { isTicketComplete } from '../../lib/cardUtils.js';
import { useUI } from '../../context/UIContext.jsx';

const STAMPS = [
  { field: 'posDone', channel: 'posChannel', letter: 'P', label: 'POS' },
  { field: 'tcgplayerDone', channel: 'tcgplayerChannel', letter: 'T', label: 'TCG Player' },
  { field: 'collectrDone', channel: 'collectrChannel', letter: 'C', label: 'Collectr' },
];

function Ticket({ t, onToggleStamp, onUndo, undoing }) {
  const complete = isTicketComplete(t);
  const applicable = STAMPS.filter(s => t[s.channel]);
  const time = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`ticket ${complete ? 'complete' : ''}`}>
      <div className="ticket-info">
        <div className="t-name">
          {t.name} × {t.qtySold}
          {t.kind === 'loss' && <span className="badge ticket-loss">Lost / stolen</span>}
        </div>
        <div className="t-meta">{t.set || ""} · {t.condition || ""} · {t.sku || ""}</div>
        {t.kind === 'loss' ? (
          <div className="t-meta">Take the listing down. To undo the loss itself, remove it in Reports.</div>
        ) : (
          <button type="button" className="btn ghost small ticket-undo" disabled={undoing} onClick={() => onUndo(t)}>
            {undoing ? 'Undoing…' : 'Undo sale'}
          </button>
        )}
      </div>
      <div className="ticket-time">{time}</div>
      <div className="stamps">
        {applicable.map(s => (
          <div key={s.field} className={`stamp ${t[s.field] ? 'done' : ''}`} onClick={() => onToggleStamp(t.id, s.field)}>
            <div className="stamp-circle">{s.letter}</div><div className="stamp-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SyncQueueTab({ queue, onToggleStamp, onUndoSale }) {
  const { showConfirm } = useUI();
  const [undoingId, setUndoingId] = useState(null);

  // Undo puts the quantity back in the catalog and deletes this ticket and
  // its Reports entry. If a platform was already stamped done, the listing
  // was already changed there, so say so before going ahead.
  async function handleUndo(t) {
    const doneOn = STAMPS.filter(s => t[s.channel] && t[s.field]).map(s => s.label);
    let msg = `Undo the sale of ${t.qtySold} × ${t.name}? The quantity goes back into the catalog, and this ticket and its Reports entry are removed.`;
    if (doneOn.length) msg += ` You already marked it updated on ${doneOn.join(', ')}, so put the listing back there too.`;
    if (!(await showConfirm(msg, 'Undo sale'))) return;
    setUndoingId(t.id);
    try { await onUndoSale(t); } finally { setUndoingId(null); }
  }

  const sorted = useMemo(() => [...queue].sort((a, b) => b.timestamp - a.timestamp), [queue]);
  const pending = sorted.filter(t => !isTicketComplete(t));
  const completed = sorted.filter(t => isTicketComplete(t));

  return (
    <div>
      <div className="toolbar">
        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', maxWidth: '520px' }}>
          Tap each stamp once you've made the update in that system. A ticket clears once all three are stamped. Sold something by mistake? Use Undo sale.
        </div>
      </div>
      <div>
        {pending.length ? pending.map(t => <Ticket key={t.id} t={t} onToggleStamp={onToggleStamp} onUndo={handleUndo} undoing={undoingId === t.id} />) : (
          <div className="empty"><span className="mark">Nothing waiting</span>Sold cards will show up here until all three systems are confirmed.</div>
        )}
      </div>
      {completed.length > 0 && (
        <>
          <div className="section-label">Completed today</div>
          <div>{completed.slice(0, 25).map(t => <Ticket key={t.id} t={t} onToggleStamp={onToggleStamp} onUndo={handleUndo} undoing={undoingId === t.id} />)}</div>
        </>
      )}
    </div>
  );
}
