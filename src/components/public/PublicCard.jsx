import { useState } from 'react';
import { activeImageSrc } from '../../lib/cardUtils.js';

// One card on the public pages (the binder QR page and the public stock
// page). Read-only: image, name, set/condition/printing, stock and price.
export default function PublicCard({ item, onZoom, showLocation = false }) {
  const [broken, setBroken] = useState(false);
  const rawSrc = activeImageSrc(item);
  const src = broken ? null : rawSrc;
  const sub = [item.set, item.condition, item.printing].filter(Boolean).join(' · ') +
    (item.itemType === 'slab' && (item.grader || item.grade) ? ` · ${item.grader || ''} ${item.grade || ''}`.trim() : '');

  return (
    <div className="binder-card">
      <div className="binder-card-img-wrap">
        {item.itemType === 'slab' && <span className="badge slab binder-card-slab-badge">Slab</span>}
        {src ? (
          <img
            src={src}
            alt=""
            className="binder-card-img"
            onClick={() => onZoom(src)}
            onError={() => setBroken(true)}
          />
        ) : (
          <div className="binder-card-img binder-card-img-empty">{item.game || "No image"}</div>
        )}
      </div>
      <div className="binder-card-name">{item.name}</div>
      <div className="binder-card-sub">{sub}</div>
      {showLocation && item.location && <div className="binder-card-sub binder-card-location">In: {item.location}</div>}
      <div className="binder-card-row">
        <span className="mono">{item.qty} in stock</span>
        <span className="mono">{item.price !== null && item.price !== undefined ? "$" + Number(item.price).toFixed(2) : "—"}</span>
      </div>
    </div>
  );
}
