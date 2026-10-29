import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function ImportExportSection() {
  return (
    <DocsSection id="import-export" title="Import / Export">
      <h3>Importing a spreadsheet</h3>
      <p>
        Drag a .csv/.xlsx file onto the drop zone, or click to choose one.
        If the file has multiple sheets, you'll pick which one to load
        first. In an .xlsx file specifically, hyperlinks in cells are
        detected and offered as image/source links automatically — a plain
        .csv can't carry that.
      </p>
      <p>
        Next is the <strong>column mapping</strong> step: for each field
        Card Cove understands (Name, Set, Game, Condition, Price, Rarity,
        etc.), pick which column in your file it corresponds to, or leave
        it "— skip —". Card Cove guesses obvious matches automatically from
        your file's own header row. You also pick a Binder/case/collection
        for the whole batch (or map a per-row location column instead), and
        the same Channels checkboxes as the Edit modal.
      </p>
      <p>
        Map a <strong>Cost ($)</strong> column to fill in what the shop paid
        per copy, the same Cost field the Edit screen has. It's what the
        Reports tab uses for Cost and Profit. A blank Cost cell just leaves
        that card without one.
      </p>
      <p>
        <strong>Import mode</strong> matters: <strong>Merge</strong> updates
        matching SKUs and adds anything new, leaving the rest of the catalog
        untouched. <strong>Replace</strong> wipes the entire catalog first —
        only use it if you actually mean to start over.
      </p>
      <DocsCallout kind="warn">
        Merge replaces a matching SKU's whole row with what's in the file. A
        card whose Cost was typed in by hand loses it if its Cost cell is
        blank or the Cost column is skipped, so include Cost when re-importing
        cards that already have one.
      </DocsCallout>
      <DocsCallout kind="note">
        Rows with no image already found get one searched automatically in
        the background — there's no review step here (unlike the Scanner),
        so double-check a few afterward in Catalog if the source names were
        unusual.
      </DocsCallout>

      <h3>Importing old quote spreadsheets</h3>
      <p>
        Switch the toggle at the top of the tab from <strong>Cards</strong> to{' '}
        <strong>Quotes</strong> and drop in the old Excel quote file (one sheet
        per quote, the format the <a href="#quote">Quote</a> tab was based on).
        Every sheet with a customer or cards on it shows up as one quote, with
        its status read from the sheet's Offer Status: <strong>In
        progress</strong> (left blank), <strong>Accepted Cash</strong>,{' '}
        <strong>Accepted Store Credit</strong> or <strong>Rejected
        Offer</strong>. Empty sheets, like the blank Template, are skipped.
      </p>
      <p>
        Pick a <strong>Game</strong> for each quote (or use "Game for all
        quotes"); the old sheets don't say which game a card is. Show cards
        lets you check what was read: name, set and collector number are split
        out of the "Name of Card" text, and shorthand like "Light P" becomes
        Lightly Played. Untick any quote you don't want, then Import.
      </p>
      <ul>
        <li><strong>In progress</strong> quotes land in the Quote tab to finish as usual.</li>
        <li><strong>Rejected</strong> quotes land there too, as a record.</li>
        <li>
          <strong>Accepted</strong> quotes also send their cards to{' '}
          <a href="#sorting">Sorting</a>, with Cost filled in from the payout,
          exactly like accepting a quote in the app.
        </li>
      </ul>
      <DocsCallout kind="note">
        A quote that looks already imported (same customer, date and number of
        cards as one already in the Quote tab) starts unticked, so importing the
        same file twice doesn't double anything by accident. A card name that
        really contains " - " (e.g. a Lorcana "Pongo - Determined Father") gets
        split as if the second half were its set; fix it in the quote afterward.
      </DocsCallout>

      <h3>Exporting</h3>
      <p>
        Pick a format — Full catalog, a TCG Player entry list, a Collectr
        entry list, Pending POS updates, or Sync history — and optionally
        scope it to one binder/case instead of everything.
      </p>
      <DocsCallout kind="warn">
        Neither TCG Player nor Collectr support Card Cove uploading listings to
        them directly. These exports are reference lists to speed up manual
        entry on those platforms, not an automatic sync.
      </DocsCallout>

      <h3>Binder QR codes</h3>
      <p>
        Pick a binder/case and hit Generate — you get a printable QR code
        and a link to a public, login-free page listing everything
        currently in stock in that binder (see{' '}
        <a href="#public-binder-page">The public binder page</a>). It's a
        live lookup, not a one-time snapshot — print it once and stick it on
        the physical binder; it stays accurate as stock changes.
      </p>
      <DocsCallout kind="warn">
        A QR page only shows cards if that binder is public. Tick it first in{' '}
        <strong>Public binders…</strong> (below); otherwise the page says the
        binder isn't shared online.
      </DocsCallout>

      <h3>Public binders</h3>
      <p>
        <strong>Public binders…</strong> lists every binder/case with how many
        cards it has in stock. Tick the ones customers may see, then Save.
        Ticked binders show on the public stock page (its link is at the
        bottom of that window) and on their QR page. Everything else stays
        private, and Bulk lots are never shown. Every binder starts private.
      </p>

      <h3>Reset all data</h3>
      <DocsCallout kind="warn">
        This wipes the entire catalog and sync queue for <em>everyone</em>{' '}
        sharing this Card Cove login — not just your own session. It asks you
        to type a confirmation password first. There's no undo.
      </DocsCallout>
    </DocsSection>
  );
}
