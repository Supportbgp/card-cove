import { useEffect, useMemo, useState } from 'react';
import { dbLoadPublicBounties, dbLoadMyBounties } from '../../lib/db.js';
import {
  MAX_OPEN_BOUNTIES, BOUNTY_EXPIRY_DAYS, BOUNTY_STATE_LABELS, bountyState, bountyDaysLeft, countOpenBounties,
  bountyDetailLine, bountyPriceLabel, callBounties, offerDetailLine, offerLapsed,
} from '../../lib/bounties.js';
import { memberStatus } from '../../lib/memberAuth.js';
import BountyFormModal from './BountyFormModal.jsx';

const ACTIVE = ['open', 'expired', 'offered', 'accepted'];
// The member's own view of the states (an offer is for them, not "sent").
const MY_LABELS = { ...BOUNTY_STATE_LABELS, offered: 'Offer for you' };

const ACT_MESSAGES = {
  cancel: (b) => `Cancelled your bounty for ${b.name}.`,
  renew: (b) => `Renewed your bounty for ${b.name} for another ${BOUNTY_EXPIRY_DAYS} days.`,
  accept: (b) => `Accepted! The shop is holding ${b.offerName || b.name} for you: pay and pick it up in store.`,
  decline: () => "Declined the offer. Your bounty stays open.",
};

function formatDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '';
}

function BountyCard({ b, onZoom }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="binder-card bounty-card">
      <div className="binder-card-img-wrap">
        {b.imageUrl && !broken ? (
          <img src={b.imageUrl} alt="" className="binder-card-img" onClick={() => onZoom(b.imageUrl)} onError={() => setBroken(true)} />
        ) : (
          <div className="binder-card-img binder-card-img-empty">{b.game || 'No image'}</div>
        )}
      </div>
      <div className="binder-card-name">{b.name}</div>
      <div className="binder-card-sub">{[b.game, bountyDetailLine(b)].filter(Boolean).join(' · ')}</div>
      <div className="binder-card-row">
        <span className="mono">Wanted</span>
        <span className="mono">{bountyPriceLabel(b)}</span>
      </div>
    </div>
  );
}

// The Wanted section of the public stock page (CLAUDE.md "Bounties"): every
// open bounty without who asked, and for a signed-in BGP Discord member
// their own bounties plus "Post a bounty".
export default function WantedPanel({ session, onZoom }) {
  const [bounties, setBounties] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mine, setMine] = useState([]);
  const [query, setQuery] = useState('');
  const [game, setGame] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const status = memberStatus(session);
  const userId = session && session.user ? session.user.id : null;
  const isMember = status === 'member';

  function reloadPublic() {
    return dbLoadPublicBounties().then(setBounties).catch(err => setLoadError(err.message));
  }
  function reloadMine() {
    if (!isMember || !userId) { setMine([]); return Promise.resolve(); }
    return dbLoadMyBounties(userId).then(setMine).catch(err => setMessage({ err: true, text: err.message }));
  }

  useEffect(() => { reloadPublic(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reloadMine(); }, [isMember, userId]);

  const games = useMemo(
    () => Array.from(new Set((bounties || []).map(b => b.game).filter(Boolean))).sort(),
    [bounties]
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (bounties || []).filter(b => {
      if (game && b.game !== game) return false;
      if (q && !`${b.name} ${b.set}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bounties, query, game]);

  const openMine = countOpenBounties(mine);
  // Closed ones are only kept around briefly: the list shows open, expired
  // (renewable) and the last few closed.
  const visibleMine = mine.filter(b => ACTIVE.includes(bountyState(b)))
    .concat(mine.filter(b => !ACTIVE.includes(bountyState(b))).slice(0, 5));

  async function handlePost(form) {
    const { posted } = await callBounties('create', { bounty: form });
    setShowForm(false);
    setMessage({ err: false, text: posted ? 'Bounty posted, and shared in the BGP Discord.' : 'Bounty posted.' });
    await Promise.all([reloadPublic(), reloadMine()]);
  }

  async function act(b, action) {
    if (action === 'cancel' && !window.confirm(`Cancel your bounty for ${b.name}?`)) return;
    if (action === 'decline' && !window.confirm(`Decline the shop's offer for ${b.name}? Your bounty stays open.`)) return;
    setBusyId(b.id);
    setMessage(null);
    try {
      await callBounties(action, { id: b.id });
      setMessage({ err: false, text: ACT_MESSAGES[action](b) });
      await Promise.all([reloadPublic(), reloadMine()]);
    } catch (err) {
      setMessage({ err: true, text: err.message || String(err) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="wanted-panel">
      {isMember ? (
        <div className="my-bounties">
          <div className="my-bounties-head">
            <div>
              <div className="section-label" style={{ margin: 0 }}>Your bounties</div>
              <div className="status-line" style={{ margin: 0 }}>
                {openMine} of {MAX_OPEN_BOUNTIES} open · each stays up {BOUNTY_EXPIRY_DAYS} days, then you can renew it.
              </div>
            </div>
            <button
              className="btn small"
              disabled={openMine >= MAX_OPEN_BOUNTIES}
              title={openMine >= MAX_OPEN_BOUNTIES ? `You have ${MAX_OPEN_BOUNTIES} open bounties. Cancel one to post another.` : undefined}
              onClick={() => { setMessage(null); setShowForm(true); }}
            >
              + Post a bounty
            </button>
          </div>
          {visibleMine.length === 0 ? (
            <div className="status-line">You haven't posted any bounties yet.</div>
          ) : (
            <div className="my-bounty-list">
              {visibleMine.map(b => {
                const state = bountyState(b);
                const days = bountyDaysLeft(b);
                return (
                  <div className={`my-bounty my-bounty-${state}`} key={b.id}>
                    <div className="my-bounty-info">
                      <div className="my-bounty-name">{b.name} <span className={`badge bounty-state-${state}`}>{MY_LABELS[state]}</span></div>
                      <div className="binder-card-sub">
                        {[b.game, bountyDetailLine(b), bountyPriceLabel(b)].filter(Boolean).join(' · ')}
                        {state === 'open' && days != null && ` · ${days === 0 ? 'expires today' : `${days} days left`}`}
                      </div>
                      {offerLapsed(b) && <div className="binder-card-sub">The shop's offer ran out without an answer.</div>}
                      {(state === 'offered' || state === 'accepted') && (
                        <div className="my-bounty-offer">
                          {b.offerImage && <img src={b.offerImage} alt="" onClick={() => onZoom(b.offerImage)} />}
                          <div>
                            <div><strong>{b.offerName}</strong>{offerDetailLine(b) && ` · ${offerDetailLine(b)}`}</div>
                            <div className="mono">{b.offerPrice == null ? 'Price at the shop' : `$${b.offerPrice.toFixed(2)}`}</div>
                            {b.offerNote && <div className="binder-card-sub">“{b.offerNote}”</div>}
                            <div className="binder-card-sub">
                              {state === 'offered'
                                ? `Held for you until ${formatDate(b.offerExpiresAt)}. Accept to keep it.`
                                : `Accepted. Pay and pick it up at the shop by ${formatDate(b.offerExpiresAt)}.`}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {ACTIVE.includes(state) && (
                      <div className="row-actions">
                        {state === 'offered' && (
                          <>
                            <button className="btn small" disabled={busyId === b.id} onClick={() => act(b, 'accept')}>Accept</button>
                            <button className="btn secondary small" disabled={busyId === b.id} onClick={() => act(b, 'decline')}>Decline</button>
                          </>
                        )}
                        {(state === 'expired' || (state === 'open' && days != null && days <= 7)) && (
                          <button className="btn secondary small" disabled={busyId === b.id} onClick={() => act(b, 'renew')}>Renew</button>
                        )}
                        <button className="btn ghost small" disabled={busyId === b.id} onClick={() => act(b, 'cancel')}>Cancel</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="status-line">
          Looking for a card we don't have? BGP Discord members can post a bounty: sign in with Discord above.
        </div>
      )}
      {message && <div className={message.err ? 'member-bar-error' : 'status-line'}>{message.text}</div>}

      <div className="section-label">Wanted by the community</div>
      {loadError && <div className="empty"><span className="mark">Couldn't load bounties</span>{loadError}</div>}
      {!loadError && bounties === null && <div className="empty"><span className="mark">Loading…</span></div>}
      {!loadError && bounties && bounties.length === 0 && (
        <div className="empty"><span className="mark">No open bounties</span>Nobody's looking for anything right now.</div>
      )}
      {!loadError && bounties && bounties.length > 0 && (
        <>
          <div className="shop-filters">
            <input type="search" aria-label="Search bounties" placeholder="Search wanted cards" value={query} onChange={(e) => setQuery(e.target.value)} />
            <select aria-label="Wanted game" value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">All games</option>
              {games.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="status-line">{matches.length === 1 ? '1 wanted card' : `${matches.length} wanted cards`}</div>
          {matches.length === 0 ? (
            <div className="empty"><span className="mark">No matches</span>Try a different name, or clear the filter.</div>
          ) : (
            <div className="binder-grid">
              {matches.map(b => <BountyCard key={b.id} b={b} onZoom={onZoom} />)}
            </div>
          )}
        </>
      )}

      {showForm && <BountyFormModal onPost={handlePost} onClose={() => setShowForm(false)} />}
    </div>
  );
}
