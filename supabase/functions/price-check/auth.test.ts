import { describe, it, expect } from 'vitest';
import { isServiceRoleRequest } from './auth.ts';

const KEY = 'service-role-key-value';
const req = (auth?: string) =>
  new Request('https://example.supabase.co/functions/v1/price-check', {
    method: 'POST',
    headers: auth === undefined ? {} : { Authorization: auth },
  });

describe('price-check isServiceRoleRequest', () => {
  it('accepts the service-role key as a bearer token', () => {
    expect(isServiceRoleRequest(req(`Bearer ${KEY}`), KEY)).toBe(true);
    expect(isServiceRoleRequest(req(`bearer   ${KEY}`), KEY)).toBe(true);
  });

  it('rejects any other key, including one that only shares a prefix', () => {
    expect(isServiceRoleRequest(req('Bearer anon-key'), KEY)).toBe(false);
    expect(isServiceRoleRequest(req(`Bearer ${KEY}x`), KEY)).toBe(false);
    expect(isServiceRoleRequest(req(`Bearer ${KEY.slice(0, -1)}`), KEY)).toBe(false);
  });

  it('rejects a missing or malformed Authorization header', () => {
    expect(isServiceRoleRequest(req(), KEY)).toBe(false);
    expect(isServiceRoleRequest(req(KEY), KEY)).toBe(false);
    expect(isServiceRoleRequest(req('Bearer '), KEY)).toBe(false);
  });

  it('rejects everything when the function has no service key configured', () => {
    expect(isServiceRoleRequest(req('Bearer '), '')).toBe(false);
    expect(isServiceRoleRequest(req('Bearer undefined'), undefined)).toBe(false);
  });
});
