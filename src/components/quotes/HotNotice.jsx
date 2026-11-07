import { META_SOURCES, reasonSources } from '../../lib/hotCards.js';

// "Sought after" heads-up on a quote row (CLAUDE.md "Hot cards"): why this
// card is in demand. Information only; it never changes a price.
export default function HotNotice({ reasons }) {
  if (!reasons || reasons.length === 0) return null;
  const sources = reasonSources(reasons);
  return (
    <div className="hot-notice" role="note">
      <strong className="hot-notice-title">Sought after</strong>
      <ul className="hot-notice-reasons">
        {reasons.map((r, i) => <li key={i}>{r.text}</li>)}
      </ul>
      {sources.length > 0 && (
        <div className="hot-notice-credit">
          Data provided by{' '}
          {sources.map((s, i) => (
            <span key={s}>
              {i > 0 && ' and '}
              <a href={META_SOURCES[s].url} target="_blank" rel="noopener noreferrer">{META_SOURCES[s].label}</a>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
