import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CatalogTable from './CatalogTable.jsx';

const { useIsMobileMock } = vi.hoisted(() => ({ useIsMobileMock: vi.fn(() => false) }));
vi.mock('../../hooks/useIsMobile.js', () => ({ useIsMobile: useIsMobileMock }));

const { openLightboxMock } = vi.hoisted(() => ({ openLightboxMock: vi.fn() }));
vi.mock('../../context/UIContext.jsx', () => ({ useUI: () => ({ openLightbox: openLightboxMock }) }));

function makeCard(overrides = {}) {
  return {
    sku: 'sku-1', name: 'Charizard', set: 'Base Set', game: 'Pokemon', condition: 'NM', printing: 'Holo',
    itemType: 'single', grader: '', grade: '', qty: 3, price: 45, notes: '', sourceUrl: '', location: '',
    lastUpdated: Date.parse('2026-01-01T00:00:00.000Z'), sold: false,
    posSynced: true, tcgplayerSynced: false, collectrSynced: false,
    posChannel: true, tcgplayerChannel: true, collectrChannel: true,
    imageUrl: '', imageData: '', photoUrl: '', photoData: '', activeImage: 'photo',
    ...overrides,
  };
}

function baseProps(overrides = {}) {
  return {
    catalogEmpty: false,
    rows: [makeCard()],
    sortState: { col: 'name', dir: 1 },
    onSort: vi.fn(),
    selectedSkus: new Set(),
    onToggleSelected: vi.fn(),
    onToggleSelectAll: vi.fn(),
    onEdit: vi.fn(),
    onTogglePlatformStatus: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useIsMobileMock.mockReturnValue(false);
  openLightboxMock.mockClear();
});

describe('CatalogTable — empty states', () => {
  it('shows the "no catalog" message when catalogEmpty is true', () => {
    render(<CatalogTable {...baseProps({ catalogEmpty: true, rows: [] })} />);
    expect(screen.getByText('No catalog yet')).toBeInTheDocument();
  });

  it('shows the "no matches" message when there is a catalog but the filtered rows are empty', () => {
    render(<CatalogTable {...baseProps({ rows: [] })} />);
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});

describe('CatalogTable — desktop table (deriveRow)', () => {
  it('renders the subtitle line joining set/condition/printing, and the game tag', () => {
    render(<CatalogTable {...baseProps()} />);
    expect(screen.getByText('Base Set · NM · Holo')).toBeInTheDocument();
    expect(screen.getByText('Pokemon')).toBeInTheDocument();
  });

  it('appends grader/grade to the subtitle for a slab, with a real space between them', () => {
    const card = makeCard({ itemType: 'slab', grader: 'PSA', grade: '8' });
    render(<CatalogTable {...baseProps({ rows: [card] })} />);
    expect(screen.getByText('Base Set · NM · Holo · PSA 8')).toBeInTheDocument();
  });

  it('marks a sold item with the sold badge and row class', () => {
    const card = makeCard({ sold: true });
    render(<CatalogTable {...baseProps({ rows: [card] })} />);
    expect(screen.getByText('Sold')).toBeInTheDocument();
    expect(screen.getByText('Sold').closest('tr')).toHaveClass('sold-row');
  });

  it('calls onEdit with the card sku when Edit is clicked', () => {
    const onEdit = vi.fn();
    render(<CatalogTable {...baseProps({ onEdit })} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(onEdit).toHaveBeenCalledWith('sku-1');
  });

  it('clicking anywhere on a row toggles its selection, not just the checkbox', () => {
    const onToggleSelected = vi.fn();
    render(<CatalogTable {...baseProps({ onToggleSelected })} />);
    fireEvent.click(screen.getByText('Charizard'));
    expect(onToggleSelected).toHaveBeenCalledWith('sku-1', true);
  });

  it('clicking an already-selected row deselects it', () => {
    const onToggleSelected = vi.fn();
    render(<CatalogTable {...baseProps({ onToggleSelected, selectedSkus: new Set(['sku-1']) })} />);
    fireEvent.click(screen.getByText('Charizard'));
    expect(onToggleSelected).toHaveBeenCalledWith('sku-1', false);
  });

  it('clicking Edit does not also toggle the row selection', () => {
    const onToggleSelected = vi.fn();
    render(<CatalogTable {...baseProps({ onToggleSelected })} />);
    fireEvent.click(screen.getByText('Edit'));
    expect(onToggleSelected).not.toHaveBeenCalled();
  });

  it('calls onSort with the column key when a sortable header is clicked', () => {
    const onSort = vi.fn();
    render(<CatalogTable {...baseProps({ onSort })} />);
    fireEvent.click(screen.getByText('Qty'));
    expect(onSort).toHaveBeenCalledWith('qty');
  });

  it('calls onToggleSelectAll with all visible skus when the header checkbox is toggled', () => {
    const cards = [makeCard({ sku: 'a' }), makeCard({ sku: 'b' })];
    const onToggleSelectAll = vi.fn();
    render(<CatalogTable {...baseProps({ rows: cards, onToggleSelectAll })} />);
    const headerCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(headerCheckbox);
    expect(onToggleSelectAll).toHaveBeenCalledWith(['a', 'b'], true);
  });

  it('calls onToggleSelectAll with every match, not just the first 400 rendered', () => {
    const cards = Array.from({ length: 450 }, (_, i) => makeCard({ sku: `sku-${i}` }));
    const onToggleSelectAll = vi.fn();
    render(<CatalogTable {...baseProps({ rows: cards, onToggleSelectAll })} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    expect(onToggleSelectAll.mock.calls[0][0]).toHaveLength(450);
  });
});

describe('CatalogTable — Load more', () => {
  it('renders only the first 400 matches and a Load more control past that', () => {
    const cards = Array.from({ length: 450 }, (_, i) => makeCard({ sku: `sku-${i}`, name: `Card ${i}` }));
    render(<CatalogTable {...baseProps({ rows: cards })} />);
    expect(screen.getAllByRole('row')).toHaveLength(401); // 400 data rows + header
    expect(screen.getByText('Showing 400 of 450 matches.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more…' })).toBeInTheDocument();
  }, 15000);

  it('reveals every match at once when Load more is clicked', () => {
    const cards = Array.from({ length: 450 }, (_, i) => makeCard({ sku: `sku-${i}`, name: `Card ${i}` }));
    render(<CatalogTable {...baseProps({ rows: cards })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load more…' }));
    expect(screen.getAllByRole('row')).toHaveLength(451);
    expect(screen.queryByRole('button', { name: 'Load more…' })).not.toBeInTheDocument();
  }, 15000);

  it('does not show Load more when every match already fits under the cap', () => {
    render(<CatalogTable {...baseProps()} />);
    expect(screen.queryByRole('button', { name: 'Load more…' })).not.toBeInTheDocument();
  });
});

describe('CatalogTable — mobile stacked cards', () => {
  beforeEach(() => useIsMobileMock.mockReturnValue(true));

  it('renders a stacked card list instead of a table', () => {
    render(<CatalogTable {...baseProps()} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByText('Charizard')).toBeInTheDocument();
    expect(screen.getByText('Select all visible')).toBeInTheDocument();
  });

  it('only reveals the subtitle, actions, and sync status after the card head is clicked', () => {
    render(<CatalogTable {...baseProps()} />);
    expect(screen.queryByText('Base Set · NM · Holo')).not.toBeInTheDocument();
    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Charizard'));
    expect(screen.getByText('Base Set · NM · Holo')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });
});
