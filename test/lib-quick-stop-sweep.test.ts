import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sweepQuickStopOffers } from '@/lib/quick-stop-sweep';
import { processQuickStopRefunds } from '@/lib/quick-stop-refund-recovery';
import { getAccountOwnerEmail, sendContractorAlertEmail } from '@/lib/email';

vi.mock('@/lib/quick-stop-refund-recovery', () => ({ processQuickStopRefunds: vi.fn() }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: vi.fn(), sendContractorAlertEmail: vi.fn() }));
function client(rows: unknown[] = [], failure?: string) {
  const rpc = vi.fn((name: string) => ({ abortSignal: vi.fn().mockResolvedValue({
    data: name === 'recover_stale_quick_stop_offers' ? 2 : rows,
    error: name === failure ? { message: 'database unavailable' } : null,
  }) }));
  return { rpc, admin: { rpc } as unknown as SupabaseClient };
}
describe('bounded Quick Stop sweep coordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(processQuickStopRefunds).mockResolvedValue({ completed: 1, pending: 2, review: 1 });
    vi.mocked(getAccountOwnerEmail).mockResolvedValue('owner@example.test');
  });
  it('bounds every batch and preserves account scope through refund recovery', async () => {
    const { rpc, admin } = client([
      { kind: 'payment_expired', request_id: 'r1', account_id: 'a1', client_name: 'Sam' },
      { kind: 'response_expired', request_id: 'r2', account_id: 'a1', client_name: 'Jo' },
      { kind: 'auto_completed', request_id: 'r3', account_id: 'a1', client_name: 'Lee' },
    ]);
    expect(await sweepQuickStopOffers(admin, 'a1')).toEqual({
      paymentExpired: 1, responseExpired: 1, autoCompleted: 1, interruptedOffersExpired: 2,
      refundsCompleted: 1, refundsPending: 2, refundsNeedReview: 1,
    });
    expect(rpc).toHaveBeenCalledWith('sweep_quick_stop_requests', { p_account_id: 'a1', p_limit: 25 });
    expect(rpc).toHaveBeenCalledWith('recover_stale_quick_stop_offers', { p_account_id: 'a1', p_limit: 25 });
    expect(processQuickStopRefunds).toHaveBeenCalledWith(admin, 2, 'a1');
    expect(sendContractorAlertEmail).toHaveBeenCalledOnce();
  });
  it('fails visibly on database errors instead of claiming zero expired rows', async () => {
    await expect(sweepQuickStopOffers(client([], 'sweep_quick_stop_requests').admin)).rejects.toThrow('Quick Stop sweep failed');
    expect(sendContractorAlertEmail).not.toHaveBeenCalled();
  });
  it('retains committed results when notification fails', async () => {
    const { admin } = client([{ kind: 'payment_expired', request_id: 'r1', account_id: 'a1', client_name: 'Sam' }]);
    vi.mocked(sendContractorAlertEmail).mockRejectedValueOnce(new Error('mail offline'));
    expect((await sweepQuickStopOffers(admin)).paymentExpired).toBe(1);
    expect(processQuickStopRefunds).toHaveBeenCalledWith(admin, 5, undefined);
  });
});
