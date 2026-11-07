import { useMemo, useState } from 'react';
import { GAMES } from '../../lib/cardUtils.js';
import {
  META_SOURCES, META_MIN_DECKS, META_MIN_SHARE_PCT, SALES_MIN_COPIES, SALES_WINDOW_DAYS, PRICE_MIN_RISE_PCT,
  topMetaCards, metaUpdatedAt, reasonsOfKind, formatLabel,
} from '../../lib/hotCards.js';

const META_GAMES = GAMES.filter(g => g !== 'Sports Singles' && g !== 'Other');

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : 'never';
}

// The Quote tab's "Hot cards…" window (CLAUDE.md "Hot cards"): the list
// staff keep by hand, plus what the automatic signals currently flag, so
// staff can see why a quote row says "Sought after".
export default function HotCardsModal({ hot, onClose }) {
  const { meta, hotList, index, addHotCard, removeHotCard } = hot;
  const [form, setForm] = useState({ game: '', name: '', reason: '', addedBy: '' });
  const [saving, setSaving] = useState(false);
  // Until staff pick one, the first game that has data (which can change
  // once the data finishes loading).
  const [pickedGame, setMetaGame] = useState('');
  const firstGameWithData = useMemo(
    () => META_GAMES.find(g => topMetaCards(meta, g, 1).length > 0) || META_GAMES[0],
    [meta]
  );
  const metaGame = pickedGame || firstGameWithData;

  const topCards = useMemo(() => topMetaCards(meta, metaGame), [meta, metaGame]);
  const updated = useMemo(() => metaUpdatedAt(meta), [meta]);
  const selling = useMemo(() => reasonsOfKind(index, 'sales'), [index]);
  const climbing = useMemo(() => reasonsOfKind(index, 'price'), [index]);

  async function handleAdd() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    const ok = await addHotCard(form);
    setSaving(false);
    if (ok) setForm(f => ({ ...f, name: '', reason: '' }));
  }

  return (
    <div className="overlay show">
      <div className="modal xwide hot-cards-modal">
        <div className="modal-head">
          <div className="name">Hot cards</div>
          <div className="meta">
            A quote row shows "Sought after" when a card is on this list, is played in at least {META_MIN_SHARE_PCT}%
            of recent tournament decks, sold {SALES_MIN_COPIES}+ copies in the last {SALES_WINDOW_DAYS} days, or its
            market price rose {PRICE_MIN_RISE_PCT}%+ this month.
          </div>
        </div>
        <div className="modal-body">
          <div className="section-label">Your hot list</div>
          <div className="form-section">
            <div className="hot-add-row">
              <div className="field-group">
                <label htmlFor="hot_game">Game</label>
                <select id="hot_game" value={form.game} onChange={(e) => setForm({ ...form, game: e.target.value })}>
                  <option value="">Any game</option>
                  {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="field-group hot-add-name">
                <label htmlFor="hot_name">Card name</label>
                <input id="hot_name" type="text" placeholder="e.g. The One Ring" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field-group hot-add-reason">
                <label htmlFor="hot_reason">Why</label>
                <input id="hot_reason" type="text" placeholder="e.g. Commander staple, people ask for it" value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </div>
              <div className="field-group">
                <label htmlFor="hot_by">Added by</label>
                <input id="hot_by" type="text" placeholder="e.g. John Doe" value={form.addedBy}
                  onChange={(e) => setForm({ ...form, addedBy: e.target.value })} />
              </div>
            </div>
            <button className="btn" disabled={!form.name.trim() || saving} onClick={handleAdd}>
              {saving ? 'Adding…' : 'Add to hot list'}
            </button>
            {hotList.length === 0 ? (
              <p className="hot-empty">Nothing on the list yet.</p>
            ) : (
              <ul className="hot-list">
                {hotList.map(h => (
                  <li key={h.id}>
                    <span className="hot-list-main">
                      <strong>{h.name}</strong>
                      {h.game && <span className="hot-list-game">{h.game}</span>}
                      {h.reason && <span className="hot-list-reason">{h.reason}</span>}
                      {h.addedBy && <span className="hot-list-by">added by {h.addedBy}</span>}
                    </span>
                    <button type="button" className="btn ghost" onClick={() => removeHotCard(h)}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="section-label">Most played in tournaments</div>
          <div className="form-section">
            <div className="field-group hot-meta-game">
              <label htmlFor="hot_meta_game">Game</label>
              <select id="hot_meta_game" value={metaGame} onChange={(e) => setMetaGame(e.target.value)}>
                {META_GAMES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {topCards.length === 0 ? (
              <p className="hot-empty">
                Not enough recent decklists for {metaGame} (needs at least {META_MIN_DECKS} in a format).
              </p>
            ) : (
              <div className="table-scroll">
                <table className="hot-meta-table">
                  <thead>
                    <tr><th>Card</th><th>Decks</th><th>Format</th><th>Source</th></tr>
                  </thead>
                  <tbody>
                    {topCards.map(m => (
                      <tr key={`${m.nameKey}#${m.code}`}>
                        <td>{m.name}{m.code && <span className="hot-meta-of"> {m.code}</span>}</td>
                        <td className="num">{m.share}% <span className="hot-meta-of">({m.decks} of {m.totalDecks})</span></td>
                        <td>{formatLabel(m.format) || '—'}</td>
                        <td>{META_SOURCES[m.source]?.label || m.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hot-credit">
              Updated daily. Data provided by{' '}
              <a href={META_SOURCES.limitless.url} target="_blank" rel="noopener noreferrer">Limitless</a>
              {' '}(last update {formatDate(updated.limitless)}) and{' '}
              <a href={META_SOURCES.topdeck.url} target="_blank" rel="noopener noreferrer">TopDeck.gg</a>
              {' '}(last update {formatDate(updated.topdeck)}).
            </p>
          </div>

          <div className="section-label">Selling fast</div>
          <div className="form-section">
            {selling.length === 0 ? (
              <p className="hot-empty">Nothing sold {SALES_MIN_COPIES}+ copies in the last {SALES_WINDOW_DAYS} days.</p>
            ) : (
              <ul className="hot-list">
                {selling.map((r, i) => (
                  <li key={i}><span className="hot-list-main"><strong>{r.name}</strong>
                    {r.game && <span className="hot-list-game">{r.game}</span>}
                    <span className="hot-list-reason">{r.text}</span></span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="section-label">Price climbing</div>
          <div className="form-section">
            {climbing.length === 0 ? (
              <p className="hot-empty">No tracked card rose {PRICE_MIN_RISE_PCT}%+ this month.</p>
            ) : (
              <ul className="hot-list">
                {climbing.map((r, i) => (
                  <li key={i}><span className="hot-list-main"><strong>{r.name}</strong>
                    {r.game && <span className="hot-list-game">{r.game}</span>}
                    <span className="hot-list-reason">{r.text}</span></span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
