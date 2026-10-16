import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function ScannerSection() {
  return (
    <DocsSection id="scan-binder" title="Scan Binder">
      <p>
        Scans one full binder page (a grid of clear pockets, one card each)
        and identifies every card on it automatically. Works best with one
        full page at a time, evenly lit.
      </p>

      <h3>Getting a photo in</h3>
      <p>
        The drop zone opens your phone's regular photo picker (camera or
        library, whatever your phone offers). If you specifically want the
        camera to open right away, use the separate{' '}
        <strong>"Take a photo"</strong> button below it — some phones don't
        reliably offer a camera option from the regular picker.
      </p>

      <h3>Reviewing what was found</h3>
      <p>
        After "Scan this page" finishes, each detected card gets its own
        review row: name, game, set, and rarity (all editable, in case the
        scan guessed wrong), plus a <strong>confidence badge</strong>{' '}
        (low/medium/high) showing how sure the scan was about that
        particular card.
      </p>
      <p>
        Each row's thumbnail has its own Photo/Stock toggle, same idea as
        the Edit modal — "Photo" is a crop taken directly from your page
        photo, "Stock" is a searched reference image. Use{' '}
        <strong>Find another image</strong> if the auto-picked stock
        candidate is wrong (correct the name/set/rarity fields first, then
        search again). <strong>Find market price</strong> reveals the
        Market Value for whichever image is currently showing — it doesn't
        run a new search, it just uses whatever was already fetched
        alongside that image.
      </p>
      <p>
        Fill in Condition and Price yourself for each row — the scan never
        guesses those. Use <strong>+ Add missed card</strong> for anything
        the scan skipped, and remove (✕) any row that shouldn't be added.
      </p>
      <p>
        The Binder/case picker and Channels checkboxes at the top apply to
        the whole batch. When everything on the page looks right, "Add N
        item(s) to catalog" commits all of them at once.
      </p>
      <DocsCallout kind="note">
        A card's crop occasionally clips the top edge slightly, especially
        for the bottom row of a page (steeper camera angle there makes it
        harder for the scan to judge). If a crop looks off, just switch that
        row's toggle to Stock, or re-photograph the page straighter-on.
      </DocsCallout>

      <h3>Stack mode: scanning cards one at a time</h3>
      <p>
        Switch the toggle at the top from <strong>Binder page</strong> to{' '}
        <strong>Stack</strong> to scan loose cards one after another, the
        way apps like ManaBox work. Tap <strong>Start camera</strong>, hold
        one card inside the white frame, and tap anywhere on the camera view
        to capture it. You'll get a flash, a beep (turn it off with{' '}
        <strong>Scan sound</strong>), and the card drops straight into the
        stack. You don't have to wait: each card is identified in the
        background while you scan the next one. The counter at the top of the
        camera shows how many cards are in the stack and how many are still
        being recognized.
      </p>
      <p>
        Scanning several copies of the same card? Scan the first one, then tap{' '}
        <strong>+1 same card</strong> for each extra copy instead of scanning
        it again. It adds one to the last card's quantity right away, without
        waiting on recognition, and works even while that card is still being
        identified.
      </p>
      <ul>
        <li>
          <strong>Before you start</strong>, set <strong>Game</strong>,{' '}
          <strong>Condition</strong> and (for some games){' '}
          <strong>Printing / finish</strong> below the camera if the whole
          stack shares them. They're applied to each card as it's scanned,
          and you can change them between cards.
        </li>
        <li>
          <strong>Scanning the same card again</strong> adds to its quantity
          instead of adding a second row (matched by name and collector
          number).
        </li>
        <li>
          <strong>No live camera?</strong> Use <strong>Take photo</strong>{' '}
          (one card per photo) or <strong>Upload photos</strong> to add
          several existing photos at once.
        </li>
        <li>
          A card that can't be recognized still stays in the stack as a blank
          row with its photo, so you can type it in or tap{' '}
          <strong>Retry</strong>.
        </li>
      </ul>
      <p>
        The stack works like the binder review above: fix anything, set the
        Condition and Price, pick the binder/case and channels, then{' '}
        <strong>Add N item(s) to catalog</strong> adds the whole stack at
        once. That button waits until every card has finished being
        recognized.
      </p>
      <DocsCallout kind="note">
        The stack is saved on <strong>this device</strong> until it's added,
        so it survives a refresh or the phone going to sleep. It isn't shared
        with other devices, and <strong>Clear stack</strong> throws it away
        without adding anything. The camera turns itself off when you leave
        the tab or lock the phone.
      </DocsCallout>
    </DocsSection>
  );
}
