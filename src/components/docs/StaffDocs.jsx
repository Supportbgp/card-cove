import { useEffect, useState } from 'react';
import logoIcon from '../../assets/logo-icon.png';
import GettingStartedSection from './sections/GettingStartedSection.jsx';
import CatalogSection from './sections/CatalogSection.jsx';
import EditingItemSection from './sections/EditingItemSection.jsx';
import SellingItemSection from './sections/SellingItemSection.jsx';
import SyncQueueSection from './sections/SyncQueueSection.jsx';
import ImportExportSection from './sections/ImportExportSection.jsx';
import ScannerSection from './sections/ScannerSection.jsx';
import QuoteSection from './sections/QuoteSection.jsx';
import SortingSection from './sections/SortingSection.jsx';
import PricingSettingsSection from './sections/PricingSettingsSection.jsx';
import PublicBinderSection from './sections/PublicBinderSection.jsx';
import BountiesSection from './sections/BountiesSection.jsx';
import GlossarySection from './sections/GlossarySection.jsx';
import KnownQuirksSection from './sections/KnownQuirksSection.jsx';

// Every entry here needs a matching `id` on that section's <DocsSection>.
// Order here is also reading order for the Previous/Next stepper below.
const SECTIONS = [
  { id: 'getting-started', label: 'Getting started', Component: GettingStartedSection },
  { id: 'catalog', label: 'Catalog', Component: CatalogSection },
  { id: 'editing-an-item', label: 'Editing an item', Component: EditingItemSection },
  { id: 'selling-an-item', label: 'Selling an item', Component: SellingItemSection },
  { id: 'sync-queue', label: 'Sync Queue', Component: SyncQueueSection },
  { id: 'import-export', label: 'Import / Export', Component: ImportExportSection },
  { id: 'scan-binder', label: 'Scan Binder', Component: ScannerSection },
  { id: 'quote', label: 'Quote', Component: QuoteSection },
  { id: 'sorting', label: 'Sorting', Component: SortingSection },
  { id: 'pricing-settings', label: 'Pricing settings', Component: PricingSettingsSection },
  { id: 'public-binder-page', label: 'The public binder page', Component: PublicBinderSection },
  { id: 'bounties', label: 'Bounties', Component: BountiesSection },
  { id: 'glossary', label: 'Concepts & glossary', Component: GlossarySection },
  { id: 'known-quirks', label: 'Known quirks', Component: KnownQuirksSection },
];

// Falls back to the first section for a missing/unrecognized hash (a bare
// ?help=1, or a stale/mistyped link) rather than rendering nothing.
function sectionIdFromHash() {
  const hash = window.location.hash.slice(1);
  return SECTIONS.some((s) => s.id === hash) ? hash : SECTIONS[0].id;
}

// Reached via ?help=1 (see main.jsx) — deliberately no login and no
// UIProvider, same reasoning as BinderView.jsx: staff should be able to
// pull this up on a phone before ever signing in, bookmark it, or print it.
//
// Shows exactly one section at a time (driven by the URL hash) instead of
// one long scrolling page — staff asked to be able to jump straight to
// what they need via the left nav, or read straight through via the
// Previous/Next stepper at the bottom, without having to scroll past
// everything else to find their place again.
export default function StaffDocs() {
  const [currentId, setCurrentId] = useState(sectionIdFromHash);

  useEffect(() => {
    function onHashChange() {
      setCurrentId(sectionIdFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Every nav/stepper link is a real #hash anchor (not a click handler), so
  // browser back/forward and directly-linked URLs both just work for free —
  // this only re-syncs the visible section to match.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentId]);

  const index = SECTIONS.findIndex((s) => s.id === currentId);
  const current = SECTIONS[index];
  const prev = index > 0 ? SECTIONS[index - 1] : null;
  const next = index < SECTIONS.length - 1 ? SECTIONS[index + 1] : null;
  const CurrentSection = current.Component;

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <img src={logoIcon} alt="" className="brand-logo" />
          <span className="mark">Card Cove</span>
          <span className="sub">Staff documentation</span>
        </div>
      </div>

      <div className="docs-layout">
        <nav className="docs-nav" aria-label="Sections">
          <div className="docs-nav-title">On this page</div>
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={s.id === currentId ? 'active' : ''}>{s.label}</a>
          ))}
        </nav>
        <div className="docs-content">
          <CurrentSection />
          <div className="docs-stepper">
            {prev ? (
              <a href={`#${prev.id}`} className="btn ghost small">← {prev.label}</a>
            ) : <span />}
            {next ? (
              <a href={`#${next.id}`} className="btn small">Next: {next.label} →</a>
            ) : (
              <a href={`#${SECTIONS[0].id}`} className="btn ghost small">Back to {SECTIONS[0].label} ↑</a>
            )}
          </div>
        </div>
      </div>

      <div className="footnote">
        Card Cove by Board Game Paradise · this page needs no login and can be bookmarked or printed.
      </div>
    </div>
  );
}
