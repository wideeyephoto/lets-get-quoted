import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TEXT_CREDIT_GATE_FLAG,
  TEXT_CREDIT_METER_FLAG,
  TEXT_CREDIT_RESOURCE_CODE,
  beginTextCreditUsage,
  commitTextCreditUsage,
  releaseTextCreditUsage,
  textCreditMode,
} from '@/lib/billing/text-credit-usage';

const rpc = vi.fn();
const admin = { rpc } as never;

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const input = (over: Partial<{ accountId: string | null; body: string; messageKey: string }> = {}) => ({
  accountId: ACCOUNT,
  body: 'Running 20 minutes late.',
  messageKey: 'reminder:job-1',
  ...over,
});

const insufficient = { code: 'P0001', message: 'insufficient usage credits for resource text_segments (missing 2 units)' };

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the two flags, and why enforcement needs both', () => {
  it('is off until the meter is switched on', () => {
    expect(textCreditMode({})).toBe('off');
    expect(textCreditMode({ [TEXT_CREDIT_GATE_FLAG]: '1' })).toBe('off');
  });

  it('measures without refusing when only the meter is on', () => {
    expect(textCreditMode({ [TEXT_CREDIT_METER_FLAG]: '1' })).toBe('measure');
  });

  it('enforces only when both are on', () => {
    // Structurally impossible to start refusing without having measured first,
    // which is what the measure-first rollout asks for.
    expect(textCreditMode({
      [TEXT_CREDIT_METER_FLAG]: '1', [TEXT_CREDIT_GATE_FLAG]: '1',
    })).toBe('enforce');
  });

  it('reads each flag as exactly the string 1', () => {
    for (const value of ['0', '', 'true', ' 1', 'yes']) {
      expect(textCreditMode({ [TEXT_CREDIT_METER_FLAG]: value })).toBe('off');
    }
  });
});

describe('what gets reserved', () => {
  it('holds one credit per carrier segment, not one per message', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginTextCreditUsage(admin, input({ body: 'x'.repeat(400) }), { mode: 'measure' });
    expect(rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({
      p_account_id: ACCOUNT,
      p_resource_code: TEXT_CREDIT_RESOURCE_CODE,
      p_units: 3,
    }));
  });

  it('prices an emoji message at what the carrier charges', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginTextCreditUsage(admin, input({ body: `${'x'.repeat(150)}\u{1F44D}` }), { mode: 'measure' });
    expect(rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({ p_units: 3 }));
  });

  it('uses a key stable across retries of the same message', async () => {
    rpc.mockResolvedValue({ data: 'res-1', error: null });
    await beginTextCreditUsage(admin, input(), { mode: 'measure' });
    await beginTextCreditUsage(admin, input(), { mode: 'measure' });
    const [first, second] = rpc.mock.calls;
    expect(first[1].p_idempotency_key).toBe(second[1].p_idempotency_key);
    // A retry that minted a fresh key would buy a second set of credits.
    expect(first[1].p_idempotency_key).toContain('reminder:job-1');
  });
});

describe('the failure posture: refuse only on a definite answer', () => {
  it('sends unmetered when the meter is off, touching no ledger', async () => {
    const decision = await beginTextCreditUsage(admin, input(), { mode: 'off' });
    expect(decision).toMatchObject({ outcome: 'allowed_unmetered', reason: 'not_metered' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends unmetered when there is no workspace to bill', async () => {
    // A signup verification code. Reported rather than ignored, so a message
    // that SHOULD carry an account shows up as this instead of vanishing.
    const decision = await beginTextCreditUsage(admin, input({ accountId: null }), { mode: 'enforce' });
    expect(decision).toMatchObject({ outcome: 'allowed_unmetered', reason: 'no_account' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends anyway when the ledger throws', async () => {
    // A reminder not sent because a database call timed out is worse than a
    // segment that went unbilled. This is the whole design decision.
    rpc.mockRejectedValue(new Error('connection reset'));
    expect(await beginTextCreditUsage(admin, input(), { mode: 'enforce' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });
  });

  it('sends anyway on an error that is not a definite shortfall', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '57014', message: 'canceling statement' } });
    expect(await beginTextCreditUsage(admin, input(), { mode: 'enforce' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });
  });

  it('sends anyway when the reservation id comes back unusable', async () => {
    for (const data of [null, '', 42, {}]) {
      rpc.mockResolvedValue({ data, error: null });
      expect(await beginTextCreditUsage(admin, input(), { mode: 'enforce' }))
        .toMatchObject({ outcome: 'allowed_unmetered', reason: 'ledger_unavailable' });
    }
  });

  it('refuses only on insufficient credits, and only when enforcing', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginTextCreditUsage(admin, input(), { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused', segments: 1 });
  });

  it('still sends an exhausted workspace while only measuring', async () => {
    rpc.mockResolvedValue({ data: null, error: insufficient });
    expect(await beginTextCreditUsage(admin, input(), { mode: 'measure' }))
      .toMatchObject({ outcome: 'allowed_unmetered', reason: 'exhausted_not_enforced' });
  });

  it('returns a lease when credits were held', async () => {
    rpc.mockResolvedValue({ data: 'res-9', error: null });
    const decision = await beginTextCreditUsage(admin, input(), { mode: 'enforce' });
    expect(decision.outcome).toBe('allowed');
    if (decision.outcome !== 'allowed') return;
    expect(decision.lease).toMatchObject({
      reservationId: 'res-9', segments: 1, accountId: ACCOUNT, ownsReservation: true,
    });
  });
});

describe('finalizing', () => {
  const lease = {
    reservationId: 'res-9',
    idempotencyKey: 'text-credit:v1:k',
    finalizationKey: 'text-credit:v1:k:commit',
    segments: 2,
    accountId: ACCOUNT,
    ownsReservation: true,
  } as const;

  it('commits with the finalization key the reservation was made under', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await commitTextCreditUsage(admin, lease)).toBe(true);
    expect(rpc).toHaveBeenCalledWith('commit_usage_reservation', {
      p_reservation_id: 'res-9',
      p_finalization_key: 'text-credit:v1:k:commit',
    });
  });

  it('refuses to finalize a reservation it did not create', async () => {
    // A retry that found somebody else's live reservation must not refund a
    // send that is still in flight.
    expect(await commitTextCreditUsage(admin, { ...lease, ownsReservation: false })).toBe(false);
    expect(await releaseTextCreditUsage(admin, { ...lease, ownsReservation: false }, 'x')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never throws out of a send path when release fails', async () => {
    // This runs inside the caller's error handler. Throwing here would turn a
    // failed text into a failed request, and the expiry sweeper picks up
    // whatever this misses within 15 minutes.
    rpc.mockRejectedValue(new Error('gone'));
    expect(await releaseTextCreditUsage(admin, lease, 'send_failed')).toBe(false);
    rpc.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await releaseTextCreditUsage(admin, lease, 'send_failed')).toBe(false);
  });

  it('truncates a long reason rather than letting the database refuse it', async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await releaseTextCreditUsage(admin, lease, 'y'.repeat(900));
    expect(rpc.mock.calls[0][1].p_reason).toHaveLength(500);
  });

  it('returns false when commit throws', async () => {
    rpc.mockRejectedValue(new Error('gone'));
    expect(await commitTextCreditUsage(admin, lease)).toBe(false);
  });
});
