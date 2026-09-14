import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: mocks.owner, sendOwnerEventNoticeEmail: mocks.send }));
import { runOwnerEventNotices } from '@/lib/owner-event-notices';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue(' OWNER@example.test ');
  mocks.send.mockImplementation(async input => {
    await input.prepareIntent({ payload: { to: 'owner@example.test' }, providerFingerprint: 'a'.repeat(64), idempotencyKey: 'saved-key' });
    return 'provider-1';
  });
});

function fixture(options: { rejectPrepare?: boolean; rejectSnapshot?: boolean; rejectFinish?: boolean; messaging?: boolean; jobless?: boolean; quickStop?: boolean } = {}) {
  const notice = { id: 'notice-1', account_id: 'account-1', source_id: 'feed-1', source_type: options.quickStop ? 'quick_stop' : options.messaging ? 'messaging_registration_event' : 'job_feed', event_kind: 'client_question', source_payload: { title: 'Question', body: 'Help', job_id: options.jobless ? undefined : 'job-1', recipient_email: 'application@example.test', business_name: 'Application Business' }, attempted_at: '2026-09-14T12:00:00Z' };
  let state = 'pending';
  const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
    if (name === 'claim_owner_event_notices') {
      if (state !== 'pending') return { data: [], error: null };
      state = 'sending'; return { data: [notice], error: null };
    }
    if (name === 'prepare_owner_event_notice') return { data: !options.rejectPrepare, error: null };
    if (name === 'prepare_owner_event_notice_snapshot') return { data: !options.rejectSnapshot, error: null };
    if (name === 'finish_owner_event_notice') {
      if (options.rejectFinish) return { data: false, error: null };
      state = input.p_provider_id ? 'accepted' : 'manual_review'; return { data: true, error: null };
    }
    throw new Error(name);
  });
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query, eq: () => query, order: () => query,
      limit: async () => ({ data: state === 'manual_review' ? [{ id: notice.id, account_id: notice.account_id, last_error: 'review' }] : [], count: state === 'manual_review' ? 1 : 0, error: null }),
      maybeSingle: async () => ({ data: { company_name: 'Builder' }, error: null }),
      then: (resolve: (value: unknown) => void) => resolve({ data: [], count: state === 'pending' ? 1 : 0, error: null }),
    };
    if (!['sites', 'owner_event_notices'].includes(table)) throw new Error(table);
    return query;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc };
}

it('saves the normalized owner and exact message under its claimed event before acceptance', async () => {
  const db = fixture();
  expect((await runOwnerEventNotices(db.client)).ownersNotified).toBe(1);
  expect(db.rpc).toHaveBeenCalledWith('prepare_owner_event_notice', expect.objectContaining({ p_id: 'notice-1', p_account_id: 'account-1', p_recipient: 'owner@example.test' }));
  expect(db.rpc).toHaveBeenCalledWith('prepare_owner_event_notice_snapshot', expect.objectContaining({ p_payload: { to: 'owner@example.test' }, p_idempotency_key: 'saved-key' }));
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ ctaUrl: expect.stringContaining('/dashboard/jobs/job-1'), bodyLines: ['Help'] }));
  await runOwnerEventNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it.each([{ rejectPrepare: true }, { rejectSnapshot: true }])('retains obsolete or failed preparation as review', async options => {
  const db = fixture(options);
  const result = await runOwnerEventNotices(db.client);
  expect(result.ownersNotified).toBe(0); expect(result.notificationReviews).toBe(1);
  expect(db.rpc).toHaveBeenCalledWith('finish_owner_event_notice', expect.objectContaining({ p_provider_id: null, p_error: 'notice_prepare_failed' }));
});

it('retains uncertain submission and does not submit again on the next run', async () => {
  const db = fixture(); mocks.send.mockRejectedValueOnce(new Error('response lost'));
  expect((await runOwnerEventNotices(db.client)).errors).toBe(1);
  await runOwnerEventNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('reports failed acceptance bookkeeping as an error and keeps the claim', async () => {
  const db = fixture({ rejectFinish: true });
  await expect(runOwnerEventNotices(db.client)).rejects.toThrow('persist');
  await runOwnerEventNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('keeps a missing owner visible without calling the sender', async () => {
  const db = fixture(); mocks.owner.mockResolvedValueOnce(null);
  expect((await runOwnerEventNotices(db.client)).errors).toBe(1);
  expect(mocks.send).not.toHaveBeenCalled();
});

it('uses the saved messaging contact and dashboard without looking up a different owner', async () => {
  const db = fixture({ messaging: true });
  expect((await runOwnerEventNotices(db.client)).ownersNotified).toBe(1);
  expect(mocks.owner).not.toHaveBeenCalled();
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    recipientEmail: 'application@example.test', businessName: 'Application Business',
    ctaUrl: expect.stringContaining('/dashboard/messages/dedicated-number'),
  }));
  await runOwnerEventNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('links a jobless owner notice to the dashboard',async()=>{
  const db=fixture({jobless:true});await runOwnerEventNotices(db.client);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ctaUrl:expect.stringMatching(/\/dashboard$/),ctaLabel:'Open dashboard'}));
});

it('uses the Quick Stops dashboard for confirmation notices',async()=>{
  await runOwnerEventNotices(fixture({quickStop:true}).client);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ctaLabel:'View Quick Stops',ctaUrl:expect.stringContaining('/dashboard/quick-stops')}));
});
