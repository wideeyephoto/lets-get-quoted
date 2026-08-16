import { describe, expect, it, vi } from 'vitest';
import {
  AI_INTAKE_THREAD_TTL_MS,
  getOrCreateAiIntakeThread,
  isAiIntakeFlowKind,
  isAiIntakeThreadId,
  type SessionStorageLike,
} from '@/lib/ai-intake-thread';

const THREAD_A = '11111111-1111-4111-8111-111111111111';
const THREAD_B = '22222222-2222-4222-8222-222222222222';

function storage(): SessionStorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

describe('public AI Intake thread identity', () => {
  it('reuses one opaque ID for the same mounted site/flow within 24 hours', () => {
    const session = storage();
    const createUuid = vi.fn(() => THREAD_A);
    const first = getOrCreateAiIntakeThread({
      siteId: 'site-a',
      flowKind: 'smart_intake',
      storage: session,
      now: 1_000,
      createUuid,
    });
    const second = getOrCreateAiIntakeThread({
      siteId: 'site-a',
      flowKind: 'smart_intake',
      storage: session,
      now: 1_000 + AI_INTAKE_THREAD_TTL_MS - 1,
      createUuid,
    });

    expect(first).toEqual({ id: THREAD_A, issuedAt: 1_000 });
    expect(second).toEqual(first);
    expect(createUuid).toHaveBeenCalledTimes(1);
  });

  it('rotates at 24 hours and isolates the storage key by site and flow', () => {
    const session = storage();
    const ids = [THREAD_A, THREAD_B, THREAD_A, THREAD_B];
    const createUuid = vi.fn(() => ids.shift()!);

    const original = getOrCreateAiIntakeThread({ siteId: 'site-a', flowKind: 'smart_intake', storage: session, now: 0, createUuid });
    const rotated = getOrCreateAiIntakeThread({ siteId: 'site-a', flowKind: 'smart_intake', storage: session, now: AI_INTAKE_THREAD_TTL_MS, createUuid });
    const otherSite = getOrCreateAiIntakeThread({ siteId: 'site-b', flowKind: 'smart_intake', storage: session, now: AI_INTAKE_THREAD_TTL_MS, createUuid });
    const otherFlow = getOrCreateAiIntakeThread({ siteId: 'site-a', flowKind: 'instant_booking', storage: session, now: AI_INTAKE_THREAD_TTL_MS, createUuid });

    expect(rotated.id).not.toBe(original.id);
    expect(otherSite.issuedAt).toBe(AI_INTAKE_THREAD_TTL_MS);
    expect(otherFlow.issuedAt).toBe(AI_INTAKE_THREAD_TTL_MS);
    expect(createUuid).toHaveBeenCalledTimes(4);
  });

  it('accepts only v4 UUID thread IDs and known immutable flow kinds', () => {
    expect(isAiIntakeThreadId(THREAD_A.toUpperCase())).toBe(true);
    expect(isAiIntakeThreadId('11111111-1111-1111-8111-111111111111')).toBe(false);
    expect(isAiIntakeThreadId('not-a-token')).toBe(false);
    expect(isAiIntakeFlowKind('smart_intake')).toBe(true);
    expect(isAiIntakeFlowKind('instant_booking')).toBe(true);
    expect(isAiIntakeFlowKind('quote text')).toBe(false);
  });

  it('keeps a mount-capable token when privacy mode blocks storage access', () => {
    const blocked: SessionStorageLike = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(getOrCreateAiIntakeThread({
      siteId: 'site-a',
      flowKind: 'smart_intake',
      storage: blocked,
      now: 1_000,
      createUuid: () => THREAD_A,
    })).toEqual({ id: THREAD_A, issuedAt: 1_000 });
  });
});
