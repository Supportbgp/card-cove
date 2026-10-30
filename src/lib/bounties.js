import { supabaseClient } from './supabase.js';

// Bounties (CLAUDE.md "Bounties"): BGP Discord members ask the shop for a
// card. Every change goes through the `bounties` Edge Function, which
// applies these same limits server-side and posts to Discord.
export const MAX_OPEN_BOUNTIES = 10;
export const BOUNTY_EXPIRY_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export function rowToBounty(r) {
  return {
    id: r.id,
    userId: r.user_id || null,
    discordId: r.discord_id || '',
    discordName: r.discord_name || '',
    game: r.game || '',
    name: r.name || '',
    set: r.set_name || '',
    number: r.number || '',
    rarity: r.rarity || '',
    printing: r.printing || '',
    condition: r.condition || '',
    imageUrl: r.image_url || '',
    maxPrice: r.max_price == null ? null : Number(r.max_price),
    notes: r.notes || '',
    // The public view only has open, unexpired bounties and no status column.
    status: r.status || 'open',
    createdAt: r.created_at || null,
    expiresAt: r.expires_at || null,
    closedAt: r.closed_at || null,
  };
}

// 'open' | 'expired' | 'fulfilled' | 'cancelled' | 'removed'. An open
// bounty past its expiry date is expired; nothing in the database flips it.
export function bountyState(b, now = Date.now()) {
  if (b.status !== 'open') return b.status;
  return b.expiresAt && new Date(b.expiresAt).getTime() <= now ? 'expired' : 'open';
}

export const BOUNTY_STATE_LABELS = {
  open: 'Open', expired: 'Expired', fulfilled: 'Fulfilled', cancelled: 'Cancelled', removed: 'Removed',
};

// Whole days until an open bounty expires (0 on its last day).
export function bountyDaysLeft(b, now = Date.now()) {
  if (!b.expiresAt) return null;
  return Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - now) / DAY_MS));
}

export function countOpenBounties(bounties, now = Date.now()) {
  return bounties.filter(b => bountyState(b, now) === 'open').length;
}

// "Base Set · #4 · Holofoil · Near Mint": the details a bounty was narrowed to.
export function bountyDetailLine(b) {
  return [b.set, b.number ? `#${b.number}` : '', b.rarity, b.printing, b.condition].filter(Boolean).join(' · ');
}

export function bountyPriceLabel(b) {
  return b.maxPrice == null ? 'Any price' : `Up to $${b.maxPrice.toFixed(2)}`;
}

// Catalog items that could fill a bounty: same game, same name (ignoring
// case/spaces), in stock, not a Bulk lot. A hint for staff, not a match
// guarantee: set/condition/printing aren't compared.
export function bountyStockMatches(bounty, catalog) {
  const name = bounty.name.trim().toLowerCase();
  if (!name) return [];
  return catalog.filter(c =>
    c.game === bounty.game &&
    (c.name || '').trim().toLowerCase() === name &&
    !c.sold && c.qty > 0 && c.itemType !== 'bulk'
  );
}

// Calls the bounties Edge Function. Returns its JSON ({ bounty, posted }) or
// throws with the function's own message.
export async function callBounties(action, payload = {}) {
  const { data, error } = await supabaseClient.functions.invoke('bounties', {
    body: { action, ...payload },
  });
  if (error) {
    let message = error.message;
    try {
      const body = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
      if (body && body.error) message = body.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  return {
    bounty: data && data.bounty ? rowToBounty(data.bounty) : null,
    posted: !!(data && data.posted),
  };
}
