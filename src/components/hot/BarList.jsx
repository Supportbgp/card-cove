// A ranked list with a bar per row (the Hot cards tab's charts). One series
// in one hue, so no legend: the section title names what the bars measure.
// Every value is also written out as text, so the list reads on its own
// (screen readers, print, colorblind) and the bars only add the shape.
//
// items: [{ key, title, subtitle?, value, valueText, detail?, tip? }]
//   value      the number the bar is scaled by (0 or more)
//   valueText  how that value is written next to the bar
//   detail     optional extra lines under the row (e.g. the sales counted)
//   tip        hover text for the whole row
export default function BarList({ items, label, max }) {
  const top = max ?? Math.max(0, ...items.map(i => i.value || 0));
  return (
    <ol className="bar-list" aria-label={label}>
      {items.map((it, i) => {
        const pct = top > 0 ? Math.max(1.5, Math.min(100, ((it.value || 0) / top) * 100)) : 0;
        return (
          <li key={it.key} className="bar-row" title={it.tip || undefined}>
            <span className="bar-rank" aria-hidden="true">{i + 1}</span>
            <span className="bar-label">
              <span className="bar-title">{it.title}</span>
              {it.subtitle && <span className="bar-sub">{it.subtitle}</span>}
            </span>
            <span className="bar-track" aria-hidden="true">
              <span className="bar-fill" style={{ width: `${pct}%` }} />
            </span>
            <span className="bar-value">{it.valueText}</span>
            {it.detail && <span className="bar-detail">{it.detail}</span>}
          </li>
        );
      })}
    </ol>
  );
}
