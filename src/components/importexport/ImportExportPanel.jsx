import { useState } from 'react';
import ImportPanel from './ImportPanel.jsx';
import QuoteImportPanel from './QuoteImportPanel.jsx';
import ExportPanel from './ExportPanel.jsx';

// The real Import/Export tab — a thin composer of ImportPanel + ExportPanel
// (split out so the Quote tab's "Import" add-card method can mount
// ImportPanel alone, without Export/Binder-QR/Reset-all-data). The Cards /
// Quotes toggle picks what's being imported: catalog rows (ImportPanel,
// unchanged) or the old Excel quote sheets (QuoteImportPanel).
export default function ImportExportPanel({ catalog, queue, locations, quotes = [], publicBinders, onSavePublicBinders, onImport, onSaveQuote, onClearAll }) {
  const [mode, setMode] = useState('cards');
  return (
    <div>
      <div className="scan-mode-toggle" role="group" aria-label="What to import">
        <button type="button" className={`btn small${mode === 'cards' ? '' : ' ghost'}`} aria-pressed={mode === 'cards'}
          onClick={() => setMode('cards')}>Cards</button>
        <button type="button" className={`btn small${mode === 'quotes' ? '' : ' ghost'}`} aria-pressed={mode === 'quotes'}
          onClick={() => setMode('quotes')}>Quotes</button>
      </div>
      {mode === 'cards'
        ? <ImportPanel catalog={catalog} locations={locations} onImport={onImport} />
        : <QuoteImportPanel quotes={quotes} onSaveQuote={onSaveQuote} />}
      <ExportPanel catalog={catalog} queue={queue} locations={locations} publicBinders={publicBinders}
        onSavePublicBinders={onSavePublicBinders} onClearAll={onClearAll} />
    </div>
  );
}
