import { useEffect, useRef } from 'react';
import { supabaseClient } from '../lib/supabase.js';
import { rowToCard, rowToTicket, rowToQuote, rowToSortingItem } from '../lib/db.js';

// Merges one postgres_changes event into local state by primary key.
// Works the same whether the event is our own write echoing back (a no-op
// replace with identical data) or a change made from another tab/device —
// that symmetry is what makes "last write wins" the natural behavior here,
// per the brief: whichever row Postgres has most recently is what everyone
// converges on, with no extra conflict-resolution logic needed.
function applyChange(prev, payload, mapRow, keyField) {
  if (payload.eventType === 'DELETE') {
    const key = payload.old && payload.old[keyField];
    if (key == null) return prev;
    return prev.filter(item => item[keyField] !== key);
  }
  const mapped = mapRow(payload.new);
  const idx = prev.findIndex(item => item[keyField] === mapped[keyField]);
  if (idx === -1) return [...prev, mapped];
  const next = prev.slice();
  next[idx] = mapped;
  return next;
}

// Subscribes to live catalog/sync_queue/quotes/sorting_queue changes so
// every open tab reflects edits from any other tab or device without
// needing a manual reload. Requires the `catalog`, `sync_queue`, `quotes`,
// and `sorting_queue` tables to be added to Supabase's `supabase_realtime`
// publication (Database → Publications in the dashboard).
// Live updates are missed while a tab is in the background or a phone is
// locked (the connection drops and nothing is replayed), and an old copy is
// what put moved cards back in their old binders. So when the page comes
// back after RESYNC_AFTER_HIDDEN_MS, or the live connection recovers after
// dropping, `onResync` reloads everything (useWriteQueue's resync).
const RESYNC_AFTER_HIDDEN_MS = 30000;

export function useRealtimeSync({ enabled, setCatalog, setQueue, setQuotes, setSorting, onResync }) {
  const resyncRef = useRef(onResync);
  resyncRef.current = onResync;

  useEffect(() => {
    if (!enabled) return undefined;
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
      if (hiddenAt && Date.now() - hiddenAt >= RESYNC_AFTER_HIDDEN_MS && resyncRef.current) resyncRef.current();
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let dropped = false;
    const channel = supabaseClient
      .channel('ledger-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog' }, (payload) => {
        setCatalog(prev => applyChange(prev, payload, rowToCard, 'sku'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sync_queue' }, (payload) => {
        setQueue(prev => applyChange(prev, payload, rowToTicket, 'id'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, (payload) => {
        setQuotes(prev => applyChange(prev, payload, rowToQuote, 'id'));
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sorting_queue' }, (payload) => {
        setSorting(prev => applyChange(prev, payload, rowToSortingItem, 'id'));
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') dropped = true;
        else if (status === 'SUBSCRIBED' && dropped) {
          dropped = false;
          if (resyncRef.current) resyncRef.current();
        }
      });

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [enabled, setCatalog, setQueue, setQuotes, setSorting]);
}
