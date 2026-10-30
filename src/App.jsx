import { useEffect, useMemo, useRef, useState } from 'react';
import { supabaseClient } from './lib/supabase.js';
import { loadSession, isStaffUser } from './lib/staffAccess.js';
import NoStaffAccess from './components/NoStaffAccess.jsx';
import { lossReasonLabel } from './lib/reportUtils.js';
import {
  dbLoadAll, dbUpsertCard, dbUpsertCards, dbDeleteCard, dbDeleteCards, dbClearCatalog,
  dbInsertTickets, dbUpdateTicketStamp, dbClearQueue, dbUpdatePlatformStatus, dbInsertSales, dbLoadSales, dbUpdateSale,
  dbDeleteTickets, dbDeleteSaleForTicket,
  dbLoadSalesForSku, dbSetSaleRefunded, dbInsertLoss, dbDeleteLoss, dbLoadLosses, dbFindLossForTicket,
  dbLoadSettings, dbSaveSettings,
  dbLoadPriceAlerts, dbAcknowledgePriceAlerts, dbLoadPriceTrackingSettings, dbSavePriceTrackingSettings,
  dbLoadPublicBinders, dbSetPublicBinders, dbLoadAllBounties,
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
import PriceAlertsModal from './components/PriceAlertsModal.jsx';
import { DEFAULT_PRICE_TRACKING, alertsBySku } from './lib/priceAlertUtils.js';
import QuotesTab from './components/quotes/QuotesTab.jsx';
import SortingTab from './components/sorting/SortingTab.jsx';
import ReportsTab from './components/reports/ReportsTab.jsx';
import BountiesTab from './components/bounties/BountiesTab.jsx';
import { callBounties, countOpenBounties } from './lib/bounties.js';

const TABS = [
  { key: 'catalog', label: 'Catalog' },
  { key: 'queue', label: 'Sync Queue' },
  { key: 'import', label: 'Import / Export' },
  { key: 'scanner', label: 'Scan Binder' },
  { key: 'quote', label: 'Quote' },
  { key: 'sorting', label: 'Sorting' },
  { key: 'reports', label: 'Reports' },
  { key: 'bounties', label: 'Bounties' },
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
  // Whether the login is marked as staff (CLAUDE.md "Staff-only access").
  // Data only loads for staff; any other login gets NoStaffAccess.
  const [isStaff, setIsStaff] = useState(false);
  const [checkedSession, setCheckedSession] = useState(false);
  const [tab, setTab] = useState('catalog');
  const [catalog, setCatalog] = useState([]);
  const [queue, setQueue] = useState([]);
  // An Undo toast's click handler is created when the sale happens, so it
  // would otherwise see the catalog as it was back then. Undo reads the
  // current catalog through this ref instead.
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  // Same reason as catalogRef: undoLoss can run from a toast created earlier.
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const undoingRef = useRef(new Set());
  // Bumped whenever sales rows are added or removed, so an open Reports tab
  // re-fetches instead of still showing an undone sale.
  const [salesRevision, setSalesRevision] = useState(0);
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
  // Open (unacknowledged) alerts from the daily price check — see
  // priceAlertUtils.js. Loaded once at sign-in; the check only runs daily,
  // so there's nothing to sync live.
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [showPriceAlerts, setShowPriceAlerts] = useState(false);
  const [priceTracking, setPriceTracking] = useState(DEFAULT_PRICE_TRACKING);
  // Binders shown on the public stock page and their QR pages.
  const [publicBinders, setPublicBinders] = useState([]);
  const [bounties, setBounties] = useState([]);
  // A request for Catalog to open one item's Edit screen (from a price
  // alert's "Find card"). A fresh object each time, so asking for the
  // same sku twice still opens it twice.
  const [editRequest, setEditRequest] = useState(null);
  // Same idea for the Quote tab: open one quote's detail view (from an
  // item's "Bought in Quote #N" link in Catalog).
  const [quoteOpenRequest, setQuoteOpenRequest] = useState(null);

  useEffect(() => {
    loadSession().then(({ signedIn: s, staff }) => {
      setSignedIn(s);
      setIsStaff(staff);
      setCheckedSession(true);
    });
  }, []);

  useEffect(() => {
    if (!signedIn || !isStaff) return;
    dbLoadAll(toast).then(({ catalog: c, queue: q }) => { setCatalog(c); setQueue(q); });
    // dbLoadSettings already falls back to defaults on a Supabase-shaped
    // error, but a thrown network exception would reject this promise
    // instead — the .catch keeps that from silently leaving `multipliers`
    // on a stale value with no feedback.
    dbLoadSettings(toast).then(setMultipliers).catch(() => setMultipliers(DEFAULT_CONDITION_MULTIPLIERS));
    dbLoadQuotes(toast).then(setQuotes);
    dbLoadQuoteSettings(toast).then(setTierSettings).catch(() => setTierSettings(DEFAULT_QUOTE_TIER_PCTS));
    dbLoadSortingQueue(toast).then(setSorting);
    dbLoadPriceAlerts(toast).then(setPriceAlerts);
    dbLoadPriceTrackingSettings(toast).then(setPriceTracking).catch(() => setPriceTracking(DEFAULT_PRICE_TRACKING));
    dbLoadPublicBinders(toast).then(setPublicBinders);
    dbLoadAllBounties(toast).then(setBounties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, isStaff]);

  async function handleSaveSettings(next, nextTracking) {
    setMultipliers(next);
    await dbSaveSettings(next, toast);
    if (nextTracking) {
      setPriceTracking(nextTracking);
      await dbSavePriceTrackingSettings(nextTracking, toast);
    }
    setShowSettings(false);
    toast("Pricing settings saved");
  }

  const priceAlertsBySku = useMemo(() => alertsBySku(priceAlerts), [priceAlerts]);

  async function handleDismissPriceAlerts(ids) {
    const idSet = new Set(ids);
    setPriceAlerts(prev => prev.filter(a => !idSet.has(a.id)));
    await dbAcknowledgePriceAlerts(ids, toast);
  }

  // "Find card" never changes a price itself — it switches to Catalog and
  // opens that item's normal Edit screen, which shows the alert (and the
  // card it was compared against) for reference; saving there is what
  // clears the alert (handleSaveCard).
  function handleFindCardFromAlert(sku) {
    setShowPriceAlerts(false);
    setTab('catalog');
    setEditRequest({ sku });
  }

  // "View quote" from an item's edit screen: switch to the Quote tab and
  // open the quote it was bought in.
  function handleOpenQuote(id) {
    setTab('quote');
    setQuoteOpenRequest({ id });
  }

  useRealtimeSync({ enabled: signedIn && isStaff, setCatalog, setQueue, setQuotes, setSorting });

  const locations = useMemo(
    () => Array.from(new Set(catalog.map(c => c.location).filter(Boolean))).sort(),
    [catalog]
  );

  const pendingCount = queue.filter(t => !isTicketComplete(t)).length;

  // Public binders (CLAUDE.md "Public binders"): save the ticked list.
  async function handleSavePublicBinders(next) {
    const ok = await dbSetPublicBinders(next, publicBinders, toast);
    if (ok) {
      setPublicBinders(next);
      toast(next.length === 1 ? '1 binder is public' : `${next.length} binders are public`);
    }
    return ok;
  }

  // Bounties (CLAUDE.md "Bounties"): Mark fulfilled / Remove go through the
  // bounties Edge Function, which also posts the fulfilled ones to Discord.
  async function handleBountyAction(bounty, action) {
    try {
      const { bounty: updated, posted } = await callBounties(action, { id: bounty.id });
      if (updated) setBounties(prev => prev.map(b => (b.id === updated.id ? { ...b, ...updated } : b)));
      if (action === 'fulfill') {
        toast(posted ? `Marked ${bounty.name} fulfilled, ${bounty.discordName || 'the member'} was pinged in Discord`
          : `Marked ${bounty.name} fulfilled (not posted to Discord)`);
      } else {
        toast(`Removed the bounty for ${bounty.name}`);
      }
    } catch (err) {
      toast(err.message || String(err), true);
    }
  }

  async function handleRefreshBounties() {
    setBounties(await dbLoadAllBounties(toast));
  }

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
    // Saving an item with an open price alert counts as having reviewed its
    // price (decided with the user: Edit shows the alert's market price for
    // reference, staff set Our Price themselves, and the save clears it).
    const reviewedAlertIds = priceAlerts.filter(a => a.sku === prevSku || a.sku === record.sku).map(a => a.id);
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
      setSalesRevision(v => v + 1);
    }
    if (reviewedAlertIds.length) await handleDismissPriceAlerts(reviewedAlertIds);
    // Toasts are single-slot, not a queue — combine into one call so a
    // warning doesn't just silently overwrite an unseen "Saved" message.
    const warnings = [priceOrderingWarning(nextCatalog, record), priceVsMarketValueWarning(record, multipliers)].filter(Boolean);
    if (newTicket) offerUndo([newTicket], existing ? { [existing.sku]: existing } : {}, warnings.join(' '));
    else if (warnings.length) toast(warnings.join(' '), true);
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
    const snapshots = {};
    const soldAt = Date.now();
    const nextCatalog = catalog.map(c => {
      if (!skus.has(c.sku) || c.sold || c.qty <= 0) return c;
      const qtySold = c.qty;
      snapshots[c.sku] = c;
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
    if (!affected) { toast('Nothing to mark sold'); return; }
    setSalesRevision(v => v + 1);
    offerUndo(newTickets, snapshots);
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
    setSalesRevision(v => v + 1);
    offerUndo([newTicket], { [c.sku]: c });
  }

  // --- Undo a sale -------------------------------------------------------
  // Every sell path above writes the same pair: a Sync Queue ticket and a
  // Reports (sales) row, both stamped with one timestamp. Undo reverses all
  // of it: the item's qty comes back (and it's no longer "sold"), the ticket
  // is deleted, and the sales row is deleted. Reachable from the toast right
  // after selling and from each ticket in the Sync Queue.

  function soldMessage(tickets) {
    if (tickets.length === 1) return `Sold ${tickets[0].qtySold} ${tickets[0].name}`;
    return `Sold ${tickets.length} items`;
  }

  // `snapshots` (sku -> the catalog row right before selling) lets the
  // toast's undo also put the P/T/C status chips back as they were, since
  // selling resets them. The Sync Queue's undo has no snapshot, so the chips
  // stay unchecked there; staff re-check them if needed.
  function offerUndo(tickets, snapshots, extra) {
    const msg = soldMessage(tickets) + (extra ? `. ${extra}` : '');
    toast(msg, false, { action: { label: 'Undo', onClick: () => undoSales(tickets, snapshots) } });
  }

  async function undoSales(tickets, snapshots = {}) {
    // Guards a double tap, or the toast and the queue button racing.
    const live = tickets.filter(t => !undoingRef.current.has(t.id));
    if (!live.length) return;
    live.forEach(t => undoingRef.current.add(t.id));
    try {
      const now = Date.now();
      const restoredBySku = new Map();
      let missing = 0;
      for (const t of live) {
        const base = restoredBySku.get(t.sku) || catalogRef.current.find(c => c.sku === t.sku);
        if (!base) { missing++; continue; }
        const snap = snapshots[t.sku];
        restoredBySku.set(t.sku, {
          ...base,
          qty: (Number(base.qty) || 0) + (Number(t.qtySold) || 0),
          sold: false,
          lastUpdated: now,
          ...(snap ? { posSynced: snap.posSynced, tcgplayerSynced: snap.tcgplayerSynced, collectrSynced: snap.collectrSynced } : {}),
        });
      }
      const restored = Array.from(restoredBySku.values());
      const ids = live.map(t => t.id);
      setCatalog(prev => prev.map(c => restoredBySku.get(c.sku) || c));
      setQueue(prev => prev.filter(t => !ids.includes(t.id)));
      await dbUpsertCards(restored, toast);
      await dbDeleteTickets(ids, toast);
      let salesRemoved = 0;
      for (const t of live) salesRemoved += await dbDeleteSaleForTicket(t, toast);
      setSalesRevision(v => v + 1);

      const what = live.length === 1 ? `the sale of ${live[0].name}` : `${live.length} sales`;
      const notes = [];
      if (missing) notes.push(live.length === 1
        ? "The item is no longer in the catalog, so its quantity couldn't be put back"
        : `${missing} item(s) are no longer in the catalog, so their quantity couldn't be put back`);
      if (salesRemoved < live.length) {
        notes.push(`${live.length - salesRemoved} Reports entry wasn't found (edited in Reports?), so remove it there`);
      }
      if (notes.length) toast(`Undid ${what}. ${notes.join('. ')}.`, true);
      else toast(`Undid ${what}. Quantity is back in the catalog.`);
    } finally {
      live.forEach(t => undoingRef.current.delete(t.id));
    }
  }

  // --- Lost / stolen cards ------------------------------------------------
  // "Report lost / stolen" on a card's Edit screen (ReportLossModal). See
  // CLAUDE.md's "Lost / stolen cards". A copy missing from stock: the qty
  // goes down and a Sync Queue ticket (kind 'loss') reminds staff to take
  // the listing down. A sold copy lost in shipment: no qty change (it's
  // already gone); if the customer was refunded, the sale is marked
  // refunded so Reports drop its revenue. Either way an inventory_losses row
  // records Cost x qty, which Reports subtract from Profit.
  async function handleReportLoss(card, report) {
    const occurredAt = Date.now();
    const c = catalogRef.current.find(x => x.sku === card.sku) || card;
    const snapshot = c;
    let ticket = null;

    // A Cost typed into the report window is saved on the card too.
    let updated = report.costEntered ? { ...c, cost: report.costEach } : c;
    if (report.mode === 'stock') {
      updated = {
        ...updated, qty: Math.max(0, (Number(c.qty) || 0) - report.qty), lastUpdated: occurredAt,
        posSynced: false, tcgplayerSynced: false, collectrSynced: false,
      };
      ticket = {
        id: 't' + Date.now() + Math.random().toString(36).slice(2, 7), kind: 'loss',
        sku: c.sku, name: c.name, set: c.set, condition: c.condition, printing: c.printing, price: c.price,
        qtySold: report.qty, timestamp: occurredAt, posDone: false, tcgplayerDone: false, collectrDone: false,
        posChannel: c.posChannel, tcgplayerChannel: c.tcgplayerChannel, collectrChannel: c.collectrChannel,
      };
    }

    const saved = await dbInsertLoss({
      sku: c.sku, name: c.name, game: c.game, condition: report.sale ? report.sale.condition : c.condition,
      qty: report.qty, costEach: report.costEach, lossAmount: report.lossAmount,
      reason: report.reason, notes: report.notes,
      saleId: report.sale ? report.sale.id : null, refunded: !!report.refunded, occurredAt,
    }, toast);
    if (!saved) return; // nothing else changed; the toast already says why

    if (updated !== c) {
      setCatalog(prev => prev.map(x => (x.sku === c.sku ? updated : x)));
      await dbUpsertCard(updated, toast);
    }
    if (ticket) {
      setQueue(prev => [...prev, ticket]);
      await dbInsertTickets([ticket], toast);
    }
    if (report.sale) {
      // A sale recorded with no cost gets the one entered here too.
      if (report.costEntered && report.sale.cost == null) {
        await dbUpdateSale({ ...report.sale, cost: report.costEach }, toast);
      }
      if (report.refunded) await dbSetSaleRefunded(report.sale.id, occurredAt, toast);
    }
    setSalesRevision(v => v + 1);

    const what = `${report.qty} × ${c.name}`;
    toast(`Reported ${what} as ${lossReasonLabel(report.reason).toLowerCase()}, $${report.lossAmount.toFixed(2)} loss`, false, {
      action: { label: 'Undo', onClick: () => undoLoss({ loss: saved, ticket, snapshot: ticket ? snapshot : null }) },
    });
  }

  // Undoes a reported loss, the same way Undo sale undoes a sale. One path
  // for all three places it's offered: the toast right after reporting
  // (loss + ticket + the pre-loss snapshot), the Reports Lost / stolen list
  // (loss only) and a "Lost / stolen" Sync Queue ticket (ticket only). The
  // missing half is found by sku + timestamp: handleReportLoss stamps the
  // ticket and the loss with the same occurredAt. A copy missing from stock
  // gets its qty back and its ticket removed; a sold copy lost in shipment
  // gets its refund cleared, so the sale counts as revenue again. A Cost
  // entered while reporting stays on the card.
  async function undoLoss({ loss = null, ticket = null, snapshot = null }) {
    const key = loss ? loss.id : ticket.id;
    if (undoingRef.current.has(key)) return;
    undoingRef.current.add(key);
    try {
      if (!loss && ticket) loss = await dbFindLossForTicket(ticket, toast);
      if (!ticket && loss && !loss.saleId) {
        ticket = queueRef.current.find(t => t.kind === 'loss' && t.sku === loss.sku && t.timestamp === loss.occurredAt) || null;
      }
      const name = loss ? loss.name : ticket.name;
      const qty = loss ? loss.qty : ticket.qtySold;
      const fromStock = loss ? !loss.saleId : true;

      if (loss) await dbDeleteLoss(loss.id, toast);
      let qtyRestored = !fromStock;
      if (fromStock) {
        const base = catalogRef.current.find(x => x.sku === (loss ? loss.sku : ticket.sku));
        if (base) {
          const restored = {
            ...base, qty: (Number(base.qty) || 0) + qty, lastUpdated: Date.now(),
            ...(snapshot ? { posSynced: snapshot.posSynced, tcgplayerSynced: snapshot.tcgplayerSynced, collectrSynced: snapshot.collectrSynced } : {}),
          };
          setCatalog(prev => prev.map(x => (x.sku === base.sku ? restored : x)));
          await dbUpsertCard(restored, toast);
          qtyRestored = true;
        }
      }
      if (ticket) {
        setQueue(prev => prev.filter(t => t.id !== ticket.id));
        await dbDeleteTickets([ticket.id], toast);
      }
      if (loss && loss.saleId && loss.refunded) await dbSetSaleRefunded(loss.saleId, null, toast);
      setSalesRevision(v => v + 1);

      const notes = [];
      if (!qtyRestored) notes.push("the item is no longer in the catalog, so its quantity couldn't be put back");
      if (!loss) notes.push("its Reports entry wasn't found (already undone there?)");
      if (notes.length) toast(`Undid the loss of ${qty} × ${name}, but ${notes.join(', and ')}.`, true);
      else toast(`Undid the loss of ${qty} × ${name}.`
        + (fromStock ? ' Quantity is back in the catalog.' : (loss.refunded ? ' The sale counts as revenue again.' : '')));
    } finally {
      undoingRef.current.delete(key);
    }
  }

  function handleLoadSalesForSku(sku) {
    return dbLoadSalesForSku(sku, toast);
  }

  function handleLoadLossReport(fromISO, toISO) {
    return dbLoadLosses(fromISO, toISO, toast);
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
  // opts.quiet skips the "Quote #N saved" toast (the quote import shows one
  // summary for the whole file instead); opts.result, if given, gets
  // movedCount, the number of cards actually sent to Sorting.
  async function handleSaveQuote(quoteDraft, opts = {}) {
    let toSave = { ...quoteDraft };
    const isAccepted = toSave.offerStatus === 'accepted_cash' || toSave.offerStatus === 'accepted_store_credit';
    let movedCount = 0;
    if (isAccepted && !toSave.movedToSorting) {
      // A brand-new quote accepted in its first save (or imported already
      // accepted) has no id yet. The Sorting rows need it so the cards
      // remember which quote they came from, and sorting_queue.quote_id
      // references quotes(id), so the quote row has to exist first: save it
      // once (not yet moved), then move its cards.
      if (!toSave.id) {
        const first = await dbUpsertQuote({ ...toSave, movedToSorting: false }, toast);
        if (!first) {
          if (opts.result) opts.result.movedCount = 0;
          return null;
        }
        toSave = { ...toSave, id: first.id, quoteNumber: first.quoteNumber };
      }
      // Compute each real card/bulk item's own cost from the quote's actual
      // payout before it becomes a sorting_queue row — see
      // quoteUtils.js's computeQuoteItemCosts for the full allocation
      // reasoning (CLAUDE.md's "Cost tracking" section).
      const itemsWithCost = computeQuoteItemCosts(toSave.items, toSave.payoutAmount, tierSettings);
      const newSortingItems = buildSortingItemsFromQuoteItems(itemsWithCost, toSave.id, toSave.collectionName);
      if (newSortingItems.length) {
        const inserted = await dbInsertSortingItems(newSortingItems, toast);
        if (inserted.length) {
          setSorting(prev => [...prev, ...inserted]);
          movedCount = inserted.length;
          toSave.movedToSorting = true;
        }
        // If the insert failed (already reported by a toast), the quote
        // stays not-moved, so saving it again retries the move.
      } else {
        toSave.movedToSorting = true;
      }
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
      if (!opts.quiet) {
        toast(`Quote #${saved.quoteNumber} saved`
          + (movedCount ? ` — ${movedCount} item(s) moved to Sorting` : ''));
      }
    }
    if (opts.result) opts.result.movedCount = saved ? movedCount : 0;
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
  async function handleSortItems(sortingItems, destination) {
    // A card with no game gets the one picked in the Sort window (see
    // SortItemModal), so it doesn't become "Other" in Catalog.
    const items = destination.game
      ? sortingItems.map(i => ((i.game || '').trim() ? i : { ...i, game: destination.game }))
      : sortingItems;
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
  if (!signedIn) return <Login onSignedIn={(session) => { setSignedIn(true); setIsStaff(isStaffUser(session && session.user)); }} />;
  if (!isStaff) return <NoStaffAccess onSignOut={handleLogout} />;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img src={logoIcon} alt="" className="brand-logo" />
          <span className="mark">Card Cove</span>
          <span className="sub brand-tagline">singles &amp; slabs · source of truth</span>
        </div>
        <div className="topbar-badges">
        <div className={`pending-badge${pendingCount === 0 ? ' zero' : ''}`}>
          <span className="pending-dot"></span>
          <span>{pendingCount} pending sync</span>
        </div>
        {priceAlerts.length > 0 && (
          <button
            type="button" className="price-alerts-badge"
            onClick={() => setShowPriceAlerts(true)}
            title="Items whose market price has risen well above Our Price"
          >
            <span aria-hidden="true">▲</span>
            <span>{priceAlerts.length} price alert{priceAlerts.length === 1 ? '' : 's'}</span>
          </button>
        )}
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
            {t.key === 'bounties' && <span className="count">{countOpenBounties(bounties)}</span>}
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
          priceAlertsBySku={priceAlertsBySku}
          editRequest={editRequest}
          quotes={quotes}
          onOpenQuote={handleOpenQuote}
          onReportLoss={handleReportLoss}
          onLoadSalesForSku={handleLoadSalesForSku}
          onEditRequestHandled={() => setEditRequest(null)}
        />
      </div>
      <div className={`panel${tab === 'queue' ? ' active' : ''}`}>
        <SyncQueueTab
          queue={queue}
          onToggleStamp={handleToggleStamp}
          onUndoSale={(t) => undoSales([t])}
          onUndoLoss={(t) => undoLoss({ ticket: t })}
        />
      </div>
      <div className={`panel${tab === 'import' ? ' active' : ''}`}>
        <ImportExportPanel
          catalog={catalog}
          queue={queue}
          locations={locations}
          quotes={quotes}
          publicBinders={publicBinders}
          onSavePublicBinders={handleSavePublicBinders}
          onSaveQuote={handleSaveQuote}
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
          openRequest={quoteOpenRequest}
          onOpenRequestHandled={() => setQuoteOpenRequest(null)}
          onSaveTierSettings={handleSaveTierSettings}
        />
      </div>

      <div className={`panel${tab === 'sorting' ? ' active' : ''}`}>
        <SortingTab sorting={sorting} catalog={catalog} locations={locations} onSortItems={handleSortItems} />
      </div>

      <div className={`panel${tab === 'reports' ? ' active' : ''}`}>
        <ReportsTab
          onLoadSales={handleLoadSalesReport}
          onLoadLosses={handleLoadLossReport}
          onUpdateSale={handleUpdateSale}
          onUndoLoss={(loss) => undoLoss({ loss })}
          refreshKey={salesRevision}
        />
      </div>

      <div className={`panel${tab === 'bounties' ? ' active' : ''}`}>
        <BountiesTab bounties={bounties} catalog={catalog} onAction={handleBountyAction} onRefresh={handleRefreshBounties} />
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
          priceTracking={priceTracking}
          onClose={() => setShowSettings(false)}
          onSave={handleSaveSettings}
        />
      )}
      {showPriceAlerts && (
        <PriceAlertsModal
          alerts={priceAlerts}
          catalog={catalog}
          onClose={() => setShowPriceAlerts(false)}
          onFindCard={handleFindCardFromAlert}
          onDismiss={handleDismissPriceAlerts}
        />
      )}
    </div>
  );
}
