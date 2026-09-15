import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { requireOfficeContext } = vi.hoisted(() => ({ requireOfficeContext: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireOfficeContext }));

import { GET } from '@/app/api/voice/recordings/[recordingId]/route';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';
const CALL = '33333333-3333-4333-8333-333333333333';
const PROVIDER = 'https://voice-access-test.signalwire.com';
const MEDIA = `${PROVIDER}/api/relay/rest/recordings/test-recording`;
const CDN = 'https://cdn.signalwire.com/recordings/test-recording.mp3';
const fetchMedia = vi.fn<typeof fetch>();

// A two-tenant dataset makes a missing account filter expose the other row.
// This tests the route boundary independently of the separately verified RLS.
function workspaceWithRecording(options: { account?: string; status?: string; url?: string } = {}) {
  const filters: Record<string, unknown> = {};
  const row = {
    id: CALL, account_id: options.account ?? ACCOUNT,
    recording_status: options.status ?? 'ready', recording_storage_path: options.url ?? MEDIA,
  };
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
    maybeSingle: vi.fn(async () => ({
      data: Object.entries(filters).every(([key, value]) => row[key as keyof typeof row] === value) ? row : null,
      error: null,
    })),
  };
  const from = vi.fn(() => query);
  requireOfficeContext.mockResolvedValue({ accountId: ACCOUNT, supabase: { from } });
  return { from };
}

async function playback(range?: string) {
  return GET(new Request(`https://app.example.test/api/voice/recordings/${CALL}`, {
    headers: range ? { range } : undefined,
  }), { params: Promise.resolve({ recordingId: CALL }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMedia.mockReset();
  vi.stubEnv('SIGNALWIRE_SPACE_URL', PROVIDER);
  vi.stubEnv('SIGNALWIRE_PROJECT_ID', 'test-project');
  vi.stubEnv('SIGNALWIRE_API_TOKEN', 'test-token');
  vi.stubGlobal('fetch', fetchMedia);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('recording authorization and media isolation', () => {
  it.each(['signed-out', 'revoked', 'crew-without-office-access'])('denies %s before reading or fetching audio', async (reason) => {
    const { from } = workspaceWithRecording();
    requireOfficeContext.mockRejectedValueOnce(new Error(reason));
    expect((await playback()).status).toBe(403);
    expect(requireOfficeContext).toHaveBeenCalledWith('leads.read');
    expect(from).not.toHaveBeenCalled();
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it('does not fetch another workspace recording when its call reference is known', async () => {
    workspaceWithRecording({ account: OTHER_ACCOUNT });
    expect((await playback()).status).toBe(404);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it.each(['none', 'pending', 'failed'])('does not fetch %s recording metadata', async (status) => {
    workspaceWithRecording({ status });
    expect((await playback()).status).toBe(404);
    expect(fetchMedia).not.toHaveBeenCalled();
  });

  it('keeps provider credentials on the configured origin and strips them at the CDN redirect', async () => {
    workspaceWithRecording();
    fetchMedia
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: CDN } }))
      .mockResolvedValueOnce(new Response('audio', { status: 200 }));
    const response = await playback();
    expect(await response.text()).toBe('audio');
    const [first, second] = fetchMedia.mock.calls;
    expect(new Headers(first[1]?.headers).get('authorization')).toBe(`Basic ${Buffer.from('test-project:test-token').toString('base64')}`);
    expect(new Headers(second[1]?.headers).get('authorization')).toBeNull();
    expect(second[0]).toBe(CDN);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('never sends provider credentials to another SignalWire workspace', async () => {
    workspaceWithRecording({ url: 'https://other-space.signalwire.com/recordings/test.mp3' });
    fetchMedia.mockResolvedValueOnce(new Response('audio', { status: 200 }));
    expect((await playback()).status).toBe(200);
    expect(new Headers(fetchMedia.mock.calls[0][1]?.headers).get('authorization')).toBeNull();
  });

  it.each(['http://cdn.signalwire.com/audio', 'https://signalwire.com.attacker.test/audio', 'https://127.0.0.1/audio'])('rejects a redirect to %s before making another request', async (location) => {
    workspaceWithRecording();
    fetchMedia.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location } }));
    expect((await playback()).status).toBe(502);
    expect(fetchMedia).toHaveBeenCalledTimes(1);
  });

  it('bounds a trusted redirect loop without disclosing a redirect to the browser', async () => {
    workspaceWithRecording();
    fetchMedia.mockImplementation(async () => new Response(null, { status: 302, headers: { location: MEDIA } }));
    const response = await playback();
    expect(response.status).toBe(502);
    expect(fetchMedia).toHaveBeenCalledTimes(4);
    expect(response.headers.get('location')).toBeNull();
  });

  it('preserves a valid byte range and the provider partial-response headers', async () => {
    workspaceWithRecording();
    fetchMedia.mockResolvedValueOnce(new Response('abcd', { status: 206, headers: {
      'content-range': 'bytes 4-7/12', 'content-length': '4', 'accept-ranges': 'bytes',
    } }));
    const response = await playback('bytes=4-7');
    expect(new Headers(fetchMedia.mock.calls[0][1]?.headers).get('range')).toBe('bytes=4-7');
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 4-7/12');
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('abcd');
  });

  it('does not forward a multipart byte-range request', async () => {
    workspaceWithRecording();
    fetchMedia.mockResolvedValueOnce(new Response('audio', { status: 200 }));
    expect((await playback('bytes=0-1,4-5')).status).toBe(200);
    expect(new Headers(fetchMedia.mock.calls[0][1]?.headers).get('range')).toBeNull();
  });
});
