import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function PublicBinderSection() {
  return (
    <DocsSection id="public-binder-page" title="The public binder page">
      <p>
        This is what a customer sees when they scan a binder's printed QR
        code (generated from <a href="#import-export">Import / Export</a>)
        — a simple grid of everything currently in stock in that one
        binder/case: image, name, set/condition/printing, quantity, and
        price. No login, nothing else in Card Cove is reachable from it.
      </p>
      <p>
        Only <strong>public</strong> binders show anything (set in{' '}
        <a href="#import-export">Import / Export → Public binders…</a>). A
        binder that isn't public says it isn't shared online. Bulk lots are
        never shown.
      </p>
      <h3>The public stock page</h3>
      <p>
        One page with everything in stock across all public binders, with a
        search box and Game/Binder filters, so a customer can check whether
        we have a card before coming in. Every binder QR page links to it
        ("Search all stock"), and its address is shown in the Public binders
        window.
      </p>
      <DocsCallout kind="note">
        It's a live lookup, not a snapshot — as soon as an item sells or its
        price changes in Card Cove, the page reflects it immediately. You can
        tell a customer confidently that what they're looking at is current.
      </DocsCallout>
    </DocsSection>
  );
}
