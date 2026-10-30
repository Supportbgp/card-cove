import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const refreshSession = vi.fn();
const signInWithOAuth = vi.fn();
vi.mock('./supabase.js', () => ({
  supabaseClient: { functions: { invoke }, auth: { refreshSession, signInWithOAuth } },
}));

const { memberStatus, memberName, isDiscordUser, verifyMembership, signInWithDiscord, readSignInError, urlWithoutSignInError } = await import('./memberAuth.js');

const discordUser = (meta = {}) => ({ app_metadata: { provider: 'discord', providers: ['discord'], ...meta }, user_metadata: { full_name: 'Jake' } });

beforeEach(() => { invoke.mockReset(); refreshSession.mockReset(); signInWithOAuth.mockReset(); });

describe('memberStatus', () => {
  it('reads each state from the session', () => {
    expect(memberStatus(null)).toBe('signed_out');
    expect(memberStatus({ user: { app_metadata: { staff: true } } })).toBe('staff');
    expect(memberStatus({ user: discordUser({ member: true }) })).toBe('member');
    expect(memberStatus({ user: discordUser({ member: false }) })).toBe('not_member');
    expect(memberStatus({ user: discordUser() })).toBe('unchecked');
  });

  it('staff wins over a member flag', () => {
    expect(memberStatus({ user: discordUser({ member: true, staff: true }) })).toBe('staff');
  });
});

describe('memberName / isDiscordUser', () => {
  it('prefers the name recorded by the check', () => {
    expect(memberName({ user: discordUser({ discord_name: 'JakeD' }) })).toBe('JakeD');
    expect(memberName({ user: discordUser() })).toBe('Jake');
  });
  it('spots a Discord login', () => {
    expect(isDiscordUser(discordUser())).toBe(true);
    expect(isDiscordUser({ app_metadata: { provider: 'email', providers: ['email'] } })).toBe(false);
  });
});

describe('signInWithDiscord', () => {
  it('asks for the server-membership scope', () => {
    signInWithDiscord('https://x/?shop=1');
    const arg = signInWithOAuth.mock.calls[0][0];
    expect(arg.provider).toBe('discord');
    expect(arg.options.scopes.split(' ')).toContain('guilds.members.read');
    expect(arg.options.redirectTo).toBe('https://x/?shop=1');
  });
});

describe('verifyMembership', () => {
  it('sends the Discord token, then refreshes the login', async () => {
    invoke.mockResolvedValue({ data: { member: false, inviteUrl: 'https://discord.gg/x' }, error: null });
    refreshSession.mockResolvedValue({ data: { session: { user: discordUser({ member: false }) } } });
    const r = await verifyMembership('tok');
    expect(invoke).toHaveBeenCalledWith('verify-discord-member', { body: { providerToken: 'tok' } });
    expect(r.inviteUrl).toBe('https://discord.gg/x');
    expect(memberStatus(r.session)).toBe('not_member');
  });

  it("throws the function's own error message", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { json: async () => ({ error: 'Discord sign-in expired, sign in again' }) } } });
    await expect(verifyMembership('tok')).rejects.toThrow('Discord sign-in expired, sign in again');
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe('sign-in errors in the address', () => {
  it('reads the reason from the query string or the hash', () => {
    expect(readSignInError('?shop=1&error=invalid_request&error_description=OAuth+state+not+found+or+expired', ''))
      .toBe('OAuth state not found or expired');
    expect(readSignInError('?shop=1', '#error=access_denied&error_description=The+user+denied'))
      .toBe('The user denied');
    expect(readSignInError('?shop=1', '')).toBe('');
  });
  it('drops only the error parameters', () => {
    expect(urlWithoutSignInError('https://x.io/card-cove/?shop=1&error=a&error_code=b&error_description=c'))
      .toBe('https://x.io/card-cove/?shop=1');
    expect(urlWithoutSignInError('https://x.io/?shop=1#error=a')).toBe('https://x.io/?shop=1');
  });
});
