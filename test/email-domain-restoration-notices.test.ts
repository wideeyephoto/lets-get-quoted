import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mocks = vi.hoisted(() => ({ owner: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/email', () => ({ getAccountOwnerEmail: mocks.owner, sendSendingDomainRestoredEmail: mocks.send }));
import { runEmailDomainRestorationNotices } from '@/lib/email-domain-restoration-notices';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.owner.mockResolvedValue(' OWNER@example.test ');
  mocks.send.mockImplementation(async input => {
    await input.prepareIntent({ payload: { to: 'owner@example.test' }, providerFingerprint: 'a'.repeat(64), idempotencyKey: 'saved-key' });
    return 'provider-1';
  });
});

function fixture(options: { rejectPrepare?: boolean; rejectSnapshot?: boolean; rejectFinish?: boolean } = {}) {
  const notice = { id: 'notice-1', account_id: 'account-1', domain_id: 'domain-1', domain: 'builder.test', attempted_at: '2026-09-14T12:00:00Z' };
  let state = 'pending';
  const rpc = vi.fn(async (name: string, input: Record<string, unknown>) => {
    if (name === 'claim_email_domain_restoration_notices') {
      if (state !== 'pending') return { data: [], error: null };
      state = 'sending'; return { data: [notice], error: null };
    }
    if (name === 'prepare_email_domain_restoration_notice') return { data: !options.rejectPrepare, error: null };
    if (name === 'prepare_email_domain_restoration_snapshot') return { data: !options.rejectSnapshot, error: null };
    if (name === 'finish_email_domain_restoration_notice') {
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
    if (!['sites', 'email_domain_restoration_notices'].includes(table)) throw new Error(table);
    return query;
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc };
}

it('saves the normalized owner and exact message under its claimed event before acceptance', async () => {
  const db = fixture();
  expect((await runEmailDomainRestorationNotices(db.client)).ownersNotified).toBe(1);
  expect(db.rpc).toHaveBeenCalledWith('prepare_email_domain_restoration_notice', expect.objectContaining({ p_id: 'notice-1', p_account_id: 'account-1', p_recipient: 'owner@example.test' }));
  expect(db.rpc).toHaveBeenCalledWith('prepare_email_domain_restoration_snapshot', expect.objectContaining({ p_payload: { to: 'owner@example.test' }, p_idempotency_key: 'saved-key' }));
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ settingsUrl: expect.stringContaining('/dashboard/settings#email-domain') }));
  await runEmailDomainRestorationNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it.each([{ rejectPrepare: true }, { rejectSnapshot: true }])('retains obsolete or failed preparation as review', async options => {
  const db = fixture(options);
  const result = await runEmailDomainRestorationNotices(db.client);
  expect(result.ownersNotified).toBe(0); expect(result.notificationReviews).toBe(1);
  expect(db.rpc).toHaveBeenCalledWith('finish_email_domain_restoration_notice', expect.objectContaining({ p_provider_id: null, p_error: 'notice_prepare_failed' }));
});

it('retains uncertain submission and does not submit again on the next run', async () => {
  const db = fixture(); mocks.send.mockRejectedValueOnce(new Error('response lost'));
  expect((await runEmailDomainRestorationNotices(db.client)).errors).toBe(1);
  await runEmailDomainRestorationNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('reports failed acceptance bookkeeping as an error and keeps the claim', async () => {
  const db = fixture({ rejectFinish: true });
  await expect(runEmailDomainRestorationNotices(db.client)).rejects.toThrow('persist');
  await runEmailDomainRestorationNotices(db.client);
  expect(mocks.send).toHaveBeenCalledTimes(1);
});

it('keeps a missing owner visible without calling the sender', async () => {
  const db = fixture(); mocks.owner.mockResolvedValueOnce(null);
  expect((await runEmailDomainRestorationNotices(db.client)).errors).toBe(1);
  expect(mocks.send).not.toHaveBeenCalled();
});
