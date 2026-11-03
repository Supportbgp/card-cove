// Who may run price-check: only a caller holding this project's service-role
// key (the daily GitHub Actions workflow). Supabase's gateway only checks
// that the bearer is *some* valid project JWT, so without this the public
// anon key or any signed-in user could trigger a full, write-heavy catalog
// run. Kept in its own file (no Deno-only APIs) so the Vitest suite can test
// it directly; index.ts is the only importer.

// Compares every byte even after a mismatch, so response time doesn't leak
// how much of the key a guess got right.
function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function isServiceRoleRequest(req: Request, serviceKey: string | undefined): boolean {
  if (!serviceKey) return false;
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return constantTimeEqual(match[1].trim(), serviceKey);
}
