import { useEffect, useRef, useState } from 'react';
import { detectGrading, normalizeCard, channelDefaultsForLocation } from '../../lib/cardUtils.js';
import { searchCardImage } from '../../lib/cardSearch.js';
import {
  FIELD_TARGETS, guessHeader, parseCsvFile, readWorkbook, loadXlsxSheet, runWithConcurrency,
} from '../../lib/importParse.js';
import LocationPicker from '../LocationPicker.jsx';

// How many rows to search for an image at once — see runWithConcurrency.
const IMAGE_SEARCH_CONCURRENCY = 4;

// The file-drop → sheet-pick → column-mapping → confirm flow, split out of
// the original ImportExportPanel so it can be reused standalone — the
// Quote tab's "Import" add-card method mounts this directly (with
// `embedded` set, and `onImport` appending to a quote's line items instead
// of writing to Catalog) rather than pulling in Export/Binder-QR/Reset-all-
// data too, none of which belong there. The real Import/Export tab still
// gets identical behavior via ImportExportPanel, which composes this
// unchanged.
export default function ImportPanel({ catalog, locations, onImport, embedded = false }) {
  const fileInputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState({ text: "", kind: "" });

  const [workbook, setWorkbook] = useState(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [showSheetPicker, setShowSheetPicker] = useState(false);

  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [locationDefault, setLocationDefault] = useState("");
  const [mapping, setMapping] = useState({});
  const [importLocation, setImportLocation] = useState("");
  // Embedded contexts (e.g. the Quote tab) never write straight to
  // Catalog, so "Replace entire catalog" is both meaningless and
  // dangerously mislabeled there — the mode selector itself only renders
  // for the real Import tab; embedded callers always merge.
  const [importMode, setImportMode] = useState("merge");
  const [showMapSection, setShowMapSection] = useState(false);
  const [channels, setChannels] = useState({ posChannel: true, tcgplayerChannel: true, collectrChannel: true });
  const [channelsTouched, setChannelsTouched] = useState(false);
  // Provisional, not a settled feature — added for a large synthetic/
  // test-data import (hundreds of rows with no real cards behind them,
  // where the auto-search would just burn time finding nothing) and for
  // bulk/legacy-data drops staff already plan to image manually later.
  // Defaults unchecked so today's behavior is unchanged for a normal
  // import; keep or drop based on whether staff actually reach for it.
  const [skipImageSearch, setSkipImageSearch] = useState(false);
  // Guards against the same duplication bug found (and fixed) on
  // SortItemModal's Confirm button: with no disabled-while-importing state,
  // a click while handleConfirmImport's own image-search loop was still
  // running (which can take real seconds per row, worst case for Pokemon —
  // see cardSearch.js's own documented pokemontcg.io retry behavior) fired
  // a second full onImport(newRows) call for the same rows, duplicating
  // every row once per extra click.
  const [importing, setImporting] = useState(false);

  // Same reasoning as the Edit modal and Scanner — one import is one batch
  // for one binder/case, so follow whatever channels that location already
  // uses until staff manually override it for this batch.
  useEffect(() => {
    if (channelsTouched) return;
    setChannels(channelDefaultsForLocation(catalog, importLocation.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importLocation]);

  function setChannel(key, val) {
    setChannelsTouched(true);
    setChannels(c => ({ ...c, [key]: val }));
  }

  function applyParsed(newRows, newHeaders, newLocationDefault) {
    setRows(newRows);
    setHeaders(newHeaders);
    setLocationDefault(newLocationDefault);
    const initialMapping = {};
    FIELD_TARGETS.forEach(f => {
      const g = guessHeader(f.aliases, newHeaders);
      if (g) initialMapping[f.key] = g;
    });
    setMapping(initialMapping);
    setImportLocation(newLocationDefault || "");
    setSkipImageSearch(false);
    setShowMapSection(true);
  }

  async function loadSheet(wb, sheetName) {
    try {
      const result = await loadXlsxSheet(wb, sheetName);
      applyParsed(result.rows, result.headers, result.locationDefault);
      setStatus({ text: result.message, kind: "ok" });
      setShowSheetPicker(false);
    } catch (err) {
      setStatus({ text: err.message, kind: "err" });
    }
  }

  async function handleFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    setShowSheetPicker(false);
    if (ext === "xlsx" || ext === "xls") {
      setStatus({ text: "Reading Excel file…", kind: "" });
      try {
        const wb = await readWorkbook(file);
        setWorkbook(wb);
        if (wb.SheetNames.length > 1) {
          setSheetNames(wb.SheetNames);
          setSelectedSheet(wb.SheetNames[0]);
          setShowSheetPicker(true);
          setStatus({ text: `${wb.SheetNames.length} sheets found — pick one to import.`, kind: "" });
        } else {
          await loadSheet(wb, wb.SheetNames[0]);
        }
      } catch (err) {
        setStatus({ text: err.message, kind: "err" });
      }
    } else {
      setStatus({ text: "Reading file…", kind: "" });
      try {
        const { rows: r, headers: h, locationDefault: ld } = await parseCsvFile(file);
        applyParsed(r, h, ld);
        setStatus({ text: `${r.length} rows detected — match columns below.`, kind: "" });
      } catch (err) {
        setStatus({ text: err.message, kind: "err" });
      }
    }
  }

  function handleMappingChange(fieldKey, value) {
    setMapping(m => {
      const next = { ...m };
      if (value) next[fieldKey] = value; else delete next[fieldKey];
      return next;
    });
  }

  async function handleConfirmImport() {
    if (!mapping.name) {
      setStatus({ text: "Card Name must be mapped to import.", kind: "err" });
      return;
    }
    setImporting(true);
    try {
      await runConfirmImport();
    } finally {
      setImporting(false);
    }
  }

  async function runConfirmImport() {
    const autoGrade = !(mapping.itemType || mapping.grader || mapping.grade);
    const batchLocation = importLocation.trim();
    // Not part of the catalog schema (see importParse.js) — kept in a
    // separate array, indexed the same as newRows, purely to narrow the
    // auto image search below. Never attached to the normalizeCard objects
    // themselves so it can't leak into what actually gets saved.
    const rarityHints = rows.map(r => (mapping.rarity ? (r[mapping.rarity] || "").trim() : ""));
    const newRows = rows.map((r, i) => {
      const rawName = mapping.name ? r[mapping.name] : "Unnamed";
      let detected = { name: rawName, itemType: "single", grader: "", grade: "" };
      if (autoGrade) detected = detectGrading(rawName);
      const perRowLocation = mapping.location ? (r[mapping.location] || "").trim() : "";
      return normalizeCard({
        sku: (mapping.sku ? r[mapping.sku] : "") || ("noSKU-" + i),
        name: autoGrade ? detected.name : rawName,
        set: mapping.set ? r[mapping.set] : "",
        game: mapping.game ? r[mapping.game] : "",
        condition: mapping.condition ? r[mapping.condition] : "",
        printing: mapping.printing ? r[mapping.printing] : "",
        qty: mapping.qty ? r[mapping.qty] : 1,
        price: mapping.price ? r[mapping.price] : null,
        cost: mapping.cost ? r[mapping.cost] : null,
        notes: mapping.notes ? r[mapping.notes] : "",
        imageUrl: mapping.imageUrl ? r[mapping.imageUrl] : "",
        sourceUrl: mapping.sourceUrl ? r[mapping.sourceUrl] : "",
        location: perRowLocation || batchLocation,
        itemType: mapping.itemType ? r[mapping.itemType] : detected.itemType,
        grader: mapping.grader ? r[mapping.grader] : detected.grader,
        grade: mapping.grade ? r[mapping.grade] : detected.grade,
        certNumber: mapping.certNumber ? r[mapping.certNumber] : "",
        sold: mapping.sold ? r[mapping.sold] : false,
        posChannel: channels.posChannel,
        tcgplayerChannel: channels.tcgplayerChannel,
        collectrChannel: channels.collectrChannel,
        lastUpdated: (() => {
          if (!mapping.lastUpdated) return Date.now();
          const parsed = Date.parse(r[mapping.lastUpdated]);
          return isNaN(parsed) ? Date.now() : parsed;
        })(),
      });
    });

    // Rows with no image already (no mapped column, or that column was
    // blank for this row) get an auto-search, same lookup the Scanner and
    // Edit modal use — this is the only thing the backlog asked for here,
    // so unlike those two, there's no price/listing backfill and no per-row
    // review step: the top result just fills the image slot directly,
    // matching how little review any other imported field gets today.
    // Skipped entirely (an empty needsImage list is a no-op below, and
    // resulting status text) when "Skip automatic image search" is
    // checked — see its own state comment above for why that exists.
    const needsImage = skipImageSearch ? [] : newRows
      .map((card, i) => ({ card, rarityHint: rarityHints[i] }))
      .filter(({ card }) => !card.imageUrl);
    let foundCount = 0;
    if (needsImage.length) {
      setStatus({ text: `Searching for card images for ${needsImage.length} row(s) without one…`, kind: "" });
      await runWithConcurrency(needsImage, IMAGE_SEARCH_CONCURRENCY, async ({ card, rarityHint }) => {
        try {
          const results = await searchCardImage(card.game, card.name, card.set, rarityHint);
          if (results && results.length) {
            card.imageUrl = results[0].url;
            foundCount++;
          }
        } catch {
          // leave blank — staff can still search/upload manually in the Edit modal
        }
      });
    }

    setStatus({ text: "Saving…", kind: "" });
    await onImport(newRows, embedded ? "merge" : importMode);
    const slabCount = newRows.filter(r => r.itemType === "slab").length;
    setStatus({
      text: `Imported ${newRows.length} rows.`
        + (autoGrade ? ` Auto-detected ${slabCount} slab(s) from grading text in the name.` : "")
        + (needsImage.length ? ` Found images for ${foundCount} of ${needsImage.length} row(s) that didn't already have one.` : ""),
      kind: "ok",
    });
    setShowMapSection(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="card card-pad" style={{ marginBottom: '16px' }}>
      <div className="section-label">Import from Google Sheets / CSV / Excel</div>
      <div style={{ fontSize: '12.5px', color: 'var(--ink-soft)', marginBottom: '12px' }}>
        Prefer <strong>.xlsx</strong> over .csv when your sheet has hyperlinks (e.g. TCGplayer photo links) — Excel
        format keeps them, CSV strips them. In Google Sheets: File → Download → Microsoft Excel (.xlsx).
      </div>
      <div
        className={`drop${dragOver ? ' drag' : ''}`}
        onClick={() => fileInputRef.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
        }}
      >
        <span className="mark">Drop a .csv or .xlsx file, or click to choose</span>
        Hyperlinks on cells are auto-detected as images. Section header rows (e.g. a row that just says "POKEMON") are
        auto-detected as a Game grouping.
      </div>
      <input
        type="file" ref={fileInputRef} accept=".csv,.xlsx" style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }}
      />
      {showSheetPicker && (
        <div className="sheet-picker">
          <label style={{ fontSize: '12.5px', color: 'var(--ink-soft)' }}>Sheet to import:</label>
          <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)}>
            {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="btn secondary small" onClick={() => loadSheet(workbook, selectedSheet)}>Load sheet</button>
        </div>
      )}
      {showMapSection && (
        <div>
          <div className="section-label">Match your columns</div>
          <div className="map-grid">
            {FIELD_TARGETS.map(field => (
              <div className="map-row" key={field.key}>
                <label>{field.label}</label>
                <select
                  value={mapping[field.key] || ""}
                  onChange={(e) => handleMappingChange(field.key, e.target.value)}
                >
                  <option value="">— skip —</option>
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className="field-group" style={{ maxWidth: '420px' }}>
            <label>Binder / case / collection for this import</label>
            <LocationPicker locations={locations} value={importLocation} onChange={setImportLocation} />
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '4px' }}>
              Applied to every row in this import. Type a new name to create a new binder/case, or pick an existing one.
            </div>
          </div>
          <div className="field-group" style={{ maxWidth: '420px' }}>
            <label>Where do these live?</label>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
              <div className="checkbox-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" id="imp_posChannel" checked={channels.posChannel} onChange={(e) => setChannel('posChannel', e.target.checked)} />
                <label htmlFor="imp_posChannel" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>In-store / POS</label>
              </div>
              <div className="checkbox-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" id="imp_tcgplayerChannel" checked={channels.tcgplayerChannel} onChange={(e) => setChannel('tcgplayerChannel', e.target.checked)} />
                <label htmlFor="imp_tcgplayerChannel" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>TCG Player</label>
              </div>
              <div className="checkbox-row" style={{ marginBottom: 0 }}>
                <input type="checkbox" id="imp_collectrChannel" checked={channels.collectrChannel} onChange={(e) => setChannel('collectrChannel', e.target.checked)} />
                <label htmlFor="imp_collectrChannel" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>Collectr</label>
              </div>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '4px' }}>
              Applies to every row in this import — edit an individual item afterward if one differs.
            </div>
          </div>
          <div className="field-group" style={{ maxWidth: '420px' }}>
            <div className="checkbox-row" style={{ marginBottom: 0 }}>
              <input
                type="checkbox" id="imp_skipImageSearch" checked={skipImageSearch}
                onChange={(e) => setSkipImageSearch(e.target.checked)}
              />
              <label htmlFor="imp_skipImageSearch" style={{ margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>
                Skip automatic image search
              </label>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: '4px' }}>
              {skipImageSearch
                ? "Rows with no Image URL mapped will just be saved without one — add images manually later from the catalog table. Useful for a large test/bulk import where the search would just be spent finding nothing."
                : "Rows with no Image URL mapped (or blank for that row) get an automatic image search by name/game/set before saving — same lookup as the binder scanner. This can take a moment for a large import; a wrong or missing result can always be fixed afterward from the catalog table."}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button className="btn" disabled={importing} onClick={handleConfirmImport}>{importing ? 'Importing…' : 'Import rows'}</button>
            {!embedded && (
              <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                <option value="merge">Merge (update matching SKUs, add new)</option>
                <option value="replace">Replace entire catalog</option>
              </select>
            )}
          </div>
        </div>
      )}
      {status.text && <div className={`status-line ${status.kind}`}>{status.text}</div>}
    </div>
  );
}
