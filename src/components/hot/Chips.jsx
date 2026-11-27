// A row of toggle chips (pick one): the Hot cards tab's game and format
// pickers. Wraps on a phone instead of a long dropdown.
export default function Chips({ options, value, onChange, label }) {
  return (
    <div className="hot-chips" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className="hot-chip"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count != null && <span className="hot-chip-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// A few headline numbers above a chart.
export function StatTiles({ tiles }) {
  return (
    <div className="hot-stats">
      {tiles.map(t => (
        <div key={t.label} className="hot-stat">
          <div className="hot-stat-label">{t.label}</div>
          <div className="hot-stat-value">{t.value}</div>
          {t.note && <div className="hot-stat-note">{t.note}</div>}
        </div>
      ))}
    </div>
  );
}
