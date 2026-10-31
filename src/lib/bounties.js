import { supabaseClient } from './supabase.js';

// Bounties (CLAUDE.md "Bounties"): BGP Discord members ask the shop for a
// card. Every change goes through the `bounties` Edge Function, which
// applies these same limits server-side and posts to Discord.
export const MAX_OPEN_BOUNTIES = 10;
export const BOUNTY_EXPIRY_DAYS = 60;
// How long an offered card is held for the member (to answer, and again to
// pick it up once accepted). Same value as the Edge Function's HOLD_DAYS.
export const BOUNTY_HOLD_DAYS = 7;

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
    // The shop's offer (Phase 4), a snapshot of the catalog card offered.
    offerStatus: r.offer_status || null,
    offerSku: r.offer_sku || '',
    offerName: r.offer_name || '',
    offerSet: r.offer_set || '',
    offerCondition: r.offer_condition || '',
    offerPrinting: r.offer_printing || '',
    offerImage: r.offer_image || '',
    offerLocation: r.offer_location || '',
    offerPrice: r.offer_price == null ? null : Number(r.offer_price),
    offerNote: r.offer_note || '',
    offeredAt: r.offered_at || null,
    offerExpiresAt: r.offer_expires_at || null,
    offerAnsweredAt: r.offer_answered_at || null,
  };
}

// 'open' | 'offered' | 'accepted' | 'expired' | 'fulfilled' | 'cancelled' |
// 'removed'. Nothing in the database flips dates over: an open bounty past
// its expiry is expired, and an offer past its own expiry no longer counts
// (the bounty is open again).
export function bountyState(b, now = Date.now()) {
  if (b.status !== 'open') return b.status;
  if (b.offerStatus === 'accepted') return 'accepted';
  if (b.offerStatus === 'pending' && b.offerExpiresAt && new Date(b.offerExpiresAt).getTime() > now) return 'offered';
  return b.expiresAt && new Date(b.expiresAt).getTime() <= now ? 'expired' : 'open';
}

export const BOUNTY_STATE_LABELS = {
  open: 'Open', offered: 'Offer sent', accepted: 'Accepted', expired: 'Expired',
  fulfilled: 'Fulfilled', cancelled: 'Cancelled', removed: 'Removed',
};

// Whether a pending offer ran out without an answer (the bounty went back
// to open/expired), for a "the offer expired" note.
export function offerLapsed(b, now = Date.now()) {
  return b.status === 'open' && b.offerStatus === 'pending' && !!b.offerExpiresAt
    && new Date(b.offerExpiresAt).getTime() <= now;
}

// A catalog row with one copy currently held for a bounty.
export function isHeld(card, now = Date.now()) {
  return !!(card && card.holdBountyId && card.holdUntil && new Date(card.holdUntil).getTime() > now);
}

export function offerDetailLine(b) {
  return [b.offerSet, b.offerCondition, b.offerPrinting].filter(Boolean).join(' · ');
}

// Whole days until an open bounty expires (0 on its last day).
export function bountyDaysLeft(b, now = Date.now()) {
  if (!b.expiresAt) return null;
  return Math.max(0, Math.floor((new Date(b.expiresAt).getTime() - now) / DAY_MS));
}

// Counts toward a member's limit: everything still open, with or without an offer.
export function countOpenBounties(bounties, now = Date.now()) {
  return bounties.filter(b => ['open', 'offered', 'accepted'].includes(bountyState(b, now))).length;
}

// What staff need to act on: open bounties nobody has offered on yet, and
// accepted offers waiting to be picked up.
export function countBountiesNeedingStaff(bounties, now = Date.now()) {
  return bounties.filter(b => ['open', 'accepted'].includes(bountyState(b, now))).length;
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

// Open bounties (no offer accepted yet) that a card could fill: same game
// and name. Used to flag a walk-in card in Sorting.
export function bountiesWantingCard(card, bounties, now = Date.now()) {
  const name = (card.name || '').trim().toLowerCase();
  if (!name) return [];
  return bounties.filter(b =>
    ['open', 'offered'].includes(bountyState(b, now)) &&
    b.game === card.game &&
    b.name.trim().toLowerCase() === name
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
