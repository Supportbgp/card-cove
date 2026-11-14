// Saves that couldn't reach the database (no connection, a server error, a
// timeout) are kept on this device and retried, instead of being lost with
// only a red toast. Added after cards moved on a phone never reached the
// shop's data (CLAUDE.md "Change history and safer saves").
//
// Only "the request never got a real answer" failures are kept: status 0
// (postgrest-js's network failure), 408, 429 and 5xx. Anything else (a
// rejected value, a permission error) won't succeed on a retry either, so
// it's reported right away as before.
//
// Order matters (an update after the insert it depends on), so once
// anything is waiting, new writes queue behind it instead of jumping ahead,
// and the queue is replayed oldest first, stopping at the first one that
// still can't get through. Every queued write is safe to send twice:
// updates and deletes match a key, inserts are upserts on a key the app
// chose (ticket ids, sale ids), so a request that reached the database but
// lost its answer can't create a duplicate when replayed.
//
// Kept per device in localStorage (separate keys for staging and
// production, which share one web origin).

import { supabaseClient } from './supabase.js';
import { IS_STAGING } from './appEnv.js';

const STORAGE_KEY = IS_STAGING ? 'card-cove-staging-write-queue' : 'card-cove-write-queue';

let queue = loadQueue();
let flushing = null;
const listeners = new Set();

function loadQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Full or blocked storage: the queue still works for this session.
  }
  for (const fn of listeners) fn(queue.length);
}

export function pendingWriteCount() {
  return queue.length;
}

// fn(count) runs whenever the number of waiting writes changes.
export function subscribeWriteQueue(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isTransientFailure(result) {
  if (!result || !result.error) return false;
  const status = Number(result.status) || 0;
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

// One write, described as plain data so it can be stored and replayed:
//   { table, action: 'update' | 'upsert' | 'delete', values?, rows?,
//     match?: { column: value }, matchIn?: { column, values },
//     onConflict?, ignoreDuplicates?, label }
function buildRequest(op) {
  const t = supabaseClient.from(op.table);
  let q;
  if (op.action === 'update') q = t.update(op.values);
  else if (op.action === 'upsert') {
    const opts = {};
    if (op.onConflict) opts.onConflict = op.onConflict;
    if (op.ignoreDuplicates) opts.ignoreDuplicates = true;
    q = t.upsert(op.rows, opts);
  } else if (op.action === 'delete') q = t.delete();
  else throw new Error('Unknown write action: ' + op.action);
  for (const [col, val] of Object.entries(op.match || {})) q = q.eq(col, val);
  if (op.matchIn) q = q.in(op.matchIn.column, op.matchIn.values);
  return q;
}

async function send(op) {
  try {
    return await buildRequest(op);
  } catch (e) {
    return { error: { message: String((e && e.message) || e) }, status: 0 };
  }
}

// Sends a write now, or queues it. Returns { ok, queued, error }.
// `onError(message)` is told about a failure that won't be retried.
export async function runWrite(op, onError) {
  if (queue.length) {
    queue.push(op);
    persist();
    flushWriteQueue(onError);
    return { ok: false, queued: true };
  }
  const result = await send(op);
  if (!result.error) return { ok: true, queued: false };
  if (isTransientFailure(result)) {
    queue.push(op);
    persist();
    return { ok: false, queued: true, error: result.error };
  }
  if (onError) onError(`${op.label || 'Save'} failed: ${result.error.message}`);
  return { ok: false, queued: false, error: result.error };
}

// Replays waiting writes, oldest first. Resolves to how many went through.
// A write the database rejects outright is dropped and reported.
export function flushWriteQueue(onError) {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    while (queue.length) {
      const op = queue[0];
      const result = await send(op);
      if (result.error && isTransientFailure(result)) break;
      queue.shift();
      persist();
      if (result.error) {
        if (onError) onError(`${op.label || 'A waiting save'} couldn't be saved: ${result.error.message}`);
      } else {
        sent++;
      }
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}

// Test-only: start from an empty queue.
export function __resetWriteQueueForTests() {
  queue = [];
  flushing = null;
  persist();
}
