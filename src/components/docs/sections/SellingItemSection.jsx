import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function SellingItemSection() {
  return (
    <DocsSection id="selling-an-item" title="Selling an item">
      <p>
        Select one or more rows in <a href="#catalog">Catalog</a> — click
        anywhere on a row (desktop table) or check its box — to reveal the
        batch action bar, then click <strong>Mark sold</strong>. This works
        the same for one item or several at once.
      </p>
      <p>
        Selling several items at once sells each one's whole remaining
        quantity. If you select just <strong>one</strong> item that has more
        than one copy, you'll be asked how many sold (<strong>Quantity
        sold</strong>), so you can sell 2 of 5 and keep the other 3 listed.
      </p>
      <p>
        Confirming automatically creates a new ticket in the{' '}
        <a href="#sync-queue">Sync Queue</a> for each item sold, and resets
        its platform status chips (see <a href="#catalog">Catalog</a>) since
        whatever's listed elsewhere no longer matches what's actually left
        in stock. It also adds the sale to <strong>Reports</strong>.
      </p>
      <h3>Undoing a sale</h3>
      <p>
        Right after you confirm, a message like <em>"Sold 1 Kyogre EX"</em>{' '}
        appears at the bottom of the screen with an <strong>Undo</strong>{' '}
        button. Tap it within a few seconds and the sale is reversed: the
        quantity goes back into the catalog (and the item is no longer marked
        sold), and its Sync Queue ticket and its Reports entry are removed.
        Checking <strong>Mark as sold</strong> in Edit works the same way.
      </p>
      <DocsCallout kind="note">
        Missed the Undo button? Every sale can still be undone later from its
        ticket in the <a href="#sync-queue">Sync Queue</a> with{' '}
        <strong>Undo sale</strong>.
      </DocsCallout>
    </DocsSection>
  );
}
