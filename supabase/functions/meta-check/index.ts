// meta-check (CLAUDE.md "Hot cards"): counts how often each card shows up in
// recent tournament decklists, so a quote row can say a card is sought
// after. Called once per job by .github/workflows/meta-check.yml (daily),
// never by the browser, so there's no CORS allowlist; only the service-role
// key may call it (auth.ts), same as price-check.
//
// Two sources, both checked against real responses before this was built:
//   * Limitless (play.limitlesstcg.com/api): no key needed, 50 requests per
//     5 minutes. Pokemon, One Piece, SWU, Gundam, Lorcana, Riftbound.
//     Decklists are structured: { section: [{ count, name, set, number }] }.
//   * TopDeck.gg (topdeck.gg/api/v2): needs the TOPDECK_API_KEY secret
//     (`supabase secrets set TOPDECK_API_KEY=...`; their terms say the key
//     must stay server-side). 5 searches per minute. Magic, Yu-Gi-Oh,
//     Riftbound, Lorcana. Their terms also require a visible "Data provided
//     by TopDeck.gg" credit wherever the data is shown (HotNotice/
//     HotCardsModal do this).
// Only card counts are stored, never player names or anything personal.
//
// One job = one source + game + format, so each call stays well inside the
// Edge Function's 150s limit and one API's rate limit at a time. Each job
// replaces its own rows in meta_cards.
//
// Deploy with: supabase functions deploy meta-check

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isServiceRoleRequest } from "./auth.ts";
import { limitlessDeckCards, topdeckDeckCards, newTally, addDeck, tallyRows } from "./decks.ts";

const WINDOW_DAYS = 30;
const LIMITLESS = "https://play.limitlesstcg.com/api";
const TOPDECK = "https://topdeck.gg/api/v2/tournaments";
// Limitless lists 50 events per page, newest first. A busy game (Pokemon:
// ~50 events in 3 days) won't reach back 30 days within these pages; the
// biggest events in what was read are enough of a sample.
const LIMITLESS_MAX_PAGES = 4;
const LIMITLESS_MAX_EVENTS = 12;
const LIMITLESS_MIN_PLAYERS = 8;
// Stop starting new requests after this, leaving time to write the rows.
const TIME_BUDGET_MS = 110_000;

type Job =
  | { source: "limitless"; id: string; game: string; format: string }
  | { source: "topdeck"; tdGame: string; game: string; format: string };

// Interleaved so consecutive jobs hit different APIs (each has its own
// rate limit). Only the TopDeck game/format names confirmed against real
// responses are listed; One Piece, SWU and Gundam come from Limitless.
export const JOBS: Job[] = [
  { source: "limitless", id: "PTCG", game: "Pokemon", format: "STANDARD" },
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "EDH" },
  { source: "limitless", id: "OP", game: "One Piece", format: "" },
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "Legacy" },
  { source: "limitless", id: "SWU", game: "SWU", format: "" },
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "Modern" },
  { source: "limitless", id: "GUNDAM", game: "Gundam", format: "" },
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "Standard" },
  { source: "limitless", id: "LORCANA", game: "Lorcana", format: "" },
  { source: "topdeck", tdGame: "Magic: The Gathering", game: "Magic", format: "Pioneer" },
  { source: "limitless", id: "RB", game: "Riftbound", format: "" },
  { source: "topdeck", tdGame: "Yu-Gi-Oh", game: "Yugioh", format: "Advanced" },
  { source: "topdeck", tdGame: "Riftbound", game: "Riftbound", format: "Constructed" },
  { source: "topdeck", tdGame: "Lorcana", game: "Lorcana", format: "Core Constructed" },
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
  const cutoff = Date.now() - WINDOW_DAYS * 86400000;
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
    body: JSON.stringify({ game: job.tdGame, format: job.format, last: WINDOW_DAYS, columns: ["decklist"] }),
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!isServiceRoleRequest(req, serviceKey)) return json({ error: "Service role only" }, 401);

  let body: { job?: number } = {};
  try { body = await req.json(); } catch { /* no body: job 0 */ }
  const jobIndex = Number.isInteger(body.job) ? Number(body.job) : 0;
  const job = JOBS[jobIndex];
  if (!job) return json({ error: `No job ${jobIndex}`, jobs: JOBS.length }, 400);
  const label = { job: jobIndex, source: job.source, game: job.game, format: job.format, last: jobIndex === JOBS.length - 1 };

  const started = Date.now();
  let result;
  try {
    result = job.source === "limitless" ? await runLimitless(job, started) : await runTopdeck(job);
  } catch (e) {
    // Nothing is written on a failure, so yesterday's rows for this job stay.
    const rateLimited = e instanceof RateLimited;
    return json({ ...label, error: String((e as Error).message || e), rateLimited }, rateLimited ? 429 : 502);
  }

  const runAt = new Date().toISOString();
  const rows = tallyRows(result.tally).map((r) => ({
    source: job.source, game: job.game, format: job.format,
    name: r.name, name_key: r.nameKey, code: r.code, decks: r.decks, copies: r.copies,
    total_decks: result.tally.totalDecks, events: result.events,
    window_days: WINDOW_DAYS, updated_at: runAt,
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

  return json({ ...label, events: result.events, decks: result.tally.totalDecks, stored: rows.length, ms: Date.now() - started });
});
