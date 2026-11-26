// Daily market climbs job (CLAUDE.md "Hot cards: market price climbs from
// TCGCSV"), run by .github/workflows/market-check.yml:
//   1. download TCGCSV's price archive for the latest day and for 30 days
//      before it, and unpack both with 7z (installed on GitHub's runners);
//   2. per game, find TCGplayer market prices that climbed (lib.js);
//   3. look up those cards' names, numbers and sets (one request per set,
//      with a pause, as TCGCSV asks);
//   4. replace that game's rows in market_movers (service role, PostgREST).
//
//   node scripts/market-movers/run.js            (needs SUPABASE_URL and
//                                                 SUPABASE_SERVICE_ROLE_KEY)
//   DRY_RUN=1 node scripts/market-movers/run.js  (prints, writes nothing)
//
// The service-role key is read from the environment only and never printed.

import { mkdtempSync, readFileSync, readdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  GAME_BY_CATEGORY, WINDOW_DAYS, MAX_PER_GAME, parsePrices, findClimbers, moverRow, dayBefore,
} from './lib.js';

const TCGCSV = 'https://tcgcsv.com';
const UA = 'card-cove-market-check';
const PAUSE_MS = 250;
const DRY_RUN = process.env.DRY_RUN === '1';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function get(url, as = 'json') {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) return as === 'json' ? res.json() : Buffer.from(await res.arrayBuffer());
    if (res.status === 404) return null;
    if (res.status < 500 && res.status !== 429) throw new Error(`${res.status} for ${url}`);
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(`Gave up on ${url}`);
}

// Downloads and unpacks one day's archive; returns its folder, or null if
// that day has no archive (yet).
async function unpackDay(day, dir) {
  const file = join(dir, `prices-${day}.ppmd.7z`);
  const data = await get(`${TCGCSV}/archive/tcgplayer/prices-${day}.ppmd.7z`, 'buffer');
  if (!data) return null;
  writeFileSync(file, data);
  const out = spawnSync('7z', ['x', '-y', `-o${dir}`, file], { stdio: 'ignore' });
  if (out.status !== 0) throw new Error(`7z could not unpack ${day}`);
  const folder = join(dir, day);
  return existsSync(folder) ? folder : null;
}

// Every group's prices for one category of one day, plus which group each
// product belongs to.
function readCategory(dayFolder, categoryId) {
  const prices = new Map();
  const groupOf = new Map();
  const catFolder = join(dayFolder, String(categoryId));
  if (!existsSync(catFolder)) return { prices, groupOf };
  for (const groupId of readdirSync(catFolder)) {
    const file = join(catFolder, groupId, 'prices');
    if (!existsSync(file)) continue;
    let json;
    try { json = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
    for (const [key, price] of parsePrices(json)) {
      prices.set(key, price);
      groupOf.set(Number(key.slice(0, key.indexOf('|'))), Number(groupId));
    }
  }
  return { prices, groupOf };
}

async function restCall(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function saveGame(game, rows, runAt) {
  for (let i = 0; i < rows.length; i += 500) {
    await restCall('POST', 'market_movers?on_conflict=product_id,sub_type', rows.slice(i, i + 500));
  }
  // This game's rows this run didn't refresh (no longer climbing).
  await restCall('DELETE', `market_movers?game=eq.${encodeURIComponent(game)}&updated_at=lt.${encodeURIComponent(runAt)}`);
}

async function main() {
  if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const dir = mkdtempSync(join(tmpdir(), 'market-'));
  try {
    const stamp = String(await get(`${TCGCSV}/last-updated.txt`, 'buffer') || '').trim();
    let newDay = /^\d{4}-\d{2}-\d{2}/.test(stamp) ? stamp.slice(0, 10) : new Date().toISOString().slice(0, 10);
    let newFolder = await unpackDay(newDay, dir);
    if (!newFolder) {
      newDay = dayBefore(newDay, 1);
      newFolder = await unpackDay(newDay, dir);
    }
    const oldDay = dayBefore(newDay, WINDOW_DAYS);
    const oldFolder = await unpackDay(oldDay, dir);
    if (!newFolder || !oldFolder) throw new Error(`No archive for ${newDay} or ${oldDay}`);
    console.log(`Comparing ${oldDay} -> ${newDay}`);

    const runAt = new Date().toISOString();
    const summary = {};
    let failed = 0;
    for (const [categoryId, game] of Object.entries(GAME_BY_CATEGORY)) {
      try {
        const before = readCategory(oldFolder, categoryId);
        const now = readCategory(newFolder, categoryId);
        const climbers = findClimbers(before.prices, now.prices);
        // Group the climbers by set, biggest climb first, and look sets up
        // until there are enough single cards.
        const byGroup = new Map();
        for (const c of climbers) {
          const g = now.groupOf.get(c.productId);
          if (!byGroup.has(g)) byGroup.set(g, []);
          byGroup.get(g).push(c);
        }
        const groups = await get(`${TCGCSV}/tcgplayer/${categoryId}/groups`);
        const groupName = new Map((groups?.results || []).map(g => [g.groupId, g.name]));
        const rows = [];
        for (const [groupId, list] of byGroup) {
          if (rows.length >= MAX_PER_GAME) break;
          await sleep(PAUSE_MS);
          const products = await get(`${TCGCSV}/tcgplayer/${categoryId}/${groupId}/products`);
          const byId = new Map((products?.results || []).map(p => [p.productId, p]));
          for (const c of list) {
            const row = moverRow(c, byId.get(c.productId), groupName.get(groupId), game, runAt);
            if (row) rows.push(row);
          }
        }
        rows.sort((a, b) => (b.new_price - b.old_price) - (a.new_price - a.old_price));
        const kept = rows.slice(0, MAX_PER_GAME);
        summary[game] = { climbers: climbers.length, singles: rows.length, saved: kept.length };
        if (DRY_RUN) {
          summary[game].top = kept.slice(0, 3).map(r => `${r.name} (${r.set_name}) ${r.sub_type} $${r.old_price}->$${r.new_price}`);
        } else {
          await saveGame(game, kept, runAt);
        }
      } catch (e) {
        failed++;
        summary[game] = { error: String(e.message || e) };
      }
    }
    console.log(JSON.stringify({ oldDay, newDay, summary }, null, 2));
    if (failed) process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exitCode = 1;
});
