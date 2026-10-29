import { useState } from 'react';
import { useUI } from '../../context/UIContext.jsx';
import ExportModal from './ExportModal.jsx';
import BinderQrModal from './BinderQrModal.jsx';
import PublicBindersModal from './PublicBindersModal.jsx';

// Export / Binder QR / Reset-all-data — split out of the original
// ImportExportPanel alongside ImportPanel so the Import half can be
// embedded elsewhere (the Quote tab) without dragging these catalog-wide,
// destructive-adjacent actions along with it. The real Import/Export tab
// still gets identical behavior via ImportExportPanel, which composes this
// unchanged.
export default function ExportPanel({ catalog, queue, locations, publicBinders = [], onSavePublicBinders, onClearAll }) {
  const { showConfirm } = useUI();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showPublicModal, setShowPublicModal] = useState(false);

  async function handleClearAll() {
    if (!(await showConfirm("This clears the shared catalog and sync queue for everyone using Card Cove. Continue?", "Reset all data", { requirePassword: true }))) return;
    await onClearAll();
  }

  return (
    <div className="card card-pad">
      <div className="section-label">Export</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className="btn secondary" onClick={() => setShowExportModal(true)}>Export…</button>
        <button className="btn secondary" disabled={!locations.length} onClick={() => setShowQrModal(true)}>Binder QR code…</button>
        <button className="btn secondary" onClick={() => setShowPublicModal(true)}>Public binders…</button>
        <button className="btn ghost" onClick={handleClearAll}>Reset all data</button>
      </div>
      {showExportModal && (
        <ExportModal
          catalog={catalog}
          queue={queue}
          locations={locations}
          onClose={() => setShowExportModal(false)}
        />
      )}
      {showQrModal && (
        <BinderQrModal
          locations={locations}
          publicBinders={publicBinders}
          onClose={() => setShowQrModal(false)}
        />
      )}
      {showPublicModal && (
        <PublicBindersModal
          catalog={catalog}
          locations={locations}
          publicBinders={publicBinders}
          onSave={onSavePublicBinders}
          onClose={() => setShowPublicModal(false)}
        />
      )}
    </div>
  );
}
