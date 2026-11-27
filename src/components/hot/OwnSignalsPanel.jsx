import { useMemo, useState } from 'react';
import { reasonsOfKind, SALES_MIN_COPIES, SALES_WINDOW_DAYS, PRICE_MIN_RISE_PCT } from '../../lib/hotCards.js';
import BarList from './BarList.jsx';
import Chips, { StatTiles } from './Chips.jsx';

// Hot cards → Selling fast / Our price climbs: the two signals that come
// from our own data (sales, and the daily price check on cards we track),
// grouped by print the same way a quote row is matched.
const KINDS = {
  sales: {
    empty: `Nothing sold ${SALES_MIN_COPIES}+ copies in the last ${SALES_WINDOW_DAYS} days.`,
    chartTitle: `Copies sold, last ${SALES_WINDOW_DAYS} days`,
    value: r => r.copies,
    valueText: r => `${r.copies} sold`,
    tiles: list => [
      { label: 'Cards selling fast', value: list.length, note: `${SALES_MIN_COPIES}+ copies in ${SALES_WINDOW_DAYS} days` },
      { label: 'Copies sold', value: list.reduce((n, r) => n + r.copies, 0), note: 'across these cards' },
    ],
    note: `Counts each exact print (same name and Set) from Mark sold, refunds left out. To see the sales in Reports, pick a Custom range covering the last ${SALES_WINDOW_DAYS} days.`,
  },
  price: {
    empty: `No tracked card rose ${PRICE_MIN_RISE_PCT}%+ this month.`,
    chartTitle: 'Market price rise this month, %',
    value: r => r.pct,
    valueText: r => `+${Math.round(r.pct)}%`,
    tiles: list => [
      { label: 'Tracked cards climbing', value: list.length, note: `up ${PRICE_MIN_RISE_PCT}%+ this month` },
      { label: 'Biggest rise', value: list.length ? `+${Math.round(list[0].pct)}%` : '—', note: list[0]?.name || '' },
    ],
    note: 'From the daily price check, which covers cards we stock priced at or above the Pricing settings floor.',
  },
};

export default function OwnSignalsPanel({ index, kind }) {
  const k = KINDS[kind];
  const all = useMemo(() => reasonsOfKind(index, kind), [index, kind]);
  const games = useMemo(() => [...new Set(all.map(r => r.game).filter(Boolean))].sort(), [all]);
  const [game, setGame] = useState('');
  const list = game ? all.filter(r => r.game === game) : all;

  const items = list.slice(0, 60).map((r, i) => ({
    key: `${r.game}|${r.name}|${r.details?.[0] || ''}|${i}`,
    title: r.name,
    subtitle: [r.game, r.text].filter(Boolean).join(' · '),
    value: k.value(r),
    valueText: k.valueText(r),
    detail: kind === 'sales' && r.details?.length ? (
      <ul className="bar-detail-list">{r.details.map((d, j) => <li key={j}>{d}</li>)}</ul>
    ) : null,
    tip: r.text,
  }));

  return (
    <div className="hot-panel">
      {all.length === 0 ? (
        <p className="hot-empty">{k.empty}</p>
      ) : (
        <>
          <StatTiles tiles={k.tiles(list)} />
          {games.length > 1 && (
            <Chips
              label="Game"
              value={game}
              onChange={setGame}
              options={[{ value: '', label: 'All games', count: all.length },
                ...games.map(g => ({ value: g, label: g, count: all.filter(r => r.game === g).length }))]}
            />
          )}
          <h3 className="hot-chart-title">{k.chartTitle}</h3>
          <BarList items={items} label={k.chartTitle} />
        </>
      )}
      <p className="hot-credit">{k.note}</p>
    </div>
  );
}
