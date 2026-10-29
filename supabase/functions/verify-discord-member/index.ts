// Checks that a Discord-signed-in visitor is a member of the BGP Discord
// server, and records the answer on their login (bounties Phase 2, see
// CLAUDE.md "Discord sign-in for members").
//
// Right after a Discord sign-in the browser holds Discord's own access
// token (Supabase hands it over once and never stores it). The app sends it
// here; this function asks Discord, with that token, whether the user is in
// the server (GET /users/@me/guilds/{guild}/member, scope
// guilds.members.read), then writes app_metadata.member (true/false) plus
// the Discord id/name and when it checked. app_metadata can only be written
// with the service-role key, so a visitor can't mark themselves a member.
// The staff flag is copied through unchanged and never set here.
//
// Deploy from the repo root with:
//   supabase functions deploy verify-discord-member
// Secrets (Edge Functions -> Secrets, or supabase secrets set):
//   DISCORD_GUILD_ID     the BGP server's id (required)
//   DISCORD_INVITE_URL   an invite link shown to non-members (optional)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://supportbgp.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
];

// Same dev-origin rule as scan-binder-page/card-lookup-proxy (a phone on
// the LAN reaches `npm run dev -- --host` from a private-IP origin).
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

const DISCORD_API = "https://discord.com/api/v10";

function discordGet(path, providerToken) {
  return fetch(`${DISCORD_API}${path}`, { headers: { Authorization: `Bearer ${providerToken}` } });
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin") || "");
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const guildId = Deno.env.get("DISCORD_GUILD_ID");
    if (!url || !serviceKey || !guildId) {
      return json({ error: "Server not configured (missing DISCORD_GUILD_ID secret)" }, 500, headers);
    }
    const admin = createClient(url, serviceKey);

    const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Not signed in" }, 401, headers);

    const identity = (user.identities || []).find((i) => i.provider === "discord");
    if (!identity) return json({ error: "Not a Discord sign-in" }, 400, headers);

    const { providerToken } = await req.json().catch(() => ({}));
    if (!providerToken) return json({ error: "Missing Discord token, sign in again" }, 400, headers);

    // The Discord token must belong to the same Discord account as this login.
    const meRes = await discordGet("/users/@me", providerToken);
    if (!meRes.ok) return json({ error: "Discord sign-in expired, sign in again" }, 401, headers);
    const me = await meRes.json();
    const ownIds = [identity.id, identity.identity_data?.provider_id, identity.identity_data?.sub].filter(Boolean).map(String);
    if (!ownIds.includes(String(me.id))) {
      return json({ error: "That Discord account doesn't match this sign-in" }, 403, headers);
    }

    const memberRes = await discordGet(`/users/@me/guilds/${guildId}/member`, providerToken);
    let member;
    if (memberRes.ok) member = true;
    // Not in the server. Discord's docs don't name the status for this, so
    // 404 (unknown guild/member) is the only one read as "not a member";
    // anything else is reported as an error instead of a guess.
    else if (memberRes.status === 404) member = false;
    else if (memberRes.status === 401 || memberRes.status === 403) {
      return json({ error: "Discord didn't allow the server check, sign in again" }, 502, headers);
    } else {
      return json({ error: `Discord server check failed (${memberRes.status}), try again` }, 502, headers);
    }

    const name = me.global_name || me.username || "";
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...(user.app_metadata || {}),
        member,
        discord_id: String(me.id),
        discord_name: name,
        member_checked_at: new Date().toISOString(),
      },
    });
    if (updateError) return json({ error: `Couldn't save the check: ${updateError.message}` }, 500, headers);

    return json({
      member,
      name,
      inviteUrl: member ? null : (Deno.env.get("DISCORD_INVITE_URL") || null),
    }, 200, headers);
  } catch (err) {
    return json({ error: String(err) }, 500, headers);
  }
});
