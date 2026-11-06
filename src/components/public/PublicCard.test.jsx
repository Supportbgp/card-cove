import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import PublicCard, { keepSeparators } from './PublicCard.jsx';

describe('keepSeparators', () => {
  it('binds each " · " to the word before it with a no-break space', () => {
    expect(keepSeparators('Base Set · Near Mint · Holofoil')).toBe('Base Set · Near Mint · Holofoil');
  });

  it('leaves text without separators alone', () => {
    expect(keepSeparators('Base Set')).toBe('Base Set');
    expect(keepSeparators('')).toBe('');
  });
});

describe('PublicCard', () => {
  it('renders the details line with bound separators, including a slab grade', () => {
    render(<PublicCard onZoom={vi.fn()} item={{
      name: 'Umbreon VMAX', set: 'Evolving Skies', condition: 'Near Mint', printing: 'Holofoil',
      itemType: 'slab', grader: 'PSA', grade: '10', qty: 1, price: 1850,
      imageUrl: '', imageData: '', photoUrl: '', photoData: '', activeImage: 'photo',
    }} />);
    const sub = document.querySelector('.binder-card-sub');
    expect(sub.textContent).toBe('Evolving Skies · Near Mint · Holofoil · PSA 10');
  });
});
