import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuoteLineItemRow from './QuoteLineItemRow.jsx';
import { normalizeQuoteItem } from '../../lib/quoteUtils.js';

const { searchCardImageMock } = vi.hoisted(() => ({ searchCardImageMock: vi.fn() }));
vi.mock('../../lib/cardSearch.js', () => ({
  searchCardImage: (...args) => searchCardImageMock(...args),
  tcgplayerSearchUrl: (name, set) => `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent([name, set].filter(Boolean).join(' '))}&view=grid`,
  ebaySoldSearchUrl: (name, set) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent([name, set].filter(Boolean).join(' '))}&LH_Sold=1&LH_Complete=1`,
  priceChartingSearchUrl: (name, set) => `https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent([name, set].filter(Boolean).join(' '))}`,
}));

vi.mock('../../context/UIContext.jsx', () => ({
  useUI: () => ({ openLightbox: vi.fn() }),
}));

beforeEach(() => {
  searchCardImageMock.mockReset();
});

function renderRow(overrides = {}) {
  const item = normalizeQuoteItem({ name: 'Charizard', game: 'Pokemon', set: 'Scarlet & Violet', ...overrides });
  const onChange = vi.fn();
  render(<QuoteLineItemRow item={item} onChange={onChange} onRemove={vi.fn()} catalog={[]} multipliers={{}} />);
  return { item, onChange };
}

describe('QuoteLineItemRow — Round price buttons', () => {
  it('rounds the Price field down or up to the next whole dollar', () => {
    const onChange = vi.fn();
    const item = normalizeQuoteItem({ name: 'Charizard', price: 13.43 });
    render(<QuoteLineItemRow item={item} onChange={onChange} onRemove={vi.fn()} catalog={[]} multipliers={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Round down' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ price: 13 }));

    fireEvent.click(screen.getByRole('button', { name: 'Round up' }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ price: 14 }));
  });

  it('disables both round buttons when there is no price to round', () => {
    const item = normalizeQuoteItem({ name: 'Charizard' });
    render(<QuoteLineItemRow item={item} onChange={vi.fn()} onRemove={vi.fn()} catalog={[]} multipliers={{}} />);
    expect(screen.getByRole('button', { name: 'Round down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Round up' })).toBeDisabled();
  });
});

describe('QuoteLineItemRow — candidate selection backfill', () => {
  it('picking a "Find price" candidate backfills Set/Number/Rarity too, matching EditModal — not just price and the source link', async () => {
    searchCardImageMock.mockResolvedValueOnce([
      {
        url: 'https://x/clefairy.jpg', label: "Lillie's Clefairy ex (Ascended Heroes) #280", price: 12,
        listingUrl: 'https://tcg/x', set: 'Ascended Heroes', number: '280/217', rarity: 'Special Illustration Rare',
      },
    ]);
    const { onChange } = renderRow();

    fireEvent.click(screen.getByText('Find price'));
    const candidate = await screen.findByTitle("Lillie's Clefairy ex (Ascended Heroes) #280");
    fireEvent.click(candidate);

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      set: 'Ascended Heroes', number: '280/217', rarity: 'Special Illustration Rare',
      basePrice: 12, sourceUrl: 'https://tcg/x',
    }));
  });

  it('picking a "Find image" candidate still backfills Set/Number/Rarity, same as before this fix', async () => {
    searchCardImageMock.mockResolvedValueOnce([
      {
        url: 'https://x/clefairy.jpg', label: "Lillie's Clefairy ex (Ascended Heroes) #280",
        set: 'Ascended Heroes', number: '280/217', rarity: 'Special Illustration Rare',
      },
    ]);
    const { onChange } = renderRow();

    fireEvent.click(screen.getByText('Find image'));
    const candidate = await screen.findByTitle("Lillie's Clefairy ex (Ascended Heroes) #280");
    fireEvent.click(candidate);

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      set: 'Ascended Heroes', number: '280/217', rarity: 'Special Illustration Rare',
      imageUrl: 'https://x/clefairy.jpg',
    }));
  });

  it('leaves Set/Number/Rarity alone on a price-mode pick when the candidate carries none of that data', async () => {
    searchCardImageMock.mockResolvedValueOnce([{ url: 'https://x/luffy.jpg', label: 'Luffy', price: 5, listingUrl: '' }]);
    const { onChange } = renderRow({ game: 'One Piece', set: 'OP01', rarity: 'Rare' });

    fireEvent.click(screen.getByText('Find price'));
    const candidate = await screen.findByTitle('Luffy');
    fireEvent.click(candidate);

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ set: 'OP01', rarity: 'Rare', basePrice: 5 }));
  });
});

describe('QuoteLineItemRow — Alter %', () => {
  it('hides the +/-X% input until "Alter %?" is checked', () => {
    renderRow();
    expect(screen.queryByPlaceholderText('e.g. +10 or -20')).not.toBeInTheDocument();
  });

  it('checking "Alter %?" patches pctAltered, and typing a delta patches pctDelta', () => {
    const { onChange } = renderRow();
    fireEvent.click(screen.getByLabelText('Alter %?'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pctAltered: true }));
  });

  it('shows the delta input with its current value once pctAltered is on', () => {
    renderRow({ pctAltered: true, pctDelta: -20 });
    expect(screen.getByDisplayValue('-20')).toBeInTheDocument();
  });
});

describe('QuoteLineItemRow — source link safety', () => {
  it('links an http(s) Source link as the live TCGPlayer listing', () => {
    renderRow({ sourceUrl: 'https://www.tcgplayer.com/product/1' });
    expect(screen.getByText('Check live TCGPlayer listing ↗').closest('a')).toHaveAttribute('href', 'https://www.tcgplayer.com/product/1');
    expect(screen.getByText('open ↗').closest('a')).toHaveAttribute('href', 'https://www.tcgplayer.com/product/1');
  });

  it('never puts a javascript: Source link in an href, falling back to the manual search', () => {
    renderRow({ sourceUrl: 'javascript:alert(1)' });
    expect(screen.queryByText('open ↗')).toBeNull();
    expect(screen.queryByText('Check live TCGPlayer listing ↗')).toBeNull();
    for (const a of document.querySelectorAll('a')) {
      expect(a.getAttribute('href')).not.toMatch(/^javascript:/i);
    }
  });
});
