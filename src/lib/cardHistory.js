// Turns catalog_history rows (phase22_catalog_history.sql) into lines staff
// can read: "Binder / case: Card Show Binder → Power Packs".

const FIELD_LABELS = {
  name: 'Name', set_name: 'Set', game: 'Game', condition: 'Condition', printing: 'Printing',
  rarity: 'Rarity', qty: 'Qty', price: 'Our price', notes: 'Notes', location: 'Binder / case',
  item_type: 'Type', grader: 'Grader', grade: 'Grade', cert_number: 'Cert #', sold: 'Sold',
  source_url: 'Source link', base_price: 'Market base price', cost: 'Cost',
  image_url: 'Stock image link', image_data: 'Stock image', photo_url: 'Photo link', photo_data: 'Photo',
  active_image: 'Image shown', source_quote_id: 'Bought in quote',
  pos_synced: 'Listed on POS', tcgplayer_synced: 'Listed on TCG Player', collectr_synced: 'Listed on Collectr',
  pos_channel: 'Sells on POS', tcgplayer_channel: 'Sells on TCG Player', collectr_channel: 'Sells on Collectr',
};

// Shown first, in this order; everything else after, alphabetically.
const FIELD_ORDER = ['location', 'qty', 'sold', 'price', 'cost', 'condition', 'name', 'set_name', 'game'];
const MONEY = new Set(['price', 'cost', 'base_price']);
const HIDDEN = new Set(['sku', 'last_updated']);

export function rowToHistory(r) {
  return {
    id: r.id, sku: r.sku, name: r.name || '', action: r.action,
    changes: r.changes || {}, changedBy: r.changed_by || '',
    changedAt: r.changed_at ? new Date(r.changed_at).getTime() : null,
  };
}

export function fieldLabel(col) {
  return FIELD_LABELS[col] || col.replace(/_/g, ' ');
}

export function formatHistoryValue(col, value) {
  if (value === null || value === undefined || value === '') return '(blank)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (MONEY.has(col) && Number.isFinite(Number(value))) return `$${Number(value).toFixed(2)}`;
  return String(value);
}

function orderedColumns(cols) {
  return cols
    .filter(c => !HIDDEN.has(c))
    .sort((a, b) => {
      const ia = FIELD_ORDER.indexOf(a);
      const ib = FIELD_ORDER.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return fieldLabel(a).localeCompare(fieldLabel(b));
    });
}

// The readable lines for one history entry.
export function describeHistory(entry) {
  const c = entry.changes || {};
  if (entry.action === 'insert' || entry.action === 'delete') {
    const verb = entry.action === 'insert' ? 'Added' : 'Deleted';
    const bits = [];
    if (c.location) bits.push(`in ${c.location}`);
    if (c.qty != null) bits.push(`qty ${c.qty}`);
    if (c.price != null) bits.push(formatHistoryValue('price', c.price));
    if (c.sold) bits.push('sold');
    return [`${verb}${bits.length ? ` (${bits.join(', ')})` : ''}`];
  }
  return orderedColumns(Object.keys(c)).map((col) => {
    const v = c[col] || {};
    if (v.changed) return `${fieldLabel(col)} changed`;
    return `${fieldLabel(col)}: ${formatHistoryValue(col, v.from)} → ${formatHistoryValue(col, v.to)}`;
  });
}

export function formatHistoryTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
