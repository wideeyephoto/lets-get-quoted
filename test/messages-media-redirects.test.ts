import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/messages/media/[messageId]/route';

const mocks = vi.hoisted(() => ({ authenticated: false }));
vi.mock('@/lib/sms-media-fetch', () => ({
  fetchSmsMedia: (url: string, options: RequestInit) => fetch(url, options),
  SmsMediaBlockedError: class extends Error {},
}));
vi.mock('@/lib/auth', () => ({
  requireOfficeContext: async () => ({
    accountId: 'account-1',
    supabase: { from: () => ({
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: {
        id: 'message-1', account_id: 'account-1', provider: 'twilio', media_urls: ['https://media.example/photo'],
      }, error: null }),
    }) },
  }),
}));
vi.mock('@/lib/sms-provider', () => ({
  buildAuthenticatedSmsMediaRequest: () => mocks.authenticated
    ? { url: 'https://api.twilio.com/media', headers: { Authorization: 'test-credentials' } } : null,
}));

const request = () => GET(new NextRequest('http://localhost/api/messages/media/message-1'), {
  params: Promise.resolve({ messageId: 'message-1' }),
});
const redirect = (location?: string) => new Response(null, { status: 302, headers: location ? { location } : {} });
beforeEach(() => { mocks.authenticated = false; });
afterEach(() => { vi.unstubAllGlobals(); });

describe.each([false, true])('MMS redirects (provider authenticated=%s)', (authenticated) => {
  beforeEach(() => { mocks.authenticated = authenticated; });
  it.each([
    'https://127.0.0.1/private', 'https://169.254.169.254/metadata',
    'https://10.0.0.1/private', 'https://[::ffff:127.0.0.1]/private',
    'http://cdn.example/photo', 'https://user:pass@cdn.example/photo',
    'https://cdn.example:8443/photo', 'https://service.internal/photo',
  ])('rejects an unsafe second redirect to %s before requesting it', async (target) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect('https://cdn.example/step'))
      .mockResolvedValueOnce(redirect(target));
    vi.stubGlobal('fetch', fetchMock);
    expect((await request()).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('downloads a valid chain and never forwards provider credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(redirect('https://cdn.example/step'))
      .mockResolvedValueOnce(redirect('/image.jpg'))
      .mockResolvedValueOnce(new Response('photo-bytes', { headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await request();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('photo-bytes');
    expect(fetchMock.mock.calls[2][0]).toBe('https://cdn.example/image.jpg');
    expect(fetchMock.mock.calls[0][1].headers).toEqual(authenticated ? { Authorization: 'test-credentials' } : undefined);
    for (const [, options] of fetchMock.mock.calls.slice(1)) {
      expect(options.headers).toBeUndefined();
      expect(options.signal).toBe(fetchMock.mock.calls[0][1].signal);
    }
  });
});

it('bounds redirect loops', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => redirect('https://cdn.example/loop'));
  vi.stubGlobal('fetch', fetchMock);
  expect((await request()).status).toBe(502);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});
it('rejects a redirect without a Location header', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(redirect()));
  expect((await request()).status).toBe(502);
});
