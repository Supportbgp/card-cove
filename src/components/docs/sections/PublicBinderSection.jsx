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
      <h3>Discord sign-in for members</h3>
      <p>
        The stock page has a <strong>Sign in with Discord</strong> button for
        customers. After signing in, Card Cove checks with Discord that they're
        in the BGP Discord server and shows "BGP Discord member", or tells them
        to join the server first. Signing in doesn't give a customer anything
        from the staff side of Card Cove. It's the first step toward letting
        members post bounties (cards they're looking for).
      </p>
      <DocsCallout kind="note">
        If you're signed in to Card Cove as staff on the same browser, the
        stock page just says "Signed in as staff" and doesn't offer Discord
        sign-in, so it can't sign you out of the staff app.
      </DocsCallout>
      <DocsCallout kind="note">
        It's a live lookup, not a snapshot — as soon as an item sells or its
        price changes in Card Cove, the page reflects it immediately. You can
        tell a customer confidently that what they're looking at is current.
      </DocsCallout>
    </DocsSection>
  );
}
