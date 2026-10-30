// Bounties: every change to a bounty goes through here (bounties Phase 3,
// see CLAUDE.md "Bounties"). Runs with the service-role key, applies the
// rules members can't be trusted to apply themselves, and posts to the
// shop's Discord channel.
//
// Actions (POST body { action, ... }):
//   create  { bounty }  BGP Discord members only; at most MAX_OPEN open,
//                       unexpired bounties each; open for EXPIRY_DAYS.
//                       Posted to Discord, mentioning the member.
//   cancel  { id }      the member who posted it (or staff).
//   renew   { id }      the member who posted it: another EXPIRY_DAYS from now.
//   fulfill { id }      staff only. Posted to Discord, mentioning the member.
//   remove  { id }      staff only. Not posted.
//   offer   { id, sku, price, note }  staff only (Phase 4): offers a catalog
//                       card; one copy is held for the member for
//                       HOLD_DAYS. Posted to Discord, mentioning the member.
//   accept  { id }      the member: keeps the hold for HOLD_DAYS more, to
//                       pick it up and pay in store.
//   decline { id }      the member: releases the hold.
//   withdraw { id }     staff only: takes the offer back, releases the hold.
//
// Closing a bounty (cancel/fulfill/remove) always releases its hold.
//
// Who the caller is comes from the auth server (not the token's claims), so
// a member flag or staff flag removed a moment ago already counts.
//
// Deploy from the repo root with:
//   supabase functions deploy bounties
// Secrets (Edge Functions -> Secrets, or supabase secrets set):
//   DISCORD_BOUNTY_WEBHOOK_URL  the channel's webhook (optional; without
//                               it nothing is posted)
//   PUBLIC_SHOP_URL             the public stock page, linked in posts
//                               (optional)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://supportbgp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

// Same dev-origin rule as the other functions (a phone on the LAN reaches
// `npm run dev -- --host` from a private-IP origin).
const DEV_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):(5173|4173)$/;

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || DEV_ORIGIN_RE.test(origin);
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "content-type": "application/json" },
  });
}

// Same values as src/lib/bounties.js (no code is shared with the app).
const MAX_OPEN = 10;
const EXPIRY_DAYS = 60;
const HOLD_DAYS = 7;
const GAMES = ["Magic", "Pokemon", "Yugioh", "Lorcana", "One Piece", "Sports Singles", "SWU", "Riftbound", "Gundam", "Other"];

function text(v, max) {
  return String(v ?? "").trim().slice(0, max);
}

function httpsUrl(v) {
  const s = text(v, 1000);
  return /^https:\/\//i.test(s) ? s : "";
}

// The fields a member may set, cleaned. Returns { row } or { error }.
function cleanBounty(input) {
  const b = input || {};
  const game = text(b.game, 40);
  if (!GAMES.includes(game)) return { error: "Pick a game" };
  const name = text(b.name, 150);
  if (!name) return { error: "Enter the card's name" };
  let maxPrice = null;
  if (b.maxPrice !== null && b.maxPrice !== undefined && String(b.maxPrice).trim() !== "") {
    maxPrice = Math.round(Number(b.maxPrice) * 100) / 100;
    if (!Number.isFinite(maxPrice) || maxPrice < 0 || maxPrice > 100000) return { error: "Max price must be a dollar amount" };
  }
  return {
    row: {
      game,
      name,
      set_name: text(b.set, 120),
      number: text(b.number, 40),
      rarity: text(b.rarity, 80),
      printing: text(b.printing, 80),
      condition: text(b.condition, 40),
      image_url: httpsUrl(b.imageUrl),
      max_price: maxPrice,
      notes: text(b.notes, 500),
    },
  };
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function expiresFromNow() {
  return daysFromNow(EXPIRY_DAYS);
}

function laterOf(a, b) {
  return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function money(n) {
  return `$${Number(n).toFixed(2)}`;
}

function cardLine(b) {
  const bits = [b.set_name, b.number ? `#${b.number}` : "", b.rarity, b.printing, b.condition].filter(Boolean);
  return bits.length ? bits.join(" · ") : "";
}

// Posts to the bounty channel. Never fails the action: returns whether it
// was posted.
async function postToDiscord(kind, bounty) {
  const webhook = Deno.env.get("DISCORD_BOUNTY_WEBHOOK_URL");
  if (!webhook) return false;
  const shopUrl = Deno.env.get("PUBLIC_SHOP_URL") || "";
  const mention = bounty.discord_id ? `<@${bounty.discord_id}>` : (bounty.discord_name || "A member");
  let content, embed;
  if (kind === "offered") {
    content = `${mention} the shop has a card for your bounty! Accept or decline it on the website within ${HOLD_DAYS} days.`;
    embed = {
      title: bounty.offer_name || bounty.name,
      description: [
        [bounty.offer_set, bounty.offer_condition, bounty.offer_printing].filter(Boolean).join(" · "),
        bounty.offer_price != null ? `Offered at ${money(bounty.offer_price)}` : "",
        bounty.offer_note ? `“${bounty.offer_note}”` : "",
      ].filter(Boolean).join("\n"),
    };
    const image = bounty.offer_image || bounty.image_url;
    if (image) embed.thumbnail = { url: image };
  } else {
    if (kind === "created") content = `New bounty from ${mention}`;
    else if (bounty.offer_status === "accepted") content = `Bounty fulfilled: ${mention} picked up their card. Enjoy!`;
    else content = `Bounty fulfilled: ${mention}, your card is in! Come by the shop to pick it up.`;
    embed = {
      title: bounty.name,
      description: [
        bounty.game,
        cardLine(bounty),
        bounty.max_price != null ? `Up to ${money(bounty.max_price)}` : "",
        kind === "created" && bounty.notes ? `“${bounty.notes}”` : "",
      ].filter(Boolean).join("\n"),
    };
    if (bounty.image_url) embed.thumbnail = { url: bounty.image_url };
  }
  if (shopUrl) embed.url = shopUrl;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        embeds: [embed],
        // Only ever ping the member the bounty belongs to.
        allowed_mentions: { parse: [], users: bounty.discord_id ? [bounty.discord_id] : [] },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin") || "");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Server not configured" }, 500, headers);
    const admin = createClient(url, serviceKey);

    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Sign in first" }, 401, headers);
    const meta = user.app_metadata || {};
    const isStaff = meta.staff === true;
    const isMember = meta.member === true;

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const nowIso = new Date().toISOString();

    async function openCount(excludeId) {
      let q = admin.from("bounties").select("id", { count: "exact", head: true })
        .eq("user_id", user.id).eq("status", "open").gt("expires_at", nowIso);
      if (excludeId) q = q.neq("id", excludeId);
      const { count, error } = await q;
      if (error) throw error;
      return count || 0;
    }

    if (action === "create") {
      if (!isMember) return json({ error: "Only BGP Discord members can post bounties" }, 403, headers);
      const { row, error: invalid } = cleanBounty(body.bounty);
      if (invalid) return json({ error: invalid }, 400, headers);
      if ((await openCount(null)) >= MAX_OPEN) {
        return json({ error: `You already have ${MAX_OPEN} open bounties. Cancel one to post another.` }, 409, headers);
      }
      const { data: created, error } = await admin.from("bounties").insert({
        ...row,
        user_id: user.id,
        discord_id: String(meta.discord_id || ""),
        discord_name: String(meta.discord_name || ""),
        status: "open",
        expires_at: expiresFromNow(),
      }).select().single();
      if (error) return json({ error: `Couldn't save the bounty: ${error.message}` }, 500, headers);
      const posted = await postToDiscord("created", created);
      return json({ bounty: created, posted }, 200, headers);
    }

    // Every other action works on one existing bounty.
    const id = text(body.id, 60);
    if (!id) return json({ error: "Missing bounty" }, 400, headers);
    const { data: bounty, error: loadError } = await admin.from("bounties").select("*").eq("id", id).maybeSingle();
    if (loadError) return json({ error: loadError.message }, 500, headers);
    if (!bounty) return json({ error: "That bounty doesn't exist" }, 404, headers);
    const isOwner = bounty.user_id === user.id;

    async function update(patch) {
      const { data, error } = await admin.from("bounties").update(patch).eq("id", id).select().single();
      if (error) throw error;
      return data;
    }

    // Frees whatever catalog copy is held for this bounty.
    async function releaseHold() {
      const { error } = await admin.from("catalog").update({ hold_bounty_id: null, hold_until: null }).eq("hold_bounty_id", id);
      if (error) throw error;
    }

    const offerLive = bounty.offer_status === "pending" && bounty.offer_expires_at
      && new Date(bounty.offer_expires_at).getTime() > Date.now();

    if (action === "cancel") {
      if (!isOwner && !isStaff) return json({ error: "Not your bounty" }, 403, headers);
      if (bounty.status !== "open") return json({ error: "That bounty is already closed" }, 409, headers);
      await releaseHold();
      return json({ bounty: await update({ status: "cancelled", closed_at: nowIso }) }, 200, headers);
    }

    if (action === "offer") {
      if (!isStaff) return json({ error: "Staff only" }, 403, headers);
      if (bounty.status !== "open") return json({ error: "That bounty is already closed" }, 409, headers);
      const sku = text(body.sku, 120);
      if (!sku) return json({ error: "Pick a card to offer" }, 400, headers);
      const { data: card, error: cardError } = await admin.from("catalog")
        .select("sku,name,set_name,condition,printing,image_url,photo_url,location,qty,sold,item_type,price,hold_bounty_id,hold_until")
        .eq("sku", sku).maybeSingle();
      if (cardError) return json({ error: cardError.message }, 500, headers);
      if (!card) return json({ error: "That card isn't in the catalog" }, 404, headers);
      if (card.sold || !(Number(card.qty) > 0)) return json({ error: "That card isn't in stock" }, 409, headers);
      if (card.item_type === "bulk") return json({ error: "A Bulk lot can't be offered" }, 400, headers);
      const heldElsewhere = card.hold_bounty_id && card.hold_bounty_id !== id
        && card.hold_until && new Date(card.hold_until).getTime() > Date.now();
      if (heldElsewhere) return json({ error: "That card is already held for another bounty" }, 409, headers);
      let price = card.price == null ? null : Number(card.price);
      if (body.price !== undefined && body.price !== null && String(body.price).trim() !== "") {
        price = Math.round(Number(body.price) * 100) / 100;
        if (!Number.isFinite(price) || price < 0 || price > 100000) return json({ error: "Price must be a dollar amount" }, 400, headers);
      }
      const offerExpires = daysFromNow(HOLD_DAYS);
      await releaseHold();
      const { error: holdError } = await admin.from("catalog")
        .update({ hold_bounty_id: id, hold_until: offerExpires }).eq("sku", sku);
      if (holdError) return json({ error: `Couldn't hold the card: ${holdError.message}` }, 500, headers);
      const updated = await update({
        offer_status: "pending",
        offer_sku: sku,
        offer_name: card.name || "",
        offer_set: card.set_name || "",
        offer_condition: card.condition || "",
        offer_printing: card.printing || "",
        offer_image: httpsUrl(card.image_url) || httpsUrl(card.photo_url) || bounty.image_url || "",
        offer_location: card.location || "",
        offer_price: price,
        offer_note: text(body.note, 500),
        offered_at: nowIso,
        offer_expires_at: offerExpires,
        offer_answered_at: null,
        expires_at: laterOf(bounty.expires_at, offerExpires),
      });
      const posted = await postToDiscord("offered", updated);
      return json({ bounty: updated, posted }, 200, headers);
    }

    if (action === "accept" || action === "decline") {
      if (!isOwner) return json({ error: "Not your bounty" }, 403, headers);
      if (bounty.status !== "open" || !offerLive) return json({ error: "That offer has expired or was withdrawn" }, 409, headers);
      if (action === "decline") {
        await releaseHold();
        return json({ bounty: await update({ offer_status: "declined", offer_answered_at: nowIso }) }, 200, headers);
      }
      // Accepted: the copy stays held while they come in to pay and pick it up.
      const pickupBy = daysFromNow(HOLD_DAYS);
      const { error: holdError } = await admin.from("catalog")
        .update({ hold_until: pickupBy }).eq("hold_bounty_id", id);
      if (holdError) return json({ error: holdError.message }, 500, headers);
      return json({
        bounty: await update({
          offer_status: "accepted",
          offer_answered_at: nowIso,
          offer_expires_at: pickupBy,
          expires_at: laterOf(bounty.expires_at, pickupBy),
        }),
      }, 200, headers);
    }

    if (action === "withdraw") {
      if (!isStaff) return json({ error: "Staff only" }, 403, headers);
      if (!["pending", "accepted"].includes(bounty.offer_status)) return json({ error: "There's no offer to withdraw" }, 409, headers);
      await releaseHold();
      return json({ bounty: await update({ offer_status: null, offer_answered_at: null }) }, 200, headers);
    }

    if (action === "renew") {
      if (!isOwner) return json({ error: "Not your bounty" }, 403, headers);
      if (!isMember) return json({ error: "Only BGP Discord members can renew bounties" }, 403, headers);
      if (bounty.status !== "open") return json({ error: "That bounty is already closed" }, 409, headers);
      if ((await openCount(id)) >= MAX_OPEN) {
        return json({ error: `You already have ${MAX_OPEN} open bounties. Cancel one to renew this one.` }, 409, headers);
      }
      return json({ bounty: await update({ expires_at: expiresFromNow() }) }, 200, headers);
    }

    if (action === "fulfill" || action === "remove") {
      if (!isStaff) return json({ error: "Staff only" }, 403, headers);
      if (bounty.status !== "open") return json({ error: "That bounty is already closed" }, 409, headers);
      await releaseHold();
      const updated = await update({ status: action === "fulfill" ? "fulfilled" : "removed", closed_at: nowIso });
      const posted = action === "fulfill" ? await postToDiscord("fulfilled", updated) : false;
      return json({ bounty: updated, posted }, 200, headers);
    }

    return json({ error: `Unknown action: ${action}` }, 400, headers);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500, headers);
  }
});
