import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mocks = vi.hoisted(() => ({ status: vi.fn(), notices: vi.fn() }));
vi.mock('@/lib/stripe-connect', () => ({ getRecipientTransferStatus: mocks.status }));
vi.mock('@/lib/owner-event-notices', () => ({ runOwnerEventNotices: mocks.notices }));
import { syncConnectTransferStatus } from '@/lib/connect-owner-notices';

beforeEach(() => { vi.clearAllMocks(); mocks.status.mockResolvedValue('inactive'); mocks.notices.mockResolvedValue({}); });
function fixture(options: { active?: boolean; disabled?: string | null; event?: string | null; missing?: boolean; readError?: boolean; writeError?: boolean; loser?: boolean } = {}) {
  const current = { id: 'account-1', connect_onboarded: options.active ?? true, connect_disabled_at: options.disabled ?? null, connect_notice_event_id: options.event ?? null, connect_status_version: null };
  const filters: unknown[][] = [];
  const update = vi.fn();
  let writing = false;
  const query = {
    select: () => query,
    update: (value: unknown) => { writing = true; update(value); return query; },
    eq: (...args: unknown[]) => { if (writing) filters.push(['eq', ...args]); return query; },
    is: (...args: unknown[]) => { if (writing) filters.push(['is', ...args]); return query; },
    maybeSingle: async () => writing
      ? { data: options.loser ? null : { id: current.id }, error: options.writeError ? {} : null }
      : { data: options.missing ? null : current, error: options.readError ? {} : null },
  };
  return { client: { from: () => query } as unknown as SupabaseClient, update, filters };
}
it('saves a new interruption with all observed fields fenced and dispatches its saved identity', async () => {
  const db = fixture();
  mocks.status.mockImplementation(async () => { expect(db.update).not.toHaveBeenCalled(); return 'inactive'; });
  await syncConnectTransferStatus(db.client, 'acct_1');
  const saved = db.update.mock.calls[0][0];
  expect(saved).toEqual({ connect_status_version: expect.any(String), connect_onboarded: false, connect_disabled_at: expect.any(String), connect_notice_event_id: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  expect(db.filters).toEqual([['eq','id','account-1'],['eq','stripe_connect_id','acct_1'],['eq','connect_onboarded',true],['is','connect_disabled_at',null],['is','connect_notice_event_id',null],['is','connect_status_version',null]]);
  expect(mocks.notices).toHaveBeenCalledWith(db.client, { sourceId: saved.connect_notice_event_id, accountId: 'account-1' });
});
it('recovers without clearing the event fence or sending an interruption notice', async () => {
  const db = fixture({ active: false, disabled: '2026-09-14T10:00:00Z', event: 'previous-event' }); mocks.status.mockResolvedValue('active');
  await syncConnectTransferStatus(db.client, 'acct_1');
  expect(db.update).toHaveBeenCalledWith({ connect_onboarded: true, connect_disabled_at: null, connect_status_version: expect.any(String) });
  expect(db.filters).toContainEqual(['eq','connect_notice_event_id','previous-event']);
  expect(mocks.notices).not.toHaveBeenCalled();
});
it.each([{ active: false }, { active: false, disabled: '2026-09-14T10:00:00Z', event: 'previous-event' }])('keeps repeated inactivity and unfinished onboarding silent', async options => {
  const db = fixture(options); await syncConnectTransferStatus(db.client,'acct_1');
  expect(db.update).toHaveBeenCalledWith({ connect_onboarded: false, connect_status_version: expect.any(String) }); expect(mocks.notices).not.toHaveBeenCalled();
});
it('fences older observations even when the account is still active', async () => {
  const db=fixture(); mocks.status.mockResolvedValue('active'); await syncConnectTransferStatus(db.client,'acct_1'); expect(db.update).toHaveBeenCalledWith({ connect_onboarded: true, connect_disabled_at: null, connect_status_version: expect.any(String) });
});
it('requests a fresh provider read on retry after losing the guarded account update', async () => {
  const db=fixture({loser:true}); await expect(syncConnectTransferStatus(db.client,'acct_1')).rejects.toThrow('changed during'); expect(mocks.notices).not.toHaveBeenCalled();
});
it('preserves the committed update when immediate pickup fails', async () => {
  const db=fixture(); mocks.notices.mockRejectedValueOnce(new Error('pickup failed'));
  await expect(syncConnectTransferStatus(db.client,'acct_1')).resolves.toBe(false); expect(db.update).toHaveBeenCalledTimes(1);
});
it.each([{readError:true},{writeError:true}])('propagates database failures for webhook retry', async options => {
  const db=fixture(options); await expect(syncConnectTransferStatus(db.client,'acct_1')).rejects.toThrow('Could not'); expect(mocks.notices).not.toHaveBeenCalled();
});
it('propagates unavailable provider status without disabling the account', async () => {
  const db=fixture(); mocks.status.mockResolvedValue(null); await expect(syncConnectTransferStatus(db.client,'acct_1')).rejects.toThrow('unavailable'); expect(db.update).not.toHaveBeenCalled();
});
it('ignores an account no longer connected to this provider ID', async () => {
  const db=fixture({missing:true}); await syncConnectTransferStatus(db.client,'acct_1'); expect(mocks.status).not.toHaveBeenCalled();
});
