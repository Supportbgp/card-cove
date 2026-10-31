import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('./supabase.js', () => ({ supabaseClient: { functions: { invoke } } }));

const {
  rowToBounty, bountyState, bountyDaysLeft, countOpenBounties, bountyDetailLine, bountyPriceLabel,
  bountyStockMatches, callBounties, offerLapsed, isHeld, countBountiesNeedingStaff, bountiesWantingCard,
  offerDetailLine,
} = await import('./bounties.js');

const NOW = new Date('2026-10-29T12:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;
const bounty = (over = {}) => ({
  id: 'b1', status: 'open', game: 'Pokemon', name: 'Charizard', set: '', number: '', rarity: '', printing: '',
  condition: '', maxPrice: null, expiresAt: new Date(NOW + 10 * DAY).toISOString(), ...over,
});

beforeEach(() => { invoke.mockReset(); });

describe('rowToBounty', () => {
  it('maps a full row', () => {
    const b = rowToBounty({
      id: 'x', user_id: 'u', discord_id: '42', discord_name: 'Jake', game: 'Magic', name: 'Sol Ring',
      set_name: 'Alpha', number: '269', rarity: 'Uncommon', printing: 'Nonfoil', condition: 'Near Mint',
      image_url: 'https://img', max_price: '12.5', notes: 'pls', status: 'fulfilled',
      created_at: 'c', expires_at: 'e', closed_at: 'z',
    });
    expect(b).toEqual({
      id: 'x', userId: 'u', discordId: '42', discordName: 'Jake', game: 'Magic', name: 'Sol Ring',
      set: 'Alpha', number: '269', rarity: 'Uncommon', printing: 'Nonfoil', condition: 'Near Mint',
      imageUrl: 'https://img', maxPrice: 12.5, notes: 'pls', status: 'fulfilled',
      createdAt: 'c', expiresAt: 'e', closedAt: 'z',
      offerStatus: null, offerSku: '', offerName: '', offerSet: '', offerCondition: '', offerPrinting: '',
      offerImage: '', offerLocation: '', offerPrice: null, offerNote: '', offeredAt: null,
      offerExpiresAt: null, offerAnsweredAt: null,
    });
  });

  it('maps the offer snapshot', () => {
    const b = rowToBounty({
      id: 'x', name: 'Mew', status: 'open', offer_status: 'pending', offer_sku: 's1', offer_name: 'Mew',
      offer_set: '151', offer_condition: 'Near Mint', offer_price: '35', offer_expires_at: 'e2', offer_location: 'Binder A',
    });
    expect(b).toMatchObject({ offerStatus: 'pending', offerSku: 's1', offerPrice: 35, offerExpiresAt: 'e2', offerLocation: 'Binder A' });
    expect(offerDetailLine(b)).toBe('151 · Near Mint');
  });

  it('a public view row (no status, no member) reads as open, with no max price', () => {
    const b = rowToBounty({ id: 'x', game: 'Pokemon', name: 'Mew', max_price: null });
    expect(b.status).toBe('open');
    expect(b.discordName).toBe('');
    expect(b.maxPrice).toBeNull();
  });
});

describe('bountyState / bountyDaysLeft / countOpenBounties', () => {
  it('an open bounty past its expiry is expired', () => {
    expect(bountyState(bounty(), NOW)).toBe('open');
    expect(bountyState(bounty({ expiresAt: new Date(NOW - 1).toISOString() }), NOW)).toBe('expired');
    expect(bountyState(bounty({ status: 'fulfilled', expiresAt: new Date(NOW - DAY).toISOString() }), NOW)).toBe('fulfilled');
  });

  it('counts whole days left, never below 0', () => {
    expect(bountyDaysLeft(bounty(), NOW)).toBe(10);
    expect(bountyDaysLeft(bounty({ expiresAt: new Date(NOW + DAY / 2).toISOString() }), NOW)).toBe(0);
    expect(bountyDaysLeft(bounty({ expiresAt: new Date(NOW - DAY).toISOString() }), NOW)).toBe(0);
  });

  it('only open, unexpired bounties count toward the limit', () => {
    const list = [
      bounty(), bounty({ id: 'b2' }),
      bounty({ id: 'b3', expiresAt: new Date(NOW - 1).toISOString() }),
      bounty({ id: 'b4', status: 'cancelled' }),
    ];
    expect(countOpenBounties(list, NOW)).toBe(2);
  });
});

describe('offers', () => {
  const soon = new Date(NOW + DAY).toISOString();
  const past = new Date(NOW - 1).toISOString();
  it('a live pending offer reads as offered, an accepted one as accepted', () => {
    expect(bountyState(bounty({ offerStatus: 'pending', offerExpiresAt: soon }), NOW)).toBe('offered');
    expect(bountyState(bounty({ offerStatus: 'accepted', offerExpiresAt: past }), NOW)).toBe('accepted');
    expect(bountyState(bounty({ offerStatus: 'accepted', status: 'fulfilled' }), NOW)).toBe('fulfilled');
  });

  it('a pending offer past its date lapses back to open', () => {
    const b = bounty({ offerStatus: 'pending', offerExpiresAt: past });
    expect(bountyState(b, NOW)).toBe('open');
    expect(offerLapsed(b, NOW)).toBe(true);
    expect(offerLapsed(bounty({ offerStatus: 'pending', offerExpiresAt: soon }), NOW)).toBe(false);
    expect(offerLapsed(bounty({ offerStatus: 'declined', offerExpiresAt: past }), NOW)).toBe(false);
  });

  it('offered and accepted still count toward the member limit; staff count open + accepted', () => {
    const list = [
      bounty(), bounty({ id: 'o', offerStatus: 'pending', offerExpiresAt: soon }),
      bounty({ id: 'a', offerStatus: 'accepted', offerExpiresAt: soon }), bounty({ id: 'f', status: 'fulfilled' }),
    ];
    expect(countOpenBounties(list, NOW)).toBe(3);
    expect(countBountiesNeedingStaff(list, NOW)).toBe(2);
  });

  it('isHeld: only a hold that has not run out', () => {
    expect(isHeld({ holdBountyId: 'b', holdUntil: soon }, NOW)).toBe(true);
    expect(isHeld({ holdBountyId: 'b', holdUntil: past }, NOW)).toBe(false);
    expect(isHeld({ holdBountyId: null, holdUntil: soon }, NOW)).toBe(false);
  });

  it('bountiesWantingCard: open or offered bounties with the same game and name', () => {
    const list = [
      bounty({ id: '1' }), bounty({ id: '2', name: 'charizard ' }),
      bounty({ id: '3', offerStatus: 'accepted', offerExpiresAt: soon }),
      bounty({ id: '4', game: 'Magic' }), bounty({ id: '5', status: 'cancelled' }),
    ];
    expect(bountiesWantingCard({ name: 'Charizard', game: 'Pokemon' }, list, NOW).map(b => b.id)).toEqual(['1', '2']);
  });
});

describe('labels', () => {
  it('joins only the details given', () => {
    expect(bountyDetailLine(bounty({ set: 'Base Set', number: '4', condition: 'Near Mint' }))).toBe('Base Set · #4 · Near Mint');
    expect(bountyDetailLine(bounty())).toBe('');
  });

  it('prices', () => {
    expect(bountyPriceLabel(bounty())).toBe('Any price');
    expect(bountyPriceLabel(bounty({ maxPrice: 40 }))).toBe('Up to $40.00');
  });
});

describe('bountyStockMatches', () => {
  const card = (over) => ({ game: 'Pokemon', name: 'Charizard', qty: 1, sold: false, itemType: 'single', ...over });
  it('same game and name (any case), in stock, not bulk', () => {
    const catalog = [
      card({ sku: 'a' }),
      card({ sku: 'b', name: ' charizard ' }),
      card({ sku: 'c', game: 'Magic' }),
      card({ sku: 'd', qty: 0 }),
      card({ sku: 'e', sold: true }),
      card({ sku: 'f', itemType: 'bulk' }),
      card({ sku: 'g', name: 'Charizard ex' }),
    ];
    expect(bountyStockMatches(bounty(), catalog).map(c => c.sku)).toEqual(['a', 'b']);
  });
});

describe('callBounties', () => {
  it('sends the action and maps the returned bounty', async () => {
    invoke.mockResolvedValue({ data: { bounty: { id: 'b9', name: 'Mew', game: 'Pokemon', status: 'fulfilled' }, posted: true }, error: null });
    const res = await callBounties('fulfill', { id: 'b9' });
    expect(invoke).toHaveBeenCalledWith('bounties', { body: { action: 'fulfill', id: 'b9' } });
    expect(res.posted).toBe(true);
    expect(res.bounty.status).toBe('fulfilled');
  });

  it("throws the function's own error message", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'non-2xx', context: { json: async () => ({ error: 'You already have 10 open bounties.' }) } },
    });
    await expect(callBounties('create', { bounty: {} })).rejects.toThrow('You already have 10 open bounties.');
  });
});
