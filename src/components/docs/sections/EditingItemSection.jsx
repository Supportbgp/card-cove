import DocsSection from '../DocsSection.jsx';
import DocsCallout from '../DocsCallout.jsx';

export default function EditingItemSection() {
  return (
    <DocsSection id="editing-an-item" title="Editing an item">
      <p>
        Opens from Catalog's "+ Add item" (blank) or a row's Edit button
        (pre-filled). The form is organized into the same sections whether
        you're adding new or editing existing.
      </p>

      <h3>The image area</h3>
      <p>
        Every item can carry two separate images at once — a{' '}
        <strong>stock</strong> photo (a clean reference picture, from a
        search or a pasted URL) and a <strong>real photo</strong> of your
        actual physical copy. If both exist, a small toggle above the
        preview lets you pick which one shows in the catalog and on the
        public binder page — it defaults to the real photo when both are
        present.
      </p>
      <ul>
        <li><strong>Find stock image</strong> — searches by name/game/set (and Rarity, if filled in) and shows a grid of candidates; click one to use it. This also backfills the NM reference price used for Market Value, if the result has one.</li>
        <li><strong>Upload real photo</strong> — attach an actual photo of this exact copy from your device.</li>
        <li>The URL field lets you paste a stock image link directly instead of searching.</li>
        <li>"Remove stock" / "Remove photo" only appear once that slot actually has something in it.</li>
      </ul>

      <h3>The Rarity field</h3>
      <p>
        Next to Set. It's never saved to the catalog — it only exists to
        narrow the image/price search above, for cards that get reprinted
        at the same name and set but a different rarity.
      </p>

      <h3>Item details</h3>
      <p>
        Name is the only required field. Condition is free text, but it's
        matched against the usual tiers (NM/LP/MP/HP/DMG and common
        spellings like "near mint") wherever Market Value math needs it —
        see <a href="#glossary">Concepts &amp; glossary</a>. SKU/barcode
        auto-generates if you leave it blank. Binder/case/collection
        autocompletes from locations already in use. Checking "This is a
        graded slab" reveals Grader/Grade/Cert fields for that unique item.
      </p>

      <h3>Channels</h3>
      <p>
        Three checkboxes — In-store/POS, TCG Player, Collectr — control
        which platforms this item is actually listed on. Only checked
        platforms show up as status chips in Catalog and as stamps in Sync
        Queue. For a brand-new item, these follow whatever the majority of
        existing items in that same binder/case already use, until you
        touch a checkbox yourself.
      </p>

      <h3>Quantity &amp; pricing</h3>
      <p>
        "Our price" is always yours to set directly — Card Cove never changes
        it automatically. A <strong>Find market price</strong> button here
        runs the same name/game/set/rarity search as Find stock image, but
        independently of whichever image is showing — pick a result to set
        or refresh the NM reference price without touching either photo.
        Selecting a stock image up in the image area does the same thing
        automatically as a bonus, so this button is really for an item that
        already has the right image and just needs its price reference set
        or refreshed. Once an NM reference exists (from either path), this
        section also shows the computed <strong>Market Value</strong> for
        the condition you typed in, with a "Use as Our Price" shortcut.
        Underneath the inputs, a <strong>Reference prices</strong> row always
        offers TCGPlayer (a live listing link once one is known, otherwise a
        manual search), eBay sold listings, and PriceCharting — three
        independent price checks, available any time regardless of whether a
        Market Value has been found yet.
      </p>
      <DocsCallout kind="warn">
        On anything priced $25+ at the NM reference, a warning appears
        reminding you Market Value is a flat-percentage estimate, not real
        per-condition sales data — worth actually checking the live listing
        before pricing something expensive.
      </DocsCallout>

      <h3>Notes &amp; status</h3>
      <p>
        A free-text Notes field (damage, provenance, buyer holds — anything
        worth flagging), and a "Mark as sold" checkbox as an alternative to{' '}
        <a href="#selling-an-item">Mark sold</a> from Catalog. Checking it
        and saving sells the item's whole quantity, the same as Mark sold: it
        creates a Sync Queue ticket and a Reports entry, and offers an Undo.
      </p>

      <h3>Saving</h3>
      <p>
        <strong>Save</strong> is disabled while the name is blank or a save
        is already in progress. <strong>Delete</strong> asks for
        confirmation on an existing item — it's permanent — and just closes
        the modal without asking if you're adding a brand-new item you
        haven't saved yet.
      </p>
    </DocsSection>
  );
}
