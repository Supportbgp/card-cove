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
      <h3>Offering a card</h3>
      <p>
        <strong>Make offer</strong> picks a card from the catalog (copies with
        the bounty's name are listed first; search for another print) and a
        price (it starts at the card's own price; a note to the member is
        optional). One copy is <strong>held</strong> for that member for 7
        days: it shows a "Held" tag in Catalog and isn't on the public stock
        page. The member is pinged in Discord and answers on the website:
      </p>
      <ul>
        <li><strong>Accept</strong>: the copy stays held another 7 days for them to come in, pay and pick it up. The bounty shows as Accepted, with a "Pick up by" date.</li>
        <li><strong>Decline</strong>: the hold is released and the bounty is open again.</li>
        <li>No answer in 7 days: the hold runs out on its own and the bounty is open again.</li>
      </ul>
      <p>
        When they come in, sell the card as usual, with <strong>Mark sold</strong> or
        Edit’s <strong>Mark as sold</strong> (both ask first, since the copy is
        held), then <strong>Mark fulfilled</strong>{' '}
        on the bounty. <strong>Withdraw offer</strong> takes an offer back and
        releases the card.
      </p>
      <DocsCallout kind="note">
        A walk-in who sells us a wanted card goes through a Quote and Sorting as
        usual. In Sorting the card shows a "Wanted" tag: place it individually
        (not into Bulk), then offer it from the Bounties tab.
      </DocsCallout>
      <ul>
        <li>
          <strong>Mark fulfilled</strong> once they have the card. With an
          accepted offer they're thanked in Discord; without an offer they're
          pinged that the card is in.
        </li>
        <li>
          <strong>Remove</strong> takes a bounty down without posting anything
          (e.g. a joke or a duplicate). It also releases a held card.
        </li>
      </ul>
      <DocsCallout kind="note">
        Marking a bounty fulfilled doesn't reserve or sell anything in the
        Catalog. Sell the card as usual when the member comes in.
      </DocsCallout>
    </DocsSection>
  );
}
