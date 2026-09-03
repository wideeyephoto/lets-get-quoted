import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  beginSmsFieldIntakeUsage,
  commitSmsFieldIntakeUsage,
} from '@/lib/sms-field-intake-usage';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const TASK_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-09-03T17:00:00.000Z');
const KEY = `field-intake-ai-${TASK_ID}`;
const FINALIZATION_KEY = `field-intake-ai-commit-${TASK_ID}`;

function queryResult(data: Record<string, unknown> | null, error: unknown = null) {
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data, error }),
  });
  return chain;
}

function admin(options: {
  reserveError?: { code?: string; message?: string } | null;
  row?: Record<string, unknown> | null;
  commit?: { data: unknown; error: unknown };
} = {}) {
  const row = options.row === undefined ? {
    id: RESERVATION_ID,
    account_id: ACCOUNT_ID,
    resource_code: 'ai_intake_threads',
    operation_type: 'ai_intake',
    idempotency_key: KEY,
    state: 'reserved',
    expires_at: '2026-09-03T18:30:00.000Z',
    finalization_key: null,
  } : options.row;
  const rpc = vi.fn(async (name: string) => {
    if (name === 'reserve_usage_credits') {
      return options.reserveError
        ? { data: null, error: options.reserveError }
        : { data: RESERVATION_ID, error: null };
    }
    if (name === 'commit_usage_reservation') {
      return options.commit ?? { data: true, error: null };
    }
    throw new Error(`Unexpected RPC ${name}`);
  });
  const from = vi.fn(() => queryResult(row));
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

describe('SMS field-intake usage admission', () => {
  it('reserves one task-keyed credit before provider work', async () => {
    const db = admin();
    await expect(beginSmsFieldIntakeUsage(db.client, {
      accountId: ACCOUNT_ID,
      taskId: TASK_ID,
    }, NOW)).resolves.toEqual({
      kind: 'allowed',
      lease: {
        reservationId: RESERVATION_ID,
        finalizationKey: FINALIZATION_KEY,
        needsCommit: true,
      },
    });
    expect(db.rpc).toHaveBeenCalledWith('reserve_usage_credits', expect.objectContaining({
      p_account_id: ACCOUNT_ID,
      p_resource_code: 'ai_intake_threads',
      p_units: 1,
      p_idempotency_key: KEY,
      p_operation_type: 'ai_intake',
      p_expires_at: '2026-09-03T18:30:00.000Z',
      p_metadata: { schema: 'sms_field_intake_v1', task_id: TASK_ID },
    }));
  });

  it('refuses provider work on definite exhaustion', async () => {
    const db = admin({
      reserveError: { code: 'P0001', message: 'insufficient usage credits for resource ai_intake_threads' },
    });
    await expect(beginSmsFieldIntakeUsage(db.client, {
      accountId: ACCOUNT_ID,
      taskId: TASK_ID,
    }, NOW)).resolves.toEqual({ kind: 'no_credits' });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('fails closed when the usage ledger is unavailable or malformed', async () => {
    const unavailable = admin({ reserveError: { code: '08006', message: 'connection lost' } });
    await expect(beginSmsFieldIntakeUsage(unavailable.client, {
      accountId: ACCOUNT_ID,
      taskId: TASK_ID,
    }, NOW)).resolves.toEqual({ kind: 'unavailable' });

    const malformed = admin({ row: { state: 'reserved' } });
    await expect(beginSmsFieldIntakeUsage(malformed.client, {
      accountId: ACCOUNT_ID,
      taskId: TASK_ID,
    }, NOW)).resolves.toEqual({ kind: 'unavailable' });
  });

  it('reuses an idempotently committed task without charging again', async () => {
    const db = admin({
      row: {
        id: RESERVATION_ID,
        account_id: ACCOUNT_ID,
        resource_code: 'ai_intake_threads',
        operation_type: 'ai_intake',
        idempotency_key: KEY,
        state: 'committed',
        expires_at: '2026-09-03T18:30:00.000Z',
        finalization_key: FINALIZATION_KEY,
      },
    });
    const admission = await beginSmsFieldIntakeUsage(db.client, {
      accountId: ACCOUNT_ID,
      taskId: TASK_ID,
    }, NOW);
    expect(admission).toMatchObject({ kind: 'allowed', lease: { needsCommit: false } });
    if (admission.kind !== 'allowed') throw new Error('Expected allowed admission');
    await expect(commitSmsFieldIntakeUsage(db.client, admission.lease)).resolves.toBe(true);
    expect(db.rpc).toHaveBeenCalledTimes(1);
  });

  it('requires a successful commit response', async () => {
    const db = admin({ commit: { data: false, error: null } });
    await expect(commitSmsFieldIntakeUsage(db.client, {
      reservationId: RESERVATION_ID,
      finalizationKey: FINALIZATION_KEY,
      needsCommit: true,
    })).resolves.toBe(false);
    expect(db.rpc).toHaveBeenCalledWith('commit_usage_reservation', {
      p_reservation_id: RESERVATION_ID,
      p_finalization_key: FINALIZATION_KEY,
    });
  });
});
