import { useEffect, useMemo, useState } from 'react';
import {
  dbLoadMetaCards, dbLoadHotList, dbAddHotCard, dbDeleteHotCard, dbLoadPriceMovers, dbLoadSales,
} from '../lib/db.js';
import { buildHotIndex, SALES_WINDOW_DAYS } from '../lib/hotCards.js';

// Everything the "Hot" quote notice needs (CLAUDE.md "Hot cards"). Loaded
// at sign-in; tournament data and price moves only change once a day, so
// there's no realtime. Recent sales reload whenever salesRevision changes
// (a sale or an undo).
export function useHotCards({ enabled, toast, salesRevision = 0 }) {
  const [meta, setMeta] = useState([]);
  const [hotList, setHotList] = useState([]);
  const [movers, setMovers] = useState([]);
  const [sales, setSales] = useState([]);

  // The notices are a nice-to-have: a failed load (say phase21 isn't run
  // yet) shouldn't put error toasts in front of staff at every sign-in.
  const quiet = (msg) => console.warn(msg);

  useEffect(() => {
    if (!enabled) return;
    dbLoadMetaCards(quiet).then(setMeta);
    dbLoadHotList(quiet).then(setHotList);
    dbLoadPriceMovers(quiet).then(setMovers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const to = new Date(Date.now() + 60000).toISOString();
    const from = new Date(Date.now() - SALES_WINDOW_DAYS * 86400000).toISOString();
    dbLoadSales(from, to, quiet).then(setSales);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, salesRevision]);

  const index = useMemo(
    () => buildHotIndex({ meta, hotList, sales, movers }),
    [meta, hotList, sales, movers]
  );

  async function addHotCard(entry) {
    const saved = await dbAddHotCard(entry, toast);
    if (saved) {
      setHotList(prev => [saved, ...prev]);
      toast(`Added ${saved.name} to the hot list`);
    }
    return !!saved;
  }

  async function removeHotCard(entry) {
    if (await dbDeleteHotCard(entry.id, toast)) {
      setHotList(prev => prev.filter(h => h.id !== entry.id));
      toast(`Removed ${entry.name} from the hot list`);
    }
  }

  return { index, meta, hotList, movers, sales, addHotCard, removeHotCard };
}
