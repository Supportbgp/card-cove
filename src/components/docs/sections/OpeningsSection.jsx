import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function OpeningsSection() {
  return (
    <DocsSection id="openings" title="Openings">
      <p>
        Use the <strong>Openings</strong> tab when the store opens sealed
        product itself (a booster box, a few packs) to sell the singles and
        bulk. It records what was opened, lists what was pulled, and gets the
        pulls into the system, the same way a quote does.
      </p>

      <h3>Recording an opening</h3>
      <p>
        Click <strong>+ New opening</strong> and fill in the name of the
        product and how many were opened, the Game, the date and time, who
        opened it and why, the <strong>Value of sealed product</strong> (for
        the whole quantity) and the <strong>Expected value</strong> (what you
        expected the pulls to be worth).
      </p>
      <p>
        Then list the pulls. <strong>Singles pulled</strong> work exactly like
        a quote's cards: add them by hand, by scanning or by import, and use
        Find image / Find price to value each one (price × qty). New rows
        start on the opening's Game. Put the leftovers under{' '}
        <strong>Bulk</strong> as one or more lots, each with one flat value
        for the whole lot (Qty is just how many cards).
      </p>

      <h3>The numbers</h3>
      <p>
        The <strong>Value</strong> section adds it up for you: the actual
        value of the singles, the value of the bulk, the actual total, and
        the <strong>difference vs. expected</strong> (green when the pulls
        beat it, red when they fell short). Nothing there needs typing except
        a reason for the difference, if there is one, and any notes.
      </p>

      <h3>Finishing: sending the pulls to Sorting</h3>
      <p>
        Save any time while you're still going. When it's complete, set{' '}
        <strong>Status</strong> to <em>Done</em> and Save: every single and
        bulk lot moves to <a href="#sorting">Sorting</a>, where you place
        singles in a binder and bulk lots with <em>Add to Bulk</em>, same as
        cards from a quote.
      </p>
      <DocsCallout kind="note">
        Each pull gets a <strong>Cost</strong> on the way: the sealed value
        is split across the pulls by their value (a $40 card gets twice the
        share of a $20 one), so Reports can show profit when they sell. A
        catalog item pulled this way says "Pulled in Opening #N" next to
        Cost, with a link back to the opening.
      </DocsCallout>
      <DocsCallout kind="warn">
        Every pull needs a Game before Done (otherwise it would land in
        Catalog as "Other"). Setting the opening's own Game fills it in for
        any pull that doesn't have one. After Done, edits to the opening only
        change this record, not the cards already in Sorting or Catalog.
      </DocsCallout>
    </DocsSection>
  );
}
