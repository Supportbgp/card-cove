import { useEffect, useMemo, useState } from 'react';
import { dbLoadPublicWantList } from '../../lib/db.js';
import { wantDetailLine } from '../../lib/wantList.js';
import { keepSeparators } from '../../lib/cardUtils.js';

function WantedCard({ w, onZoom }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="binder-card">
      <div className="binder-card-img-wrap">
        {w.imageUrl && !broken ? (
          <img src={w.imageUrl} alt="" className="binder-card-img" onClick={() => onZoom(w.imageUrl)} onError={() => setBroken(true)} />
        ) : (
          <div className="binder-card-img binder-card-img-empty">{w.game || 'No image'}</div>
        )}
      </div>
      <div className="binder-card-name">{w.name}</div>
      <div className="binder-card-sub">{keepSeparators([w.game, wantDetailLine(w)].filter(Boolean).join(' · '))}</div>
      <div className="binder-card-row"><span className="mono">Wanted</span></div>
    </div>
  );
}

// The public Wanted view (?shop=1&view=wanted, CLAUDE.md "Want list"):
// cards the shop is looking for, for staff to share with customers. Only
// requests staff ticked "Show on the public list", and never who asked.
export default function PublicWantList({ onZoom }) {
  const [wants, setWants] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [game, setGame] = useState('');

  useEffect(() => {
    dbLoadPublicWantList().then(setWants).catch(err => setError(err.message));
  }, []);

  const games = useMemo(
    () => Array.from(new Set((wants || []).map(w => w.game).filter(Boolean))).sort(),
    [wants]
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (wants || []).filter(w => {
      if (game && w.game !== game) return false;
      if (q && !`${w.name} ${w.set}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [wants, query, game]);

  if (error) return <div className="empty"><span className="mark">Couldn't load the list</span>{error}</div>;
  if (wants === null) return <div className="empty"><span className="mark">Loading…</span></div>;
  if (wants.length === 0) {
    return <div className="empty"><span className="mark">Nothing on our list right now</span>Check back soon.</div>;
  }
  return (
    <>
      <div className="status-line">Cards we're looking for. Have one? Bring it by the shop or message us: we'll make you an offer.</div>
      <div className="shop-filters">
        <input type="search" aria-label="Search wanted cards" placeholder="Search by card name or set" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Wanted game" value={game} onChange={(e) => setGame(e.target.value)}>
          <option value="">All games</option>
          {games.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="status-line">{matches.length === 1 ? '1 wanted card' : `${matches.length} wanted cards`}</div>
      {matches.length === 0 ? (
        <div className="empty"><span className="mark">No matches</span>Try a different name, or clear the filter.</div>
      ) : (
        <div className="binder-grid">
          {matches.map(w => <WantedCard key={w.id} w={w} onZoom={onZoom} />)}
        </div>
      )}
    </>
  );
}
