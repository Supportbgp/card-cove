import { useEffect, useRef, useState } from 'react';
import { isStaffUser } from '../../lib/staffAccess.js';
import {
  signInWithDiscord, signOutMember, isDiscordUser, memberStatus, memberName, verifyMembership,
  getCurrentSession, onSessionChange,
} from '../../lib/memberAuth.js';

// The sign-in strip on the public stock page (CLAUDE.md "Discord sign-in
// for members"). Right after a Discord sign-in the session carries
// Discord's token (once, never stored), so that's when the BGP server
// check runs.
export default function MemberBar() {
  const [session, setSession] = useState(undefined);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState(null);
  const checkedRef = useRef(false);

  async function check(s) {
    if (checkedRef.current || !s || !s.provider_token || !isDiscordUser(s.user) || isStaffUser(s.user)) return;
    checkedRef.current = true;
    setChecking(true);
    setError('');
    try {
      const result = await verifyMembership(s.provider_token);
      if (result.session) setSession(result.session);
      setInviteUrl(result.inviteUrl);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    let active = true;
    getCurrentSession().then((s) => {
      if (!active) return;
      setSession(s);
      check(s);
    });
    const unsubscribe = onSessionChange((event, s) => {
      setSession(s);
      // supabase-js asks not to call it again from inside this callback.
      if (event === 'SIGNED_IN') setTimeout(() => check(s), 0);
    });
    return () => { active = false; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}?shop=1`;
  function signIn() {
    setError('');
    signInWithDiscord(redirectTo).then(({ error: e }) => { if (e) setError(e.message); });
  }
  async function signOut() {
    await signOutMember();
    checkedRef.current = false;
    setSession(null);
    setInviteUrl(null);
    setError('');
  }

  if (session === undefined) return null;
  const status = memberStatus(session);
  const name = memberName(session);

  let content;
  if (status === 'staff') {
    content = <span className="member-bar-text">Signed in as staff.</span>;
  } else if (status === 'signed_out') {
    content = (
      <>
        <span className="member-bar-text">BGP Discord members can sign in.</span>
        <button className="btn small" onClick={signIn}>Sign in with Discord</button>
      </>
    );
  } else if (checking) {
    content = <span className="member-bar-text"><span className="spinner" /> Checking your BGP Discord membership…</span>;
  } else if (status === 'member') {
    content = (
      <>
        <span className="member-bar-text">Signed in as <strong>{name || 'a member'}</strong> · BGP Discord member</span>
        <button className="btn ghost small" onClick={signOut}>Sign out</button>
      </>
    );
  } else if (status === 'not_member') {
    content = (
      <>
        <span className="member-bar-text">
          {name ? <strong>{name}</strong> : 'This account'} isn't in the BGP Discord server.{' '}
          {inviteUrl ? <a href={inviteUrl} target="_blank" rel="noreferrer">Join the server</a> : 'Join the server'}, then sign in again.
        </span>
        <button className="btn small" onClick={signIn}>Sign in again</button>
        <button className="btn ghost small" onClick={signOut}>Sign out</button>
      </>
    );
  } else {
    content = (
      <>
        <span className="member-bar-text">We couldn't check your BGP Discord membership. Sign in again to retry.</span>
        <button className="btn small" onClick={signIn}>Sign in again</button>
        <button className="btn ghost small" onClick={signOut}>Sign out</button>
      </>
    );
  }

  return (
    <div className="member-bar">
      {content}
      {error && <div className="member-bar-error">{error}</div>}
    </div>
  );
}
