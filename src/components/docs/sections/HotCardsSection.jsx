import DocsSection from '../DocsSection.jsx';

export default function HotCardsSection() {
  return (
    <DocsSection id="hot-cards" title="Hot cards">
      <p>
        The <strong>Hot cards</strong> tab shows the data behind a quote row's amber{' '}
        <strong>Sought after</strong> note (see <a href="#quote">Quote</a>). It never changes a price; it's there
        so you can see what's in demand and why. Each section has its own tab:
      </p>
      <ul>
        <li>
          <strong>Tournaments</strong>: the most-played cards per game, as a share of recent tournament
          decklists, with how many decklists each format counted and when it was last updated. Pick a game, then
          a format if the game has more than one (Magic does). "All formats" shows each card's best format.
        </li>
        <li>
          <strong>Market climbing</strong>: cards whose TCGplayer market price rose 20% or more in the last 30
          days (worth $3 or more). Sort by the biggest dollar gain or the biggest % rise. Click a card name to
          open its TCGplayer page.
        </li>
        <li>
          <strong>Selling fast</strong>: prints we sold 3 or more of in the last 30 days, with the sales counted.
        </li>
        <li>
          <strong>Our price climbs</strong>: copies we stock whose market price rose 20% or more this month, from
          the daily price check.
        </li>
        <li>
          <strong>Hot list</strong>: cards staff flag by hand. Add one with a game (or Any game), the card name,
          why, and who added it; Remove takes it off. A quote row for that card shows your reason.
        </li>
      </ul>
      <p>
        Each bar shows its number next to it, and hovering a row shows the full detail. The sources are
        credited at the bottom of each section, with their last update.
      </p>
    </DocsSection>
  );
}
