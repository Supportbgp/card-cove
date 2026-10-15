import DocsSection from '../DocsSection.jsx';

export default function PricingSettingsSection() {
  return (
    <DocsSection id="pricing-settings" title="Pricing settings">
      <p>
        Opens from the "Pricing settings" link in the footer of the main
        app. This is where the shop's{' '}
        <strong>condition multiplier table</strong> lives — the percentage
        of a card's Near Mint price that each worse condition is assumed to
        be worth (Near Mint itself is always 100%, not editable).
      </p>
      <p>
        These percentages are what turn an NM reference price into the{' '}
        <strong>Market Value</strong> shown throughout Editing an item and
        the Scanner — see{' '}
        <a href="#glossary">Market Value vs. Our Price</a> for what that
        number actually means. Changing a percentage here changes Market
        Value everywhere it's shown, immediately, for every item — it never
        touches Our Price on any item, since that's always set by hand.
      </p>

      <h3>Price alerts</h3>
      <p>
        Once a day, Card Cove checks the market price of every item priced at
        or above a set amount (Pokemon, Magic, Yu-Gi-Oh, Lorcana, One Piece,
        Riftbound, Gundam and SWU). When an item's market price has risen well
        above Our Price, it raises a <strong>price alert</strong>. A blue{' '}
        <strong>"▲ N price alerts"</strong> badge then shows up at the top of
        every screen, and that item's price gets a small <strong>▲</strong> in
        the Catalog.
      </p>
      <p>
        Click the badge to see every open alert: Our Price, the market price
        the check found, and how far apart they are. For each one you can:
      </p>
      <ul>
        <li>
          <strong>Update price</strong>: opens the item's normal Edit screen,
          with the market price shown next to Our Price for reference. Our
          Price is never filled in for you. Set it to whatever you decide,
          then <strong>Save</strong>. Saving the item clears its alert.
        </li>
        <li>
          <strong>Dismiss</strong>: clears the alert and leaves the price as it
          is, for when you've decided the current price is right.
        </li>
      </ul>
      <p>
        The bottom of this Pricing settings window has the two numbers that
        control alerts: the minimum price an item needs to be checked at all
        (default $25), and how far above Our Price the market has to be
        before it raises an alert (default 20%). Changes apply from the next
        daily check.
      </p>
    </DocsSection>
  );
}
