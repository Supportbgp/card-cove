import { useMemo, useState } from 'react';
import { PRICE_MIN_RISE_PCT, MARKET_SOURCE, topMarketMovers } from '../../lib/hotCards.js';
import { safeHttpUrl } from '../../lib/safeUrl.js';
import BarList from './BarList.jsx';
import Chips, { StatTiles } from './Chips.jsx';
import { META_GAMES } from './TournamentsPanel.jsx';

const money = (n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const gain = (m) => m.newPrice - m.oldPrice;

// Hot cards → Market climbing: TCGplayer market climbs over the last 30
// days (TCGCSV, CLAUDE.md "Hot cards: market price climbs from TCGCSV"),
// biggest dollar gain or biggest % first.
export default function MarketPanel({ market }) {
  const byGame = useMemo(
    () => Object.fromEntries(META_GAMES.map(g => [g, topMarketMovers(market, g, Infinity)])),
    [market]
  );
  const [picked, setPicked] = useState('');
  const game = picked || META_GAMES.find(g => byGame[g].length > 0) || META_GAMES[0];
  const [sort, setSort] = useState('gain');
  const all = byGame[game];
  const rows = useMemo(
    () => (sort === 'pct' ? all.slice().sort((a, b) => b.pct - a.pct) : all).slice(0, 40),
    [all, sort]
  );

  const biggestGain = all[0];
  const biggestPct = all.reduce((best, m) => (!best || m.pct > best.pct ? m : best), null);

  const items = rows.map(m => {
    const link = safeHttpUrl(m.url);
    return {
      key: `${m.productId}|${m.subType}`,
      title: link ? <a href={link} target="_blank" rel="noopener noreferrer">{m.name}</a> : m.name,
      subtitle: [m.set, m.number && `#${m.number}`, m.subType, `${money(m.oldPrice)} → ${money(m.newPrice)}`]
        .filter(Boolean).join(' · '),
      value: sort === 'pct' ? m.pct : gain(m),
      valueText: sort === 'pct' ? `+${Math.round(m.pct)}%` : `+${money(gain(m))}`,
      tip: `${m.name}: ${money(m.oldPrice)} → ${money(m.newPrice)} (+${Math.round(m.pct)}%) in ${m.windowDays} days`,
    };
  });

  return (
    <div className="hot-panel">
      <Chips
        label="Game"
        value={game}
        onChange={setPicked}
        options={META_GAMES.map(g => ({ value: g, label: g, count: byGame[g].length }))}
      />
      {all.length === 0 ? (
        <p className="hot-empty">No {game} card worth $3+ rose {PRICE_MIN_RISE_PCT}%+ in the last 30 days.</p>
      ) : (
        <>
          <StatTiles tiles={[
            { label: 'Cards climbing', value: all.length.toLocaleString(), note: `worth $3+, up ${PRICE_MIN_RISE_PCT}%+ in 30 days` },
            { label: 'Biggest $ gain', value: `+${money(gain(biggestGain))}`, note: biggestGain.name },
            { label: 'Biggest % rise', value: `+${Math.round(biggestPct.pct)}%`, note: biggestPct.name },
          ]} />
          <Chips
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[{ value: 'gain', label: 'Biggest $ gain' }, { value: 'pct', label: 'Biggest % rise' }]}
          />
          <h3 className="hot-chart-title">
            {sort === 'pct' ? 'Market price rise, %' : 'Market price gain, $'} (top {rows.length})
          </h3>
          <BarList items={items} label={`${game} market climbs`} />
        </>
      )}
      <p className="hot-credit">
        Updated daily from{' '}
        <a href={MARKET_SOURCE.url} target="_blank" rel="noopener noreferrer">{MARKET_SOURCE.label}</a>.
        {' '}A quote row shows this only when its Number (or Set) says which print it is.
      </p>
    </div>
  );
}
