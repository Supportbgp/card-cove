import { useMemo, useState } from 'react';
import { bountyStockMatches, bountyDetailLine, bountyPriceLabel, isHeld, BOUNTY_HOLD_DAYS } from '../../lib/bounties.js';

const LABEL_STYLE = { margin: 0, fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' };

function money(n) {
  return n == null ? '—' : `$${Number(n).toFixed(2)}`;
}

// Staff answer a bounty with a card from the catalog (CLAUDE.md "Bounty
// offers"): one copy is held for the member while they Accept or Decline on
// the website. Cards with the bounty's exact name are listed first; any
// other in-stock card of that game can be found by name.
export default function OfferModal({ bounty, catalog, onOffer, onClose }) {
  const [query, setQuery] = useState('');
  const [sku, setSku] = useState(null);
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  // A copy held for a different bounty can't be offered again.
  const available = (c) => !c.sold && c.qty > 0 && c.itemType !== 'bulk'
    && !(isHeld(c) && c.holdBountyId !== bounty.id);

  const matches = useMemo(() => bountyStockMatches(bounty, catalog).filter(available),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bounty, catalog]);
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matchSkus = new Set(matches.map(c => c.sku));
    return catalog.filter(c => c.game === bounty.game && available(c) && !matchSkus.has(c.sku)
      && `${c.name} ${c.set || ''}`.toLowerCase().includes(q)).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, catalog, bounty, matches]);

  const selected = catalog.find(c => c.sku === sku) || null;
  const priceNum = price === '' ? null : Number(price);
  const overMax = bounty.maxPrice != null && priceNum != null && priceNum > bounty.maxPrice;

  function pick(card) {
    setSku(card.sku);
    setPrice(card.price == null ? '' : String(card.price));
  }

  async function send() {
    setSending(true);
    const ok = await onOffer(sku, price, note);
    if (!ok) setSending(false);
  }

  function cardRow(c) {
    const id = `offer-card-${c.sku}`;
    return (
      <div className="checkbox-row offer-card-row" key={c.sku}>
        <input type="radio" name="offer-card" id={id} checked={sku === c.sku} onChange={() => pick(c)} />
        <label htmlFor={id} style={LABEL_STYLE}>
          <strong>{c.name}</strong>{' '}
          <span className="n-sub">
            {[c.set, c.condition, c.printing].filter(Boolean).join(' · ')} · {c.location || 'no location'} · {c.qty} in stock · {money(c.price)}
          </span>
        </label>
      </div>
    );
  }

  return (
    <div className="overlay show">
      <div className="modal wide">
        <div className="modal-head">
          <div className="name">Offer a card: {bounty.name}</div>
          <div className="meta">
            {[bounty.game, bountyDetailLine(bounty), bountyPriceLabel(bounty)].filter(Boolean).join(' · ')}
            {bounty.discordName ? ` · for ${bounty.discordName}` : ''}.
            One copy is held for them for {BOUNTY_HOLD_DAYS} days while they accept or decline on the website,
            and they're pinged in Discord.
          </div>
        </div>
        <div className="modal-body">
          <div className="section-label">In stock with this name</div>
          {matches.length === 0
            ? <div className="status-line">None in stock. Search below for another print, or add the card to the catalog first (a walk-in goes through Quote and Sorting).</div>
            : matches.map(cardRow)}
          <div className="field-group" style={{ marginTop: 10 }}>
            <label htmlFor="offer_search">Other {bounty.game} cards in stock</label>
            <input id="offer_search" type="search" placeholder="Search by name or set" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          {query.trim() && searched.length === 0 && <div className="status-line">No other matches.</div>}
          {searched.map(cardRow)}

          {selected && (
            <>
              <div className="section-label">Offer</div>
              <div className="field-row2">
                <div className="field-group">
                  <label htmlFor="offer_price">Price ($)</label>
                  <input id="offer_price" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
                </div>
                <div className="field-group">
                  <label htmlFor="offer_note">Note to the member (optional)</label>
                  <input id="offer_note" type="text" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
              </div>
              {overMax && (
                <div className="status-line" style={{ color: 'var(--amber)' }}>
                  Above their max price ({money(bounty.maxPrice)}). They can still accept it.
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost small" disabled={sending} onClick={onClose}>Cancel</button>
          <button className="btn small" disabled={!selected || sending || (price !== '' && !(priceNum >= 0))} onClick={send}>
            {sending ? 'Sending…' : 'Send offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
