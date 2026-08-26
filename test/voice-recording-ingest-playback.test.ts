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

describe('voice recording status ingest webhook (/api/voice/recording-status)', () => {
  let updates: Record<string, unknown>[] = [];

  const mockAdmin = {
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
    mockCreateAdminClient.mockReturnValue(mockAdmin);
  });

  it('rejects callbacks without a call id', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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
      recording_status: 'ready',
      recording_storage_path: 'https://cdn.signalwire.com/recordings/audio123.mp3',
      recording_duration_seconds: 45,
      recording_size_bytes: 360000,
      recording_content_type: 'audio/mp3',
    });
  });

  it('rejects recording callbacks containing invalid or untrusted URL schemes', async () => {
    const req = new Request('http://localhost/api/voice/recording-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const res = await recordingPlaybackHandler(req, { params: { recordingId: CALL_ID } });

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
    const res = await recordingPlaybackHandler(req, { params: { recordingId: CALL_ID } });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('untrusted_storage_host');
  });

  it('redirects with private no-store headers when audio is ready', async () => {
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
    const res = await recordingPlaybackHandler(req, { params: { recordingId: CALL_ID } });

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://cdn.signalwire.com/recordings/audio123.mp3');
    expect(res.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
});
