import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeHttpUrl, openSafeUrl } from './safeUrl.js';

describe('safeHttpUrl', () => {
  it('keeps http and https URLs (trimmed)', () => {
    expect(safeHttpUrl('https://www.tcgplayer.com/product/1')).toBe('https://www.tcgplayer.com/product/1');
    expect(safeHttpUrl('  http://example.com/a?b=1  ')).toBe('http://example.com/a?b=1');
    expect(safeHttpUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('rejects script and other non-web schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBe('');
    expect(safeHttpUrl(' JavaScript:alert(1)')).toBe('');
    expect(safeHttpUrl('java\tscript:alert(1)')).toBe('');
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe('');
    expect(safeHttpUrl('vbscript:msgbox(1)')).toBe('');
    expect(safeHttpUrl('file:///etc/passwd')).toBe('');
  });

  it('rejects relative, malformed and non-string values', () => {
    expect(safeHttpUrl('www.tcgplayer.com/product/1')).toBe('');
    expect(safeHttpUrl('/card-cove/')).toBe('');
    expect(safeHttpUrl('not a url')).toBe('');
    expect(safeHttpUrl('')).toBe('');
    expect(safeHttpUrl(null)).toBe('');
    expect(safeHttpUrl(undefined)).toBe('');
    expect(safeHttpUrl(42)).toBe('');
  });
});

describe('openSafeUrl', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens a safe URL in a new tab with noopener', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openSafeUrl('https://example.com');
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('does nothing for an unsafe URL', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openSafeUrl('javascript:alert(1)');
    expect(open).not.toHaveBeenCalled();
  });
});
