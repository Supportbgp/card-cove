import { useCallback, useEffect, useRef, useState } from 'react';
import { flushWriteQueue, pendingWriteCount, subscribeWriteQueue } from '../lib/writeQueue.js';

const RETRY_EVERY_MS = 20000;

// Waiting saves (writeQueue.js) and keeping this device's copy fresh
// (CLAUDE.md "Change history and safer saves"):
//   * shows how many saves are waiting, and tells staff once when the first
//     one couldn't get through;
//   * retries them every 20 seconds, when the connection comes back, and
//     when the tab is opened again;
//   * `resync()` sends anything waiting first, then reloads everything from
//     the database (`reload`). useRealtimeSync calls it when a tab or phone
//     wakes up, since live updates are missed while it sleeps. While saves
//     are still waiting, it doesn't reload: that would hide them on screen
//     until they get through.
export function useWriteQueue({ enabled, toast, reload }) {
  const [pending, setPending] = useState(pendingWriteCount);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const reportFailure = useCallback((msg) => toastRef.current(msg, true), []);

  const lastRef = useRef({ count: pendingWriteCount(), stored: true });
  useEffect(() => subscribeWriteQueue((count, stored) => {
    const last = lastRef.current;
    if (last.count === 0 && count > 0) {
      toastRef.current("Couldn't reach the database. Your change is saved on this device and will be sent automatically.", true);
    }
    if (last.stored && !stored && count > 0) {
      toastRef.current("This device's storage is full, so waiting changes are only kept while this tab stays open. Don't close it until they're saved.", true);
    }
    lastRef.current = { count, stored };
    setPending(count);
  }), []);

  const retryNow = useCallback(async () => {
    const before = pendingWriteCount();
    if (!before) return 0;
    const sent = await flushWriteQueue(reportFailure);
    if (sent && !pendingWriteCount()) {
      toastRef.current(sent === 1 ? 'Saved 1 waiting change' : `Saved ${sent} waiting changes`);
    }
    return sent;
  }, [reportFailure]);

  const resync = useCallback(async () => {
    if (!enabled) return;
    if (pendingWriteCount()) await retryNow();
    if (pendingWriteCount()) return;
    await reloadRef.current();
  }, [enabled, retryNow]);

  useEffect(() => {
    if (!enabled) return undefined;
    retryNow();
    const onOnline = () => { retryNow(); };
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => { if (pendingWriteCount()) retryNow(); }, RETRY_EVERY_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [enabled, retryNow]);

  return { pending, retryNow, resync };
}
