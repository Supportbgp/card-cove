import { useState } from 'react';
import { supabaseClient, SHARED_LOGIN_EMAIL } from '../lib/supabase.js';
import logoIcon from '../assets/logo-icon.png';

export default function Login({ onSignedIn }) {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ text: "", isErr: false });
  const [busy, setBusy] = useState(false);

  async function doLogin() {
    setBusy(true);
    setStatus({ text: "Signing in…", isErr: false });
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email: SHARED_LOGIN_EMAIL, password });
    setBusy(false);
    if (error) { setStatus({ text: "Incorrect password.", isErr: true }); return; }
    onSignedIn(data && data.session);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') doLogin();
  }

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head" style={{ textAlign: 'center' }}>
          <img src={logoIcon} alt="" style={{ width: '56px', height: '56px', display: 'block', margin: '0 auto 10px' }} />
          <div className="name">Card Cove sign-in</div>
          <div className="meta">Enter the shared store password to continue.</div>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Shared password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className={`status-line${status.isErr ? ' err' : ''}`}>{status.text}</div>
        </div>
        <div className="modal-foot">
          <button className="btn small" disabled={busy} onClick={doLogin}>Sign in</button>
        </div>
      </div>
    </div>
  );
}
