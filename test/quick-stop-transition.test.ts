import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { transitionQuickStopRequest } from '@/lib/quick-stop-transition';

describe('Quick Stop atomic transition', () => {
  const input = { accountId: 'a1', requestId: 'r1', from: 'confirmed' as const, to: 'completed' as const };
  function client(data: unknown, error: { message: string } | null = null) {
    const q = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
    const from = vi.fn(() => q);
    return { q, from, admin: { from } as unknown as SupabaseClient };
  }
  it('rejects a terminal-to-active jump before a database write', async () => {
    const { admin, from } = client({ id: 'r1' });
    await expect(transitionQuickStopRequest(admin, { ...input, from: 'customer_canceled', to: 'confirmed' })).rejects.toThrow('cannot move');
    expect(from).not.toHaveBeenCalled();
  });
  it('claims the exact account, state and report/window version', async () => {
    const { admin, q } = client({ id: 'r1' });
    expect(await transitionQuickStopRequest(admin, { ...input, expected: { no_show_reported_at: null, updated_at: 'snapshot' } })).toBe(true);
    expect(q.eq).toHaveBeenCalledWith('account_id', 'a1');
    expect(q.eq).toHaveBeenCalledWith('status', 'confirmed');
    expect(q.eq).toHaveBeenCalledWith('updated_at', 'snapshot');
    expect(q.is).toHaveBeenCalledWith('no_show_reported_at', null);
  });
  it('returns false for a lost race, but throws for a database failure', async () => {
    expect(await transitionQuickStopRequest(client(null).admin, input)).toBe(false);
    await expect(transitionQuickStopRequest(client(null, { message: 'offline' }).admin, input)).rejects.toThrow('offline');
  });
});
