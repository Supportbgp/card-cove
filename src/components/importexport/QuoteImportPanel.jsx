import { useRef, useState } from 'react';
import { GAMES } from '../../lib/cardUtils.js';
import { computeQuoteTotals } from '../../lib/quoteUtils.js';
import { readWorkbookSheetRows } from '../../lib/importParse.js';
import { parseQuoteSheet, buildImportedQuote, looksAlreadyImported } from '../../lib/quoteImport.js';
import { useUI } from '../../context/UIContext.jsx';

const STATUS_INFO = {
  accepted_cash: { label: 'Accepted Cash', badge: 'tag-green' },
  accepted_store_credit: { label: 'Accepted Store Credit', badge: 'tag-green' },
  rejected: { label: 'Rejected Offer', badge: 'tag-rust' },
};

function statusInfo(status) {
  return STATUS_INFO[status] || { label: 'In progress', badge: 'tag-amber' };
}

function money(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}

function isAccepted(status) {
  return status === 'accepted_cash' || status === 'accepted_store_credit';
}

// Import/Export → Quotes: the shop's old Excel quote sheets (one sheet =
// one quote, see quoteImport.js for the layout) become real quotes. Each
// one lands in the Quote tab with its status; an accepted one also sends
// its cards to Sorting with Cost filled in from the payout, exactly like
// accepting a quote by hand (it goes through the same onSaveQuote).
export default function QuoteImportPanel({ quotes, onSaveQuote }) {
  const { toast } = useUI();
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState({ text: '', kind: '' });
  // One entry per sheet that holds a quote: { key, parsed, selected, game, open }
  const [entries, setEntries] = useState([]);
  const [importing, setImporting] = useState(false);

  async function handleFile(file) {
    setEntries([]);
    setStatus({ text: `Reading ${file.name}…`, kind: '' });
    try {
      const sheets = await readWorkbookSheetRows(file);
      let empty = 0;
      const found = [];
      sheets.forEach(({ name, rows }, i) => {
        const parsed = parseQuoteSheet(rows, name);
        if (!parsed) { empty++; return; }
        const already = looksAlreadyImported(parsed, quotes);
        found.push({ key: `${i}-${name}`, parsed, already, selected: !already, game: '', open: false });
      });
      setEntries(found);
      if (!found.length) {
        setStatus({ text: 'No quotes found in this file (every sheet was empty).', kind: 'err' });
      } else {
        setStatus({
          text: `Found ${found.length} quote(s)` + (empty ? `, skipped ${empty} empty sheet(s)` : '') + '.',
          kind: '',
        });
      }
    } catch (err) {
      setStatus({ text: `Couldn't read that file: ${err.message || err}`, kind: 'err' });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function updateEntry(key, patch) {
    setEntries(prev => prev.map(e => (e.key === key ? { ...e, ...patch } : e)));
  }

  function setGameForAll(game) {
    setEntries(prev => prev.map(e => ({ ...e, game })));
  }

  const selected = entries.filter(e => e.selected);
  const missingGame = selected.filter(e => !e.game).length;
  const blockedReason = !selected.length
    ? 'Tick at least one quote to import.'
    : missingGame
      ? `Pick a game for ${missingGame} quote(s).`
      : '';

  async function handleImport() {
    if (blockedReason || importing) return;
    setImporting(true);
    const counts = { progress: 0, accepted: 0, rejected: 0, moved: 0, failed: 0 };
    const doneKeys = new Set();
    // One at a time: each accepted quote's cards are inserted into Sorting
    // with that quote's id, and quote numbers come out in sheet order.
    for (const e of selected) {
      const result = {};
      const saved = await onSaveQuote(buildImportedQuote(e.parsed, e.game), { quiet: true, result });
      if (!saved) { counts.failed++; continue; }
      doneKeys.add(e.key);
      counts.moved += result.movedCount || 0;
      if (isAccepted(saved.offerStatus)) counts.accepted++;
      else if (saved.offerStatus === 'rejected') counts.rejected++;
      else counts.progress++;
    }
    setEntries(prev => prev.filter(e => !doneKeys.has(e.key)));
    const parts = [];
    if (counts.progress) parts.push(`${counts.progress} in progress`);
    if (counts.accepted) parts.push(`${counts.accepted} accepted`);
    if (counts.rejected) parts.push(`${counts.rejected} rejected`);
    const total = counts.progress + counts.accepted + counts.rejected;
    let msg = total ? `Imported ${total} quote(s): ${parts.join(', ')}.` : 'No quotes were imported.';
    if (counts.moved) msg += ` ${counts.moved} card(s) moved to Sorting.`;
    if (counts.failed) msg += ` ${counts.failed} failed to save and are still listed below.`;
    setStatus({ text: msg, kind: counts.failed ? 'err' : 'ok' });
    toast(msg, counts.failed > 0);
    setImporting(false);
  }

  return (
    <div className="card card-pad" style={{ marginBottom: '16px' }}>
      <div className="section-label">Import quotes from Excel</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '12px' }}>
        For the old quote spreadsheet (one sheet per quote). Each quote goes to the <strong>Quote</strong> tab with
        its status. An <strong>accepted</strong> quote also sends its cards to <strong>Sorting</strong>, with
        Cost filled in from the payout, same as accepting a quote in the app. Rejected quotes are kept as a record.
      </div>
      <div
        className={`drop${dragOver ? ' drag' : ''}`}
        onClick={() => fileInputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        }}
      >
        <span className="mark">Drop a quote .xlsx file, or click to choose</span>
        Every sheet with a customer or cards on it becomes one quote. Empty sheets (like the blank Template) are skipped.
      </div>
      <input
        type="file" ref={fileInputRef} accept=".xlsx" style={{ display: 'none' }}
        data-testid="quote-import-file"
        onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
      />

      {entries.length > 0 && (
        <div>
          <div className="quote-import-toolbar">
            <label htmlFor="qi_gameAll">Game for all quotes</label>
            <select id="qi_gameAll" defaultValue="" onChange={(e) => { if (e.target.value) setGameForAll(e.target.value); }}>
              <option value="">— pick to set every quote —</option>
              {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="quote-import-list">
            {entries.map(e => {
              const p = e.parsed;
              const info = statusInfo(p.offerStatus);
              const { total } = computeQuoteTotals(p.items);
              const gameId = `qi_game_${e.key}`;
              const checkId = `qi_sel_${e.key}`;
              return (
                <div className={`quote-import-item${e.selected ? '' : ' unselected'}`} key={e.key} data-testid="quote-import-item">
                  <div className="quote-import-head">
                    <input
                      type="checkbox" id={checkId} checked={e.selected}
                      onChange={(ev) => updateEntry(e.key, { selected: ev.target.checked })}
                    />
                    <label htmlFor={checkId} className="quote-import-title">
                      {p.customerName || `Sheet "${p.sheetName}"`}
                    </label>
                    <span className={`badge ${info.badge}`}>{info.label}</span>
                  </div>
                  <div className="quote-import-meta">
                    {[
                      p.sheetName && `Sheet "${p.sheetName}"`,
                      p.dateQuoted || 'no date',
                      `${p.items.length} card(s)`,
                      `quoted value ${money(total)}`,
                      p.payoutAmount != null && `payout ${money(p.payoutAmount)}`,
                      p.employee && `by ${p.employee}`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {e.already && (
                    <div className="quote-import-warn">
                      Looks already imported (a quote with the same customer, date and number of cards exists), so it
                      starts unticked.
                    </div>
                  )}
                  {p.warnings.map(w => <div className="quote-import-warn" key={w}>{w}</div>)}
                  <div className="quote-import-controls">
                    <label htmlFor={gameId}>Game</label>
                    <select id={gameId} value={e.game} onChange={(ev) => updateEntry(e.key, { game: ev.target.value })}>
                      <option value="">— pick —</option>
                      {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    {p.items.length > 0 && (
                      <button type="button" className="btn ghost small" onClick={() => updateEntry(e.key, { open: !e.open })}>
                        {e.open ? 'Hide cards' : 'Show cards'}
                      </button>
                    )}
                  </div>
                  {e.open && (
                    <div className="table-scroll">
                      <table className="quote-import-cards">
                        <thead>
                          <tr><th>Name</th><th>Set</th><th>#</th><th>Condition</th><th>Price</th><th>Qty</th></tr>
                        </thead>
                        <tbody>
                          {p.items.map((it, i) => (
                            <tr key={i}>
                              <td>{it.name}</td>
                              <td>{it.set}</td>
                              <td>{it.number}</td>
                              <td>{it.condition}</td>
                              <td>{money(it.price)}</td>
                              <td>{it.qty}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn" disabled={!!blockedReason || importing} onClick={handleImport}>
              {importing ? 'Importing…' : `Import ${selected.length} quote(s)`}
            </button>
            {blockedReason && !importing && <span style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>{blockedReason}</span>}
          </div>
        </div>
      )}
      {status.text && <div className={`status-line ${status.kind}`}>{status.text}</div>}
    </div>
  );
}
