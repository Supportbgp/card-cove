import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function WantListSection() {
  return (
    <DocsSection id="want-list" title="Want list">
      <p>
        When a customer asks for a card we don't have ("No, but I'll keep it on a list"), add it to the{' '}
        <strong>Want list</strong> tab with <strong>+ Add request</strong>: the game and card name (and set or
        number if they care which print), what they'd pay if they said, their name, and a phone number, email or
        Discord to reach them. <strong>Responsible</strong> is optional, for whoever took the request.{' '}
        <strong>Search for the card</strong> is optional too: picking a result adds its picture.
      </p>
      <p>
        A request stays open until you mark it <strong>Fulfilled</strong> or <strong>Reject</strong> it. It never
        expires. Closed requests are kept under Fulfilled / Rejected, and <strong>Reopen</strong> brings one back.
        Anyone on duty can call the customer: the app only keeps the record. An <strong>N in stock</strong> note
        means the catalog already has that card.
      </p>
      <h3>While quoting and sorting</h3>
      <p>
        When a card on a <a href="#quote">quote</a> is on the want list, its row says so, with who wants it and what
        they'd pay, and suggests paying more for it: <strong>Pay +10% for it</strong> sets the card's Alter % to
        +10 (change it to whatever makes sense). In <a href="#sorting">Sorting</a>, a wanted card shows a{' '}
        <strong>Wanted ×N</strong> tag, so you can place it individually and contact the customer.
      </p>
      <h3>Sharing the list</h3>
      <p>
        The public stock page has a <strong>Wanted</strong> view listing the open requests, so you can share what
        we're looking for with customers. <strong>Copy link</strong> on the Want list tab copies its address. It
        only shows the card, never the customer, their contact, their price or your notes. Untick{' '}
        <strong>Show on the public Wanted list</strong> on a request to keep it off.
      </p>
      <DocsCallout kind="note">
        The match is by card name and game, not by print or condition, so check the request's details before
        calling.
      </DocsCallout>
    </DocsSection>
  );
}
