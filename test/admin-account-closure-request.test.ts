import { beforeEach, describe, expect, it, vi } from 'vitest';
import { closeAndAnonymizeAccountAction } from '@/app/admin/accounts/[id]/actions';

const { authorize, request, processJob, log } = vi.hoisted(() => ({
  authorize: vi.fn(), request: vi.fn(), processJob: vi.fn(), log: vi.fn(),
}));
vi.mock('@/lib/auth', async original => ({ ...await original<typeof import('@/lib/auth')>(), requireMfaPermission: authorize }));
vi.mock('@/lib/admin', async original => ({ ...await original<typeof import('@/lib/admin')>(), logAdminAction: log }));
vi.mock('@/lib/account-closure-orchestrator', () => ({ requestAccountClosure: request, processClosureJob: processJob }));
vi.mock('next/navigation', () => ({ unstable_rethrow: (t: unknown) => { const d = (t as { digest?: unknown })?.digest; if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT')) throw t; }, redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));

beforeEach(() => {
  vi.clearAllMocks();
  const accounts = { data: { account_number: 1001, stripe_customer_id: null, quickbooks_realm_id: null } };
  const admin = { from: (table: string) => {
    const builder: any = { select: () => builder, eq: () => builder, maybeSingle: async () => accounts,
      then: (resolve: (value: unknown) => void) => resolve({ data: table === 'memberships' ? [] : accounts.data }) };
    return builder;
  } };
  authorize.mockResolvedValue({ admin, userId: 'staff-user' });
  request.mockResolvedValue({ jobId: 'closure-job' });
});

describe('admin account closure request', () => {
  const confirmation = (value = '1001') => { const data = new FormData(); data.set('confirm', value); return data; };
  it('schedules the confirmed closure and reports its recovery period without running disposal', async () => {
    await expect(closeAndAnonymizeAccountAction('account', confirmation())).rejects.toThrow('done=closure_requested');
    expect(authorize).toHaveBeenCalledWith('account.delete');
    expect(request).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      accountId: 'account', requestedByUserId: 'staff-user', requestedByRole: 'admin',
    }));
    expect(processJob).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      action: 'account_closure_requested', meta: expect.objectContaining({ closureJobId: 'closure-job', status: 'pending_grace_period' }),
    }));
  });
  it('requires matching account confirmation before scheduling', async () => {
    await expect(closeAndAnonymizeAccountAction('account', confirmation('other'))).rejects.toThrow('error=confirm');
    expect(request).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled();
  });
  it('does not report or audit success after an atomic request failure', async () => {
    request.mockRejectedValue(new Error('closure request failed'));
    await expect(closeAndAnonymizeAccountAction('account', confirmation())).rejects.toThrow('closure request failed');
    expect(log).not.toHaveBeenCalled(); expect(processJob).not.toHaveBeenCalled();
  });
});
