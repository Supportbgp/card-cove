import { useState } from 'react';
import ChangeHistoryModal from './history/ChangeHistoryModal.jsx';

const linkStyle = { color: 'var(--ink-faint)' };

// The signed-in app's footer: Staff docs, Change history, Pricing settings,
// Sign out. Change history lives here (not in Import / Export) since it's
// a look-up tool, not an export.
export default function AppFooter({ onOpenSettings, onLogout }) {
  const [showHistory, setShowHistory] = useState(false);
  const click = (fn) => (e) => { e.preventDefault(); fn(); };
  return (
    <>
      <div className="footnote">
        Card Cove by Board Game Paradise · shared store data, live in Supabase · not connected to POS, TCG Player, or Collectr APIs ·{' '}
        <a href="?help=1" target="_blank" rel="noopener noreferrer" style={linkStyle}>Staff docs</a>
        {' · '}
        <a href="#" onClick={click(() => setShowHistory(true))} style={linkStyle}>Change history</a>
        {' · '}
        <a href="#" onClick={click(onOpenSettings)} style={linkStyle}>Pricing settings</a>
        {' · '}
        <a href="#" onClick={click(onLogout)} style={linkStyle}>Sign out</a>
      </div>
      {showHistory && <ChangeHistoryModal onClose={() => setShowHistory(false)} />}
    </>
  );
}
