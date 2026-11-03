import { useEffect, useState } from 'react';
import { dbLoadPublicBinder, dbLoadPublicBinderList } from '../lib/db.js';
import PublicCard from './public/PublicCard.jsx';
import Lightbox from './Lightbox.jsx';
import logoIcon from '../assets/logo-icon.png';

// The binder QR page (?binder=<location>). Only binders staff have made
// public show anything (CLAUDE.md "Public binders"); any other binder says
// it isn't shared, rather than looking empty.
export default function BinderView({ location }) {
  const [items, setItems] = useState(null);
  const [isPublic, setIsPublic] = useState(null);
  const [error, setError] = useState('');
  const [zoomUrl, setZoomUrl] = useState(null);

  useEffect(() => {
    Promise.all([dbLoadPublicBinder(location), dbLoadPublicBinderList()])
      .then(([rows, list]) => { setItems(rows); setIsPublic(list.includes(location)); })
      .catch((err) => setError(err.message));
  }, [location]);

  const loading = !error && (items === null || isPublic === null);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img src={logoIcon} alt="" className="brand-logo" />
          <span className="mark">Card Cove</span>
          <span className="sub">{location}</span>
        </div>
        <a className="btn secondary small" href="?shop=1">Search all stock</a>
      </div>

      {error && (
        <div className="empty"><span className="mark">Couldn't load this binder</span>{error}</div>
      )}
      {loading && (
        <div className="empty"><span className="mark">Loading…</span></div>
      )}
      {!loading && !error && !isPublic && (
        <div className="empty">
          <span className="mark">This binder isn't shared online</span>
          Ask at the counter to see what's inside.
        </div>
      )}
      {!loading && !error && isPublic && items.length === 0 && (
        <div className="empty">
          <span className="mark">Nothing here right now</span>
          This binder is currently empty, or everything in it has sold.
        </div>
      )}
      {!loading && !error && isPublic && items.length > 0 && (
        <div className="binder-grid">
          {items.map((it, i) => <PublicCard key={i} item={it} onZoom={setZoomUrl} />)}
        </div>
      )}

      {zoomUrl && <Lightbox url={zoomUrl} onClose={() => setZoomUrl(null)} />}

      <div className="footnote">Card Cove by Board Game Paradise · live inventory lookup — updates automatically as stock changes.</div>
    </div>
  );
}
