import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  checkCircuitBreaker,
  tripCircuitBreaker,
  clearCircuitBreaker,
  invalidateCircuitBreakerCache,
  CIRCUIT_BREAKER_SERVICES,
} from '../src/lib/circuit-breaker';

describe('platform circuit breakers (emergency kill switches)', () => {
  beforeEach(() => {
    invalidateCircuitBreakerCache();
    vi.resetModules();
  });

  it('has definitions for all 4 core services with clear impact', () => {
    expect(Object.keys(CIRCUIT_BREAKER_SERVICES)).toEqual([
      'ai_intake',
      'sms_outbound',
      'voice_routing',
      'payments_checkout',
    ]);
    expect(CIRCUIT_BREAKER_SERVICES.ai_intake.impact).toContain('manual review');
    expect(CIRCUIT_BREAKER_SERVICES.sms_outbound.impact).toContain('suppressed');
    expect(CIRCUIT_BREAKER_SERVICES.voice_routing.impact).toContain('maintenance');
    expect(CIRCUIT_BREAKER_SERVICES.payments_checkout.impact).toContain('refuse');
  });

  it('returns blocked: false when no breakers are active', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    } as any;

    const result = await checkCircuitBreaker('sms_outbound', 'acct-123', mockClient);
    expect(result.blocked).toBe(false);
  });

  it('blocks all accounts when a global circuit breaker is tripped', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'breaker-1',
                service: 'ai_intake',
                scope: 'global',
                account_id: null,
                is_tripped: true,
                reason: 'Gemini API degraded across US-Central',
                tripped_by: 'admin@letsgetquoted.com',
                tripped_at: '2026-09-13T10:00:00Z',
              },
            ],
            error: null,
          }),
        }),
      }),
    } as any;

    const res1 = await checkCircuitBreaker('ai_intake', 'acct-abc', mockClient);
    expect(res1.blocked).toBe(true);
    expect(res1.scope).toBe('global');
    expect(res1.reason).toBe('Gemini API degraded across US-Central');

    // Different service is NOT blocked
    const resOther = await checkCircuitBreaker('voice_routing', 'acct-abc', mockClient);
    expect(resOther.blocked).toBe(false);
  });

  it('blocks only the specific account when an account-scoped breaker is tripped', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'breaker-2',
                service: 'sms_outbound',
                scope: 'account',
                account_id: 'bad-contractor-999',
                is_tripped: true,
                reason: 'Carrier spam report received for this contractor',
                tripped_by: 'admin@letsgetquoted.com',
                tripped_at: '2026-09-13T10:00:00Z',
              },
            ],
            error: null,
          }),
        }),
      }),
    } as any;

    // The offending contractor is blocked
    const resBad = await checkCircuitBreaker('sms_outbound', 'bad-contractor-999', mockClient);
    expect(resBad.blocked).toBe(true);
    expect(resBad.scope).toBe('account');
    expect(resBad.reason).toContain('Carrier spam report');

    // Any other contractor is allowed through normally
    const resGood = await checkCircuitBreaker('sms_outbound', 'good-contractor-111', mockClient);
    expect(resGood.blocked).toBe(false);
  });

  it('rejects tripping without a valid operational reason', async () => {
    const mockAdmin = {} as any;
    const mockActor = { adminEmail: 'admin@letsgetquoted.com' };

    const res = await tripCircuitBreaker(mockAdmin, mockActor, {
      service: 'sms_outbound',
      scope: 'global',
      reason: 'no', // Too short
    });

    expect(res.success).toBe(false);
    expect(res.error).toContain('at least 4 characters');
  });

  it('successfully trips a breaker and logs an admin action', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'breaker-new-1',
            service: 'payments_checkout',
            scope: 'global',
            account_id: null,
            is_tripped: true,
            reason: 'Stripe webhook replay desync investigation',
          },
          error: null,
        }),
      }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'platform_circuit_breakers') {
          return { insert: insertMock };
        }
        if (table === 'admin_actions') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    } as any;

    const mockActor = { adminEmail: 'admin@letsgetquoted.com' };

    const res = await tripCircuitBreaker(mockAdmin, mockActor, {
      service: 'payments_checkout',
      scope: 'global',
      reason: 'Stripe webhook replay desync investigation',
    });

    expect(res.success).toBe(true);
    expect(res.breaker?.id).toBe('breaker-new-1');
    expect(insertMock).toHaveBeenCalled();
  });

  it('clears an active circuit breaker and logs clearance', async () => {
    const updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'platform_circuit_breakers') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'breaker-1',
                    service: 'ai_intake',
                    scope: 'global',
                    is_tripped: true,
                  },
                  error: null,
                }),
              }),
            }),
            update: updateMock,
          };
        }
        if (table === 'admin_actions') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        return {};
      }),
    } as any;

    const mockActor = { adminEmail: 'admin@letsgetquoted.com' };

    const res = await clearCircuitBreaker(mockAdmin, mockActor, {
      breakerId: 'breaker-1',
      reason: 'Upstream issue resolved and verified',
    });

    expect(res.success).toBe(true);
    expect(updateMock).toHaveBeenCalled();
  });
});
