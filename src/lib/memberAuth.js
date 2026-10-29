import { supabaseClient } from './supabase.js';
import { isStaffUser } from './staffAccess.js';

// Discord sign-in for members (CLAUDE.md "Discord sign-in for members").
// Members sign in on the public stock page; staff keep the shop's password
// login. guilds.members.read is what lets verify-discord-member ask Discord
// whether the user is in the BGP server.
const DISCORD_SCOPES = 'identify guilds.members.read';

export function signInWithDiscord(redirectTo) {
  return supabaseClient.auth.signInWithOAuth({
    provider: 'discord',
    options: { scopes: DISCORD_SCOPES, redirectTo },
  });
}

// Components go through these rather than importing supabase.js
// themselves (the e2e harness swaps that module by its import path).
export async function getCurrentSession() {
  const { data } = await supabaseClient.auth.getSession();
  return data.session;
}

export function onSessionChange(callback) {
  const { data } = supabaseClient.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

export function signOutMember() {
  return supabaseClient.auth.signOut();
}

export function isDiscordUser(user) {
  if (!user) return false;
  const meta = user.app_metadata || {};
  return meta.provider === 'discord' || (meta.providers || []).includes('discord');
}

// What a session means on the public pages:
//   'signed_out' | 'staff' | 'member' | 'not_member' | 'unchecked'
// 'unchecked' is a Discord login whose server membership hasn't been
// recorded yet (the check runs right after signing in).
export function memberStatus(session) {
  const user = session && session.user;
  if (!user) return 'signed_out';
  if (isStaffUser(user)) return 'staff';
  const meta = user.app_metadata || {};
  if (meta.member === true) return 'member';
  if (meta.member === false) return 'not_member';
  return 'unchecked';
}

export function memberName(session) {
  const user = session && session.user;
  if (!user) return '';
  const meta = user.user_metadata || {};
  return (user.app_metadata || {}).discord_name || meta.full_name || meta.name || meta.user_name || '';
}

// Asks verify-discord-member to check the server membership with the
// Discord token from this sign-in, then refreshes the login so the result
// (written to app_metadata) is in the session. Returns
// { session, inviteUrl } or throws with a message to show.
export async function verifyMembership(providerToken) {
  const { data, error } = await supabaseClient.functions.invoke('verify-discord-member', {
    body: { providerToken },
  });
  if (error) {
    let message = error.message;
    try {
      const body = error.context && typeof error.context.json === 'function' ? await error.context.json() : null;
      if (body && body.error) message = body.error;
    } catch { /* keep the generic message */ }
    throw new Error(message);
  }
  const refreshed = await supabaseClient.auth.refreshSession();
  const session = refreshed && refreshed.data && refreshed.data.session;
  return { session, inviteUrl: (data && data.inviteUrl) || null };
}
