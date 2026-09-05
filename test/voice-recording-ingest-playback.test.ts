import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateAdminClient = vi.fn();
const mockRequireOfficeContext = vi.fn();

vi.mock('@/lib/auth', () => ({
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
  requireOfficeContext: (...args: unknown[]) => mockRequireOfficeContext(...args),
}));

import { POST as recordingStatusHandler } from '@/app/api/voice/recording-status/route';
import { GET as recordingPlaybackHandler } from '@/app/api/voice/recordings/[recordingId]/route';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const CALL_ID = 'call-12345';
const PROVIDER_CALL_ID = 'p-call-123';

const TEST_BASIC_AUTH = 'testuser:testpass';
const VALID_AUTH_HEADER = `Basic ${Buffer.from(TEST_BASIC_AUTH).toString('base64')}`;

describe('voice recording status ingest webhook (/api/voice/recording-status)', () => {
  let updates: Record<string, unknown>[] = [];

  const mockAdmin = {
    rpc: async (_name: string, args: Record<string, unknown>) => { updates.push(args); return { error: null }; },
    from() {
      const chain: Record<string, unknown> = {};
      chain.update = (row: Record<string, unknown>) => {
        updates.push(row);
        return chain;
      };
      chain.eq = () => chain;
      return chain;
    },
  };

  beforeEach(() => {
    updates = [];
    process.env.LGQ_VOICE_RECEIPT_BASIC = TEST_BASIC_AUTH;
    mockCreateAdminClient.mockReturnValue(mockAdmin);
  });

  it('rejects unauthenticated callbacks with 401', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: PROVIDER_CALL_ID, recording_status: 'completed' }),
    });

    const res = await recordingStatusHandler(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe('Unauthorized');
  });

  it('rejects callbacks with invalid credentials with 401', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from('wrong:creds').toString('base64'),
      },
      body: JSON.stringify({ call_id: PROVIDER_CALL_ID, recording_status: 'completed' }),
    });

    const res = await recordingStatusHandler(req);
    expect(res.status).toBe(401);
  });

  it('returns 503 if voice receipt auth is not configured', async () => {
    delete process.env.LGQ_VOICE_RECEIPT_BASIC;

    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call_id: PROVIDER_CALL_ID, recording_status: 'completed' }),
    });

    const res = await recordingStatusHandler(req);
    expect(res.status).toBe(503);
  });

  it('rejects callbacks without a call id', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: VALID_AUTH_HEADER,
      },
      body: JSON.stringify({ recording_status: 'completed' }),
    });

    const res = await recordingStatusHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('missing_call_id');
  });

  it('ingests completed recording metadata into voice_calls', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: VALID_AUTH_HEADER,
      },
      body: JSON.stringify({
        call_id: PROVIDER_CALL_ID,
        recording_status: 'completed',
        recording_url: 'https://cdn.signalwire.com/recordings/audio123.mp3',
        recording_duration: '45',
        recording_size: '360000',
      }),
    });

    const res = await recordingStatusHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      p_status: 'ready',
      p_url: 'https://cdn.signalwire.com/recordings/audio123.mp3',
      p_duration: 45,
      p_size: 360000,
    });
  });

  it('rejects recording callbacks containing invalid or untrusted URL schemes', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: VALID_AUTH_HEADER,
      },
      body: JSON.stringify({
        call_id: PROVIDER_CALL_ID,
        recording_status: 'completed',
        recording_url: 'http://malicious-site.example.com/exploit.mp3',
      }),
    });

    const res = await recordingStatusHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_recording_url');
  });
});

describe('authenticated voice recording playback endpoint (/api/voice/recordings/[recordingId])', () => {
  it('returns 404 if recording is not found or not ready', async () => {
    const mockSupabase = {
      from() {
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq']) chain[method] = () => chain;
        chain.maybeSingle = async () => ({ data: null, error: null });
        return chain;
      },
    };

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: ACCOUNT_ID,
    });

    const req = new Request(`http://localhost/api/voice/recordings/${CALL_ID}`);
    const res = await recordingPlaybackHandler(req, { params: Promise.resolve({ recordingId: CALL_ID }) });

    expect(res.status).toBe(404);
  });

  it('rejects playback redirect if recording URL hostname is untrusted', async () => {
    const mockSupabase = {
      from() {
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq']) chain[method] = () => chain;
        chain.maybeSingle = async () => ({
          data: {
            id: CALL_ID,
            recording_status: 'ready',
            recording_storage_path: 'https://evil-untrusted-host.com/audio.mp3',
            recording_duration_seconds: 45,
            started_at: '2026-08-25T13:00:00Z',
          },
          error: null,
        });
        return chain;
      },
    };

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: ACCOUNT_ID,
    });

    const req = new Request(`http://localhost/api/voice/recordings/${CALL_ID}`);
    const res = await recordingPlaybackHandler(req, { params: Promise.resolve({ recordingId: CALL_ID }) });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('untrusted_storage_host');
  });

  it('streams audio with private no-store headers without disclosing its provider URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('audio', { status: 200 })));
    const mockSupabase = {
      from() {
        const chain: Record<string, unknown> = {};
        for (const method of ['select', 'eq']) chain[method] = () => chain;
        chain.maybeSingle = async () => ({
          data: {
            id: CALL_ID,
            recording_status: 'ready',
            recording_storage_path: 'https://cdn.signalwire.com/recordings/audio123.mp3',
            recording_duration_seconds: 45,
            started_at: '2026-08-25T13:00:00Z',
          },
          error: null,
        });
        return chain;
      },
    };

    mockRequireOfficeContext.mockResolvedValue({
      supabase: mockSupabase,
      accountId: ACCOUNT_ID,
    });

    const req = new Request(`http://localhost/api/voice/recordings/${CALL_ID}`);
    const res = await recordingPlaybackHandler(req, { params: Promise.resolve({ recordingId: CALL_ID }) });

    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.text()).toBe('audio');
    vi.unstubAllGlobals();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});


describe('native recording callback hardening', () => {
  const origin = 'https://app.letsgetquoted.com';
  function callback(payload: unknown) {
    const url = origin + '/api/voice/recording-status';
    const body = JSON.stringify(payload);
    return new Request(url, { method: 'POST', body, headers: {
      'Content-Type': 'application/json',
      'x-signalwire-signature': createHmac('sha1','native-key').update(url+body).digest('hex'),
    } });
  }
  beforeEach(() => {
    process.env.SIGNALWIRE_WEBHOOK_ORIGIN = origin;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'letsgetquoted.com';
    process.env.SIGNALWIRE_SIGNING_KEY = 'native-key';
  });
  it('accepts the signed native nested payload without receipt Basic credentials', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null }); mockCreateAdminClient.mockReturnValue({ rpc });
    const res = await recordingStatusHandler(callback({ event_type: 'calling.call.record', params: {
      call_id: 'native-call', state: 'finished', url: 'https://example.signalwire.com/api/v1/recordings/r1/download', duration: 15.2, size: 99,
    } }));
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('apply_voice_recording_observation',expect.objectContaining({p_call_id:'native-call',p_status:'ready',p_duration:16}));
  });
  it('does not acknowledge a lost database write', async () => {
    mockCreateAdminClient.mockReturnValue({ rpc: async () => ({ error: { code: 'offline' } }) });
    expect((await recordingStatusHandler(callback({ params: { call_id:'c',state:'recording' } }))).status).toBe(500);
  });
  it('rejects completed callbacks without media and unknown states', async () => {
    expect((await recordingStatusHandler(callback({ params: { call_id:'c',state:'finished' } }))).status).toBe(400);
    expect((await recordingStatusHandler(callback({ params: { call_id:'c',state:'surprise' } }))).status).toBe(400);
  });
});
