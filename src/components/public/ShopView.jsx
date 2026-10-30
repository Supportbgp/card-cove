import { useEffect, useMemo, useState } from 'react';
import { dbLoadPublicStock, dbLoadPublicBinderList, dbLoadPublicImages, publicItemKey } from '../../lib/db.js';
import PublicCard from './PublicCard.jsx';
import MemberBar from './MemberBar.jsx';
import WantedPanel from './WantedPanel.jsx';
import Lightbox from '../Lightbox.jsx';
import logoIcon from '../../assets/logo-icon.png';

const PAGE_SIZE = 48;

// The public stock page (?shop=1): everything in stock in the binders staff
// have made public, searchable, no login. Bulk is never listed (in-store
// only). Inline images are fetched only for the cards on screen, since a
// whole shop's worth is too heavy for a phone. The Wanted view (&view=wanted)
// lists open bounties (CLAUDE.md "Bounties").
function initialView() {
  return new URLSearchParams(window.location.search).get('view') === 'wanted' ? 'wanted' : 'stock';
}

export default function ShopView() {
  const [view, setView] = useState(initialView);
  const [session, setSession] = useState(null);
  const [stock, setStock] = useState(null);
  const [binders, setBinders] = useState([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [game, setGame] = useState('');
  const [binder, setBinder] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [images, setImages] = useState({});
  const [zoomUrl, setZoomUrl] = useState(null);

  useEffect(() => {
    Promise.all([dbLoadPublicStock(), dbLoadPublicBinderList()])
      .then(([rows, list]) => { setStock(rows); setBinders(list.slice().sort()); })
      .catch((err) => setError(err.message));
  }, []);

  const games = useMemo(
    () => Array.from(new Set((stock || []).map(s => s.game).filter(Boolean))).sort(),
    [stock]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (stock || []).filter(s => {
      if (game && s.game !== game) return false;
      if (binder && s.location !== binder) return false;
      if (q && !`${s.name} ${s.set || ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [stock, query, game, binder]);

  const visible = matches.slice(0, visibleCount);

  // Fetch inline images for the cards on screen that haven't been fetched.
  useEffect(() => {
    const missing = visible.filter(it => !(publicItemKey(it) in images));
    if (!missing.length) return;
    let cancelled = false;
    dbLoadPublicImages(missing).then(found => {
      if (cancelled) return;
      setImages(prev => {
        const next = { ...prev };
        // Mark every requested card as fetched, found or not, so it isn't asked for again.
        for (const it of missing) next[publicItemKey(it)] = found[publicItemKey(it)] || null;
        return next;
      });
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.map(publicItemKey).join('\n')]);

  function resetPaging(setter) {
    return (e) => { setter(e.target.value); setVisibleCount(PAGE_SIZE); };
  }

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img src={logoIcon} alt="" className="brand-logo" />
          <span className="mark">Card Cove</span>
          <span className="sub">{view === 'wanted' ? 'Wanted' : 'In stock'}</span>
        </div>
      </div>

      <MemberBar onSession={setSession} />

      <div className="scan-mode-toggle shop-view-toggle" role="group" aria-label="Show">
        <button type="button" aria-pressed={view === 'stock'} className={`btn small${view === 'stock' ? '' : ' ghost'}`} onClick={() => setView('stock')}>In stock</button>
        <button type="button" aria-pressed={view === 'wanted'} className={`btn small${view === 'wanted' ? '' : ' ghost'}`} onClick={() => setView('wanted')}>Wanted</button>
      </div>

      {view === 'wanted' && <WantedPanel session={session} onZoom={setZoomUrl} />}
      {view === 'stock' && (<>

      {error && (
        <div className="empty"><span className="mark">Couldn't load our stock</span>{error}</div>
      )}
      {!error && stock === null && (
        <div className="empty"><span className="mark">Loading…</span></div>
      )}
      {!error && stock && stock.length === 0 && (
        <div className="empty">
          <span className="mark">Nothing listed online right now</span>
          Come by the store to see what's in stock.
        </div>
      )}
      {!error && stock && stock.length > 0 && (
        <>
          <div className="shop-filters">
            <input
              type="search"
              aria-label="Search cards"
              placeholder="Search by card name or set"
              value={query}
              onChange={resetPaging(setQuery)}
            />
            <select aria-label="Game" value={game} onChange={resetPaging(setGame)}>
              <option value="">All games</option>
              {games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {binders.length > 1 && (
              <select aria-label="Binder" value={binder} onChange={resetPaging(setBinder)}>
                <option value="">All binders</option>
                {binders.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>
          <div className="status-line">{matches.length === 1 ? '1 card' : `${matches.length} cards`}</div>
          {matches.length === 0 ? (
            <div className="empty"><span className="mark">No matches</span>Try a different name, or clear the filters.</div>
          ) : (
            <div className="binder-grid">
              {visible.map((it, i) => {
                const key = publicItemKey(it);
                const item = images[key] ? { ...it, ...images[key] } : it;
                return <PublicCard key={`${key}#${i}`} item={item} onZoom={setZoomUrl} showLocation />;
              })}
            </div>
          )}
          {matches.length > visible.length && (
            <div style={{ textAlign: 'center', margin: '16px 0' }}>
              <button className="btn secondary" onClick={() => setVisibleCount(c => c + PAGE_SIZE)}>
                Show more ({matches.length - visible.length} left)
              </button>
            </div>
          )}
        </>
      )}
      </>)}

      {zoomUrl && <Lightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}

      <div className="footnote">Card Cove by Board Game Paradise · live inventory — updates automatically as stock changes.</div>
    </div>
  );
}
