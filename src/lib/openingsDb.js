import { supabaseClient } from './supabase.js';
import { fetchAllRows } from './db.js';

// Openings tab (phase24_openings.sql). Kept out of db.js, which is already
// near this repo's 1,000-line soft limit.

export function rowToOpening(r) {
  return {
    id: r.id,
    openingNumber: r.opening_number,
    openedAt: r.opened_at,
    productName: r.product_name || '',
    productQty: r.product_qty || 1,
    game: r.game || '',
    employee: r.employee || '',
    reason: r.reason || '',
    sealedValue: r.sealed_value,
    expectedValue: r.expected_value,
    differenceReason: r.difference_reason || '',
    notes: r.notes || '',
    items: Array.isArray(r.items) ? r.items : [],
    status: r.status === 'done' ? 'done' : 'open',
    movedToSorting: !!r.moved_to_sorting,
    createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  };
}

export function openingToRow(o) {
  const row = {
    opened_at: o.openedAt || new Date().toISOString(),
    product_name: o.productName || '',
    product_qty: Number(o.productQty) || 1,
    game: o.game || '',
    employee: o.employee || '',
    reason: o.reason || '',
    sealed_value: o.sealedValue ?? null,
    expected_value: o.expectedValue ?? null,
    difference_reason: o.differenceReason || '',
    notes: o.notes || '',
    items: o.items || [],
    status: o.status === 'done' ? 'done' : 'open',
    moved_to_sorting: !!o.movedToSorting,
  };
  // id/opening_number are made by the database for a new opening.
  if (o.id) row.id = o.id;
  return row;
}

export async function dbLoadOpenings(toast) {
  const { data, error } = await fetchAllRows('openings', 'opened_at', { ascending: false });
  if (error) {
    toast('Failed to load openings: ' + error.message, true);
    return [];
  }
  return (data || []).map(rowToOpening);
}

// Returns the saved opening, so a new one gets its id/opening_number back.
export async function dbUpsertOpening(opening, toast) {
  const { data, error } = await supabaseClient.from('openings').upsert(openingToRow(opening)).select().single();
  if (error) {
    toast('Failed to save opening: ' + error.message, true);
    return null;
  }
  return rowToOpening(data);
}

export async function dbDeleteOpening(id, toast) {
  const { error } = await supabaseClient.from('openings').delete().eq('id', id);
  if (error) {
    toast('Delete failed: ' + error.message, true);
    return false;
  }
  return true;
}
