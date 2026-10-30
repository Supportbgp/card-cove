import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function BountiesSection() {
  return (
    <DocsSection id="bounties" title="Bounties">
      <p>
        A bounty is a BGP Discord member asking the shop for a card we don't
        have. Members post them from the public stock page's{' '}
        <strong>Wanted</strong> view after signing in with Discord (see{' '}
        <a href="#public-binder-page">The public binder page</a>). They pick
        the card from a search, or type its details when the search doesn't
        find it, and can add a condition, printing, max price and a note.
      </p>
      <p>
        Each new bounty is posted in the BGP Discord bounty channel. On the
        website, anyone can see the open bounties (card and max price), but
        never who asked.
      </p>
      <h3>Limits</h3>
      <p>
        A member can have up to <strong>10 open bounties</strong>. Each one
        stays up <strong>60 days</strong>, then it expires; the member can
        renew it from their list (also in its last week), or cancel it any
        time.
      </p>
      <h3>The Bounties tab</h3>
      <p>
        Lists every bounty with the member's Discord name, the max price, and
        how many copies of a card with the same name and game are in stock
        right now ("2 in stock" — a hint only: set, condition and printing
        aren't compared). Filter by Open / Expired / Fulfilled / Cancelled /
        Removed, or search by card or member. <strong>Refresh</strong> picks
        up bounties posted since you opened the app.
      </p>
      <ul>
        <li>
          <strong>Mark fulfilled</strong> once we have the card for them: the
          member is pinged in the Discord channel that it's in.
        </li>
        <li>
          <strong>Remove</strong> takes a bounty down without posting anything
          (e.g. a joke or a duplicate).
        </li>
      </ul>
      <DocsCallout kind="note">
        Marking a bounty fulfilled doesn't reserve or sell anything in the
        Catalog. Sell the card as usual when the member comes in.
      </DocsCallout>
    </DocsSection>
  );
}
