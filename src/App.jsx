import { useEffect, useMemo, useState } from 'react';
import { supabaseClient } from './lib/supabase.js';
import {
  dbLoadAll, dbUpsertCard, dbUpsertCards, dbDeleteCard, dbDeleteCards, dbClearCatalog,
  dbInsertTickets, dbUpdateTicketStamp, dbClearQueue, dbUpdatePlatformStatus, dbInsertSales, dbLoadSales, dbUpdateSale,
  dbLoadSettings, dbSaveSettings,
  dbLoadQuotes, dbUpsertQuote, dbDeleteQuote, dbLoadQuoteSettings, dbSaveQuoteSettings,
  dbLoadSortingQueue, dbInsertSortingItems, dbDeleteSortingItem,
} from './lib/db.js';
import {
  needsPlatformStatusReset, isTicketComplete, canonicalizeCondition, marketValueForCondition,
  DEFAULT_CONDITION_MULTIPLIERS, findBulkRow, buildBulkCatalogItem,
} from './lib/cardUtils.js';
import { buildCatalogItemsFromQuoteItems, buildSortingItemsFromQuoteItems, computeQuoteItemCosts, DEFAULT_QUOTE_TIER_PCTS } from './lib/quoteUtils.js';
import { useUI } from './context/UIContext.jsx';
import { useRealtimeSync } from './hooks/useRealtimeSync.js';
import Login from './components/Login.jsx';
import logoIcon from './assets/logo-icon.png';
import CatalogPanel from './components/catalog/CatalogPanel.jsx';
import SyncQueueTab from './components/queue/SyncQueueTab.jsx';
import ImportExportPanel from './components/importexport/ImportExportPanel.jsx';
import ScannerPanel from './components/scanner/ScannerPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import QuotesTab from './components/quotes/QuotesTab.jsx';
import SortingTab from './components/sorting/SortingTab.jsx';
import ReportsTab from './components/reports/ReportsTab.jsx';

const TABS = [
  { key: 'catalog', label: 'Catalog' },
  { key: 'queue', label: 'Sync Queue' },
  { key: 'import', label: 'Import / Export' },
  { key: 'scanner', label: 'Scan Binder' },
  { key: 'quote', label: 'Quote' },
  { key: 'sorting', label: 'Sorting' },
  { key: 'reports', label: 'Reports' },
];

const CONDITION_RANK = { NM: 0, LP: 1, MP: 2, HP: 3, DMG: 4 };

// Soft nudge, not a hard rule — a worse-condition copy of the same card in
// the same case shouldn't be priced above a better-condition copy. Flags it
// so staff can double-check, doesn't block the save either way.
function priceOrderingWarning(catalog, record) {
  const tier = canonicalizeCondition(record.condition);
  if (!tier || record.price == null) return null;
  const siblings = catalog.filter(c =>
    c.sku !== record.sku && c.name === record.name && c.game === record.game &&
    c.location === record.location && c.price != null && !c.sold
  );
  for (const s of siblings) {
    const sTier = canonicalizeCondition(s.condition);
    if (!sTier) continue;
    if (CONDITION_RANK[tier] < CONDITION_RANK[sTier] && record.price < s.price) {
      return `${record.name} (${tier}) is priced below the ${sTier} copy in this case — worth double-checking.`;
    }
    if (CONDITION_RANK[tier] > CONDITION_RANK[sTier] && record.price > s.price) {
      return `${record.name} (${tier}) is priced above the ${sTier} copy in this case — worth double-checking.`;
    }
  }
  return null;
}

// A different kind of soft nudge than priceOrderingWarning above: this one
// compares Our Price against THIS card's own computed Market Value, not
// against another physical copy. The flat condition multiplier can be
// materially wrong for a specific card (a real example landed ~18% off —
// see CLAUDE.md), so a meaningful gap is worth a second look — but it's
// still just a nudge; deliberate pricing decisions (the whole reason Our
// Price is separate from Market Value) are expected and not an error.
const MARKET_VALUE_DEVIATION_THRESHOLD = 0.15;

function priceVsMarketValueWarning(record, multipliers) {
  if (record.basePrice == null || record.price == null || !multipliers) return null;
  const mv = marketValueForCondition(record.basePrice, record.condition, multipliers);
  if (mv == null || mv <= 0) return null;
  const diff = Math.abs(record.price - mv) / mv;
  if (diff < MARKET_VALUE_DEVIATION_THRESHOLD) return null;
  const dir = record.price < mv ? 'below' : 'above';
  return `${record.name}'s price ($${record.price.toFixed(2)}) is ${dir} its estimated market value ($${mv.toFixed(2)}).`;
}

export default function App() {
  const { toast } = useUI();
  const [signedIn, setSignedIn] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);
  const [tab, setTab] = useState('catalog');
  const [catalog, setCatalog] = useState([]);
  const [queue, setQueue] = useState([]);
  // Starts as the real defaults, not null — "Pricing settings" should be
  // usable the instant staff tap it, not gated behind a network round trip
  // that (on a flaky mobile connection) could leave this null indefinitely
  // with zero feedback. Real settings just overwrite this once loaded.
  const [multipliers, setMultipliers] = useState(DEFAULT_CONDITION_MULTIPLIERS);
  const [showSettings, setShowSettings] = useState(false);
  const [quotes, setQuotes] = useState([]);
  // Same "usable immediately, real settings overwrite once loaded" reasoning
  // as `multipliers` above.
  const [tierSettings, setTierSettings] = useState(DEFAULT_QUOTE_TIER_PCTS);
  // Sorting stage — accepted quote items awaiting an individual placement
  // decision (a real binder/case, or Bulk). See db.js/quoteUtils.js and
  // CLAUDE.md's "Sorting stage" section.
  const [sorting, setSorting] = useState([]);

  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data: { session } }) => {
      if (session) setSignedIn(true);
      setCheckedSession(true);
    });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    dbLoadAll(toast).then(({ catalog: c, queue: q }) => { setCatalog(c); setQueue(q); });
    // dbLoadSettings already falls back to defaults on a Supabase-shaped
    // error, but a thrown network exception would reject this promise
    // instead — the .catch keeps that from silently leaving `multipliers`
    // on a stale value with no feedback.
    dbLoadSettings(toast).then(setMultipliers).catch(() => setMultipliers(DEFAULT_CONDITION_MULTIPLIERS));
    dbLoadQuotes(toast).then(setQuotes);
    dbLoadQuoteSettings(toast).then(setTierSettings).catch(() => setTierSettings(DEFAULT_QUOTE_TIER_PCTS));
    dbLoadSortingQueue(toast).then(setSorting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  async function handleSaveSettings(next) {
    setMultipliers(next);
    await dbSaveSettings(next, toast);
    setShowSettings(false);
    toast("Pricing settings saved");
  }

  useRealtimeSync({ enabled: signedIn, setCatalog, setQueue, setQuotes, setSorting });

  const locations = useMemo(
    () => Array.from(new Set(catalog.map(c => c.location).filter(Boolean))).sort(),
    [catalog]
  );

  const pendingCount = queue.filter(t => !isTicketComplete(t)).length;

  async function handleSaveCard(record, prevSku) {
    const idx = catalog.findIndex(c => c.sku === prevSku);
    const existing = prevSku && idx >= 0 ? catalog[idx] : null;
    if (needsPlatformStatusReset(existing, record)) {
      record.posSynced = false;
      record.tcgplayerSynced = false;
      record.collectrSynced = false;
    }
    // Edit's own "Mark as sold" checkbox used to silently diverge from the
    // batch Mark Sold flow — it flipped `sold` here but never wrote a sales
    // record or a Sync Queue ticket, so an item sold this way never showed
    // up in Reports or the queue. Only fires on a genuine false->true
    // transition (a brand-new item saved as already sold counts, since
    // `existing` is null) with real qty to report — same qty<=0 guard
    // handleBatchSell itself uses to skip a row with nothing left to sell.
    const wasSold = existing ? existing.sold : false;
    let newTicket = null, newSale = null;
    if (!wasSold && record.sold && record.qty > 0) {
      const qtySold = record.qty;
      const soldAt = record.lastUpdated || Date.now();
      record = { ...record, qty: 0 };
      newTicket = {
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
        sku: record.sku, name: record.name, set: record.set, condition: record.condition, printing: record.printing, price: record.price,
        qtySold, timestamp: soldAt, posDone: false, tcgplayerDone: false, collectrDone: false,
        posChannel: record.posChannel, tcgplayerChannel: record.tcgplayerChannel, collectrChannel: record.collectrChannel,
      };
      newSale = {
        sku: record.sku, name: record.name, game: record.game, condition: record.condition,
        qtySold, salePrice: record.price, cost: record.cost, soldAt,
      };
    }
    let nextCatalog;
    if (existing) {
      if (record.sku !== prevSku) {
        await dbDeleteCard(prevSku, toast);
        nextCatalog = catalog.filter(c => c.sku !== prevSku).concat([record]);
      } else {
        nextCatalog = catalog.slice();
        nextCatalog[idx] = record;
      }
    } else {
      nextCatalog = catalog.concat([record]);
    }
    setCatalog(nextCatalog);
    await dbUpsertCard(record, toast);
    if (newTicket) {
      setQueue(prev => [...prev, newTicket]);
      await dbInsertTickets([newTicket], toast);
      await dbInsertSales([newSale], toast);
    }
    // Toasts are single-slot, not a queue — combine into one call so a
    // warning doesn't just silently overwrite an unseen "Saved" message.
    const warnings = [priceOrderingWarning(nextCatalog, record), priceVsMarketValueWarning(record, multipliers)].filter(Boolean);
    if (warnings.length) toast(warnings.join(' '), true);
    else toast(`Saved ${record.name}`);
  }

  async function handleDeleteCard(sku) {
    await dbDeleteCard(sku, toast);
    setCatalog(prev => prev.filter(c => c.sku !== sku));
    toast("Item deleted");
  }

  async function handleBatchDelete(skus) {
    const count = skus.size;
    await dbDeleteCards(skus, toast);
    setCatalog(prev => prev.filter(c => !skus.has(c.sku)));
    toast(`Deleted ${count} item(s)`);
  }

  async function handleBatchSell(skus) {
    let affected = 0;
    const updatedList = [];
    const newTickets = [];
    const newSales = [];
    const soldAt = Date.now();
    const nextCatalog = catalog.map(c => {
      if (!skus.has(c.sku) || c.sold || c.qty <= 0) return c;
      const qtySold = c.qty;
      const updated = {
        ...c, qty: 0, sold: true, lastUpdated: soldAt,
        posSynced: false, tcgplayerSynced: false, collectrSynced: false,
      };
      updatedList.push(updated);
      newTickets.push({
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
        sku: c.sku, name: c.name, set: c.set, condition: c.condition, printing: c.printing, price: c.price,
        qtySold, timestamp: soldAt, posDone: false, tcgplayerDone: false, collectrDone: false,
        posChannel: c.posChannel, tcgplayerChannel: c.tcgplayerChannel, collectrChannel: c.collectrChannel,
      });
      // Only the Mark Sold flow writes a sales record — editing Quantity
      // down directly in Edit does not, same boundary sync_queue tickets
      // already draw (see phase12_sales_history.sql).
      newSales.push({
        sku: c.sku, name: c.name, game: c.game, condition: c.condition,
        qtySold, salePrice: c.price, cost: c.cost, soldAt,
      });
      affected++;
      return updated;
    });
    setCatalog(nextCatalog);
    setQueue(prev => [...prev, ...newTickets]);
    await dbUpsertCards(updatedList, toast);
    await dbInsertTickets(newTickets, toast);
    await dbInsertSales(newSales, toast);
    toast(`Marked ${affected} item(s) sold`);
  }

  // Restores the one-item partial-quantity sell this app's older per-row
  // Sell flow supported (sell 2 of 5, keep 3 as a still-active row) before
  // Sell was folded into the batch-select flow above — real staff need,
  // confirmed after handleBatchSell's own all-or-nothing qty turned out to
  // be a real gap, not just an accepted trade-off. Deliberately a separate
  // function from handleBatchSell rather than a shared one: this only ever
  // runs for exactly one card (CatalogPanel only opens the quantity picker
  // when a single multi-copy item is selected), and the two have genuinely
  // different end states (qty decremented, still unsold vs. qty zeroed,
  // sold) — folding them in would mean branching the one existing,
  // already-tested batch path on an edge case it never needs to handle.
  async function handleSellPartial(sku, qtySold) {
    const idx = catalog.findIndex(c => c.sku === sku);
    if (idx === -1) return;
    const c = catalog[idx];
    if (!(qtySold > 0) || qtySold > c.qty) return;
    const soldAt = Date.now();
    const updated = {
      ...c, qty: c.qty - qtySold, lastUpdated: soldAt,
      posSynced: false, tcgplayerSynced: false, collectrSynced: false,
    };
    const newTicket = {
      id: 't' + Date.now() + Math.random().toString(36).slice(2, 7),
      sku: c.sku, name: c.name, set: c.set, condition: c.condition, printing: c.printing, price: c.price,
      qtySold, timestamp: soldAt, posDone: false, tcgplayerDone: false, collectrDone: false,
      posChannel: c.posChannel, tcgplayerChannel: c.tcgplayerChannel, collectrChannel: c.collectrChannel,
    };
    const newSale = {
      sku: c.sku, name: c.name, game: c.game, condition: c.condition,
      qtySold, salePrice: c.price, cost: c.cost, soldAt,
    };
    setCatalog(prev => prev.map(x => (x.sku === sku ? updated : x)));
    setQueue(prev => [...prev, newTicket]);
    await dbUpsertCard(updated, toast);
    await dbInsertTickets([newTicket], toast);
    await dbInsertSales([newSale], toast);
    toast(`Marked ${qtySold} of ${c.name} sold`);
  }

  // Thin passthrough to dbLoadSales — ReportsTab owns the date-range UI and
  // calls this on demand (see ReportsTab.jsx's own comment for why sales
  // isn't eagerly loaded into top-level state like catalog/quotes/sorting).
  function handleLoadSalesReport(fromISO, toISO) {
    return dbLoadSales(fromISO, toISO, toast);
  }

  // The Reports tab's Edit Sale action. sales isn't top-level App.jsx state
  // (see the comment above) so there's nothing to update here beyond the
  // write itself — ReportsTab already patches its own local `sales` array
  // once this resolves.
  async function handleUpdateSale(sale) {
    await dbUpdateSale(sale, toast);
  }

  async function handleToggleStamp(id, field) {
    const t = queue.find(x => x.id === id);
    if (!t) return;
    const nextVal = !t[field];
    setQueue(prev => prev.map(x => x.id === id ? { ...x, [field]: nextVal } : x));
    await dbUpdateTicketStamp(id, field, nextVal, toast);
    const merged = { ...t, [field]: nextVal };
    if (isTicketComplete(merged)) {
      toast(`${t.name} synced`);
    }
  }

  async function handleTogglePlatformStatus(sku, field) {
    const card = catalog.find(c => c.sku === sku);
    if (!card) return;
    const nextVal = !card[field];
    setCatalog(prev => prev.map(c => c.sku === sku ? { ...c, [field]: nextVal } : c));
    await dbUpdatePlatformStatus(sku, field, nextVal, toast);
  }

  async function handleImport(newRows, mode) {
    if (mode === "replace") {
      await dbClearCatalog(toast);
    }
    await dbUpsertCards(newRows, toast);
    const { catalog: c, queue: q } = await dbLoadAll(toast);
    setCatalog(c);
    setQueue(q);
  }

  async function handleClearAll() {
    await dbClearCatalog(toast);
    await dbClearQueue(toast);
    setCatalog([]);
    setQueue([]);
    toast("All data cleared");
  }

  // Returns the saved quote (with its real id/quote_number once persisted)
  // so QuotesTab can open a freshly-created quote's detail view right away.
  // The accept-time handoff lives here: a quote transitioning into an
  // Accepted status (cash or credit — either counts) and not already moved
  // gets each line item turned into a sorting_queue row (a "needs to
  // process" stage), NOT a Catalog row directly — cards from the same
  // quote can end up in several different places, so that decision is
  // made individually, per card, from the Sorting tab, not once for the
  // whole quote at accept time. Guarded by `movedToSorting` so re-saving
  // an already-accepted quote never creates duplicate sorting rows.
  async function handleSaveQuote(quoteDraft) {
    const toSave = { ...quoteDraft };
    const isAccepted = toSave.offerStatus === 'accepted_cash' || toSave.offerStatus === 'accepted_store_credit';
    let movedCount = 0;
    if (isAccepted && !toSave.movedToSorting) {
      // Compute each real card/bulk item's own cost from the quote's actual
      // payout before it becomes a sorting_queue row — see
      // quoteUtils.js's computeQuoteItemCosts for the full allocation
      // reasoning (CLAUDE.md's "Cost tracking" section).
      const itemsWithCost = computeQuoteItemCosts(toSave.items, toSave.payoutAmount, tierSettings);
      const newSortingItems = buildSortingItemsFromQuoteItems(itemsWithCost, quoteDraft.id, toSave.collectionName);
      if (newSortingItems.length) {
        const inserted = await dbInsertSortingItems(newSortingItems, toast);
        if (inserted.length) {
          setSorting(prev => [...prev, ...inserted]);
          movedCount = inserted.length;
        }
      }
      toSave.movedToSorting = true;
    }
    const saved = await dbUpsertQuote(toSave, toast);
    if (saved) {
      setQuotes(prev => {
        const idx = prev.findIndex(q => q.id === saved.id);
        if (idx === -1) return [saved, ...prev];
        const next = prev.slice();
        next[idx] = saved;
        return next;
      });
      toast(`Quote #${saved.quoteNumber} saved`
        + (movedCount ? ` — ${movedCount} item(s) moved to Sorting` : ''));
    }
    return saved;
  }

  async function handleDeleteQuote(id) {
    await dbDeleteQuote(id, toast);
    setQuotes(prev => prev.filter(q => q.id !== id));
    toast("Quote deleted");
  }

  // The Sorting tab's placement decision — for one item (the per-row "Sort"
  // button) or several at once (batch-selecting a group headed to the same
  // binder/case, same reasoning as Catalog's own multi-select). `destination.
  // mode` is 'individual' (a real binder/case, same channel checkboxes as
  // any other new item) or 'bulk' (no channels — see findBulkRow/
  // buildBulkCatalogItem in cardUtils.js for why this finds-or-creates a
  // running (location, game) count instead of a per-print row). Either way,
  // every sorting_queue row involved is deleted once resolved — the new/
  // updated Catalog row is the durable record from here on, not this table.
  async function handleSortItems(items, destination) {
    let resultCards;
    if (destination.mode === 'bulk') {
      // Processed sequentially, folding each result back into `working`
      // before the next item looks up its own (location, game) row — two
      // items in the same batch sharing that pair must increment ONE row,
      // not each create/upsert their own separate copy against the same
      // stale snapshot of `catalog`. Deduped by sku afterward so that shared
      // row is only written to the DB once, with its final accumulated qty,
      // instead of once per contributing item.
      let working = catalog;
      const bySku = new Map();
      for (const item of items) {
        const existing = findBulkRow(working, destination.location, item.game);
        const resultCard = buildBulkCatalogItem(item, destination.location, existing);
        const idx = working.findIndex(c => c.sku === resultCard.sku);
        working = idx === -1 ? [...working, resultCard] : working.map((c, i) => (i === idx ? resultCard : c));
        bySku.set(resultCard.sku, resultCard);
      }
      resultCards = Array.from(bySku.values());
      for (const resultCard of resultCards) await dbUpsertCard(resultCard, toast);
    } else {
      resultCards = buildCatalogItemsFromQuoteItems(items, destination);
      await dbUpsertCards(resultCards, toast);
    }
    setCatalog(prev => {
      let next = prev.slice();
      for (const resultCard of resultCards) {
        const idx = next.findIndex(c => c.sku === resultCard.sku);
        if (idx === -1) next.push(resultCard); else next[idx] = resultCard;
      }
      return next;
    });
    for (const item of items) await dbDeleteSortingItem(item.id, toast);
    const ids = new Set(items.map(i => i.id));
    setSorting(prev => prev.filter(s => !ids.has(s.id)));
    toast(destination.mode === 'bulk'
      ? `${items.length} item(s) added to Bulk (${destination.location})`
      : `${items.length} item(s) sorted to ${destination.location}`);
  }

  async function handleSaveTierSettings(next) {
    setTierSettings(next);
    await dbSaveQuoteSettings(next, toast);
    toast("Quote settings saved");
  }

  async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
  }

  if (!checkedSession) return null;
  if (!signedIn) return <Login onSignedIn={() => setSignedIn(true)} />;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img src={logoIcon} alt="" className="brand-logo" />
          <span className="mark">Card Cove</span>
          <span className="sub brand-tagline">singles &amp; slabs · source of truth</span>
        </div>
        <div className={`pending-badge${pendingCount === 0 ? ' zero' : ''}`}>
          <span className="pending-dot"></span>
          <span>{pendingCount} pending sync</span>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(t => (
          <div key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key === 'catalog' && <span className="count">{catalog.length}</span>}
            {t.key === 'queue' && <span className="count">{pendingCount}</span>}
            {t.key === 'quote' && <span className="count">{quotes.filter(q => !q.offerStatus).length}</span>}
            {t.key === 'sorting' && <span className="count">{sorting.length}</span>}
          </div>
        ))}
      </div>

      <div className={`panel${tab === 'catalog' ? ' active' : ''}`}>
        <CatalogPanel
          catalog={catalog}
          onSaveCard={handleSaveCard}
          onDeleteCard={handleDeleteCard}
          onBatchDelete={handleBatchDelete}
          onBatchSell={handleBatchSell}
          onSellPartial={handleSellPartial}
          onTogglePlatformStatus={handleTogglePlatformStatus}
          multipliers={multipliers}
        />
      </div>
      <div className={`panel${tab === 'queue' ? ' active' : ''}`}>
        <SyncQueueTab queue={queue} onToggleStamp={handleToggleStamp} />
      </div>
      <div className={`panel${tab === 'import' ? ' active' : ''}`}>
        <ImportExportPanel
          catalog={catalog}
          queue={queue}
          locations={locations}
          onImport={handleImport}
          onClearAll={handleClearAll}
        />
      </div>
      <div className={`panel${tab === 'scanner' ? ' active' : ''}`}>
        <ScannerPanel catalog={catalog} locations={locations} onImport={handleImport} multipliers={multipliers} />
      </div>
      <div className={`panel${tab === 'quote' ? ' active' : ''}`}>
        <QuotesTab
          quotes={quotes}
          catalog={catalog}
          locations={locations}
          multipliers={multipliers}
          tierSettings={tierSettings}
          onSaveQuote={handleSaveQuote}
          onDeleteQuote={handleDeleteQuote}
          onSaveTierSettings={handleSaveTierSettings}
        />
      </div>

      <div className={`panel${tab === 'sorting' ? ' active' : ''}`}>
        <SortingTab sorting={sorting} catalog={catalog} locations={locations} onSortItems={handleSortItems} />
      </div>

      <div className={`panel${tab === 'reports' ? ' active' : ''}`}>
        <ReportsTab onLoadSales={handleLoadSalesReport} onUpdateSale={handleUpdateSale} />
      </div>

      <div className="footnote">
        Card Cove by Board Game Paradise · shared store data, live in Supabase · not connected to POS, TCG Player, or Collectr APIs ·{' '}
        <a href="?help=1" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-faint)' }}>Staff docs</a>
        {' · '}
        <a href="#" onClick={(e) => { e.preventDefault(); setShowSettings(true); }} style={{ color: 'var(--ink-faint)' }}>Pricing settings</a>
        {' · '}
        <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }} style={{ color: 'var(--ink-faint)' }}>Sign out</a>
      </div>
      {showSettings && (
        <SettingsModal
          multipliers={multipliers}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
    </div>
  );
}
