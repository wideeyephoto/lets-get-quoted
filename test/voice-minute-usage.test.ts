import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  VOICE_CALL_CAP_MINUTES,
  VOICE_MINUTE_GATE_FLAG,
  VOICE_MINUTE_METER_FLAG,
  VOICE_MINUTE_RESOURCE_CODE,
  admitVoiceCall,
  billableVoiceMinutes,
  releaseVoiceCall,
  settleVoiceCall,
  voiceMinuteMode,
} from '@/lib/billing/voice-minute-usage';

const tryOverage = vi.fn();
const releaseOverage = vi.fn();
vi.mock('@/lib/billing/usage-overage', () => ({
  tryUsageOverage: (...a: unknown[]) => tryOverage(...a),
  releaseUsageOverage: (...a: unknown[]) => releaseOverage(...a),
}));

const rpc = vi.fn();
const admin = { rpc } as never;
type RpcReply = { data: unknown; error: unknown } | Error;
let rpcScript: Record<string, RpcReply[]>;

function setRpc(name: string, ...replies: RpcReply[]): void {
  rpcScript[name] = replies;
}

function callsFor(name: string): Array<[string, Record<string, unknown>]> {
  return rpc.mock.calls
    .filter((call) => call[0] === name)
    .map((call) => [
      String(call[0]),
      (call[1] && typeof call[1] === 'object' ? call[1] : {}) as Record<string, unknown>,
    ]);
}

const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const CALL = 'a15ce0a0-ac77-44a8-bd9e-5d9e506775ba';
const input = { accountId: ACCOUNT, providerCallId: CALL, dialedNumber: '+12485550199' };

const insufficient = {
  code: 'P0001',
  message: 'insufficient usage credits for resource voice_minutes (missing 60 units)',
};

/** The interval measured from a real SignalWire agent: 32.806429 seconds. */
const MEASURED = { ai_start_date: 1787171667036808, ai_end_date: 1787171699843237 };

beforeEach(() => {
  rpc.mockReset();
  rpcScript = {};
  rpc.mockImplementation(async (name: string) => {
    const scripted = rpcScript[name]?.shift();
    if (scripted instanceof Error) throw scripted;
    if (scripted) return scripted;
    if (name === 'claim_voice_call_admission_v2') {
      return { data: [{ claim_status: 'claimed', admission_id: 'adm-1' }], error: null };
    }
    if (name === 'finalize_voice_call_admission'
        || name === 'release_voice_call_admission_claim') {
      return { data: true, error: null };
    }
    return { data: null, error: { message: `unexpected RPC ${name}` } };
  });
  tryOverage.mockReset();
  tryOverage.mockResolvedValue({ outcome: 'not_authorized' });
  releaseOverage.mockReset();
  releaseOverage.mockResolvedValue(true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('what a call actually costs', () => {
  it('bills the AI-connected interval, not the call', () => {
    // ai_start..ai_end sits strictly inside the answered window, so ringing and
    // any post-transfer leg are excluded without anyone subtracting them.
    expect(billableVoiceMinutes(MEASURED)).toBe(1);
  });

  it('rounds up, because floor would bill a 33-second call as nothing', () => {
    const start = 1_000_000_000;
    const m = (seconds: number) => billableVoiceMinutes({
      ai_start_date: start, ai_end_date: start + seconds * 1_000_000,
    });
    expect(m(1)).toBe(1);
    expect(m(59)).toBe(1);
    expect(m(60)).toBe(1);
    expect(m(61)).toBe(2);
    expect(m(119)).toBe(2);
  });

  it('never bills past the published safety cap', () => {
    const start = 1_000_000_000;
    expect(billableVoiceMinutes({
      ai_start_date: start, ai_end_date: start + 3 * 60 * 60 * 1_000_000,
    })).toBe(VOICE_CALL_CAP_MINUTES);
  });

  it('charges nothing for an AI session of no length', () => {
    expect(billableVoiceMinutes({ ai_start_date: 5_000, ai_end_date: 5_000 })).toBe(0);
  });

  it('returns null, not zero, when the receipt cannot support a bill', () => {
    // Zero is a settlement. Null is a reconciliation. Collapsing them would
    // quietly write off every malformed receipt as a free call.
    for (const receipt of [
      {},
      { ai_start_date: 1, ai_end_date: undefined },
      { ai_start_date: 'later', ai_end_date: 'sooner' },
      { ai_start_date: 9_000, ai_end_date: 1_000 },
      { ai_start_date: 0, ai_end_date: 5_000 },
      { ai_start_date: -1, ai_end_date: 5_000 },
      { ai_start_date: Number.NaN, ai_end_date: 5_000 },
    ]) {
      expect(billableVoiceMinutes(receipt), JSON.stringify(receipt)).toBeNull();
    }
  });
});

describe('the two flags', () => {
  it('is off until the meter is switched on', () => {
    expect(voiceMinuteMode({})).toBe('off');
    expect(voiceMinuteMode({ [VOICE_MINUTE_GATE_FLAG]: '1' })).toBe('off');
  });

  it('measures without refusing when only the meter is on', () => {
    expect(voiceMinuteMode({ [VOICE_MINUTE_METER_FLAG]: '1' })).toBe('measure');
  });

  it('enforces only when both are on', () => {
    expect(voiceMinuteMode({
      [VOICE_MINUTE_METER_FLAG]: '1', [VOICE_MINUTE_GATE_FLAG]: '1',
    })).toBe('enforce');
  });
});

describe('admission', () => {
  it('claims the concurrency slot before touching the minute ledger', async () => {
    setRpc('reserve_usage_credits', { data: 'res-1', error: null });
    await admitVoiceCall(admin, input, { mode: 'measure', concurrencyLimit: 3 });
    expect(rpc.mock.calls.slice(0, 2).map((call) => call[0])).toEqual([
      'claim_voice_call_admission_v2',
      'reserve_usage_credits',
    ]);
    expect(rpc).toHaveBeenCalledWith('claim_voice_call_admission_v2', {
      p_account_id: ACCOUNT,
      p_provider_call_id: CALL,
      p_dialed_number: '+12485550199',
      p_concurrency_limit: 3,
      p_caller_number: null,
      p_caller_kind: 'unknown',
    });
  });

  it('honours the atomic capacity answer without reserving minutes', async () => {
    setRpc('claim_voice_call_admission_v2', {
      data: [{ claim_status: 'at_capacity', admission_id: null }], error: null,
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce', concurrencyLimit: 1 }))
      .toEqual({ outcome: 'refused', reason: 'at_capacity' });
    expect(callsFor('reserve_usage_credits')).toHaveLength(0);
  });

  it('honours a final database-boundary sender suspension without touching the ledger', async () => {
    setRpc('claim_voice_call_admission_v2', {
      data: [{ claim_status: 'number_not_ready', admission_id: null }], error: null,
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce', concurrencyLimit: 1 }))
      .toEqual({ outcome: 'refused', reason: 'number_not_ready' });
    expect(callsFor('reserve_usage_credits')).toHaveLength(0);
  });

  it('refuses a CallSid that was terminally tombstoned before admission', async () => {
    setRpc('claim_voice_call_admission_v2', {
      data: [{ claim_status: 'call_terminal', admission_id: null }], error: null,
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce', concurrencyLimit: 1 }))
      .toEqual({ outcome: 'refused', reason: 'call_terminal' });
    expect(callsFor('reserve_usage_credits')).toHaveLength(0);
  });

  it('replays an already-finalized call without buying a second hold', async () => {
    setRpc('claim_voice_call_admission_v2', {
      data: [{ claim_status: 'existing', admission_id: 'adm-1' }], error: null,
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toEqual({ outcome: 'admitted_unmetered', reason: 'existing_admission' });
    expect(callsFor('reserve_usage_credits')).toHaveLength(0);
  });

  it('fails to the normal line for a busy or unreadable admission claim', async () => {
    setRpc('claim_voice_call_admission_v2', {
      data: [{ claim_status: 'busy', admission_id: 'adm-1' }], error: null,
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toEqual({ outcome: 'refused', reason: 'admission_unavailable' });

    setRpc('claim_voice_call_admission_v2', {
      data: null, error: { code: '08006', message: 'database unavailable' },
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toEqual({ outcome: 'refused', reason: 'admission_unavailable' });
  });

  it('holds the whole safety cap, not an estimate', () => {
    // Holding the cap is what makes a spending limit mean anything while the
    // call is still running: two concurrent calls cannot both believe the last
    // minute is theirs.
    setRpc('reserve_usage_credits', { data: 'res-1', error: null });
    return admitVoiceCall(admin, input, { mode: 'measure' }).then(() => {
      expect(rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({
        p_resource_code: VOICE_MINUTE_RESOURCE_CODE,
        p_units: VOICE_CALL_CAP_MINUTES,
        p_operation_type: 'ai_voice_minute',
      }));
    });
  });

  it('holds it for longer than the longest call it could cover', async () => {
    setRpc('reserve_usage_credits', { data: 'res-1', error: null });
    const now = new Date('2026-08-19T12:00:00.000Z');
    await admitVoiceCall(admin, input, { mode: 'measure', now: () => now });
    const held = new Date(String(
      callsFor('reserve_usage_credits')[0][1].p_expires_at,
    )).getTime() - now.getTime();
    // A 15-minute hold like the other meters would expire mid-conversation and
    // hand the minutes back while the caller was still talking.
    expect(held).toBeGreaterThan(VOICE_CALL_CAP_MINUTES * 60_000);
  });

  it('keys the hold on the call, so a retried webhook buys nothing twice', async () => {
    setRpc(
      'reserve_usage_credits',
      { data: 'res-1', error: null },
      { data: 'res-1', error: null },
    );
    await admitVoiceCall(admin, input, { mode: 'measure' });
    await admitVoiceCall(admin, input, { mode: 'measure' });
    const [first, second] = callsFor('reserve_usage_credits');
    expect(String(first[1].p_idempotency_key)).toBe(String(second[1].p_idempotency_key));
    expect(String(first[1].p_idempotency_key)).toContain(CALL);
  });

  it('records the admission, which is what makes a forged receipt inert', async () => {
    setRpc('reserve_usage_credits', { data: 'res-9', error: null });
    await admitVoiceCall(admin, input, { mode: 'enforce' });
    expect(rpc).toHaveBeenCalledWith('finalize_voice_call_admission', expect.objectContaining({
      p_account_id: ACCOUNT, p_provider_call_id: CALL,
      p_reservation_id: 'res-9', p_reserved_minutes: VOICE_CALL_CAP_MINUTES,
    }));
  });
});

describe('the failure posture: answer the call', () => {
  it('answers unmetered when the meter is off, but still records attribution', async () => {
    expect(await admitVoiceCall(admin, input, { mode: 'off' }))
      .toMatchObject({ outcome: 'admitted_unmetered', reason: 'not_metered' });
    expect(rpc).toHaveBeenCalledWith('finalize_voice_call_admission', expect.objectContaining({
      p_provider_call_id: CALL, p_reservation_id: null, p_reserved_minutes: 0,
    }));
  });

  it('refuses rather than answer a call whose receipt could not be attributed', async () => {
    setRpc('finalize_voice_call_admission', {
      data: null, error: { code: '08006', message: 'database unavailable' },
    });
    expect(await admitVoiceCall(admin, input, { mode: 'off' }))
      .toMatchObject({ outcome: 'refused', reason: 'admission_unavailable' });
    expect(callsFor('release_voice_call_admission_claim')).toEqual([[
      'release_voice_call_admission_claim',
      {
        p_admission_id: 'adm-1',
        p_account_id: ACCOUNT,
        p_provider_call_id: CALL,
      },
    ]]);
  });

  it.each([
    ['the minute ledger throws', 'enforce', () => {
      setRpc('reserve_usage_credits', new Error('connection reset'));
    }],
    ['the minute ledger returns an error', 'enforce', () => {
      setRpc('reserve_usage_credits', {
        data: null, error: { code: '57014', message: 'canceling statement' },
      });
    }],
    ['the minute ledger returns an unusable reservation id', 'enforce', () => {
      setRpc('reserve_usage_credits', { data: 42, error: null });
    }],
    ['measure mode has no allowance', 'measure', () => {
      setRpc('reserve_usage_credits', { data: null, error: insufficient });
    }],
  ] as const)('releases the exact claim when %s and fallback attribution fails', async (_label, mode, arrange) => {
    arrange();
    setRpc('finalize_voice_call_admission', {
      data: null, error: { code: '08006', message: 'database unavailable' },
    });

    expect(await admitVoiceCall(admin, input, { mode }))
      .toMatchObject({ outcome: 'refused', reason: 'admission_unavailable' });
    expect(callsFor('release_voice_call_admission_claim')).toEqual([[
      'release_voice_call_admission_claim',
      {
        p_admission_id: 'adm-1',
        p_account_id: ACCOUNT,
        p_provider_call_id: CALL,
      },
    ]]);
  });

  it('answers anyway when the ledger throws', async () => {
    // A receptionist that fails closed sends every caller to voicemail during an
    // outage, for a product sold as "your phone keeps working". The exposure is
    // bounded by the cap and recoverable, because the receipt still arrives.
    setRpc('reserve_usage_credits', new Error('connection reset'));
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'admitted_unmetered', reason: 'ledger_unavailable' });
  });

  it('answers anyway on an error that is not a definite shortfall', async () => {
    setRpc('reserve_usage_credits', {
      data: null, error: { code: '57014', message: 'canceling statement' },
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'admitted_unmetered', reason: 'ledger_unavailable' });
  });

  it('answers anyway when the reservation id comes back unusable', async () => {
    for (const data of [null, '', 42, {}]) {
      setRpc('reserve_usage_credits', { data, error: null });
      expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
        .toMatchObject({ outcome: 'admitted_unmetered', reason: 'ledger_unavailable' });
    }
  });

  it('still records the admission when it could not meter', async () => {
    // The receipt for THIS call still has to be attributable to a workspace, or
    // it arrives looking exactly like a forgery.
    setRpc('reserve_usage_credits', new Error('down'));
    await admitVoiceCall(admin, input, { mode: 'enforce' });
    expect(rpc).toHaveBeenCalledWith('finalize_voice_call_admission', expect.objectContaining({
      p_provider_call_id: CALL, p_reservation_id: null, p_reserved_minutes: 0,
    }));
  });

  it('releases a metered hold when admission attribution cannot be stored', async () => {
    setRpc('reserve_usage_credits', { data: 'res-orphan', error: null });
    setRpc('finalize_voice_call_admission', {
      data: null, error: { code: '08006', message: 'database unavailable' },
    });
    setRpc('release_usage_reservation', { data: true, error: null });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused', reason: 'admission_unavailable' });
    expect(rpc).toHaveBeenCalledWith('release_usage_reservation', expect.objectContaining({
      p_reservation_id: 'res-orphan',
      p_reason: 'admission_record_failed',
    }));
    expect(rpc.mock.calls.slice(-2).map((call) => call[0])).toEqual([
      'release_usage_reservation',
      'release_voice_call_admission_claim',
    ]);
  });

  it('refuses an exhausted workspace, which is voicemail and not an error', async () => {
    setRpc('reserve_usage_credits', { data: null, error: insufficient });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused' });
  });

  it('records no admission when it refuses, because no receipt will come', async () => {
    setRpc('reserve_usage_credits', { data: null, error: insufficient });
    await admitVoiceCall(admin, input, { mode: 'enforce' });
    expect(callsFor('finalize_voice_call_admission')).toHaveLength(0);
    expect(callsFor('release_voice_call_admission_claim')).toHaveLength(1);
  });

  it('still answers an exhausted workspace while only measuring', async () => {
    setRpc('reserve_usage_credits', { data: null, error: insufficient });
    expect(await admitVoiceCall(admin, input, { mode: 'measure' }))
      .toMatchObject({ outcome: 'admitted_unmetered', reason: 'exhausted_not_enforced' });
  });

  it('is never asked for overage while only measuring', async () => {
    setRpc('reserve_usage_credits', { data: null, error: insufficient });
    await admitVoiceCall(admin, input, { mode: 'measure' });
    expect(tryOverage).not.toHaveBeenCalled();
  });

  it('asks for overage before sending the caller to voicemail', async () => {
    setRpc('reserve_usage_credits', { data: null, error: insufficient });
    tryOverage.mockResolvedValue({
      outcome: 'accrued', chargedMillicents: 2_100_000, accruedMillicents: 2_100_000, capMillicents: 5_000_000,
    });
    const d = await admitVoiceCall(admin, input, { mode: 'enforce' });
    expect(d).toMatchObject({ outcome: 'admitted_overage' });
    expect(tryOverage).toHaveBeenCalledWith(admin, expect.objectContaining({
      resourceCode: 'voice_minutes', units: VOICE_CALL_CAP_MINUTES,
    }));
  });

  it('releases an overage when admission attribution cannot be stored', async () => {
    setRpc('reserve_usage_credits', { data: null, error: insufficient });
    tryOverage.mockResolvedValue({
      outcome: 'accrued',
      chargedMillicents: 2_100_000,
      accruedMillicents: 2_100_000,
      capMillicents: 5_000_000,
      periodStart: '2026-08-01',
      idempotencyKey: 'voice-overage-key',
    });
    setRpc('finalize_voice_call_admission', {
      data: null, error: { code: '08006', message: 'database unavailable' },
    });
    expect(await admitVoiceCall(admin, input, { mode: 'enforce' }))
      .toMatchObject({ outcome: 'refused', reason: 'admission_unavailable' });
    expect(releaseOverage).toHaveBeenCalledWith(admin, expect.objectContaining({
      accountId: ACCOUNT,
      idempotencyKey: 'voice-overage-key',
    }));
    expect(callsFor('release_voice_call_admission_claim')).toHaveLength(1);
    const claimReleaseIndex = rpc.mock.calls.findIndex(
      (call) => call[0] === 'release_voice_call_admission_claim',
    );
    expect(releaseOverage.mock.invocationCallOrder[0])
      .toBeLessThan(rpc.mock.invocationCallOrder[claimReleaseIndex]);
  });

  it('refuses when overage is unavailable, and never admits on uncertainty there', async () => {
    setRpc(
      'reserve_usage_credits',
      { data: null, error: insufficient },
      { data: null, error: insufficient },
      { data: null, error: insufficient },
    );
    for (const outcome of ['cap_reached', 'not_authorized', 'unavailable']) {
      tryOverage.mockResolvedValue({ outcome });
      expect(await admitVoiceCall(admin, input, { mode: 'enforce' }), outcome)
        .toMatchObject({ outcome: 'refused' });
    }
  });
});

describe('settlement', () => {
  const lease = {
    reservationId: 'res-9',
    finalizationKey: 'ai-voice:v1:call:settle',
    accountId: ACCOUNT,
    providerCallId: CALL,
    reservedMinutes: 60,
    ownsReservation: true,
  } as const;

  it('commits only what the call used', async () => {
    setRpc('commit_usage_reservation_partial', { data: 1, error: null });
    expect(await settleVoiceCall(admin, lease, 1)).toBe(1);
    expect(rpc).toHaveBeenCalledWith('commit_usage_reservation_partial', {
      p_reservation_id: 'res-9',
      p_finalization_key: 'ai-voice:v1:call:settle',
      p_units: 1,
    });
  });

  it('never commits more than was held, whatever a receipt claims', async () => {
    setRpc('commit_usage_reservation_partial', { data: 60, error: null });
    await settleVoiceCall(admin, lease, 5_000);
    expect(Number(callsFor('commit_usage_reservation_partial')[0][1].p_units)).toBe(60);
  });

  it('returns null rather than zero when settlement fails', async () => {
    setRpc('commit_usage_reservation_partial', { data: null, error: { message: 'nope' } });
    expect(await settleVoiceCall(admin, lease, 3)).toBeNull();
    setRpc('commit_usage_reservation_partial', new Error('gone'));
    expect(await settleVoiceCall(admin, lease, 3)).toBeNull();
  });

  it('refuses nonsense minute counts rather than passing them to the ledger', async () => {
    for (const minutes of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(await settleVoiceCall(admin, lease, minutes), String(minutes)).toBeNull();
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('will not settle or release a hold it does not own', async () => {
    const borrowed = { ...lease, ownsReservation: false };
    expect(await settleVoiceCall(admin, borrowed, 1)).toBeNull();
    expect(await releaseVoiceCall(admin, borrowed, 'x')).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('never throws out of a release, which runs in an error path', async () => {
    setRpc('release_usage_reservation', new Error('gone'));
    expect(await releaseVoiceCall(admin, lease, 'never_connected')).toBe(false);
  });

  it('truncates a long release reason rather than letting the database refuse it', async () => {
    setRpc('release_usage_reservation', { data: true, error: null });
    await releaseVoiceCall(admin, lease, 'y'.repeat(900));
    expect(String(callsFor('release_usage_reservation')[0][1].p_reason)).toHaveLength(500);
  });
});
