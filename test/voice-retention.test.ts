import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import {
  runVoiceRetentionBatch,
  purgeProviderVoiceRecording,
  VOICE_RETENTION_BATCH_SIZE,
} from '@/lib/voice/retention';

function adminResult(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };
}

describe('the voice retention worker', () => {
  it('invokes the database-owned retention boundary and reports both classes', async () => {
    const admin = adminResult([{
      voice_calls_deleted: 7,
      voice_events_deleted: 5,
      more_due: false,
    }]);

    await expect(runVoiceRetentionBatch({}, { admin })).resolves.toEqual({
      requestedBatchSize: VOICE_RETENTION_BATCH_SIZE,
      batches: 1,
      voiceCallsDeleted: 7,
      voiceEventsDeleted: 5,
      moreDue: false,
      failed: 0,
    });
    expect(admin.rpc).toHaveBeenCalledWith('purge_expired_voice_history', {
      p_batch_size: VOICE_RETENTION_BATCH_SIZE,
    });
  });

  it('validates the batch before opening a database boundary', async () => {
    const admin = adminResult([]);
    await expect(runVoiceRetentionBatch({ batchSize: 0 }, { admin }))
      .rejects.toThrow('between 1 and 5000');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('fails a malformed database result instead of reporting a false deletion', async () => {
    const admin = adminResult([{
      voice_calls_deleted: -1, voice_events_deleted: 0, more_due: false,
    }]);
    await expect(runVoiceRetentionBatch({}, { admin }))
      .rejects.toThrow('call count was invalid');
  });

  it('drains more than one batch and aggregates its result', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{ voice_calls_deleted: 500, voice_events_deleted: 500, more_due: true }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ voice_calls_deleted: 9, voice_events_deleted: 4, more_due: false }],
        error: null,
      });

    await expect(runVoiceRetentionBatch({}, { admin: { rpc } as never })).resolves.toMatchObject({
      batches: 2,
      voiceCallsDeleted: 509,
      voiceEventsDeleted: 504,
      moreDue: false,
      failed: 0,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('surfaces a backlog as failed when the bounded drain cannot catch up', async () => {
    const admin = adminResult([{
      voice_calls_deleted: 500, voice_events_deleted: 500, more_due: true,
    }]);
    await expect(runVoiceRetentionBatch({ maxBatches: 2 }, { admin })).resolves.toMatchObject({
      batches: 2,
      moreDue: true,
      failed: 1,
    });
    expect(admin.rpc).toHaveBeenCalledTimes(2);
  });

  it('logs no provider or database message through its thrown error', async () => {
    const admin = adminResult(null, {
      code: '57014',
      message: 'contains caller transcript and a database host',
    });
    await expect(runVoiceRetentionBatch({}, { admin }))
      .rejects.toThrow('database operation failed (57014)');
  });

  it('has no rollout flag that can strand caller data', () => {
    const source = readFileSync(
      join(process.cwd(), 'src', 'lib', 'voice', 'retention.ts'),
      'utf8',
    );
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'cron', 'voice-retention', 'route.ts'),
      'utf8',
    );
    expect(source).not.toMatch(/process\.env|workerEnabled|_ENABLED/);
    expect(route).not.toMatch(/process\.env|workerEnabled|_ENABLED/);
    expect(route).toContain("cronRoute('voice-retention'");
  });

  it('skips purging provider recording if storagePath is null or missing', async () => {
    const result = await purgeProviderVoiceRecording(null);
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(true);
  });

  it('sends DELETE request to SignalWire REST API when deleting audio recording', async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
    })) as unknown as typeof fetch;

    const result = await purgeProviderVoiceRecording(
      'https://example.signalwire.com/recordings/RE123456789.mp3',
      {
        projectId: 'proj-abc',
        spaceUrl: 'example.signalwire.com',
        apiToken: 'test-token-123',
        fetchImpl: mockFetch,
      },
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.signalwire.com/api/laml/2010-04-01/Accounts/proj-abc/Recordings/RE123456789.json',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
        }),
      }),
    );
  });
});
