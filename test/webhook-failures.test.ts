import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logWebhookFailure } from '@/lib/webhook-failures';
import { createAdminClient } from '@/lib/auth';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

describe('logWebhookFailure', () => {
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockFrom: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockInsert = vi.fn().mockResolvedValue({ error: null });
    mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
    
    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
    } as any);

    // Reset date to control the flooding window
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('inserts a failure log successfully', async () => {
    await logWebhookFailure({
      source: 'stripe',
      eventType: 'customer.created',
      referenceId: 'cus_123',
      errorMessage: 'Test error',
      payloadExcerpt: '{"foo":"bar"}',
    });

    expect(mockFrom).toHaveBeenCalledWith('webhook_failures');
    expect(mockInsert).toHaveBeenCalledWith({
      source: 'stripe',
      event_type: 'customer.created',
      reference_id: 'cus_123',
      error_message: 'Test error',
      payload_excerpt: '{"foo":"bar"}',
    });
  });

  it('truncates the payload excerpt to 500 characters', async () => {
    const longPayload = 'A'.repeat(600);
    await logWebhookFailure({
      source: 'ai_voice',
      errorMessage: 'Long payload',
      payloadExcerpt: longPayload,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        payload_excerpt: 'A'.repeat(500),
      })
    );
  });

  it('swallows insert errors without throwing', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInsert.mockResolvedValue({ error: new Error('DB Error') });

    await expect(logWebhookFailure({
      source: 'stripe',
      errorMessage: 'Test error',
    })).resolves.not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith('logWebhookFailure insert failed:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('swallows unexpected throws during insert', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockInsert.mockRejectedValue(new Error('Network error'));

    await expect(logWebhookFailure({
      source: 'stripe',
      errorMessage: 'Test error',
    })).resolves.not.toThrow();

    expect(consoleErrorSpy).toHaveBeenCalledWith('logWebhookFailure threw (non-fatal):', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });

  it('prevents flooding of the same error message within a 1-minute window', async () => {
    // Generate a unique error message for this test so it doesn't collide with the deduplication map state from other tests
    const uniqueError = `Flood error ${Math.random()}`;
    
    // First 5 logs should succeed
    for (let i = 0; i < 5; i++) {
      await logWebhookFailure({
        source: 'resend',
        errorMessage: uniqueError,
      });
    }

    expect(mockInsert).toHaveBeenCalledTimes(5);

    // 6th log should be deduplicated
    await logWebhookFailure({
      source: 'resend',
      errorMessage: uniqueError,
    });

    expect(mockInsert).toHaveBeenCalledTimes(5); // Still 5

    // Fast forward past the 1-minute window (60,000ms)
    vi.advanceTimersByTime(60_001);

    // Should insert again after the window
    await logWebhookFailure({
      source: 'resend',
      errorMessage: uniqueError,
    });

    expect(mockInsert).toHaveBeenCalledTimes(6);
  });
});
