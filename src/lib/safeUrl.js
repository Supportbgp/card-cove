// Every link built from stored or imported data (a catalog row's sourceUrl,
// a scan candidate's listingUrl, a price alert's matched_url) goes through
// here before it reaches an href or window.open. A value like
// "javascript:..." typed into a field or a spreadsheet cell would otherwise
// run as code when staff click the link. Only absolute http/https URLs
// pass; anything else comes back as '' so the caller shows no link.
export function safeHttpUrl(url) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return '';
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : '';
}

// window.open for a stored URL: nothing happens for an unsafe one, and the
// new tab gets no handle back to this one (noopener).
export function openSafeUrl(url) {
  const safe = safeHttpUrl(url);
  if (safe) window.open(safe, '_blank', 'noopener,noreferrer');
}
