import { useMemo, useState } from 'react';
import { GAMES } from '../../lib/cardUtils.js';
import {
  META_SOURCES, META_MIN_DECKS, META_MIN_SHARE_PCT, META_MIN_CARD_VALUE,
  topMetaCards, metaFormatsForGame, metaUpdatedAt, formatLabel,
} from '../../lib/hotCards.js';
import BarList from './BarList.jsx';
import Chips, { StatTiles } from './Chips.jsx';

export const META_GAMES = GAMES.filter(g => g !== 'Sports Singles' && g !== 'Other');

export function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'never';
}

// Hot cards → Tournaments: the most-played cards per game, as a share of
// recent decklists, with the formats and decklist counts behind them.
export default function TournamentsPanel({ meta }) {
  const counts = useMemo(
    () => Object.fromEntries(META_GAMES.map(g => [g, topMetaCards(meta, g, Infinity).length])),
    [meta]
  );
  const [picked, setPicked] = useState('');
  const game = picked || META_GAMES.find(g => counts[g] > 0) || META_GAMES[0];
  const formats = useMemo(() => metaFormatsForGame(meta, game), [meta, game]);
  const [formatKey, setFormatKey] = useState('');
  const format = formats.find(f => f.key === formatKey) || null;
  const cards = useMemo(
    () => topMetaCards(meta, game, 40, Date.now(), format && { source: format.source, format: format.format }),
    [meta, game, format]
  );
  const updated = useMemo(() => metaUpdatedAt(meta), [meta]);

  function pickGame(g) {
    setPicked(g);
    setFormatKey('');
  }

  const items = cards.map(m => {
    const fmt = formatLabel(m.format);
    return {
      key: `${m.source}|${m.format}|${m.nameKey}#${m.code}`,
      title: <>{m.name}{m.code && <span className="hot-meta-of"> {m.code}</span>}</>,
      subtitle: [`${m.decks} of ${m.totalDecks} decks`, fmt, META_SOURCES[m.source]?.label].filter(Boolean).join(' · '),
      value: m.share,
      valueText: `${m.share}%`,
      tip: `${m.name}: in ${m.share}% of ${game}${fmt ? ` ${fmt}` : ''} decks (${m.decks} of ${m.totalDecks}, last ${m.windowDays} days)`,
    };
  });

  return (
    <div className="hot-panel">
      <Chips
        label="Game"
        value={game}
        onChange={pickGame}
        options={META_GAMES.map(g => ({ value: g, label: g, count: counts[g] }))}
      />

      {formats.length === 0 ? (
        <p className="hot-empty">
          Not enough recent decklists for {game} (needs at least {META_MIN_DECKS} in a format).
        </p>
      ) : (
        <>
          <StatTiles tiles={formats.map(f => ({
            label: `${f.label || game} decklists`,
            value: f.totalDecks.toLocaleString(),
            note: `${META_SOURCES[f.source]?.label || f.source} · last ${f.windowDays} days · updated ${formatDate(f.updatedAt)}`,
          }))} />
          {formats.length > 1 && (
            <Chips
              label="Format"
              value={formatKey}
              onChange={setFormatKey}
              options={[{ value: '', label: 'All formats' }, ...formats.map(f => ({ value: f.key, label: f.label || f.source }))]}
            />
          )}
          <h3 className="hot-chart-title">
            Share of decks playing each card{format ? `, ${format.label || game}` : ''}
          </h3>
          {cards.length === 0 ? (
            <p className="hot-empty">No card is in {META_MIN_SHARE_PCT}%+ of these decks.</p>
          ) : (
            <BarList items={items} max={100} label={`Most played ${game} cards`} />
          )}
        </>
      )}

      <p className="hot-credit">
        Cards in at least {META_MIN_SHARE_PCT}% of decks; "All formats" shows each card's best format. Updated daily.
        Data provided by{' '}
        {Object.keys(META_SOURCES).map((s, i, all) => (
          <span key={s}>
            {i > 0 && (i === all.length - 1 ? ' and ' : ', ')}
            <a href={META_SOURCES[s].url} target="_blank" rel="noopener noreferrer">{META_SOURCES[s].label}</a>
            {' '}(updated {formatDate(updated[s])})
          </span>
        ))}.
        {' '}Cheap staples (under ${META_MIN_CARD_VALUE}) don't get a tournament notice on a quote row.
      </p>
    </div>
  );
}
