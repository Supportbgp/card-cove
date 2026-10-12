import { useEffect, useMemo, useState } from 'react';
import { SORT_COLUMNS } from '../../lib/cardUtils.js';
import CatalogToolbar from './CatalogToolbar.jsx';
import BatchBar from './BatchBar.jsx';
import CatalogTable from './CatalogTable.jsx';
import EditModal from './EditModal.jsx';
import SellQuantityModal from './SellQuantityModal.jsx';
import { useUI } from '../../context/UIContext.jsx';

export default function CatalogPanel({ catalog, onSaveCard, onDeleteCard, onBatchDelete, onBatchSell, onSellPartial, onTogglePlatformStatus, multipliers }) {
  const { showConfirm } = useUI();
  const [search, setSearch] = useState("");
  const [gameFilter, setGameFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Rarity/Condition/Printing are game-specific enough (their real-world
  // vocabulary varies per game, e.g. Pokemon rarities mean nothing for
  // Magic) that these three only make sense — and only show in the
  // toolbar — once a single game is selected. Resetting them whenever
  // gameFilter changes avoids a stale value from one game silently
  // filtering everything out once a different game is picked.
  const [rarityFilter, setRarityFilter] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [printingFilter, setPrintingFilter] = useState("");
  const [sortState, setSortState] = useState({ col: 'name', dir: 1 });
  const [selectedSkus, setSelectedSkus] = useState(new Set());
  const [editingSku, setEditingSku] = useState(undefined); // undefined = closed, null = adding, sku = editing
  // Set only when "Mark sold" is clicked with exactly one multi-copy item
  // selected — lets staff sell fewer than the full qty (see
  // SellQuantityModal.jsx). A single qty-1 item or a multi-item batch skip
  // this and go straight to the plain yes/no confirm below, same as before.
  const [sellPromptCard, setSellPromptCard] = useState(null);

  const games = useMemo(() => Array.from(new Set(catalog.map(c => c.game).filter(Boolean))).sort(), [catalog]);
  const locations = useMemo(() => Array.from(new Set(catalog.map(c => c.location).filter(Boolean))).sort(), [catalog]);

  // A single game's own catalog rows, not RARITY_OPTIONS_BY_GAME/
  // CONDITION_OPTIONS/PRINTING_OPTIONS_BY_GAME's curated data-entry
  // suggestions — filtering by a curated value nothing in the catalog
  // actually has would just be a dead end, and this also naturally picks up
  // any custom value staff typed through those pickers' free-text escape
  // hatch (e.g. a specific Poke Ball/Master Ball pattern).
  const gameRows = useMemo(() => catalog.filter(c => c.game === gameFilter), [catalog, gameFilter]);
  const rarityOptions = useMemo(() => Array.from(new Set(gameRows.map(c => c.rarity).filter(Boolean))).sort(), [gameRows]);
  const conditionOptions = useMemo(() => Array.from(new Set(gameRows.map(c => c.condition).filter(Boolean))).sort(), [gameRows]);
  const printingOptions = useMemo(() => Array.from(new Set(gameRows.map(c => c.printing).filter(Boolean))).sort(), [gameRows]);

  // A rarity/condition/printing value picked while a different game was
  // selected is almost certainly meaningless for the new one (or, worse,
  // happens to collide and silently mis-filters) — clear all three
  // whenever the game filter itself changes, including to/from "all games".
  useEffect(() => {
    setRarityFilter("");
    setConditionFilter("");
    setPrintingFilter("");
  }, [gameFilter]);

  const filteredRows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return catalog.filter(c => {
      if (s) {
        const hay = (c.name + " " + c.set + " " + c.sku + " " + c.notes + " " + c.location).toLowerCase();
        if (!hay.includes(s)) return false;
      }
      if (gameFilter && c.game !== gameFilter) return false;
      if (locationFilter && c.location !== locationFilter) return false;
      if (typeFilter && c.itemType !== typeFilter) return false;
      if (statusFilter === "available" && (c.sold || c.qty <= 0)) return false;
      if (statusFilter === "sold" && !(c.sold || c.qty <= 0)) return false;
      if (rarityFilter && c.rarity !== rarityFilter) return false;
      if (conditionFilter && c.condition !== conditionFilter) return false;
      if (printingFilter && c.printing !== printingFilter) return false;
      return true;
    });
  }, [catalog, search, gameFilter, locationFilter, typeFilter, statusFilter, rarityFilter, conditionFilter, printingFilter]);

  const sortedRows = useMemo(() => {
    const sortKey = SORT_COLUMNS[sortState.col] || SORT_COLUMNS.name;
    const rows = filteredRows.slice();
    rows.sort((a, b) => {
      const av = sortKey(a), bv = sortKey(b);
      const cmp = typeof av === "string" ? av.localeCompare(bv) : (av > bv ? 1 : av < bv ? -1 : 0);
      return cmp * sortState.dir;
    });
    return rows;
  }, [filteredRows, sortState]);

  function setSort(col) {
    setSortState(s => s.col === col ? { col, dir: s.dir * -1 } : { col, dir: 1 });
  }

  function toggleSelected(sku, checked) {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      if (checked) next.add(sku); else next.delete(sku);
      return next;
    });
  }
  function toggleSelectAll(skus, checked) {
    setSelectedSkus(prev => {
      const next = new Set(prev);
      skus.forEach(sku => checked ? next.add(sku) : next.delete(sku));
      return next;
    });
  }

  async function handleBatchDelete() {
    const count = selectedSkus.size;
    if (!count) return;
    if (!(await showConfirm(`Delete ${count} selected item(s)? This can't be undone.`))) return;
    await onBatchDelete(selectedSkus);
    setSelectedSkus(new Set());
  }

  async function handleBatchSell() {
    const count = selectedSkus.size;
    if (!count) return;
    if (count === 1) {
      const sku = selectedSkus.values().next().value;
      const card = catalog.find(c => c.sku === sku);
      if (card && card.qty > 1) {
        setSellPromptCard(card);
        return;
      }
    }
    if (!(await showConfirm(`Mark ${count} selected item(s) as sold? This creates sync tickets for each.`))) return;
    await onBatchSell(selectedSkus);
    setSelectedSkus(new Set());
  }

  const editingCard = editingSku ? catalog.find(c => c.sku === editingSku) : null;

  return (
    <div>
      <CatalogToolbar
        search={search} setSearch={setSearch}
        gameFilter={gameFilter} setGameFilter={setGameFilter}
        locationFilter={locationFilter} setLocationFilter={setLocationFilter}
        typeFilter={typeFilter} setTypeFilter={setTypeFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        rarityFilter={rarityFilter} setRarityFilter={setRarityFilter}
        conditionFilter={conditionFilter} setConditionFilter={setConditionFilter}
        printingFilter={printingFilter} setPrintingFilter={setPrintingFilter}
        rarityOptions={rarityOptions} conditionOptions={conditionOptions} printingOptions={printingOptions}
        games={games} locations={locations}
        onAddItem={() => setEditingSku(null)}
      />
      {selectedSkus.size > 0 && (
        <BatchBar
          count={selectedSkus.size}
          onMarkSold={handleBatchSell}
          onDelete={handleBatchDelete}
          onClear={() => setSelectedSkus(new Set())}
        />
      )}
      <div className="card">
        <CatalogTable
          catalogEmpty={catalog.length === 0}
          rows={sortedRows}
          sortState={sortState}
          onSort={setSort}
          selectedSkus={selectedSkus}
          onToggleSelected={toggleSelected}
          onToggleSelectAll={toggleSelectAll}
          onEdit={(sku) => setEditingSku(sku)}
          onTogglePlatformStatus={onTogglePlatformStatus}
        />
      </div>
      {editingSku !== undefined && (
        <EditModal
          card={editingCard}
          catalog={catalog}
          locations={locations}
          multipliers={multipliers}
          onClose={() => setEditingSku(undefined)}
          onSave={async (record, prevSku) => { await onSaveCard(record, prevSku); setEditingSku(undefined); }}
          onDelete={async (sku) => { await onDeleteCard(sku); setEditingSku(undefined); }}
        />
      )}
      {sellPromptCard && (
        <SellQuantityModal
          card={sellPromptCard}
          onConfirmFull={async () => {
            await onBatchSell(selectedSkus);
            setSelectedSkus(new Set());
            setSellPromptCard(null);
          }}
          onConfirmPartial={async (qtySold) => {
            await onSellPartial(sellPromptCard.sku, qtySold);
            setSelectedSkus(new Set());
            setSellPromptCard(null);
          }}
          onCancel={() => setSellPromptCard(null)}
        />
      )}
    </div>
  );
}
