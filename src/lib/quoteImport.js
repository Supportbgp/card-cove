import { CONDITION_TIERS, canonicalizeCondition } from './cardUtils.js';
import { normalizeQuoteItem } from './quoteUtils.js';

// Import/Export → "Quotes": reads the shop's old Excel quote sheets (the
// template the Quote tab was modeled on) into real quotes. One sheet = one
// quote. Layout, from the real template (not guessed):
//   B1 "Customer Name:" C1 value   D1 "Customer ID:" E1   F1 "Phone #:" G1
//   B2 "Date Quoted:"   C2 date
//   B3 "Offer Status:"  C3 "Accepted Cash" / "Rejected Offer" / blank
//   D3 "Payout Amount:" E3 number    D4 "Paid Out?" E4 TRUE/FALSE
//   B5 "Time taken to Quote:" C5     D5 "Employee:" E5
//   Row 6 headers: "Name of Card" | "Set - PKM #" | "Condition" | "Price" | "Qty" | "Notes:"
//   Rows 7+: one card per row; Qty blank means 1; Price is per card.
// Values are found next to their labels (one cell to the right) and the
// card columns by their header text, so a sheet with a column moved or a
// row inserted above still reads correctly.

const HEADER_LABELS = {
  customerName: 'customer name',
  customerId: 'customer id',
  phone: 'phone #',
  dateQuoted: 'date quoted',
  offerStatus: 'offer status',
  payoutAmount: 'payout amount',
  paidOut: 'paid out?',
  timeTaken: 'time taken to quote',
  employee: 'employee',
};

const KNOWN_LABELS = new Set(Object.values(HEADER_LABELS).concat(['offer']));

function labelKey(v) {
  if (v == null) return '';
  return String(v).trim().toLowerCase().replace(/:$/, '').trim();
}

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function parseNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseBool(v) {
  if (typeof v === 'boolean') return v;
  const s = cellText(v).toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === 'x' || s === '1';
}

// Excel stores dates as a day count since 1899-12-30 when read without
// cellDates. Returns "YYYY-MM-DD" (how quotes store date_quoted), or ''.
export function parseQuoteDate(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (v < 1 || v > 100000) return '';
    const d = new Date(Math.round((v - 25569) * 86400000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  }
  return '';
}

// "Accepted Cash " / "Accepted Store Credit" / "Rejected Offer" / blank.
// Returns { status, unrecognized } where status is the app's offer_status
// (null = still in progress / waiting for an answer).
export function parseQuoteStatus(v) {
  const s = cellText(v).toLowerCase();
  if (!s) return { status: null, unrecognized: '' };
  if (s.includes('reject') || s.includes('declin')) return { status: 'rejected', unrecognized: '' };
  if (s.includes('accept')) {
    return { status: s.includes('credit') ? 'accepted_store_credit' : 'accepted_cash', unrecognized: '' };
  }
  return { status: null, unrecognized: cellText(v) };
}

// "Light P" → "Lightly Played", etc. Anything not recognized is kept as
// typed (the Condition field is free text everywhere in the app).
export function parseCondition(v) {
  const raw = cellText(v);
  const tier = canonicalizeCondition(raw);
  if (!tier) return raw;
  return CONDITION_TIERS.find(t => t.key === tier).name;
}

// A collector number as the sheets write it: "094/088", "4/102", "056",
// "SWSH283", "SM213", "TG05/TG30", "GG44".
const NUMBER_RE = /^[A-Za-z]{0,6}\d+[A-Za-z]?(?:\/[A-Za-z]{0,6}\d+)?$/;

// The "Name of Card" cell usually packs everything into one string:
//   "Ethan's Typhlosion - 190/182 - SV10: Destined Rivals (DRI)"
//   "Lapras GX (Full Art) - SM Base Set (SM01)"
//   "Sleight of Hand - Secrets of Strixhaven"
// The first " - " part is the name; a part that looks like a collector
// number is the number; the rest is the set. A card whose real name has a
// " - " in it (e.g. Lorcana "Pongo - Determined Father") would be split
// wrong; staff can fix that in the quote after importing.
export function splitCardText(text) {
  const parts = cellText(text).split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
  if (!parts.length) return { name: '', set: '', number: '' };
  const [name, ...rest] = parts;
  let number = '';
  const setParts = [];
  for (const p of rest) {
    if (!number && NUMBER_RE.test(p)) number = p;
    else setParts.push(p);
  }
  return { name, set: setParts.join(' - '), number };
}

// Same split for the "Set - PKM #" column, where there's no name part.
function splitSetText(text) {
  const parts = cellText(text).split(/\s+-\s+/).map(p => p.trim()).filter(Boolean);
  let number = '';
  const setParts = [];
  for (const p of parts) {
    if (!number && NUMBER_RE.test(p)) number = p;
    else setParts.push(p);
  }
  return { set: setParts.join(' - '), number };
}

function findLabelValue(rows, label, maxRow) {
  for (let r = 0; r < Math.min(rows.length, maxRow); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      if (labelKey(row[c]) === label) {
        const v = row[c + 1];
        // The cell to the right is another label when this one was left blank.
        if (KNOWN_LABELS.has(labelKey(v))) return null;
        return v == null ? null : v;
      }
    }
  }
  return null;
}

function findHeaderRow(rows) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const nameCol = row.findIndex(v => labelKey(v) === 'name of card');
    if (nameCol !== -1) return { headerRow: r, row, nameCol };
  }
  return null;
}

// rows: the sheet as an array of rows (XLSX sheet_to_json with header: 1).
// Returns the parsed quote, or null when the sheet has neither a customer
// nor any cards (an unused copy of the template).
export function parseQuoteSheet(rows, sheetName = '') {
  const header = findHeaderRow(rows);
  const maxHeaderRow = header ? header.headerRow : Math.min(rows.length, 20);
  const val = (key) => findLabelValue(rows, HEADER_LABELS[key], maxHeaderRow);

  const items = [];
  if (header) {
    const col = (pred) => header.row.findIndex(v => pred(labelKey(v)));
    const setCol = col(k => k.startsWith('set'));
    const condCol = col(k => k === 'condition');
    const qtyCol = col(k => k === 'qty' || k === 'quantity');
    // Some real sheets lost the "Price" header (Example 4 in the shop's own
    // file); in the template Price is always the column just left of Qty.
    let priceCol = col(k => k === 'price');
    if (priceCol === -1 && qtyCol > 0 && qtyCol - 1 !== condCol && qtyCol - 1 !== header.nameCol) priceCol = qtyCol - 1;
    const notesCol = col(k => k === 'notes');
    for (let r = header.headerRow + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const text = cellText(row[header.nameCol]);
      if (!text) continue;
      const fromName = splitCardText(text);
      const fromSet = setCol === -1 ? { set: '', number: '' } : splitSetText(row[setCol]);
      const qty = qtyCol === -1 ? null : parseNumber(row[qtyCol]);
      items.push({
        name: fromName.name,
        set: fromSet.set || fromName.set,
        number: fromSet.number || fromName.number,
        condition: condCol === -1 ? '' : parseCondition(row[condCol]),
        price: priceCol === -1 ? null : parseNumber(row[priceCol]),
        qty: qty && qty > 0 ? qty : 1,
        notes: notesCol === -1 ? '' : cellText(row[notesCol]),
      });
    }
  }

  const customerName = cellText(val('customerName'));
  if (!customerName && !items.length) return null;

  const { status, unrecognized } = parseQuoteStatus(val('offerStatus'));
  const warnings = [];
  if (unrecognized) warnings.push(`Offer status "${unrecognized}" isn't one the app knows, so it's imported as in progress.`);
  if (!header) warnings.push('No "Name of Card" header row found, so no cards were read.');
  const missingPrice = items.filter(i => i.price == null).length;
  if (missingPrice) warnings.push(`${missingPrice} card(s) have no price.`);
  const payoutAmount = parseNumber(val('payoutAmount'));
  if ((status === 'accepted_cash' || status === 'accepted_store_credit') && payoutAmount == null) {
    warnings.push('Accepted, but no payout amount, so the cards get no Cost.');
  }

  return {
    sheetName,
    customerName,
    customerId: cellText(val('customerId')),
    phone: cellText(val('phone')),
    dateQuoted: parseQuoteDate(val('dateQuoted')),
    offerStatus: status,
    payoutAmount,
    paidOut: parseBool(val('paidOut')),
    timeTaken: cellText(val('timeTaken')),
    employee: cellText(val('employee')),
    items,
    warnings,
  };
}

// The quote record the app saves (same shape QuotesTab builds for a new
// quote), with every card given the game picked at import.
export function buildImportedQuote(parsed, game) {
  const datePart = parsed.dateQuoted || new Date().toISOString().slice(0, 10);
  const who = parsed.customerName || parsed.sheetName || 'Imported quote';
  return {
    id: null, quoteNumber: null,
    collectionName: `${who} (${datePart})`,
    customerName: parsed.customerName,
    customerId: parsed.customerId,
    phone: parsed.phone,
    customerEmail: '',
    employee: parsed.employee,
    timeTaken: parsed.timeTaken,
    hasExpectedPrice: null, expectedPriceAmount: '',
    intakeNotes: `Imported from spreadsheet${parsed.sheetName ? ` (sheet "${parsed.sheetName}")` : ''}.`,
    dateQuoted: datePart,
    items: parsed.items.map(i => normalizeQuoteItem({ ...i, game })),
    offerStatus: parsed.offerStatus,
    payoutAmount: parsed.payoutAmount,
    paidOut: parsed.paidOut,
    movedToSorting: false,
  };
}

// True when a quote that looks like this one is already in the app (same
// customer, same date, same number of cards) — most likely imported
// before, so it starts unticked.
export function looksAlreadyImported(parsed, existingQuotes) {
  const name = (parsed.customerName || '').trim().toLowerCase();
  if (!name || !parsed.dateQuoted) return false;
  return (existingQuotes || []).some(q =>
    (q.customerName || '').trim().toLowerCase() === name
    && String(q.dateQuoted || '').slice(0, 10) === parsed.dateQuoted
    && (q.items || []).length === parsed.items.length);
}
