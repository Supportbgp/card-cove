import { useState } from 'react';
import { GAMES } from '../../lib/cardUtils.js';

// Hot cards → Hot list: cards staff flag by hand (hot_cards). A quote row
// for any of these shows "Sought after" with the reason.
export default function HotListPanel({ hotList, addHotCard, removeHotCard }) {
  const [form, setForm] = useState({ game: '', name: '', reason: '', addedBy: '' });
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    const ok = await addHotCard(form);
    setSaving(false);
    if (ok) setForm(f => ({ ...f, name: '', reason: '' }));
  }

  return (
    <div className="hot-panel">
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
      </div>

      {hotList.length === 0 ? (
        <p className="hot-empty">Nothing on the list yet.</p>
      ) : (
        <ul className="hot-list">
          {hotList.map(h => (
            <li key={h.id}>
              <span className="hot-list-main">
                <strong>{h.name}</strong>
                <span className="hot-list-game">{h.game || 'Any game'}</span>
                {h.reason && <span className="hot-list-reason">{h.reason}</span>}
                {h.addedBy && <span className="hot-list-by">added by {h.addedBy}</span>}
              </span>
              <button type="button" className="btn ghost" onClick={() => removeHotCard(h)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
