import { useRef, useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import { readBinderPagePhoto, scanBinderPage } from '../../lib/scanner.js';
import { mergeScanDuplicates } from '../../lib/cardUtils.js';
import { cropImageRegion } from '../../lib/image.js';
import { runWithConcurrency } from '../../lib/importParse.js';
import { detectedToRow, findImageCandidates, ScanReview } from './scanShared.jsx';
import StackScanner from './StackScanner.jsx';

// `destinationLabel` is purely cosmetic (button/description copy) — lets
// the Quote tab embed this exact component for its "Scan" add-card method
// without every string here still saying "catalog". Everything else about
// the component (photo capture, detection, the review queue, onImport's
// signature) is unchanged; the Scanner tab's own default behavior/wording
// is untouched.
function BinderPageScanner({ catalog, locations, onImport, multipliers, destinationLabel }) {
  const { toast } = useUI();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [photo, setPhoto] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState(null);
  // Tracks the post-scan image/price auto-fill batch — null once it's done
  // (or hasn't started). Drives the "Looking up images & prices" progress
  // line and the scroll-to-top once every row has settled.
  const [fillProgress, setFillProgress] = useState(null);
  const reviewRef = useRef(null);

  async function handlePhotoSelected(file) {
    if (!file) return;
    try {
      const dataUrl = await readBinderPagePhoto(file);
      setPhoto(dataUrl);
      setRows(null);
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function handleScan() {
    if (!photo || scanning) return; // guards a rapid double-tap firing this twice
    setScanning(true);
    try {
      const detected = await scanBinderPage(photo);
      if (!detected.length) {
        toast("No cards detected — try a clearer, more evenly-lit photo.", true);
        setRows([]);
        setScanning(false);
        return;
      }
      const detectedRows = await Promise.all(detected.map(async (card) => {
        const row = detectedToRow(card);
        // Crop this card's own real photo out of the full page image using
        // the vision model's bounding box — no second upload needed. If the
        // model omitted a usable bbox (or the crop math fails on a bad one),
        // leave the photo slot blank; the stock image search below still
        // gives the row something to show.
        if (card.bbox) {
          try {
            row.photoData = await cropImageRegion(photo, card.bbox);
            row.photoUrl = 'local';
          } catch { /* leave photo slot blank */ }
        }
        return row;
      }));
      // Collapse repeat physical copies of the exact same print (matching
      // Name + Number) into one qty-N row before review even starts — see
      // mergeScanDuplicates for why this needs Number, not just Name, to
      // avoid merging visually-identical-looking but genuinely distinct
      // serialized/alt-art prints. Also means the image-fill batch below
      // only ever searches each distinct print once, not once per physical
      // copy.
      const newRows = mergeScanDuplicates(detectedRows);
      setRows(newRows);
      setScanning(false);
      // Pre-fill an image guess per row, independently, without blocking the
      // review queue from showing up immediately. Auto-places the image
      // (unchanged), and quietly remembers that candidate's price/listing
      // as "pending" — Market Value stays hidden until "Find market price"
      // explicitly reveals it, since that's money-relevant and shouldn't
      // come from an unconfirmed top search result.
      // Capped concurrency, not one request burst per card — a full 9-card
      // page firing unbounded parallel searches (each one also pricing up to
      // 20 Pokemon candidates) can hit dozens of simultaneous requests
      // against a free, key-less public API — originally pokemontcg.io,
      // which was prone to rate-limiting/5xx under exactly that kind of
      // burst; still a sensible courtesy for TCGdex (same reasoning as CSV import's
      // runWithConcurrency cap, reused here). A small staggered start on top
      // of that cap spreads the very first wave out further still, rather
      // than firing several requests in the same instant — a self-imposed
      // pace meant to stay well under whatever limit the API enforces,
      // instead of finding it the hard way.
      setFillProgress({ done: 0, total: newRows.length });
      // Tallied locally, not read back off `rows` state — the .then() below
      // fires the instant every worker's promise resolves, which can beat
      // React actually applying the last batch of setRows updates. A plain
      // closure variable has no such race.
      let noImageCount = 0;
      runWithConcurrency(newRows, 3, async (row, i) => {
        await new Promise((r) => setTimeout(r, Math.min(i, 2) * 220));
        const results = await findImageCandidates(row.name, row.game, row.set, row.rarity, row.number);
        if (!results.length) noImageCount++;
        setRows(prev => prev && prev.map(r => r.id === row.id
          ? {
            ...r, imageUrl: results[0]?.url || '', imageStatus: results.length ? 'found' : 'none', imageCandidates: results,
            pendingPrice: results[0]?.price ?? null, pendingListingUrl: results[0]?.listingUrl || '',
          }
          : r));
        setFillProgress(p => p && { ...p, done: p.done + 1 });
      }).then(() => {
        setFillProgress(null);
        // Staff may have scrolled to watch a specific row fill in — snap
        // back to the top of the review queue now that every row has
        // settled, so they start reviewing from card #1.
        reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // A blank thumbnail is easy to miss in a long list, and jumping
        // straight into "Find another image" clicks recreates the exact
        // burst the pacing above is trying to avoid — a single nudge here
        // is more useful than staff mass-retrying rows the moment the queue
        // settles.
        if (noImageCount > 0) {
          toast(`${noImageCount} card${noImageCount === 1 ? '' : 's'} need${noImageCount === 1 ? 's' : ''} a manual image search — see the row(s) below with no thumbnail.`, true);
        }
      });
    } catch (err) {
      toast("Scan failed: " + err.message, true);
      setScanning(false);
    }
  }

  return (
    <div>
      <div className="card card-pad" style={{ marginBottom: '16px' }}>
        <div className="section-label">Scan a binder page</div>
        <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '12px' }}>
          Take or upload a photo of one full binder page. Every card gets identified automatically —
          review and correct the results below before anything is added to the {destinationLabel}. Condition,
          printing/finish, and price aren't guessed; fill those in yourself once you have the cards in hand.
        </div>
        <div
          className="drop"
          onClick={() => { if (!scanning) fileInputRef.current.click(); }}
        >
          {photo ? (
            <img src={photo} style={{ maxWidth: '100%', maxHeight: '260px', borderRadius: '8px' }} />
          ) : (
            <>
              <span className="mark">Choose a photo of a binder page</span>
              One page at a time works best — a full 9-pocket page in even light. Or use the camera button below.
            </>
          )}
        </div>
        {/* Two separate inputs instead of one relying on the OS's default
            file-picker chooser to offer both options — that chooser's exact
            behavior (whether "Take Photo" even shows up) varies enough across
            mobile browsers/OS versions that staff on some phones only ever
            saw a plain file picker with no camera option. capture="environment"
            here guarantees a real camera launch regardless of that. */}
        <input
          type="file" ref={fileInputRef} accept="image/*" style={{ display: 'none' }}
          disabled={scanning}
          onChange={(e) => handlePhotoSelected(e.target.files[0])}
        />
        <input
          type="file" ref={cameraInputRef} accept="image/*" capture="environment" style={{ display: 'none' }}
          disabled={scanning}
          onChange={(e) => handlePhotoSelected(e.target.files[0])}
        />
        <button
          type="button" className="btn secondary small" disabled={scanning}
          style={{ marginTop: '10px' }}
          onClick={() => cameraInputRef.current.click()}
        >
          Take a photo
        </button>
        {photo && !rows && (
          <div style={{ marginTop: '10px' }}>
            <button className="btn" disabled={scanning} onClick={handleScan}>
              {scanning ? 'Scanning…' : 'Scan this page'}
            </button>
            {scanning && (
              <div className="status-line" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="spinner" />
                Reading the page — this can take several seconds…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Blocking, non-dismissible — real-phone feedback found staff editing
          rows (name/set fields, image toggles) while this batch fill was
          still writing into them, which raced. Sitting in the same
          .overlay/.modal system as every other modal (z-index 1000)
          categorically covers the review queue below and swallows clicks
          to it, so there's nothing to edit until the batch actually settles. */}
      {fillProgress && (
        <div className="overlay show">
          <div className="modal">
            <div className="modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
              <span className="spinner" style={{ width: '26px', height: '26px', borderWidth: '3px' }} />
              <div style={{ fontWeight: 600, marginTop: '14px', fontFamily: "'Space Grotesk', sans-serif" }}>
                Looking up images &amp; prices…
              </div>
              <div style={{ color: 'var(--ink-soft)', fontSize: '13px', marginTop: '6px' }}>
                {fillProgress.done} of {fillProgress.total} card{fillProgress.total === 1 ? '' : 's'} done.
                This only runs once per scan — the review queue unlocks as soon as it's finished.
              </div>
            </div>
          </div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card card-pad" ref={reviewRef}>
          <ScanReview
            rows={rows}
            setRows={setRows}
            catalog={catalog}
            locations={locations}
            multipliers={multipliers}
            onImport={onImport}
            onAdded={() => {
              setPhoto(null);
              setRows(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            destinationLabel={destinationLabel}
            locationLabel="Binder / case / collection for this page"
            addedMessage={(n) => `Added ${n} item(s) from this page`}
          />
        </div>
      )}
      {rows && rows.length === 0 && (
        <div className="empty"><span className="mark">Nothing detected</span>Try a clearer or better-lit photo.</div>
      )}
    </div>
  );
}

// The Scanner tab (and the Quote tab's embedded "Scan" option): two modes
// sharing one review/add flow (scanShared.jsx). "Binder page" — one photo
// of a whole page, every card detected at once. "Stack" — scan single cards
// one after another into a stack, ManaBox-style (StackScanner.jsx).
export default function ScannerPanel(props) {
  const [mode, setMode] = useState('binder');
  return (
    <div>
      <div className="scan-mode-toggle" role="group" aria-label="Scan mode">
        <button type="button" className={`btn small${mode === 'binder' ? '' : ' ghost'}`} aria-pressed={mode === 'binder'}
          onClick={() => setMode('binder')}>Binder page</button>
        <button type="button" className={`btn small${mode === 'stack' ? '' : ' ghost'}`} aria-pressed={mode === 'stack'}
          onClick={() => setMode('stack')}>Stack</button>
      </div>
      {mode === 'binder'
        ? <BinderPageScanner {...props} destinationLabel={props.destinationLabel || 'catalog'} />
        : <StackScanner {...props} destinationLabel={props.destinationLabel || 'catalog'} />}
    </div>
  );
}
