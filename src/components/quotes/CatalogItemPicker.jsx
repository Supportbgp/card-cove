import { useMemo, useState } from 'react';

// A lightweight, client-side-only typeahead over the shop's own already-
// loaded catalog — deliberately NOT a live external card search (Scryfall/
// TCGdex/etc., see CLAUDE.md's Quote tab section): matching by name
// against data Card Cove already has, backfilling a line item's game/set/
// number/rarity/printing/basePrice from whichever catalog entry staff
// pick. Typing a name that matches nothing is just as valid — the row is
// added with only what was typed and the rest filled in by hand, same
// "share functionality"-weight flow this was scoped as, not a search hub.
export default function CatalogItemPicker({ catalog, value, onChange, onSelectCatalogItem, ariaLabel }) {
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = (value || '').trim().toLowerCase();
    if (!q) return [];
    const seen = new Set();
    const results = [];
    for (const card of catalog) {
      if (!card.name || !card.name.toLowerCase().includes(q)) continue;
      const key = `${card.name}|${card.game}|${card.set}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(card);
      if (results.length >= 8) break;
    }
    return results;
  }, [catalog, value]);

  function pick(card) {
    onSelectCatalogItem(card);
    setOpen(false);
  }

  return (
    <div className="catalog-item-picker">
      <input
        type="text"
        aria-label={ariaLabel || 'Card name'}
        placeholder="Card name"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // A plain click on a menu option blurs the input first — delay
        // closing so that click still registers instead of the menu
        // vanishing out from under it.
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && matches.length > 0 && (
        <div className="catalog-item-picker-menu">
          {matches.map((card, i) => (
            <div
              key={`${card.sku}-${i}`}
              className="catalog-item-picker-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(card)}
            >
              <span className="catalog-item-picker-name">{card.name}</span>
              <span className="catalog-item-picker-meta">
                {[card.game, card.set].filter(Boolean).join(' · ')}
                {card.basePrice != null ? ` — $${Number(card.basePrice).toFixed(2)}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
