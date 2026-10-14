import Papa from 'papaparse';

// Loaded lazily — xlsx is a large dependency and most sessions never touch
// the Excel import path, so it shouldn't sit in the main bundle.
let XLSX = null;
async function loadXlsx() {
  if (!XLSX) XLSX = await import('xlsx');
  return XLSX;
}

export const FIELD_TARGETS = [
  { key: "sku", label: "SKU / Barcode", aliases: ["sku", "barcode", "tcgplayer id", "tcgplayerid", "product id", "productid", "id"] },
  { key: "name", label: "Card Name", aliases: ["name", "card name", "product name", "title"] },
  { key: "set", label: "Set", aliases: ["set", "set name", "edition"] },
  { key: "game", label: "Game", aliases: ["game", "category", "tcg", "game (detected)"] },
  { key: "condition", label: "Condition", aliases: ["condition", "cond"] },
  { key: "printing", label: "Printing / Foil", aliases: ["printing", "foil", "finish", "variant"] },
  // Not part of the catalog schema — same as EditModal's/ScannerPanel's
  // transient rarity field, used only to narrow the auto image search below
  // for rows that don't already have an image mapped.
  { key: "rarity", label: "Rarity", aliases: ["rarity"] },
  { key: "qty", label: "Quantity", aliases: ["qty", "quantity", "stock", "on hand", "onhand"] },
  { key: "price", label: "Price", aliases: ["price", "market price", "list price"] },
  { key: "notes", label: "Notes", aliases: ["notes", "note", "comment", "comments"] },
  { key: "imageUrl", label: "Image URL", aliases: ["image", "image url", "imageurl", "photo", "img", "image url (detected)"] },
  { key: "itemType", label: "Type (single/slab)", aliases: ["type", "item type", "itemtype"] },
  { key: "grader", label: "Grader", aliases: ["grader", "grading company"] },
  { key: "grade", label: "Grade", aliases: ["grade"] },
  { key: "certNumber", label: "Cert Number", aliases: ["cert", "cert number", "certnumber", "serial"] },
  { key: "sourceUrl", label: "Source / Product URL", aliases: ["source url", "source url (detected)", "product url", "link", "url", "tcgplayer url"] },
  { key: "location", label: "Binder / Case / Collection", aliases: ["location", "binder", "case", "collection", "source"] },
  { key: "sold", label: "Sold (true/false)", aliases: ["sold", "status"] },
  { key: "lastUpdated", label: "Last Updated", aliases: ["last updated", "lastupdated", "updated", "date"] },
];

export function guessHeader(aliases, headers) {
  for (const h of headers) { if (aliases.indexOf(h.trim().toLowerCase()) !== -1) return h; }
  return "";
}

export function isLikelyImageUrl(url) {
  if (!url) return false;
  const u = url.toLowerCase();
  return /\.(jpg|jpeg|png|webp|gif)(\?|$)/.test(u) || u.indexOf('tcgplayer-cdn.tcgplayer.com') !== -1;
}

// Runs `worker` over every item with at most `limit` in flight at once —
// used for the import flow's per-row image search, since firing one request
// per row unbounded (fine for a ~9-card scanner batch) could mean hundreds
// of simultaneous calls against Scryfall/TCGdex/the card-lookup-proxy
// Edge Function for a large spreadsheet import.
export async function runWithConcurrency(items, limit, worker) {
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runOne));
}

export function looksNumeric(s) {
  if (!s) return false;
  const cleaned = s.replace(/[$,]/g, '').trim();
  if (cleaned === '') return false;
  return !isNaN(Number(cleaned));
}

export function guessGameFromSheetName(name) {
  const n = name.toLowerCase();
  if (n.indexOf("mtg") !== -1 || n.indexOf("magic") !== -1) return "Magic";
  if (n.indexOf("pokemon") !== -1 || n.indexOf("pokémon") !== -1) return "Pokemon";
  if (n.indexOf("yugioh") !== -1 || n.indexOf("yu-gi-oh") !== -1) return "Yugioh";
  if (n.indexOf("lorcana") !== -1) return "Lorcana";
  if (n.indexOf("one piece") !== -1) return "One Piece";
  if (n.indexOf("sport") !== -1) return "Sports Singles";
  if (n.indexOf("swu") !== -1 || n.indexOf("star wars") !== -1) return "SWU";
  if (n.indexOf("riftbound") !== -1) return "Riftbound";
  return "";
}

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => {
        if (!res.data.length) { reject(new Error("No rows found in that file.")); return; }
        resolve({ rows: res.data, headers: res.meta.fields, locationDefault: "" });
      },
      error: (err) => reject(new Error("Couldn't parse that CSV: " + err.message)),
    });
  });
}

export async function readWorkbook(file) {
  const XLSX = await loadXlsx();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellHTML: false });
        resolve(wb);
      } catch (err) {
        reject(new Error("Couldn't read that Excel file: " + err.message));
      }
    };
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsArrayBuffer(file);
  });
}

// Loads a single sheet from an already-parsed workbook, auto-detecting the
// binder-page (side-by-side pages) layout vs. the normal header-row layout.
export async function loadXlsxSheet(workbook, sheetName) {
  const XLSX = await loadXlsx();
  const ws = workbook.Sheets[sheetName];
  if (!ws || !ws['!ref']) throw new Error("That sheet appears empty.");
  const range = XLSX.utils.decode_range(ws['!ref']);

  const rawRows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowVals = [];
    const rowCells = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: r, c: c });
      const cell = ws[addr];
      const val = cell ? (cell.w !== undefined ? cell.w : cell.v) : "";
      rowVals.push(val === undefined || val === null ? "" : String(val));
      rowCells.push(cell || null);
    }
    rawRows.push({ vals: rowVals, cells: rowCells });
  }

  while (rawRows.length && rawRows[rawRows.length - 1].vals.every(v => !v.trim())) {
    rawRows.pop();
  }
  if (!rawRows.length) throw new Error("No data found in that sheet.");

  const headerRow = rawRows[0].vals;

  // Detect the "binder page" layout: header row has 2+ cells like "Page 1", "Page 2"
  const pageBlockStarts = [];
  headerRow.forEach((h, idx) => { if (/^page\s*\d+/i.test(h.trim())) pageBlockStarts.push(idx); });
  if (pageBlockStarts.length >= 2) {
    return loadBinderPageFormat(sheetName, rawRows, headerRow, pageBlockStarts);
  }

  // Detect whether row 1 is a real header row, or already data (no header at all).
  // Heuristic: header rows are made of words; a row with a bare number in it is data.
  const hasHeaderRow = !headerRow.some(h => looksNumeric(h));
  const headers = hasHeaderRow
    ? headerRow.map((h, i) => h.trim() ? h.trim() : "Column " + (i + 1))
    : headerRow.map((h, i) => "Column " + (i + 1));
  const startIdx = hasHeaderRow ? 1 : 0;

  let anySectionDetected = false;
  let currentSection = "";
  const dataRows = [];
  for (let i = startIdx; i < rawRows.length; i++) {
    const rr = rawRows[i];
    const vals = rr.vals;
    const first = (vals[0] || "").trim();
    if (!first) continue;
    const restBlank = vals.slice(1).every(v => !v.trim());
    if (restBlank) {
      currentSection = first;
      anySectionDetected = true;
      continue;
    }
    const rowObj = {};
    headers.forEach((h, idx) => { rowObj[h] = vals[idx] !== undefined ? vals[idx] : ""; });
    const nameCell = rr.cells[0];
    const link = (nameCell && nameCell.l && nameCell.l.Target) || "";
    rowObj["Source URL (detected)"] = link;
    rowObj["Image URL (detected)"] = isLikelyImageUrl(link) ? link : "";
    if (anySectionDetected || currentSection) { rowObj["Game (detected)"] = currentSection; }
    dataRows.push(rowObj);
  }

  const finalHeaders = headers.slice();
  finalHeaders.push("Image URL (detected)");
  finalHeaders.push("Source URL (detected)");
  if (anySectionDetected) finalHeaders.push("Game (detected)");

  const withLinks = dataRows.filter(r => r["Image URL (detected)"]).length;
  const withUrls = dataRows.filter(r => r["Source URL (detected)"]).length;
  const message = `${dataRows.length} rows detected from "${sheetName}"` +
    (hasHeaderRow ? "" : " (no header row found — used generic column names)") +
    ` — ${withLinks} recognized as direct image links, ${withUrls} total links found (non-image links mapped to Source URL)` +
    (anySectionDetected ? `, ${new Set(dataRows.map(r => r["Game (detected)"])).size} section group(s) detected` : "") +
    ". Match columns below.";

  return { rows: dataRows, headers: finalHeaders, locationDefault: sheetName.trim(), message };
}

function loadBinderPageFormat(sheetName, rawRows, headerRow, blockStarts) {
  const numCols = headerRow.length;
  const blocks = blockStarts.map((start, idx) => {
    const end = (idx + 1 < blockStarts.length) ? blockStarts[idx + 1] - 1 : numCols - 1;
    let priceIdx = -1, soldValueIdx = -1, tradeIdx = -1;
    for (let c = start; c <= end; c++) {
      const h = (headerRow[c] || "").toLowerCase();
      if (priceIdx === -1 && h.indexOf("mark value") !== -1) priceIdx = c;
      if (soldValueIdx === -1 && h.indexOf("final sale") !== -1) soldValueIdx = c;
      if (tradeIdx === -1 && h.indexOf("traded from") !== -1) tradeIdx = c;
    }
    return { nameIdx: start, priceIdx: priceIdx, soldValueIdx: soldValueIdx, tradeIdx: tradeIdx };
  });

  const guessedGame = guessGameFromSheetName(sheetName);
  const dataRows = [];
  for (let i = 1; i < rawRows.length; i++) {
    const rr = rawRows[i];
    blocks.forEach(block => {
      const nameVal = (rr.vals[block.nameIdx] || "").trim();
      if (!nameVal) return;
      const nameCell = rr.cells[block.nameIdx];
      const hyperlink = (nameCell && nameCell.l && nameCell.l.Target) || "";
      const priceVal = block.priceIdx !== -1 ? rr.vals[block.priceIdx] : "";
      const soldVal = block.soldValueIdx !== -1 ? rr.vals[block.soldValueIdx] : "";
      const tradeVal = block.tradeIdx !== -1 ? rr.vals[block.tradeIdx] : "";
      const rowObj = {
        "Name": nameVal,
        "Price": priceVal,
        "Sold": soldVal.trim() ? "TRUE" : "FALSE",
        "Notes": tradeVal.trim() ? ("Traded from #" + tradeVal.trim()) : "",
        "Image URL (detected)": isLikelyImageUrl(hyperlink) ? hyperlink : "",
        "Source URL (detected)": hyperlink,
      };
      if (guessedGame) rowObj["Game (detected)"] = guessedGame;
      dataRows.push(rowObj);
    });
  }

  const finalHeaders = ["Name", "Price", "Sold", "Notes", "Image URL (detected)", "Source URL (detected)"];
  if (guessedGame) finalHeaders.push("Game (detected)");

  const withLinks = dataRows.filter(r => r["Image URL (detected)"]).length;
  const withUrls = dataRows.filter(r => r["Source URL (detected)"]).length;
  const message = `Binder-page layout detected (${blocks.length} page columns) in "${sheetName}" — ${dataRows.length} items unpacked, ${withLinks} recognized as direct image links, ${withUrls} total links found. ` +
    "\"Final sale value\" filled in was treated as Sold; \"Mark Value\" was treated as Price; \"Traded From #\" was folded into Notes." +
    (guessedGame ? ` Game guessed as "${guessedGame}" from the sheet name — double-check before importing.` : " Couldn't guess a Game from the sheet name — set it manually after import.");

  return { rows: dataRows, headers: finalHeaders, locationDefault: sheetName.trim(), message };
}
