import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AI_WRITING_GATE_FLAG,
  AI_WRITING_METER_FLAG,
  AI_WRITING_RESOURCE_CODE,
  aiWritingMode,
  beginAiWritingUsage,
  commitAiWritingUsage,
  releaseAiWritingUsage,
} from '@/lib/billing/ai-writing-usage';

const rpc = vi.fn();
const admin = { rpc } as never;

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const input = { accountId: ACCOUNT, generationKey: 'gen-123' };
const insufficient = {
  code: 'P0001',
  message: 'insufficient usage credits for resource ai_writing_drafts (missing 1 units)',
};

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('measure before enforce, expressed as two flags', () => {
  it('is off until the meter is on, whatever the gate says', () => {
    expect(aiWritingMode({})).toBe('off');
    expect(aiWritingMode({ [AI_WRITING_GATE_FLAG]: '1' })).toBe('off');
  });

  it('measures with the meter alone and enforces only with both', () => {
    expect(aiWritingMode({ [AI_WRITING_METER_FLAG]: '1' })).toBe('measure');
    expect(aiWritingMode({
      [AI_WRITING_METER_FLAG]: '1', [AI_WRITING_GATE_FLAG]: '1',
    })).toBe('enforce');
  });

  it('reads each flag as exactly the string 1', () => {
    for (const value of ['0', '', 'true', ' 1']) {
      expect(aiWritingMode({ [AI_WRITING_METER_FLAG]: value })).toBe('off');
    }
  });
});

describe('what is held', () => {
  it('touches no ledger while dark', async () => {
    expect(await beginAiWritingUsage(admin, input, { mode: 'off' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'not_metered' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('holds exactly one credit for one generation', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginAiWritingUsage(admin, input, { mode: 'measure' });
    expect(rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({
      p_account_id: ACCOUNT,
      p_resource_code: AI_WRITING_RESOURCE_CODE,
      p_units: 1,
      p_idempotency_key: 'ai-writing:v1:gen-123',
    }));
  });

  it('keys the reservation to the generation key', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginAiWritingUsage(admin, input, { mode: 'measure' });
    await beginAiWritingUsage(
      admin, { ...input, generationKey: 'gen-456' }, { mode: 'measure' },
    );
    const [first, second] = rpc.mock.calls;
    expect(first[1].p_idempotency_key).not.toBe(second[1].p_idempotency_key);
    expect(first[1].p_idempotency_key).toContain('gen-123');
    expect(second[1].p_idempotency_key).toContain('gen-456');
  });
});

describe('refusal and overage', () => {
  it('refuses on a definite shortfall when enforcing without overage', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: insufficient });
    // Overages check: returns not authorized
    rpc.mockResolvedValueOnce({ data: { outcome: 'not_authorized' }, error: null });

    expect(await beginAiWritingUsage(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused' });
  });

  it('still generates for an exhausted workspace while only measuring', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginAiWritingUsage(admin, input, { mode: 'measure' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'exhausted_not_enforced' });
  });

  it('allows unmetered when the ledger cannot answer in enforce mode', async () => {
    rpc.mockRejectedValue(new Error('connection reset'));
    expect(await beginAiWritingUsage(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });
  });

  it('authorizes overage when credits are exhausted and overage is enabled', async () => {
    const previous = process.env.LGQ_USAGE_OVERAGE_ENABLED;
    process.env.LGQ_USAGE_OVERAGE_ENABLED = '1';
    try {
      rpc.mockResolvedValueOnce({ data: null, error: insufficient });
      // authorize_usage_overage RPC mock returns row with decision: 'accrued'
      rpc.mockResolvedValueOnce({
        data: [{
          decision: 'accrued',
          charged_millicents: 7600,
          accrued_millicents: 7600,
          cap_millicents: 500000,
        }],
        error: null,
      });

      const mockAdmin = {
        rpc,
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { period_start: '2026-08-01T00:00:00Z', period_end: '2026-09-01T00:00:00Z' },
                error: null,
              }),
            }),
          }),
        }),
      } as never;

      const result = await beginAiWritingUsage(mockAdmin, input, { mode: 'enforce' });
      expect(result).toMatchObject({
        outcome: 'allowed_overage',
        overage: expect.objectContaining({
          resourceCode: AI_WRITING_RESOURCE_CODE,
          units: 1,
          millicents: 7600,
        }),
      });
    } finally {
      if (previous === undefined) delete process.env.LGQ_USAGE_OVERAGE_ENABLED;
      else process.env.LGQ_USAGE_OVERAGE_ENABLED = previous;
    }
  });
});

describe('commit and release', () => {
  it('commits with the exact finalization key', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const lease = {
      reservationId: 'res-1',
      finalizationKey: 'ai-writing:v1:gen-123:commit',
      accountId: ACCOUNT,
      ownsReservation: true,
    };
    expect(await commitAiWritingUsage(admin, lease)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('commit_usage_reservation', {
      p_reservation_id: 'res-1',
      p_finalization_key: 'ai-writing:v1:gen-123:commit',
    });
  });

  it('releases with the reservation id and finalization key', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const lease = {
      reservationId: 'res-1',
      finalizationKey: 'ai-writing:v1:gen-123:commit',
      accountId: ACCOUNT,
      ownsReservation: true,
    };
    await releaseAiWritingUsage(admin, lease, 'failed');
    expect(rpc).toHaveBeenCalledWith('release_usage_reservation', {
      p_reservation_id: 'res-1',
      p_finalization_key: 'ai-writing:v1:gen-123:commit',
      p_reason: 'failed',
    });
  });
});
