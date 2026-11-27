import { useEffect, useState } from 'react';
import { dbLoadOpenings, dbUpsertOpening, dbDeleteOpening } from '../lib/openingsDb.js';
import { dbInsertSortingItems } from '../lib/db.js';
import { buildSortingItemsFromOpening, fillGameFromOpening, openingLabel } from '../lib/openingUtils.js';

// Openings tab state (CLAUDE.md "Openings"). Loaded once at sign-in, not on
// the realtime channel: openings change rarely and are edited by one person
// at a time. A woken tab's reload (useWriteQueue) refreshes them too.
export function useOpenings({ enabled, toast, setSorting }) {
  const [openings, setOpenings] = useState([]);
  // "View opening" from a catalog item's edit screen.
  const [openRequest, setOpenRequest] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    dbLoadOpenings(toast).then(setOpenings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  function reload() {
    return dbLoadOpenings(toast).then(setOpenings);
  }

  function upsertLocal(saved) {
    setOpenings(prev => {
      const idx = prev.findIndex(o => o.id === saved.id);
      if (idx === -1) return [saved, ...prev];
      const next = prev.slice();
      next[idx] = saved;
      return next;
    });
  }

  // Marking an opening Done moves its pulls to Sorting once (guarded by
  // movedToSorting), with each pull's Cost split from the sealed value.
  // Same order as accepting a quote: sorting_queue.opening_id references
  // openings(id), so a brand-new opening is saved first to get its id.
  async function save(draft) {
    let toSave = { ...draft };
    let movedCount = 0;
    if (toSave.status === 'done' && !toSave.movedToSorting) {
      if (!toSave.id) {
        const first = await dbUpsertOpening({ ...toSave, status: 'open', movedToSorting: false }, toast);
        if (!first) return null;
        upsertLocal(first);
        toSave = { ...toSave, id: first.id, openingNumber: first.openingNumber };
      }
      toSave.items = fillGameFromOpening(toSave.items, toSave.game);
      const rows = buildSortingItemsFromOpening(toSave);
      if (rows.length) {
        const inserted = await dbInsertSortingItems(rows, toast);
        if (inserted.length) {
          setSorting(prev => [...prev, ...inserted]);
          movedCount = inserted.length;
          toSave.movedToSorting = true;
        } else {
          // The insert failed (a toast said why): keep it in progress, so
          // saving again retries the move.
          toSave.status = 'open';
        }
      } else {
        toSave.movedToSorting = true;
      }
    }
    const saved = await dbUpsertOpening(toSave, toast);
    if (!saved) return null;
    upsertLocal(saved);
    toast(`${openingLabel(saved)} saved` + (movedCount ? `, ${movedCount} pull(s) moved to Sorting` : ''));
    return saved;
  }

  async function remove(id) {
    const ok = await dbDeleteOpening(id, toast);
    if (!ok) return false;
    setOpenings(prev => prev.filter(o => o.id !== id));
    toast('Opening deleted');
    return true;
  }

  return { openings, save, remove, reload, openRequest, setOpenRequest };
}
