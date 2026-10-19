import DocsSection from '../DocsSection.jsx';

export default function SyncQueueSection() {
  return (
    <DocsSection id="sync-queue" title="Sync Queue">
      <p>
        Every sale (Mark sold in Catalog, or Mark as sold in Edit)
        automatically creates a <strong>ticket</strong> here. A ticket is a
        snapshot of what sold (name, condition, price, quantity) and which
        platforms it was actually listed on <em>at the moment of sale</em> —
        editing the item's channels afterward doesn't change what an
        already-created ticket requires.
      </p>
      <p>
        Each ticket shows a stamp for every platform it applies to —{' '}
        <strong>POS</strong>, <strong>TCG Player</strong>,{' '}
        <strong>Collectr</strong> — tap a stamp once you've gone and updated
        that system yourself. Once every applicable stamp is tapped, the
        ticket moves down into "Completed today."
      </p>
      <p>
        The pending-sync badge in the topbar counts tickets here that aren't
        fully stamped yet — that's the number it's showing you all day.
      </p>
      <p>
        Sold something by mistake? Every ticket has an <strong>Undo
        sale</strong> button. After you confirm, the quantity goes back into
        the catalog and the ticket and its Reports entry are removed. If you
        already stamped a platform for that sale, the confirmation reminds you
        to put the listing back there too, and the item's status chips stay
        unchecked so you can re-check them once it's re-listed.
      </p>
    </DocsSection>
  );
}
