import { useState } from 'react';
import { buildBinderUrl, generateQrDataUrl } from '../../lib/qr.js';

export default function BinderQrModal({ locations, publicBinders = [], onClose }) {
  const [location, setLocation] = useState(locations[0] || '');
  const [qrUrl, setQrUrl] = useState('');
  const [link, setLink] = useState('');
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    if (!location) return;
    setGenerating(true);
    const url = buildBinderUrl(location);
    const dataUrl = await generateQrDataUrl(url);
    setLink(url);
    setQrUrl(dataUrl);
    setGenerating(false);
  }

  return (
    <div className="overlay show">
      <div className="modal">
        <div className="modal-head">
          <div className="name">Binder QR code</div>
          <div className="meta">
            Print this on the binder — scanning it opens a login-free page showing what's currently inside, with prices.
            It's a live lookup, so it always reflects current stock.
          </div>
        </div>
        <div className="modal-body">
          <div className="field-group">
            <label htmlFor="qr_location">Binder / case</label>
            <select id="qr_location" value={location} onChange={(e) => { setLocation(e.target.value); setQrUrl(''); }}>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          {location && !publicBinders.includes(location) && (
            <div className="warn-line" style={{ margin: '0 0 10px', fontSize: '12.5px', color: 'var(--amber)' }}>
              This binder isn't public, so its QR page says it isn't shared online. Make it public in Public binders… first.
            </div>
          )}
          {qrUrl && (
            <div className="qr-preview">
              <img src={qrUrl} alt="Binder QR code" />
              <div className="qr-link">{link}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ghost small" onClick={onClose}>Close</button>
          <button className="btn small" disabled={!location || generating} onClick={handleGenerate}>
            {qrUrl ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
  );
}
