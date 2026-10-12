import { useState } from 'react';
import { activeImageSrc } from '../../lib/cardUtils.js';
import { useUI } from '../../context/UIContext.jsx';
import SortItemModal from './SortItemModal.jsx';

// "Needs to process" queue — every accepted quote's line items land here
// (see App.jsx's handleSaveQuote/buildSortingItemsFromQuoteItems) before
// staff decide, one card at a time, where it actually goes: a real
// binder/case, or Bulk. A sorted row disappears from this list the moment
// it's placed — the resulting Catalog row is the durable record from
// then on, not this queue (see CLAUDE.md's "Sorting stage" section for
// why history isn't kept here).
export default function SortingTab({ sorting, catalog, locations, onSortItems }) {
  const { openLightbox } = useUI();
  // `sortingItems` holds whichever item(s) the open SortItemModal is
  // currently deciding a destination for — a single-item array from a
  // row's own "Sort" button, or the whole batch-selected set from "Sort
  // selected" below. The modal itself doesn't care which; it just asks one
  // destination question and hands the array back.
  const [sortingItems, setSortingItems] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  function toggleSelected(id, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }

  function toggleSelectAll(ids, checked) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of ids) { if (checked) next.add(id); else next.delete(id); }
      return next;
    });
  }

  async function handleConfirm(destination) {
    if (!sortingItems || !sortingItems.length) return;
    await onSortItems(sortingItems, destination);
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const item of sortingItems) next.delete(item.id);
      return next;
    });
    setSortingItems(null);
  }

  const allIds = sorting.map(s => s.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  const selectedItems = sorting.filter(s => selectedIds.has(s.id));

  return (
    <div>
      <div className="toolbar">
        <div style={{ fontSize: '13px', color: 'var(--ink-soft)', maxWidth: '560px' }}>
          Cards from accepted quotes land here first — sort each one to a real binder/case, or add it to Bulk, before it becomes a Catalog item.
        </div>
      </div>
      {sorting.length ? (
        <>
          <label className="checkbox-row" style={{ marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => toggleSelectAll(allIds, e.target.checked)}
            />
            <span style={{ fontFamily: "'Inter',sans-serif", textTransform: 'none', letterSpacing: 'normal' }}>Select all</span>
          </label>
          {selectedItems.length > 0 && (
            <div className="batch-bar show">
              <span>{selectedItems.length} selected</span>
              <div className="spacer"></div>
              <button className="btn small" onClick={() => setSortingItems(selectedItems)}>
                Sort selected ({selectedItems.length})
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sorting.map(item => {
              const displaySrc = activeImageSrc(item);
              const isChecked = selectedIds.has(item.id);
              return (
                <div className={`scan-row${isChecked ? ' row-selected' : ''}`} key={item.id}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => toggleSelected(item.id, e.target.checked)}
                    style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                  />
                  <div className="scan-row-thumb-col">
                    <div
                      className="scan-row-thumb"
                      onClick={() => { if (displaySrc) openLightbox(displaySrc); }}
                      style={{ cursor: displaySrc ? 'pointer' : 'default' }}
                      title={displaySrc ? 'Click to zoom' : ''}
                    >
                      {displaySrc ? <img src={displaySrc} /> : <span style={{ fontSize: '9px', color: 'var(--ink-faint)', textAlign: 'center' }}>{item.game || 'No image'}</span>}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{item.name}{item.qty > 1 ? ` × ${item.qty}` : ''}</div>
                    <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                      {[item.game, item.set, item.rarity, item.condition].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ink-faint)' }}>
                      From {item.quoteCollectionName || 'a quote'}{item.price != null ? ` · $${Number(item.price).toFixed(2)}` : ''}
                    </div>
                  </div>
                  <button className="btn small" onClick={() => setSortingItems([item])}>Sort</button>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty"><span className="mark">Nothing waiting</span>Cards from accepted quotes will show up here to be sorted.</div>
      )}
      {sortingItems && (
        <SortItemModal
          items={sortingItems}
          catalog={catalog}
          locations={locations}
          onConfirm={handleConfirm}
          onCancel={() => setSortingItems(null)}
        />
      )}
    </div>
  );
}
