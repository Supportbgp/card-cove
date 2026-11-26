// meta-check (CLAUDE.md "Hot cards"): counts how often each card shows up in
// recent tournament decklists, so a quote row can say a card is sought
// after. Called once per job by .github/workflows/meta-check.yml (daily),
// never by the browser, so there's no CORS allowlist; only the service-role
// key may call it (auth.ts), same as price-check.
//
// Sources, each checked against real responses before it was added
// (CLAUDE.md "Hot cards" and "Hot cards: more tournament sources"):
//   * Limitless (play.limitlesstcg.com/api): no key needed, 50 requests per
//     5 minutes. Pokemon and One Piece. Decklists are structured:
//     { section: [{ count, name, set, number }] }.
//   * TopDeck.gg (topdeck.gg/api/v2): needs the TOPDECK_API_KEY secret
//     (`supabase secrets set TOPDECK_API_KEY=...`; their terms say the key
//     must stay server-side). 5 searches per minute. Magic Commander and
//     Legacy, Riftbound. Their terms also require a visible "Data provided
//     by TopDeck.gg" credit wherever the data is shown (HotNotice/
//     HotCardsModal do this).
//   * Egman's deckbuilder (deckbuilder.egmanevents.com): Gundam. Top-cut
//     lists from events plus store/ranking lists, as card codes.
//   * Yu-Gi-Oh! Meta (yugiohmeta.com/api/v1): Yu-Gi-Oh Advanced (TCG).
//   * SWU Meta Stats (swumetastats.com/api, a documented public API):
//     Star Wars: Unlimited Premier, already counted per card.
//   * MTGODecklistCache (github.com/Jiliac/MTGODecklistCache): Magic Modern,
//     Standard and Pioneer results from MTGO, updated weekly. The workflow
//     lists the files (GitHub's API, with its own token) and sends only the
//     paths; this function checks each path's shape before fetching it.
// Egman, Yu-Gi-Oh! Meta and the MTGO cache are used with their owners' OK.
// Only card counts are stored, never player names or anything personal.
//
// One job = one source + game + format, so each call stays well inside the
// Edge Function's 150s limit and one API's rate limit at a time. Each job
// replaces its own rows in meta_cards.
//
// Deploy with: supabase functions deploy meta-check

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceRoleRequest } from "./auth.ts";
import {
  limitlessDeckCards, topdeckDeckCards, egmanDeckCards, ygometaDeckCards, isYgoAdvancedDeck, mtgoDeckCards,
  mtgoPathsFor, swuUsageRows, cardCode, newTally, addDeck, tallyRows,
} from "./decks.ts";

const WINDOW_DAYS = 30;
const LIMITLESS = "https://play.limitlesstcg.com/api";
const TOPDECK = "https://topdeck.gg/api/v2/tournaments";
const EGMAN = "https://deckbuilder.egmanevents.com/api";
const YGOMETA = "https://www.yugiohmeta.com/api/v1";
const SWUMETA = "https://swumetastats.com/api";
const MTGO_RAW = "https://raw.githubusercontent.com/Jiliac/MTGODecklistCache/master/Tournaments/mtgo.com_limited_data/";
const MTGO_CONCURRENCY = 6;
const UA = "card-cove-meta-check";
// Limitless lists 50 events per page, newest first. A busy game (Pokemon:
// ~50 events in 3 days) won't reach back 30 days within these pages; the
// biggest events in what was read are enough of a sample.
const LIMITLESS_MAX_PAGES = 4;
const LIMITLESS_MAX_EVENTS = 12;
const LIMITLESS_MIN_PLAYERS = 8;
// Stop starting new requests after this, leaving time to write the rows.
const TIME_BUDGET_MS = 110_000;

// windowDays: how far back to count, when not WINDOW_DAYS.
type Job =
  | { source: "limitless"; id: string; game: string; format: string; windowDays?: number }
  | { source: "topdeck"; tdGame: string; game: string; format: string; windowDays?: number }
  | { source: "egman"; egGame: string; game: string; format: string; windowDays?: number }
  | { source: "ygometa"; game: string; format: string; windowDays?: number }
  | { source: "swumeta"; game: string; format: string; windowDays?: number }
  | { source: "mtgo"; prefix: string; game: string; format: string; windowDays?: number };

// Interleaved so consecutive jobs hit different sites (Limitless and
// TopDeck.gg have rate limits). Dropped after the first weeks of real runs
// because they returned nothing: Limitless SWU/Gundam/Lorcana/Riftbound and
// TopDeck.gg Modern/Standard/Pioneer/Yu-Gi-Oh/Lorcana (covered by the
// sources above now, except Lorcana, which has no usable source yet).
export const JOBS: Job[] = [
  { source: "limitless", id: "PTCG", game: "Pokemon", format: "STANDARD" },
  // Commander is huge: 30 days was a 70 MB response (~7,200 decklists) and
  // ran out of Edge Function compute on the first real run. 7 days is ~11 MB
  // and ~1,100 decklists, still plenty for a share.
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "EDH", windowDays: 7 },
  { source: "limitless", id: "OP", game: "One Piece", format: "" },
  { source: "swumeta", game: "SWU", format: "Premier" },
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "Legacy" },
  { source: "mtgo", prefix: "modern", game: "Magic", format: "Modern" },
  { source: "egman", egGame: "gundam", game: "Gundam", format: "" },
  { source: "topdeck", tdGame: "Riftbound", game: "Riftbound", format: "Constructed" },
  { source: "mtgo", prefix: "standard", game: "Magic", format: "Standard" },
  { source: "ygometa", game: "Yugioh", format: "Advanced" },
  { source: "mtgo", prefix: "pioneer", game: "Magic", format: "Pioneer" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

class RateLimited extends Error {}

async function limitlessGet(path: string) {
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "card-cove-meta-check" };
  const key = Deno.env.get("LIMITLESS_API_KEY");
  if (key) headers["X-Access-Key"] = key;
  let res = await fetch(LIMITLESS + path, { headers });
  if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 800));
    res = await fetch(LIMITLESS + path, { headers });
  }
  if (res.status === 429) throw new RateLimited("Limitless rate limit reached");
  if (!res.ok) throw new Error(`Limitless ${res.status} for ${path}`);
  return res.json();
}

async function runLimitless(job: Extract<Job, { source: "limitless" }>, started: number) {
  const cutoff = Date.now() - (job.windowDays ?? WINDOW_DAYS) * 86400000;
  const events: { id: string; players: number }[] = [];
  for (let page = 1; page <= LIMITLESS_MAX_PAGES; page++) {
    const fmt = job.format ? `&format=${encodeURIComponent(job.format)}` : "";
    const list = await limitlessGet(`/tournaments?game=${encodeURIComponent(job.id)}${fmt}&limit=50&page=${page}`);
    if (!Array.isArray(list) || list.length === 0) break;
    let reachedCutoff = false;
    for (const t of list) {
      if (new Date(t.date).getTime() < cutoff) { reachedCutoff = true; continue; }
      if ((t.players || 0) >= LIMITLESS_MIN_PLAYERS) events.push({ id: t.id, players: t.players });
    }
    if (reachedCutoff || list.length < 50) break;
  }
  const picked = events.sort((a, b) => b.players - a.players).slice(0, LIMITLESS_MAX_EVENTS);
  const tally = newTally();
  let counted = 0;
  for (const e of picked) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const standings = await limitlessGet(`/tournaments/${encodeURIComponent(e.id)}/standings`);
    if (!Array.isArray(standings)) continue;
    for (const p of standings) if (p?.decklist) addDeck(tally, job.game, limitlessDeckCards(p.decklist));
    counted++;
  }
  return { tally, events: counted };
}

async function runTopdeck(job: Extract<Job, { source: "topdeck" }>) {
  const key = Deno.env.get("TOPDECK_API_KEY");
  if (!key) throw new Error("TOPDECK_API_KEY secret is not set");
  const res = await fetch(TOPDECK, {
    method: "POST",
    headers: { Authorization: key, "Content-Type": "application/json" },
    body: JSON.stringify({ game: job.tdGame, format: job.format, last: job.windowDays ?? WINDOW_DAYS, columns: ["decklist"] }),
  });
  if (res.status === 429) throw new RateLimited("TopDeck.gg rate limit reached");
  if (!res.ok) throw new Error(`TopDeck.gg ${res.status}`);
  const tournaments = await res.json();
  const tally = newTally();
  let events = 0;
  for (const t of Array.isArray(tournaments) ? tournaments : []) {
    events++;
    for (const p of t?.standings || []) addDeck(tally, job.game, topdeckDeckCards(p));
  }
  return { tally, events };
}

// A JSON GET with one retry on a server error.
async function getJson(url: string, label: string) {
  const headers = { Accept: "application/json", "User-Agent": UA };
  let res = await fetch(url, { headers });
  if (res.status >= 500) {
    await new Promise((r) => setTimeout(r, 800));
    res = await fetch(url, { headers });
  }
  if (res.status === 429) throw new RateLimited(`${label} rate limit reached`);
  if (!res.ok) throw new Error(`${label} ${res.status}`);
  return res.json();
}

function isoDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

async function runEgman(job: Extract<Job, { source: "egman" }>) {
  const cutoff = isoDay(Date.now() - (job.windowDays ?? WINDOW_DAYS) * 86400000);
  const [cards, tournaments, standalone] = await Promise.all([
    getJson(`${EGMAN}/cards/${job.egGame}`, "Egman cards"),
    getJson(`${EGMAN}/tournaments/${job.egGame}`, "Egman tournaments"),
    getJson(`${EGMAN}/standalone/${job.egGame}`, "Egman decklists"),
  ]);
  const nameByCode = new Map<string, string>();
  for (const c of Array.isArray(cards) ? cards : []) {
    const code = cardCode("", c?.card_code);
    if (code && c?.name && !nameByCode.has(code)) nameByCode.set(code, String(c.name));
  }
  const tally = newTally();
  const events = new Set<string>();
  for (const t of Array.isArray(tournaments) ? tournaments : []) {
    if (!t?.start_date || t.start_date < cutoff) continue;
    events.add(`t:${t.id}`);
    for (const r of t.tournament_results || []) {
      const url = Array.isArray(r?.deck_list_url) ? r.deck_list_url[0] : r?.deck_list_url;
      addDeck(tally, job.game, egmanDeckCards(url, nameByCode));
    }
  }
  for (const d of Array.isArray(standalone) ? standalone : []) {
    if (!d?.date || d.date < cutoff) continue;
    events.add(`s:${d.source}|${d.date}`);
    const url = Array.isArray(d.deck_list_url) ? d.deck_list_url[0] : d.deck_list_url;
    addDeck(tally, job.game, egmanDeckCards(url, nameByCode));
  }
  return { tally, events: events.size };
}

async function runYgometa(job: Extract<Job, { source: "ygometa" }>) {
  const cutoff = isoDay(Date.now() - (job.windowDays ?? WINDOW_DAYS) * 86400000);
  const decks = await getJson(`${YGOMETA}/top-decks?created%5B%24gte%5D=${cutoff}&limit=0`, "Yu-Gi-Oh! Meta");
  const tally = newTally();
  const events = new Set<string>();
  for (const d of Array.isArray(decks) ? decks : []) {
    if (!isYgoAdvancedDeck(d)) continue;
    if (d?.event?._id) events.add(d.event._id);
    addDeck(tally, job.game, ygometaDeckCards(d));
  }
  return { tally, events: events.size };
}

// SWU Meta Stats counts usage itself, so this returns rows, not a tally.
async function runSwumeta(job: Extract<Job, { source: "swumeta" }>) {
  const now = Date.now();
  const range = `startDate=${isoDay(now - (job.windowDays ?? WINDOW_DAYS) * 86400000)}&endDate=${isoDay(now)}` +
    `&format=${encodeURIComponent(job.format)}`;
  const [decklists, tournaments] = await Promise.all([
    getJson(`${SWUMETA}/decklists?${range}&take=1`, "SWU Meta Stats"),
    getJson(`${SWUMETA}/tournaments?${range}`, "SWU Meta Stats"),
  ]);
  const totalDecks = Math.trunc(Number(decklists?.totalCount) || 0);
  const cards: unknown[] = [];
  // Sorted by usage, so stop once a page's last card is under 5% of decks.
  for (let page = 0; page < 3 && totalDecks > 0; page++) {
    const res = await getJson(
      `${SWUMETA}/cards?type=all&includeUsage=true&sortBy=usage&sortDir=desc&pageSize=200&page=${page}&${range}`,
      "SWU Meta Stats",
    );
    const list = Array.isArray(res?.cards) ? res.cards : [];
    cards.push(...list);
    const last = list[list.length - 1];
    if (!res?.hasMore || !last || Number(last?.usage?.appearances || 0) < totalDecks * 0.05) break;
  }
  return { rows: swuUsageRows(cards, totalDecks), totalDecks, events: Math.trunc(Number(tournaments?.totalCount) || 0) };
}

async function runMtgo(job: Extract<Job, { source: "mtgo" }>, files: unknown, started: number) {
  const paths = mtgoPathsFor(files, job.prefix, Date.now() - (job.windowDays ?? WINDOW_DAYS) * 86400000);
  if (paths.length === 0) throw new Error("No MTGO files sent for this format (the workflow lists them)");
  const tally = newTally();
  let events = 0;
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      if (Date.now() - started > TIME_BUDGET_MS) return;
      const path = paths[next++];
      const data = await getJson(MTGO_RAW + path, "MTGO cache");
      events++;
      for (const d of Array.isArray(data?.Decks) ? data.Decks : []) addDeck(tally, job.game, mtgoDeckCards(d));
    }
  };
  await Promise.all(Array.from({ length: MTGO_CONCURRENCY }, worker));
  return { tally, events };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isServiceRoleRequest(req, serviceKey)) return json({ error: "Service role only" }, 401);

  let body: { job?: number; mtgoFiles?: unknown } = {};
  try { body = await req.json(); } catch { /* no body: job 0 */ }
  const jobIndex = Number.isInteger(body.job) ? Number(body.job) : 0;
  const job = JOBS[jobIndex];
  if (!job) return json({ error: `No job ${jobIndex}`, jobs: JOBS.length }, 400);
  const label = { job: jobIndex, source: job.source, game: job.game, format: job.format, last: jobIndex === JOBS.length - 1 };

  const started = Date.now();
  let tallied: { nameKey: string; code: string; name: string; decks: number; copies: number }[];
  let totalDecks: number;
  let events: number;
  try {
    if (job.source === "swumeta") {
      const r = await runSwumeta(job);
      tallied = r.rows; totalDecks = r.totalDecks; events = r.events;
    } else {
      const r = job.source === "limitless" ? await runLimitless(job, started)
        : job.source === "topdeck" ? await runTopdeck(job)
        : job.source === "egman" ? await runEgman(job)
        : job.source === "ygometa" ? await runYgometa(job)
        : await runMtgo(job, body.mtgoFiles, started);
      tallied = tallyRows(r.tally); totalDecks = r.tally.totalDecks; events = r.events;
    }
  } catch (e) {
    // Nothing is written on a failure, so yesterday's rows for this job stay.
    const rateLimited = e instanceof RateLimited;
    return json({ ...label, error: String((e as Error).message || e), rateLimited }, rateLimited ? 429 : 502);
  }

  const runAt = new Date().toISOString();
  const rows = tallied.map((r) => ({
    source: job.source, game: job.game, format: job.format,
    name: r.name, name_key: r.nameKey, code: r.code, decks: r.decks, copies: r.copies,
    total_decks: totalDecks, events,
    window_days: job.windowDays ?? WINDOW_DAYS, updated_at: runAt,
  }));

  // Save this run's rows first, then remove the ones it didn't refresh
  // (cards that dropped out), so a failed save never empties a game.
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey!);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("meta_cards")
      .upsert(rows.slice(i, i + 500), { onConflict: "source,game,format,name_key,code" });
    if (error) return json({ ...label, error: "Saving rows failed: " + error.message }, 500);
  }
  const { error: delError } = await admin.from("meta_cards").delete()
    .eq("source", job.source).eq("game", job.game).eq("format", job.format).lt("updated_at", runAt);
  if (delError) return json({ ...label, error: "Removing old rows failed: " + delError.message }, 500);
  // Rows no job has refreshed in 3 days (a job dropped from JOBS, or one
  // failing every day) are out of date: remove them so they stop flagging.
  await admin.from("meta_cards").delete().lt("updated_at", new Date(Date.now() - 3 * 86400000).toISOString());

  return json({ ...label, events, decks: totalDecks, stored: rows.length, ms: Date.now() - started });
});
