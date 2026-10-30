import logoIcon from '../assets/logo-icon.png';

// Signed in, but the login isn't marked as staff (CLAUDE.md "Staff-only
// access"). Shown instead of the app, whose tabs would otherwise just come
// up empty, which reads as lost data.
export default function NoStaffAccess({ onSignOut }) {
  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head" style={{ textAlign: 'center' }}>
          <img src={logoIcon} alt="" style={{ width: '56px', height: '56px', display: 'block', margin: '0 auto 10px' }} />
          <div className="name">No staff access</div>
          <div className="meta">You're signed in, but this login isn't a Card Cove staff account.</div>
        </div>
        <div className="modal-body" style={{ fontSize: '13.5px', color: 'var(--ink-soft)' }}>
          If this is the shop's own login, sign out and sign back in. If it still shows this, ask whoever manages
          Card Cove to check that the login is marked as staff.
          {' '}Looking for our stock? See the <a href="?shop=1">public stock page</a>.
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
