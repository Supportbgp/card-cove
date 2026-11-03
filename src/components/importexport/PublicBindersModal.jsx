import { useMemo, useState } from 'react';

const LABEL_STYLE = { margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' };

function shownCount(catalog, location) {
  return catalog.filter(c => c.location === location && !c.sold && c.qty > 0 && c.itemType !== 'bulk').length;
}

// Which binders/cases are public (CLAUDE.md "Public binders"): only these
// show on the public stock page and on their QR page. Bulk lots are never
// shown, public binder or not.
export default function PublicBindersModal({ catalog, locations, publicBinders, onSave, onClose }) {
  const [selected, setSelected] = useState(() => new Set(publicBinders));
  const [saving, setSaving] = useState(false);

  // A binder that's public but no longer has any catalog rows still shows,
  // so it can be turned off.
  const all = useMemo(
    () => Array.from(new Set([...locations, ...publicBinders])).sort(),
    [locations, publicBinders]
  );
  const shopUrl = `${window.location.origin}${import.meta.env.BASE_URL}?shop=1`;

  function toggle(location, on) {
    setSelected(prev => {
      const next = new Set(prev);
      if (on) next.add(location); else next.delete(location);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    const ok = await onSave(all.filter(l => selected.has(l)));
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head">
          <div className="name">Public binders</div>
          <div className="meta">
            Ticked binders show on the public stock page and on their QR page, with prices, for anyone with the link.
            The rest stay private. Bulk lots are never shown.
          </div>
        </div>
        <div className="modal-body">
          {all.length === 0 && <div className="status-line">No binders yet.</div>}
          {all.map((loc, i) => {
            const id = `public-binder-${i}`;
            const n = shownCount(catalog, loc);
            return (
              <div className="checkbox-row" key={loc}>
                <input type="checkbox" id={id} checked={selected.has(loc)} onChange={(e) => toggle(loc, e.target.checked)} />
                <label htmlFor={id} style={LABEL_STYLE}>
                  {loc} <span className="mono" style={{ color: 'var(--ink-soft)' }}>· {n === 1 ? '1 card' : `${n} cards`} in stock</span>
                </label>
              </div>
            );
          })}
          <div className="section-label">Public stock page</div>
          <div className="qr-link">
            <a href={shopUrl} target="_blank" rel="noreferrer">{shopUrl}</a>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost small" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn small" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
