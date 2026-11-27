import { useMemo, useState } from 'react';
import {
  META_MIN_SHARE_PCT, SALES_MIN_COPIES, SALES_WINDOW_DAYS, PRICE_MIN_RISE_PCT, reasonsOfKind,
} from '../../lib/hotCards.js';
import HotListPanel from './HotListPanel.jsx';
import TournamentsPanel from './TournamentsPanel.jsx';
import OwnSignalsPanel from './OwnSignalsPanel.jsx';
import MarketPanel from './MarketPanel.jsx';

// The Hot cards tab (CLAUDE.md "Hot cards tab"): everything behind a quote
// row's "Sought after" notice, one section per signal. Moved out of the
// Quote tab's old "Hot cards…" window, which had grown too long for one.
export default function HotCardsTab({ hot }) {
  const { meta = [], hotList = [], market = [], index, addHotCard, removeHotCard } = hot || {};
  const [section, setSection] = useState('meta');
  const sellingCount = useMemo(() => (index ? reasonsOfKind(index, 'sales').length : 0), [index]);
  const climbingCount = useMemo(() => (index ? reasonsOfKind(index, 'price').length : 0), [index]);

  const sections = [
    { key: 'meta', label: 'Tournaments' },
    { key: 'market', label: 'Market climbing' },
    { key: 'sales', label: 'Selling fast', count: sellingCount },
    { key: 'price', label: 'Our price climbs', count: climbingCount },
    { key: 'list', label: 'Hot list', count: hotList.length },
  ];

  return (
    <div className="card card-pad hot-tab">
      <p className="hot-intro">
        A quote row says "Sought after" when its card is played in {META_MIN_SHARE_PCT}%+ of recent tournament
        decks, its TCGplayer market price rose {PRICE_MIN_RISE_PCT}%+, we sold {SALES_MIN_COPIES}+ copies in{' '}
        {SALES_WINDOW_DAYS} days, a copy we track climbed {PRICE_MIN_RISE_PCT}%+, or it's on the hot list.
        This is the data behind those notices.
      </p>
      <div className="hot-subtabs" role="tablist" aria-label="Hot cards sections">
        {sections.map(s => (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`hot-tab-${s.key}`}
            aria-selected={section === s.key}
            aria-controls="hot-section"
            className="hot-subtab"
            onClick={() => setSection(s.key)}
          >
            {s.label}
            {s.count > 0 && <span className="hot-chip-count">{s.count}</span>}
          </button>
        ))}
      </div>
      <div id="hot-section" role="tabpanel" aria-labelledby={`hot-tab-${section}`}>
        {!hot ? (
          <p className="hot-empty">Loading…</p>
        ) : section === 'meta' ? (
          <TournamentsPanel meta={meta} />
        ) : section === 'market' ? (
          <MarketPanel market={market} />
        ) : section === 'list' ? (
          <HotListPanel hotList={hotList} addHotCard={addHotCard} removeHotCard={removeHotCard} />
        ) : (
          <OwnSignalsPanel key={section} index={index} kind={section} />
        )}
      </div>
    </div>
  );
}
