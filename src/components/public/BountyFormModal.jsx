import { useState } from 'react';
import { GAMES, CONDITION_OPTIONS, PRINTING_OPTIONS_BY_GAME } from '../../lib/cardUtils.js';
import { searchCardImage } from '../../lib/cardSearch.js';

const EMPTY = { game: '', name: '', set: '', number: '', rarity: '', printing: '', condition: '', imageUrl: '', maxPrice: '', notes: '' };

// Posting a bounty (CLAUDE.md "Bounties"): pick the card from a search, or
// just type its details when the search doesn't find it.
export default function BountyFormModal({ onPost, onClose }) {
  const [form, setForm] = useState(EMPTY);
  const [results, setResults] = useState(null);
  const [searchNote, setSearchNote] = useState('');
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function changeGame(game) {
    // A pick and the printing list belong to one game.
    setForm(prev => ({ ...prev, game, printing: '', imageUrl: '', rarity: '' }));
    setPicked(null);
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
        if (!found.length) setSearchNote('No matches. Fill in the details below and post it anyway.');
      }
    } catch {
      setResults(null);
      setSearchNote("The card search isn't answering right now. Fill in the details below and post it anyway.");
    } finally {
      setSearching(false);
    }
  }

  function pick(c) {
    setPicked(c);
    setForm(prev => ({
      ...prev,
      imageUrl: c.url || '',
      set: c.set || prev.set,
      number: c.number || prev.number,
      rarity: c.rarity || '',
    }));
  }

  function clearPick() {
    setPicked(null);
    setForm(prev => ({ ...prev, imageUrl: '', rarity: '' }));
  }

  async function post() {
    setError('');
    if (!form.game) { setError('Pick a game.'); return; }
    if (!form.name.trim()) { setError("Enter the card's name."); return; }
    if (form.maxPrice !== '' && !(Number(form.maxPrice) >= 0)) { setError('Max price must be a dollar amount.'); return; }
    setPosting(true);
    try {
      await onPost(form);
    } catch (err) {
      setError(err.message || String(err));
      setPosting(false);
    }
  }

  const printings = PRINTING_OPTIONS_BY_GAME[form.game] || [];

  return (
    <div className="overlay show">
      <div className="modal wide">
        <div className="modal-head">
          <div className="name">Post a bounty</div>
          <div className="meta">
            Tell the shop which card you're after. It's posted in the BGP Discord, and you're pinged when the shop has it.
            Your name isn't shown on the website.
          </div>
        </div>
        <div className="modal-body">
          <div className="field-row2">
            <div className="field-group">
              <label htmlFor="bounty_game">Game</label>
              <select id="bounty_game" value={form.game} onChange={(e) => changeGame(e.target.value)}>
                <option value="">— Game —</option>
                {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="bounty_name">Card name</label>
              <input id="bounty_name" type="text" maxLength={150} value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
          </div>
          <div className="field-row2">
            <div className="field-group">
              <label htmlFor="bounty_set">Set (optional)</label>
              <input id="bounty_set" type="text" maxLength={120} value={form.set} onChange={(e) => set('set', e.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor="bounty_number">Number (optional)</label>
              <input id="bounty_number" type="text" maxLength={40} placeholder="e.g. 4/102" value={form.number} onChange={(e) => set('number', e.target.value)} />
            </div>
          </div>
          <div className="bounty-search-row">
            <button type="button" className="btn secondary small" disabled={searching} onClick={search}>
              {searching ? <><span className="spinner" /> Searching…</> : 'Search for the card'}
            </button>
            <span className="status-line" style={{ margin: 0 }}>Optional: pick the exact print from the results.</span>
          </div>
          {searchNote && <div className="status-line">{searchNote}</div>}
          {picked && (
            <div className="bounty-picked">
              {picked.url && <img src={picked.url} alt="" />}
              <div>
                <div><strong>Picked:</strong> {picked.label}</div>
                <button type="button" className="btn ghost small" onClick={clearPick}>Clear pick</button>
              </div>
            </div>
          )}
          {!picked && results && results.length > 0 && (
            <div className="img-candidates">
              {results.map((r, i) => (
                <img key={i} src={r.url} title={r.label} alt={r.label} onClick={() => pick(r)} />
              ))}
            </div>
          )}

          <div className="field-row2">
            <div className="field-group">
              <label htmlFor="bounty_condition">Condition</label>
              <select id="bounty_condition" value={form.condition} onChange={(e) => set('condition', e.target.value)}>
                <option value="">Any condition</option>
                {CONDITION_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label htmlFor="bounty_printing">Printing</label>
              {printings.length > 0 ? (
                <select id="bounty_printing" value={form.printing} onChange={(e) => set('printing', e.target.value)}>
                  <option value="">Any printing</option>
                  {printings.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              ) : (
                <input id="bounty_printing" type="text" maxLength={80} placeholder="Any printing" value={form.printing} onChange={(e) => set('printing', e.target.value)} />
              )}
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="bounty_max">Max price ($, optional)</label>
            <input id="bounty_max" type="number" min="0" step="0.01" placeholder="Leave blank for any price" value={form.maxPrice} onChange={(e) => set('maxPrice', e.target.value)} />
          </div>
          <div className="field-group">
            <label htmlFor="bounty_notes">Notes (optional)</label>
            <textarea id="bounty_notes" maxLength={500} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          {error && <div className="member-bar-error">{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn ghost small" disabled={posting} onClick={onClose}>Cancel</button>
          <button className="btn small" disabled={posting} onClick={post}>{posting ? 'Posting…' : 'Post bounty'}</button>
        </div>
      </div>
    </div>
  );
}
