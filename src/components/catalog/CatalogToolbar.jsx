export default function CatalogToolbar({
  search, setSearch,
  gameFilter, setGameFilter,
  locationFilter, setLocationFilter,
  typeFilter, setTypeFilter,
  statusFilter, setStatusFilter,
  rarityFilter, setRarityFilter,
  conditionFilter, setConditionFilter,
  printingFilter, setPrintingFilter,
  rarityOptions, conditionOptions, printingOptions,
  games, locations,
  onAddItem,
}) {
  return (
    <div className="toolbar catalog-toolbar">
      <input
        type="text" className="search-input" placeholder="Search name, set, or SKU…"
        value={search} onChange={(e) => setSearch(e.target.value)}
      />
      <select value={gameFilter} onChange={(e) => setGameFilter(e.target.value)}>
        <option value="">All games</option>
        {games.map(g => <option key={g} value={g}>{g}</option>)}
      </select>
      <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
        <option value="">All locations</option>
        {locations.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
        <option value="">Singles + Slabs + Bulk</option>
        <option value="single">Singles only</option>
        <option value="slab">Slabs only</option>
        <option value="bulk">Bulk only</option>
      </select>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
        <option value="">All items</option>
        <option value="available">Available</option>
        <option value="sold">Sold</option>
      </select>
      {/* Rarity/Condition/Printing are specific enough to one game's own
          vocabulary that a filter for them only makes sense once a single
          game is picked — a mixed-game list would just be a noisy option
          dump. Options come from this game's actual catalog values (see
          CatalogPanel), so a filter is never offered for a value nothing
          in the catalog actually has. */}
      {gameFilter && rarityOptions.length > 0 && (
        <select value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value)}>
          <option value="">All rarities</option>
          {rarityOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {gameFilter && conditionOptions.length > 0 && (
        <select value={conditionFilter} onChange={(e) => setConditionFilter(e.target.value)}>
          <option value="">All conditions</option>
          {conditionOptions.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
      {gameFilter && printingOptions.length > 0 && (
        <select value={printingFilter} onChange={(e) => setPrintingFilter(e.target.value)}>
          <option value="">All printings</option>
          {printingOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      )}
      <button className="btn" onClick={onAddItem}>+ Add item</button>
    </div>
  );
}
