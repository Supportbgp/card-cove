import { supabaseClient } from './supabase.js';

// Staff-only access (CLAUDE.md "Staff-only access"). The database decides
// for real (every table's rule is is_staff(), from the login's
// app_metadata.staff flag); this is only so the app can say "this login has
// no staff access" instead of showing an empty catalog that looks like lost
// data.
export function isStaffUser(user) {
  return !!(user && user.app_metadata && user.app_metadata.staff === true);
}

// The current login, refreshed first so a staff flag set since the last
// sign-in (e.g. right after the phase18 migration) is already in the token
// the database sees. If the refresh fails (offline), the saved session is
// used as is. Returns { signedIn, staff }.
export async function loadSession() {
  const { data } = await supabaseClient.auth.getSession();
  let session = data && data.session;
  if (!session) return { signedIn: false, staff: false };
  try {
    const refreshed = await supabaseClient.auth.refreshSession();
    if (refreshed && refreshed.data && refreshed.data.session) session = refreshed.data.session;
  } catch {
    // keep the saved session
  }
  return { signedIn: true, staff: isStaffUser(session.user) };
}
