import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MARKETING_EMAIL_GATE_FLAG,
  MARKETING_EMAIL_METER_FLAG,
  MARKETING_EMAIL_RESOURCE_CODE,
  beginMarketingEmailUsage,
  commitMarketingEmailUsage,
  marketingEmailMode,
  releaseMarketingEmailUsage,
} from '@/lib/billing/marketing-email-usage';

const rpc = vi.fn();
const admin = { rpc } as never;

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const input = { accountId: ACCOUNT, sendKey: 'run-1:dave@example.com' };
const insufficient = {
  code: 'P0001',
  message: 'insufficient usage credits for resource marketing_email_sends (missing 1 units)',
};

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('measure before enforce, expressed as two flags', () => {
  it('is off until the meter is on, whatever the gate says', () => {
    expect(marketingEmailMode({})).toBe('off');
    expect(marketingEmailMode({ [MARKETING_EMAIL_GATE_FLAG]: '1' })).toBe('off');
  });

  it('measures with the meter alone and enforces only with both', () => {
    expect(marketingEmailMode({ [MARKETING_EMAIL_METER_FLAG]: '1' })).toBe('measure');
    expect(marketingEmailMode({
      [MARKETING_EMAIL_METER_FLAG]: '1', [MARKETING_EMAIL_GATE_FLAG]: '1',
    })).toBe('enforce');
  });

  it('reads each flag as exactly the string 1', () => {
    for (const value of ['0', '', 'true', ' 1']) {
      expect(marketingEmailMode({ [MARKETING_EMAIL_METER_FLAG]: value })).toBe('off');
    }
  });
});

describe('what is held', () => {
  it('touches no ledger while dark', async () => {
    expect(await beginMarketingEmailUsage(admin, input, { mode: 'off' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'not_metered' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('holds exactly one credit for one recipient', async () => {
    // One reservation per recipient, because commit_usage_reservation has no
    // unit count and a campaign that dies halfway must not bill for the rest.
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginMarketingEmailUsage(admin, input, { mode: 'measure' });
    expect(rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({
      p_account_id: ACCOUNT,
      p_resource_code: MARKETING_EMAIL_RESOURCE_CODE,
      p_units: 1,
    }));
  });

  it('keys the reservation to this recipient of this run', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginMarketingEmailUsage(admin, input, { mode: 'measure' });
    await beginMarketingEmailUsage(
      admin, { ...input, sendKey: 'run-1:sam@example.com' }, { mode: 'measure' },
    );
    const [first, second] = rpc.mock.calls;
    expect(first[1].p_idempotency_key).not.toBe(second[1].p_idempotency_key);
    expect(first[1].p_idempotency_key).toContain('dave@example.com');
  });
});

describe('refusal is one recipient, never the campaign', () => {
  it('refuses only on a definite shortfall, and only when enforcing', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginMarketingEmailUsage(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused' });
  });

  it('still sends an exhausted workspace while only measuring', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginMarketingEmailUsage(admin, input, { mode: 'measure' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'exhausted_not_enforced' });
  });

  it('sends anyway when the ledger cannot answer', async () => {
    // A transient error must not truncate a campaign the contractor is watching
    // run. Unbillable is better than half-sent-and-reported-as-whole.
    rpc.mockRejectedValue(new Error('connection reset'));
    expect(await beginMarketingEmailUsage(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });

    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement' } });
    expect(await beginMarketingEmailUsage(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });

    for (const data of [null, '', 7]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await beginMarketingEmailUsage(admin, input, { mode: 'enforce' }))
        .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });
    }
  });
});

describe('finalizing', () => {
  const lease = {
    reservationId: 'res-9',
    finalizationKey: 'marketing-email:v1:k:commit',
    accountId: ACCOUNT,
    ownsReservation: true,
  } as const;

  it('commits under the key the reservation was made with', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await commitMarketingEmailUsage(admin, lease)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('commit_usage_reservation', {
      p_reservation_id: 'res-9', p_finalization_key: 'marketing-email:v1:k:commit',
    });
  });

  it('will not finalize a reservation it did not create', async () => {
    const borrowed = { ...lease, ownsReservation: false };
    expect(await commitMarketingEmailUsage(admin, borrowed)).toBe(false);
    expect(await releaseMarketingEmailUsage(admin, borrowed, 'x')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never throws out of the per-recipient catch', async () => {
    // This runs inside the loop that must go on to the next recipient.
    rpc.mockRejectedValue(new Error('gone'));
    expect(await releaseMarketingEmailUsage(admin, lease, 'send_failed')).toBe(false);
    expect(await commitMarketingEmailUsage(admin, lease)).toBe(false);
  });

  it('truncates a long reason rather than letting the database refuse it', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await releaseMarketingEmailUsage(admin, lease, 'y'.repeat(900));
    expect(rpc.mock.calls[0][1].p_reason).toHaveLength(500);
  });
});
