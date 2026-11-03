import { useState } from 'react';
import { GAMES, CONDITION_OPTIONS, PRINTING_OPTIONS_BY_GAME } from '../../lib/cardUtils.js';
import { searchCardImage } from '../../lib/cardSearch.js';

const EMPTY = {
  game: '', name: '', set: '', number: '', rarity: '', printing: '', condition: '', imageUrl: '',
  maxPrice: '', customerName: '', customerContact: '', responsible: '', notes: '', showPublic: true,
};

function toForm(want) {
  if (!want) return EMPTY;
  return { ...EMPTY, ...want, maxPrice: want.maxPrice == null ? '' : String(want.maxPrice) };
}

// Adding or editing a want-list request (CLAUDE.md "Want list"): the card
// (picked from a search, or just typed), who asked and how to reach them.
export default function WantRequestModal({ want, onSave, onClose }) {
  const editing = !!(want && want.id);
  const [form, setForm] = useState(() => toForm(want));
  const [results, setResults] = useState(null);
  const [searchNote, setSearchNote] = useState('');
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function changeGame(game) {
    // A picked image and the printing list belong to one game.
    setForm(prev => ({ ...prev, game, printing: '', imageUrl: '', rarity: '' }));
    setResults(null);
    setSearchNote('');
  }

  async function search() {
    if (!form.game || !form.name.trim()) {
      setSearchNote('Pick a game and type a name first.');
      return;
    }
    setSearching(true);
    setSearchNote('');
    try {
      const found = await searchCardImage(form.game, form.name.trim(), form.set.trim(), '', form.number.trim());
      if (found === null) {
        setResults(null);
        setSearchNote("Card search isn't available for this game. Just fill in the details below.");
      } else {
        setResults(found);
        if (!found.length) setSearchNote('No matches. Fill in the details below and save it anyway.');
      }
    } catch {
      setResults(null);
      setSearchNote("The card search isn't answering right now. Fill in the details below and save it anyway.");
    } finally {
      setSearching(false);
    }
  }

  function pick(c) {
    setResults(null);
    setForm(prev => ({
      ...prev,
      imageUrl: c.url || '',
      set: c.set || prev.set,
      number: c.number || prev.number,
      rarity: c.rarity || prev.rarity,
    }));
  }

  async function save() {
    setError('');
    if (!form.name.trim()) { setError("Enter the card's name."); return; }
    if (!form.customerName.trim()) { setError("Enter the customer's name."); return; }
    if (form.maxPrice !== '' && !(Number(form.maxPrice) >= 0)) { setError('Price must be a dollar amount.'); return; }
    setSaving(true);
    const ok = await onSave({ ...form, id: want && want.id });
    if (!ok) setSaving(false);
  }

  const printings = PRINTING_OPTIONS_BY_GAME[form.game] || [];

  return (
    <div className="overlay show">
      <div className="modal wide">
        <div className="modal-head">
          <div className="name">{editing ? 'Edit request' : 'Add to the want list'}</div>
          <div className="meta">
            A card a customer asked us to look for. It stays on the list until you mark it fulfilled or rejected.
            The customer's name and contact are only shown to staff.
          </div>
        </div>
        <div className="modal-body">
          <div className="form-section">
            <div className="section-label">Card</div>
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="want_game">Game</label>
                <select id="want_game" value={form.game} onChange={(e) => changeGame(e.target.value)}>
                  <option value="">— Game —</option>
                  {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="want_name">Card name</label>
                <input id="want_name" type="text" maxLength={150} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
            </div>
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="want_set">Set (optional)</label>
                <input id="want_set" type="text" maxLength={120} value={form.set} onChange={(e) => set('set', e.target.value)} />
              </div>
              <div className="field-group">
                <label htmlFor="want_number">Number (optional)</label>
                <input id="want_number" type="text" maxLength={40} placeholder="e.g. 4/102" value={form.number} onChange={(e) => set('number', e.target.value)} />
              </div>
            </div>
            <div className="want-search-row">
              <button type="button" className="btn secondary small" disabled={searching} onClick={search}>
                {searching ? <><span className="spinner" /> Searching…</> : 'Search for the card'}
              </button>
              <span className="status-line" style={{ margin: 0 }}>Optional: pick the exact print for its picture.</span>
            </div>
            {searchNote && <div className="status-line">{searchNote}</div>}
            {form.imageUrl && (
              <div className="want-picked">
                <img src={form.imageUrl} alt="" />
                <button type="button" className="btn ghost small" onClick={() => set('imageUrl', '')}>Remove picture</button>
              </div>
            )}
            {results && results.length > 0 && (
              <div className="img-candidates">
                {results.map((r, i) => (
                  <img key={i} src={r.url} title={r.label} alt={r.label} onClick={() => pick(r)} />
                ))}
              </div>
            )}
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="want_condition">Condition</label>
                <select id="want_condition" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
                  <option value="">Any condition</option>
                  {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label htmlFor="want_printing">Printing</label>
                {printings.length > 0 ? (
                  <select id="want_printing" value={form.printing} onChange={(e) => set('printing', e.target.value)}>
                    <option value="">Any printing</option>
                    {printings.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                ) : (
                  <input id="want_printing" type="text" maxLength={80} placeholder="Any printing" value={form.printing} onChange={(e) => set('printing', e.target.value)} />
                )}
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="want_max">They'd pay up to ($, optional)</label>
              <input id="want_max" type="number" min="0" step="0.01" placeholder="Leave blank if they didn't say" value={form.maxPrice} onChange={(e) => set('maxPrice', e.target.value)} />
            </div>
          </div>

          <div className="form-section">
            <div className="section-label">Customer</div>
            <div className="field-row2">
              <div className="field-group">
                <label htmlFor="want_customer">Name</label>
                <input id="want_customer" type="text" maxLength={120} value={form.customerName} onChange={(e) => set('customerName', e.target.value)} />
              </div>
              <div className="field-group">
                <label htmlFor="want_contact">Phone, email or Discord (optional)</label>
                <input id="want_contact" type="text" maxLength={160} value={form.customerContact} onChange={(e) => set('customerContact', e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label htmlFor="want_responsible">Responsible (optional)</label>
              <input id="want_responsible" type="text" maxLength={80} placeholder="e.g. John Doe" value={form.responsible} onChange={(e) => set('responsible', e.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="want_notes">Notes (optional)</label>
              <textarea id="want_notes" maxLength={500} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
            <div className="checkbox-row">
              <input id="want_public" type="checkbox" checked={form.showPublic} onChange={(e) => set('showPublic', e.target.checked)} />
              <label htmlFor="want_public">Show on the public Wanted list (the card only, never the customer)</label>
            </div>
          </div>
          {error && <div className="status-line err">{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn ghost small" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn small" disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save' : 'Add to list'}</button>
        </div>
      </div>
    </div>
  );
}
