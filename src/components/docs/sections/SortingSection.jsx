import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function SortingSection() {
  return (
    <DocsSection id="sorting" title="Sorting">
      <p>
        Once a quote is Accepted (Cash or Store Credit), its cards don't go
        straight into Catalog — they land here first, in a "needs to
        process" queue, so each physical card can be placed on its own
        rather than the whole quote being forced into one binder at once.
      </p>

      <h3>Sorting a card</h3>
      <p>
        Each waiting row shows the card, which quote/collection it came
        from, and a <strong>Sort</strong> button. That opens a placement
        decision with two modes:
      </p>
      <DocsCallout kind="note">
        Check the boxes on several rows (or <strong>Select all</strong>) to
        reveal a <strong>Sort selected</strong> button — one destination
        decision then applies to every checked card at once, same batch
        pattern as Catalog's own checkboxes. Handy when a whole group from
        one quote is headed to the same binder/case or the same Bulk lot.
      </DocsCallout>
      <ul>
        <li>
          <strong>Place individually</strong> (default) — pick a real
          binder/case, plus the same In-store/POS, TCG Player, Collectr
          channel checkboxes as adding any Catalog item by hand. Confirming
          creates a normal Catalog row and the card disappears from this
          queue.
        </li>
        <li>
          <strong>Add to Bulk</strong> — just a binder/case, no channels at
          all. See below for what this actually does.
        </li>
      </ul>
      <p>
        If a card has no game set (cards accepted before quotes required
        one), the Sort window asks for its <strong>Game</strong> first, so it
        doesn't land in Catalog as "Other".
      </p>
      <DocsCallout kind="note">
        Once a card is sorted, it's removed from this queue for good — the
        new Catalog row (or the updated Bulk count) is the record from then
        on, not this list. There's nothing to review here after the fact.
      </DocsCallout>

      <h3>What "Bulk" actually is</h3>
      <p>
        Bulk is for cards not worth tracking individually — commons, bulk
        lots, anything you wouldn't price or list on its own. Adding a card
        to Bulk doesn't create a new Catalog row per card; it finds (or
        creates) a single running count for that exact{' '}
        <strong>binder + game</strong> combination and adds this card's
        quantity onto it. Ten different Pokemon commons sorted to Bulk in
        the same binder, on different days, all just increment the same
        one number.
      </p>
      <DocsCallout kind="warn">
        A Bulk row has no Set/Rarity/Condition/Price of its own, is never
        listed on POS/TCG Player/Collectr, and doesn't show up on the
        public binder page — it's an internal holding count only, shown in
        Catalog with an amber <strong>Bulk</strong> badge next to it.
      </DocsCallout>
    </DocsSection>
  );
}
