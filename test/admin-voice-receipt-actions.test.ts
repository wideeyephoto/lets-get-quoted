import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn(), insert: vi.fn(), from: vi.fn(), recover: vi.fn(), scope: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireMfaPermission: mocks.guard }));
vi.mock('@/lib/admin', () => ({ logAdminAction: mocks.audit }));
vi.mock('@/lib/voice/auth', () => ({ signalWireVoiceScope: mocks.scope }));
vi.mock('@/lib/voice/receipt-recovery', () => ({ recoverVoiceReceipt: mocks.recover }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next/navigation', () => ({ unstable_rethrow: (t: unknown) => { const d = (t as { digest?: unknown })?.digest; if (typeof d === 'string' && d.startsWith('NEXT_REDIRECT')) throw t; }, redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { retryVoiceReceiptAction } from '@/app/admin/failures/actions';

const EVENT = '11111111-1111-4111-8111-111111111111';
const admin = { from: mocks.from };
const scope = { projectId: 'project', spaceId: 'space' };
const form = (reason = 'Dependency repaired; resume the original receipt') => { const f = new FormData(); f.set('reason', reason); return f; };
beforeEach(() => {
  vi.clearAllMocks(); mocks.from.mockReturnValue({ insert: mocks.insert }); mocks.insert.mockResolvedValue({ error: null });
  mocks.guard.mockResolvedValue({ admin, adminEmail: 'operator@example.test', staff: { id: 'staff' }, permission: 'ops.manage' });
  mocks.scope.mockReturnValue(scope); mocks.recover.mockResolvedValue({ status: 'processed', minutes: 1 }); mocks.audit.mockResolvedValue(undefined);
});
describe('operator voice receipt recovery', () => {
  it('requires MFA and operations permission before reading or mutating', async () => {
    mocks.guard.mockRejectedValue(new Error('MFA required'));
    await expect(retryVoiceReceiptAction(EVENT, form())).rejects.toThrow('MFA required');
    expect(mocks.guard).toHaveBeenCalledWith('ops.manage');
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.recover).not.toHaveBeenCalled();
  });
  it.each(['short', 'x'.repeat(501)])('requires a bounded reason', async reason => {
    await expect(retryVoiceReceiptAction(EVENT, form(reason))).rejects.toThrow('voice=reason');
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.recover).not.toHaveBeenCalled();
  });
  it('refuses an invalid event ID or absent provider scope', async () => {
    await expect(retryVoiceReceiptAction('invalid', form())).rejects.toThrow('voice=review');
    mocks.scope.mockReturnValue(null);
    await expect(retryVoiceReceiptAction(EVENT, form())).rejects.toThrow('voice=review');
    expect(mocks.recover).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('cannot retry when the durable audit insert fails', async () => {
    mocks.insert.mockResolvedValue({ error: { code: 'XX000' } });
    await expect(retryVoiceReceiptAction(EVENT, form())).rejects.toThrow('voice=unconfirmed');
    expect(mocks.recover).not.toHaveBeenCalled();
  });
  it('records intent first and uses existing scoped recovery for the exact original event', async () => {
    await expect(retryVoiceReceiptAction(EVENT, form())).rejects.toThrow('voice=processed');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'voice_receipt_retry_requested', target_id: EVENT, permission: 'ops.manage' }));
    expect(mocks.insert.mock.invocationCallOrder[0]).toBeLessThan(mocks.recover.mock.invocationCallOrder[0]);
    expect(mocks.recover).toHaveBeenCalledOnce(); expect(mocks.recover).toHaveBeenCalledWith(admin, EVENT, { scope, apply: true });
  });
  it.each([['busy','deferred'],['deferred','deferred'],['needs_review','review'],['exhausted','review'],['not_pending','complete'],['ignored','complete'],['retryable_failure','retry_scheduled']])('reports %s truthfully', async (status, outcome) => {
    mocks.recover.mockResolvedValue({ status });
    await expect(retryVoiceReceiptAction(EVENT, form())).rejects.toThrow(`voice=${outcome}`);
  });
  it('does not claim success or replay a write after a lost response', async () => {
    mocks.recover.mockRejectedValue(new Error('lost response'));
    await expect(retryVoiceReceiptAction(EVENT, form())).rejects.toThrow('voice=unconfirmed');
    expect(mocks.recover).toHaveBeenCalledOnce(); expect(mocks.revalidate).toHaveBeenCalledWith('/admin/failures');
  });
});
