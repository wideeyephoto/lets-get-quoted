import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  AI_INTAKE_OPERATION_TYPE,
  AI_INTAKE_PROVIDER_ATTEMPT_LIMIT,
  AI_INTAKE_PROVIDER_ATTEMPT_WINDOW_SECONDS,
  AI_INTAKE_RESOURCE_CODE,
  aiIntakeUsageGateEnabled,
  allowAiIntakeProviderAttempt,
  beginAiIntakeUsage,
  buildAiIntakeUsageIdentity,
  commitAiIntakeUsage,
  releaseAiIntakeUsage,
  type AiIntakeUsageInput,
} from '@/lib/billing/ai-intake-usage';

const ACCOUNT_ID = '10000000-0000-4000-8000-000000000001';
const SITE_A = '20000000-0000-4000-8000-000000000002';
const SITE_B = '20000000-0000-4000-8000-000000000003';
const THREAD_ID = '30000000-0000-4000-8000-000000000003';
const RESERVATION_ID = '40000000-0000-4000-8000-000000000004';
const CLAIM_NONCE = '50000000-0000-4000-8000-000000000005';
const NOW = new Date('2026-08-15T20:00:00.000Z');

type Row = {
  id: string;
  account_id: string;
  resource_code: string;
  operation_type: string;
  idempotency_key: string;
  state: string;
  finalization_key: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  expires_at: string;
};

function request(overrides: Partial<AiIntakeUsageInput> = {}): AiIntakeUsageInput {
  return { accountId: ACCOUNT_ID, siteId: SITE_A, threadId: THREAD_ID, flowKind: 'smart_intake', ...overrides };
}

function rowFor(input: AiIntakeUsageInput, overrides: Partial<Row> = {}): Row {
  const identity = buildAiIntakeUsageIdentity(input);
  return {
    id: RESERVATION_ID,
    account_id: input.accountId,
    resource_code: AI_INTAKE_RESOURCE_CODE,
    operation_type: AI_INTAKE_OPERATION_TYPE,
    idempotency_key: identity.idempotencyKey,
    state: 'reserved',
    finalization_key: null,
    metadata: {
      schema: 'ai_intake_thread_v1',
      account_id: input.accountId,
      site_id: input.siteId,
      thread_id: input.threadId.toLowerCase(),
      flow_kind: input.flowKind,
      claim_nonce: CLAIM_NONCE,
    },
    created_at: NOW.toISOString(),
    expires_at: new Date(NOW.getTime() + (15 * 60 * 1_000)).toISOString(),
    ...overrides,
  };
}

function mockAdmin(options: {
  initialRow?: Row | null;
  reserveError?: { code?: string; message?: string } | null;
  onReserve?: (args: Record<string, unknown>, existing: Row | null) => Row;
} = {}) {
  let storedRow = options.initialRow ?? null;
  const queryFilters = new Map<string, unknown>();
  const eq = vi.fn((column: string, value: unknown) => {
    queryFilters.set(column, value);
    return chain;
  });
  const maybeSingle = vi.fn(async () => {
    const matches = storedRow
      && [...queryFilters].every(([column, value]) => (storedRow as unknown as Record<string, unknown>)[column] === value);
    queryFilters.clear();
    return { data: matches ? storedRow : null, error: null };
  });
  const chain = {
    select: vi.fn(() => chain),
    eq,
    maybeSingle,
  };
  const from = vi.fn(() => chain);
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (name === 'reserve_usage_credits') {
      if (options.reserveError) return { data: null, error: options.reserveError };
      if (!storedRow) storedRow = options.onReserve?.(args, storedRow) ?? null;
      return { data: storedRow?.id ?? RESERVATION_ID, error: null };
    }
    if (name === 'commit_usage_reservation') {
      if (storedRow) {
        storedRow = { ...storedRow, state: 'committed', finalization_key: String(args.p_finalization_key) };
      }
      return { data: true, error: null };
    }
    if (name === 'release_usage_reservation') {
      if (storedRow) storedRow = { ...storedRow, state: 'released', finalization_key: String(args.p_finalization_key) };
      return { data: true, error: null };
    }
    return { data: null, error: { message: `Unexpected RPC ${name}` } };
  });
  return {
    admin: { from, rpc } as unknown as SupabaseClient,
    from,
    rpc,
    readRow: () => storedRow,
  };
}

const enabled = (allowNewThread = vi.fn(async () => true)) => ({
  enabled: true,
  dependencies: { now: () => NOW, allowNewThread },
});

describe('AI Intake usage reservation gate', () => {
  it('is exact-string opt-in and performs zero ledger or limiter work while off', async () => {
    expect(aiIntakeUsageGateEnabled({ LGQ_AI_INTAKE_USAGE_GATE_ENABLED: '1' })).toBe(true);
    expect(aiIntakeUsageGateEnabled({ LGQ_AI_INTAKE_USAGE_GATE_ENABLED: 'true' })).toBe(false);
    expect(aiIntakeUsageGateEnabled({})).toBe(false);
    const { admin, from, rpc } = mockAdmin();
    const allowNewThread = vi.fn(async () => true);

    await expect(beginAiIntakeUsage(admin, request(), {
      enabled: false,
      dependencies: { allowNewThread },
    })).resolves.toEqual({ kind: 'disabled' });
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(allowNewThread).not.toHaveBeenCalled();

    const providerLimiter = vi.fn(async () => false);
    await expect(allowAiIntakeProviderAttempt(null, providerLimiter)).resolves.toBe(true);
    expect(providerLimiter).not.toHaveBeenCalled();
  });

  it('uses a fail-closed ten-attempt, 24-hour budget keyed only by the hashed thread identity', async () => {
    const input = request();
    const identity = buildAiIntakeUsageIdentity(input);
    const limiter = vi.fn(async (_bucket: string, _limit: number, _windowSeconds: number) => false);
    const lease = {
      kind: 'allowed' as const,
      reservationId: RESERVATION_ID,
      ...identity,
      state: 'committed' as const,
      ownsReservation: false,
    };

    await expect(allowAiIntakeProviderAttempt(lease, limiter)).resolves.toBe(false);
    expect(limiter).toHaveBeenCalledWith(
      `ai-intake:provider:${identity.idempotencyKey}`,
      AI_INTAKE_PROVIDER_ATTEMPT_LIMIT,
      AI_INTAKE_PROVIDER_ATTEMPT_WINDOW_SECONDS,
    );
    expect(limiter.mock.calls[0]?.[0]).not.toContain(input.threadId);
  });

  it('falls back before paid work when no credit is available', async () => {
    const { admin, rpc } = mockAdmin({
      reserveError: { code: 'P0001', message: 'insufficient usage credits for ai_intake_threads' },
    });
    const paidAiWork = vi.fn();
    const decision = await beginAiIntakeUsage(admin, request(), enabled());
    if (decision.kind === 'allowed') paidAiWork();

    expect(decision).toEqual({ kind: 'classic_fallback', reason: 'no_credits' });
    expect(paidAiWork).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('fails closed before OpenAI when reservation storage throws', async () => {
    const lookupFailure = mockAdmin();
    lookupFailure.from.mockImplementationOnce(() => { throw new Error('database unavailable'); });
    await expect(beginAiIntakeUsage(lookupFailure.admin, request(), enabled()))
      .resolves.toEqual({ kind: 'classic_fallback', reason: 'unavailable' });
    expect(lookupFailure.rpc).not.toHaveBeenCalled();

    const reserveFailure = mockAdmin();
    reserveFailure.rpc.mockImplementationOnce(async () => { throw new Error('rpc unavailable'); });
    await expect(beginAiIntakeUsage(reserveFailure.admin, request(), enabled()))
      .resolves.toEqual({ kind: 'classic_fallback', reason: 'unavailable' });
  });

  it('uses the strict new-thread allowance only when no stable reservation exists', async () => {
    const committedInput = request();
    const committed = rowFor(committedInput, {
      state: 'committed',
      finalization_key: buildAiIntakeUsageIdentity(committedInput).finalizationKey,
    });
    const existing = mockAdmin({ initialRow: committed });
    const existingLimiter = vi.fn(async () => false);

    await expect(beginAiIntakeUsage(existing.admin, committedInput, enabled(existingLimiter)))
      .resolves.toMatchObject({ kind: 'allowed', state: 'committed' });
    expect(existingLimiter).not.toHaveBeenCalled();
    expect(existing.rpc).not.toHaveBeenCalled();

    const fresh = mockAdmin();
    const freshLimiter = vi.fn(async () => false);
    await expect(beginAiIntakeUsage(fresh.admin, request(), enabled(freshLimiter)))
      .resolves.toEqual({ kind: 'classic_fallback', reason: 'unavailable' });
    expect(freshLimiter).toHaveBeenCalledTimes(1);
    expect(fresh.rpc).not.toHaveBeenCalled();
  });

  it('allows a committed same-thread replay without another debit', async () => {
    const input = request();
    const { admin, rpc } = mockAdmin({
      initialRow: rowFor(input, {
        state: 'committed',
        finalization_key: buildAiIntakeUsageIdentity(input).finalizationKey,
      }),
    });

    const first = await beginAiIntakeUsage(admin, input, enabled());
    const second = await beginAiIntakeUsage(admin, input, enabled());
    expect(first).toMatchObject({ kind: 'allowed', state: 'committed', ownsReservation: false });
    expect(second).toMatchObject({ kind: 'allowed', state: 'committed', ownsReservation: false });
    expect(rpc).not.toHaveBeenCalled();
    if (second.kind === 'allowed') await expect(commitAiIntakeUsage(admin, second)).resolves.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('recovers an existing reserved thread without another debit or new-thread allowance', async () => {
    const limiter = vi.fn(async () => false);
    const { admin, rpc } = mockAdmin({ initialRow: rowFor(request()) });

    await expect(beginAiIntakeUsage(admin, request(), enabled(limiter)))
      .resolves.toMatchObject({
        kind: 'allowed',
        reservationId: RESERVATION_ID,
        state: 'reserved',
        ownsReservation: false,
      });
    expect(rpc).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
  });

  it('rejects a stale unswept reservation before any provider work', async () => {
    const limiter = vi.fn(async () => true);
    const { admin, rpc } = mockAdmin({
      initialRow: rowFor(request(), {
        expires_at: new Date(NOW.getTime() - 1).toISOString(),
      }),
    });

    await expect(beginAiIntakeUsage(admin, request(), enabled(limiter)))
      .resolves.toEqual({ kind: 'classic_fallback', reason: 'expired' });
    expect(rpc).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
  });

  it('permanently falls back for released and expired thread reservations', async () => {
    for (const state of ['released', 'expired'] as const) {
      const mocked = mockAdmin({ initialRow: rowFor(request(), { state }) });
      const limiter = vi.fn(async () => true);
      const decision = await beginAiIntakeUsage(mocked.admin, request(), enabled(limiter));
      expect(decision).toEqual({ kind: 'classic_fallback', reason: 'finalized' });
      expect(mocked.rpc).not.toHaveBeenCalled();
      expect(limiter).not.toHaveBeenCalled();
    }
  });

  it('binds identity and metadata to the server-resolved site and flow', async () => {
    const siteA = request();
    const siteB = request({ siteId: SITE_B });
    expect(buildAiIntakeUsageIdentity(siteA).idempotencyKey)
      .not.toBe(buildAiIntakeUsageIdentity(siteB).idempotencyKey);

    const { admin } = mockAdmin({
      onReserve: (args) => rowFor(siteB, {
        idempotency_key: String(args.p_idempotency_key),
        metadata: { ...rowFor(siteA).metadata },
      }),
    });
    await expect(beginAiIntakeUsage(admin, siteB, enabled()))
      .resolves.toEqual({ kind: 'classic_fallback', reason: 'unavailable' });
  });

  it('normalizes uppercase UUIDs before validating stored metadata', async () => {
    const upperInput = request({ threadId: THREAD_ID.toUpperCase() });
    const normalized = request();
    const { admin } = mockAdmin({
      onReserve: (args) => rowFor(normalized, { idempotency_key: String(args.p_idempotency_key) }),
    });
    await expect(beginAiIntakeUsage(admin, upperInput, enabled()))
      .resolves.toMatchObject({ kind: 'allowed', state: 'reserved' });
  });

  it('keeps concurrent first turns on one recoverable reservation and stable finalization key', async () => {
    const input = request();
    const mocked = mockAdmin({
      onReserve: (args) => rowFor(input, {
        idempotency_key: String(args.p_idempotency_key),
        metadata: { ...rowFor(input).metadata, ...(args.p_metadata as Record<string, unknown>) },
      }),
    });

    const [first, second] = await Promise.all([
      beginAiIntakeUsage(mocked.admin, input, enabled()),
      beginAiIntakeUsage(mocked.admin, input, enabled()),
    ]);

    expect(first).toMatchObject({ kind: 'allowed', reservationId: RESERVATION_ID, state: 'reserved' });
    expect(second).toMatchObject({ kind: 'allowed', reservationId: RESERVATION_ID, state: 'reserved' });
    if (first.kind !== 'allowed' || second.kind !== 'allowed') throw new Error('expected two idempotent leases');
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first.finalizationKey).toBe(second.finalizationKey);
    expect([first, second].filter((lease) => lease.ownsReservation)).toHaveLength(1);
    const replay = first.ownsReservation ? second : first;
    const releaseCallsBefore = mocked.rpc.mock.calls.filter(([name]) => name === 'release_usage_reservation').length;
    await expect(releaseAiIntakeUsage(mocked.admin, replay, 'concurrent failure')).resolves.toBe(false);
    expect(mocked.rpc.mock.calls.filter(([name]) => name === 'release_usage_reservation')).toHaveLength(releaseCallsBefore);
    expect(mocked.rpc.mock.calls.filter(([name]) => name === 'reserve_usage_credits')).toHaveLength(2);
    expect(mocked.readRow()?.id).toBe(RESERVATION_ID);
  });

  it('commits only a substantive reserved lease and can release provider failure once', async () => {
    const input = request();
    const mocked = mockAdmin({
      onReserve: (args) => rowFor(input, {
        idempotency_key: String(args.p_idempotency_key),
        metadata: args.p_metadata as Record<string, unknown>,
      }),
    });
    const lease = await beginAiIntakeUsage(mocked.admin, input, enabled());
    expect(lease.kind).toBe('allowed');
    if (lease.kind !== 'allowed') throw new Error('expected a lease');
    expect(lease.ownsReservation).toBe(true);

    await expect(commitAiIntakeUsage(mocked.admin, lease)).resolves.toBe(true);
    expect(mocked.readRow()?.state).toBe('committed');

    const failing = mockAdmin({
      onReserve: (args) => rowFor(input, {
        idempotency_key: String(args.p_idempotency_key),
        metadata: args.p_metadata as Record<string, unknown>,
      }),
    });
    const failingLease = await beginAiIntakeUsage(failing.admin, input, enabled());
    if (failingLease.kind !== 'allowed') throw new Error('expected a lease');
    await expect(releaseAiIntakeUsage(failing.admin, failingLease, 'provider failure')).resolves.toBe(true);
    expect(failing.readRow()?.state).toBe('released');
  });
});
