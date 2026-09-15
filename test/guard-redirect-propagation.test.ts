import { describe, it, expect, vi, beforeEach } from 'vitest';
import { redirect } from 'next/navigation';

// The dashboard guards deny by calling redirect(), which throws a Next control
// error rather than returning. Every one of these handlers wraps its guard in a
// try/catch, so without an explicit rethrow the denial is swallowed and the
// caller is told the server broke: HTTP 500 carrying the literal string
// "NEXT_REDIRECT", with the intended navigation lost and the permission denial
// indistinguishable from a real fault in logs and alerting.
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: vi.fn(async () => { redirect('/office-access'); }),
  requireOwnerContext: vi.fn(async () => { redirect('/login'); }),
  createAdminClient: vi.fn(() => ({})),
}));
vi.mock('@/lib/stripe-terminal', () => ({ createTerminalConnectionToken: vi.fn() }));
vi.mock('@/lib/geocode', () => ({ geocodeArea: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(async () => true) }));

// Next marks its control-flow errors with a digest rather than a type, and the
// digest string is the stable part of that contract.
const isRedirect = (e: unknown): boolean =>
  typeof (e as { digest?: unknown })?.digest === 'string' &&
  String((e as { digest: string }).digest).startsWith('NEXT_REDIRECT');

describe('guard denials propagate instead of becoming a 500', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('route handler: an office user without the capability gets the redirect, not a 500', async () => {
    const { POST } = await import('@/app/api/terminal/connection-token/route');
    await expect(POST()).rejects.toSatisfy(isRedirect);
  });

  it('server action: the redirect is not swallowed into a generic failure result', async () => {
    const { resolveFirstRunPlaceAction } = await import('@/app/welcome/lookup-actions');
    await expect(resolveFirstRunPlaceAction('48067')).rejects.toSatisfy(isRedirect);
  });

  it('a genuine error is still caught and reported, not rethrown', async () => {
    // unstable_rethrow must be surgical: only Next's own control-flow errors go
    // back up. An ordinary failure below the guard still becomes a result.
    const auth = await import('@/lib/auth');
    vi.mocked(auth.requireOwnerContext).mockResolvedValueOnce({ accountId: 'acct_1' } as never);
    const geo = await import('@/lib/geocode');
    vi.mocked(geo.geocodeArea).mockRejectedValueOnce(new Error('geocoder down'));

    const { resolveFirstRunPlaceAction } = await import('@/app/welcome/lookup-actions');
    const result = await resolveFirstRunPlaceAction('48067');
    expect(result.ok).toBe(false);
  });
});
