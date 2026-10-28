import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function QuoteSection() {
  return (
    <DocsSection id="quote" title="Quote">
      <p>
        The Quote tab is for <strong>buying cards</strong> — the reverse of
        everything else in Card Cove. Catalog, Scanner, and Import are about
        the shop's own stock going <em>out</em>; Quote is about cards
        coming <em>in</em>, from a customer who wants to sell or trade them
        to the shop.
      </p>

      <h3>Starting a quote</h3>
      <p>
        <strong>+ New Quote</strong> offers two ways in: <strong>Resume a
        collection</strong> (an in-progress quote you already started —
        e.g. "Jake binder proposal" — that hasn't been Accepted or Rejected
        yet), or start a brand-new one by typing a{' '}
        <strong>Collection name</strong>. Nothing is saved to the database
        until you actually hit <strong>Save</strong> the first time — closing
        out of a just-created quote with Cancel leaves no trace behind.
      </p>

      <h3>Adding cards to a quote</h3>
      <p>
        Three ways, freely mixable on the same quote — scan a binder page,
        then add a couple more by hand, for example:
      </p>
      <ul>
        <li>
          <strong>+ Add card manually</strong> — type a name; if it matches
          something already in this shop's own Catalog, picking it backfills
          Game/Set/Rarity/Printing/Market Value automatically. No match?
          Just fill the fields in by hand — a brand-new trade-in card has no
          catalog history to reference yet, which is expected.
        </li>
        <li>
          <strong>+ Add cards by scanning</strong> — the same Scanner used
          in <a href="#scan-binder">Scan Binder</a>, embedded here; detected
          cards get added to this quote instead of straight to Catalog.
        </li>
        <li>
          <strong>+ Add cards by import</strong> — the same spreadsheet
          import used in <a href="#import-export">Import / Export</a>, minus
          the "Replace entire catalog" option (meaningless for a quote).
        </li>
        <li>
          <strong>+ Add misc. item</strong> — for something that isn't a
          card at all: a playmat, a couple of binders you want to offer a
          flat amount for, or a flat "$1 for 3 bulk V/ex" bundle. Just a
          Qty, Name, an optional Description, and a Price — no Game/Set/
          Rarity/Condition fields, and no catalog search. Qty here is a
          record only ("this was 3 cards") — it's never multiplied into the
          price, so a flat $5 always stays a full $5.
        </li>
      </ul>
      <p>
        A fifth option, <strong>+ Add card as Bulk</strong>, lives in its own{' '}
        <strong>Bulk items</strong> section below Cards — for real cards you
        already know are going straight into a Bulk pile, with no reason to
        fill in Set/Rarity/Printing/Condition for them one at a time. Fields
        are Qty, Game, a free-text Lot name (e.g. "Pokemon surge bulk"), a
        Description (e.g. "all Pikachus in different conditions"), and a
        Price — a single flat amount for the whole lot, same as a misc.
        item's price: Qty is a record of how many cards are in the lot, never
        a multiplier (20 cards priced at $5 stays $5, not $100). Just like a
        misc. item, a Bulk lot's price is <em>excluded</em> from the total
        quoted value and tier offers below, and only reaches Payout amount if
        you explicitly add it there (see the next section) — unlike a misc.
        item, though, a Bulk-flagged card still moves to Sorting once
        accepted (see the note below), since it's a real card headed to real
        inventory; you choose Add to Bulk for it at Sorting time.
      </p>
      <p>
        Both a misc. item and a Bulk lot have an optional <strong>Apply a
        %?</strong> checkbox — type a value's full worth, check the box, type
        a percentage (60, 70, 100, anything), and that row's own total
        becomes that percentage of what you typed, instead of you
        pre-calculating "60% of $5" by hand. Leave it unchecked and the row
        behaves exactly as before: the full entered amount.
      </p>
      <DocsCallout kind="note">
        Each card row also has its own <strong>Find image</strong>/
        <strong>Find price</strong> buttons and manual TCGPlayer/eBay
        sold-listings/PriceCharting reference links, same as Catalog's Edit
        modal — the live search is available per card, not just when
        scanning/importing a batch. The same column also has an{' '}
        <strong>Add image</strong> button (uploads a real photo of this
        exact copy) and a <strong>Paste image URL</strong> button — click it
        to reveal a "paste a stock image URL" field, kept collapsed the rest
        of the time so the row stays uncluttered. A labeled{' '}
        <strong>Source link</strong> field further down holds the product/
        listing page a card came from — the same manual-entry options
        Catalog's Edit modal offers, in case a card has no automated match
        to pick from. Once a card carries a Source link, TCGPlayer's
        reference link above switches to that real listing instead of a
        manual search.
      </DocsCallout>

      <h3>Condition is never pre-filled</h3>
      <p>
        Unlike every other Condition field in Card Cove, a quote line item's
        Condition always starts blank — it's a real, on-the-spot physical
        assessment of a card you're about to pay for, not something to
        default and possibly forget to actually check.
      </p>

      <h3>Total, tiers, and the offer decision</h3>
      <p>
        The total quoted value and three offer amounts (defaulting
        50%/60%/70%, adjustable via the <strong>Quote settings</strong> link
        next to "+ New Quote") update live as you add/price cards. "Use"
        next to any tier fills that amount straight into{' '}
        <strong>Payout amount</strong>. Set <strong>Offer status</strong> to{' '}
        <strong>Accepted Cash</strong>, <strong>Accepted Store
        Credit</strong>, or <strong>Rejected Offer</strong> once a decision
        is made, and check <strong>Paid out</strong> once the payout is
        actually handed over.
      </p>
      <p>
        A specific card can also pay out at a different rate than the rest
        of the collection — check <strong>Alter %?</strong> on that card's
        own row and type a signed <strong>+/-X%</strong> (e.g. +10 or -20).
        This is relative to whichever tier you end up using, not a fixed
        number — +10 on a 60% tier pays that one card at 70%, -20 pays it
        at 40% — so the three tier amounts above already reflect it no
        matter which one you pick, useful for a card with a different
        condition, rarity, or ease of resale than the rest of the quote.
      </p>
      <p>
        Any <strong>+ Add misc. item</strong> rows show their own{' '}
        <strong>Add-ons total</strong> right next to the three tier amounts —
        deliberately <em>excluded</em> from the total quoted value those
        tiers are computed from, so a flat $5 you want to pay for two
        binders stays a full $5, never shaved down to a tier percentage.
        Click <strong>Add to payout</strong> to add that raw amount straight
        into Payout amount, on top of whatever you've already entered — the
        button then becomes <strong>Remove from payout</strong>, which
        subtracts exactly that same amount back out, so clicking it twice
        can't stack the add-on total into the payout by accident. Any{' '}
        <strong>+ Add card as Bulk</strong> rows get their own, independent{' '}
        <strong>Bulk total</strong> stat right alongside it, with the same
        Add to payout/Remove from payout toggle — the two totals are tracked
        and applied separately, so you can offer one without the other.
      </p>
      <DocsCallout kind="warn">
        Saving a quote as Accepted (either Cash or Store Credit) moves every
        card on it into the <a href="#sorting">Sorting</a> queue — it does{' '}
        <strong>not</strong> go straight into Catalog. Cards from the same
        quote can end up in different binders or as Bulk, so that decision
        happens afterward, one card at a time. Misc. item add-ons are the
        one exception — they're pricing-only and never move to Sorting or
        become a Catalog row at all.
      </DocsCallout>
      <p>
        Every card and Bulk lot needs a <strong>Game</strong> before the
        quote can be saved as Accepted. Save stays disabled and the message
        names the cards that are missing one (their Game box is outlined in
        red). An in-progress quote can still be saved without one.
      </p>

      <h3>Release form info</h3>
      <p>
        A separate section for the shop's real paper intake form — whether
        the customer already has a price in mind, what number if so, and a
        free-text description of what's actually being left with the shop.
        <strong> Print Release Form</strong> lives at the top of this section
        and prints a physical copy of the intake form matching the shop's
        paper original — meant to be signed with a pen on the spot, not a
        digital signature feature.
        <strong> Print Quote</strong>, an internal record of the whole quote,
        lives the same way at the top of the Total &amp; offer section below
        instead.
      </p>

      <h3>Collapsible sections</h3>
      <p>
        A quote's five sections — Quote details, Release form info, Cards,
        Bulk items, Total &amp; offer — each collapse independently by
        clicking their header, so you can jump straight to, say, Total &amp;
        offer on a long card-heavy quote without scrolling past everything
        else.
      </p>

      <h3>Finding a quote later</h3>
      <p>
        The Quote list is searchable by collection/customer name, filterable
        by status (quick toggle buttons — All/In progress/Accepted Cash/
        Accepted Store Credit/Rejected), sortable by column, and
        color-tinted by outcome. Quotes are never shown or referenced from
        Catalog — every quote lives only in its own view here.
      </p>
    </DocsSection>
  );
}
