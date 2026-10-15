// "Compared against: …" — the card the daily price check actually matched
// when it raised an alert, shown in both the alerts list and the item's Edit
// screen so a wrong-print match (a bare "Mew" priced off a different, pricier
// Mew) is obvious at a glance. Alerts raised before matched-card recording
// existed have no `match` and say so instead of showing nothing.
const BASIS_LABEL = {
  number: 'matched by the number in the name',
  set: "matched by this item's Set",
  only_print: 'the only print with this name',
};

export default function PriceAlertMatch({ alert, onZoom }) {
  const m = alert && alert.match;
  if (!m) {
    return (
      <div className="price-alert-match none">
        Compared against: not recorded (alert raised before the check saved its match)
      </div>
    );
  }
  const detail = [m.set, m.number && `#${m.number}`].filter(Boolean).join(' ');
  return (
    <div className="price-alert-match">
      {m.image && (
        <img
          src={m.image} alt={m.name} className="price-alert-match-img"
          // A provider image that's since moved/expired just disappears
          // instead of showing a broken-image icon — the text says it all.
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          onClick={onZoom ? (e) => { e.stopPropagation(); onZoom(m.image); } : undefined}
        />
      )}
      <div>
        <div>
          Compared against: <strong>{m.name}</strong>{detail ? ` — ${detail}` : ''}
        </div>
        <div className="price-alert-match-meta">
          {BASIS_LABEL[m.basis] || 'first search result'}
          {m.url && (
            <>
              {' · '}
              <a href={m.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                View listing ↗
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
