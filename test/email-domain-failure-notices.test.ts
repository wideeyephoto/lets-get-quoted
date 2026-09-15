import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runEmailDomainFailureNotices } from '@/lib/email-domain-failure-notices';

const { send, owner } = vi.hoisted(() => ({ send: vi.fn(), owner: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendSendingDomainFailedEmail: send, getAccountOwnerEmail: owner }));

function database(options: { saveAcceptedFails?: boolean; eventReadFails?: boolean; pending?: number } = {}) {
  const notices: Array<Record<string, any>> = [{
    id: 'notice-1', account_id: 'account-1', domain_id: 'domain-1', domain: 'contractor.example',
    reason: 'Required DNS record missing', state: 'pending', provider_id: null, accepted_at: null,
  }];
  const events: Record<string, Record<string, unknown>> = {};
  const rpc = vi.fn(async () => {
    for (const row of notices) if (row.state === 'sending' && row.expired) {
      row.state = 'manual_review'; row.last_error = 'send_outcome_unknown';
    }
    const claimed = notices.filter(n => n.state === 'pending').slice(0, 5);
    claimed.forEach(n => { n.state = 'sending'; });
    return { data: claimed.map(n => ({ ...n })), error: null };
  });
  const from = (table: string) => {
    const filters: Record<string, unknown> = {};
    let patch: Record<string, unknown> | undefined;
    let head = false;
    const resolve = () => {
      if (table === 'sites') return { data: { company_name: 'Contractor' }, error: null };
      if (table === 'email_events') return {
        data: events[String(filters.provider_id)] ?? null,
        error: options.eventReadFails ? { message: 'unavailable' } : null,
      };
      const rows = notices.filter(row => Object.entries(filters).every(([k, v]) => row[k] === v));
      if (patch) {
        if (options.saveAcceptedFails && patch.state === 'accepted') return { data: null, error: { message: 'unavailable' } };
        rows.forEach(row => Object.assign(row, patch));
      }
      return { data: head ? null : rows.map(row => ({ ...row })), count: head ? (options.pending ?? rows.length) : rows.length, error: null };
    };
    const builder: Record<string, any> = {
      select(_columns: string, opts?: { head?: boolean }) { head = Boolean(opts?.head); return builder; },
      update(value: Record<string, unknown>) { patch = value; return builder; },
      eq(key: string, value: unknown) { filters[key] = value; return builder; },
      order() { return builder; }, limit() { return builder; },
      maybeSingle() { return Promise.resolve(resolve()); },
      then(ok: (value: unknown) => unknown, fail?: (error: unknown) => unknown) { return Promise.resolve(resolve()).then(ok, fail); },
    };
    return builder;
  };
  return { client: { rpc, from } as never, notices, events, rpc };
}

beforeEach(() => { vi.clearAllMocks(); send.mockResolvedValue('provider-1'); owner.mockResolvedValue('owner@example.com'); });

describe('Durable domain failure notices', () => {
  it('retains a rejected notification across the next run without another send', async () => {
    const db = database(); send.mockRejectedValue(new Error('provider rejected'));
    const first = await runEmailDomainFailureNotices(db.client);
    const second = await runEmailDomainFailureNotices(db.client);
    expect(first.errors).toBe(1); expect(second.errors).toBe(1);
    expect(second.failures).toEqual([{ noticeId: 'notice-1', accountId: 'account-1', code: 'send_failed_or_outcome_unknown' }]);
    expect(db.notices[0].state).toBe('manual_review'); expect(send).toHaveBeenCalledTimes(1);
  });

  it('retains an absent owner mailbox as an incident without submitting email', async () => {
    const db = database(); owner.mockResolvedValue(null);
    expect((await runEmailDomainFailureNotices(db.client)).errors).toBe(1);
    expect(db.notices[0].last_error).toBe('owner_email_missing'); expect(send).not.toHaveBeenCalled();
  });

  it('does not resend when the provider accepts but saving its ID fails', async () => {
    const db = database({ saveAcceptedFails: true });
    await expect(runEmailDomainFailureNotices(db.client)).rejects.toThrow('persist');
    expect(db.notices[0].state).toBe('sending');
    db.notices[0].expired = true;
    const retry = await runEmailDomainFailureNotices(db.client);
    expect(retry.errors).toBe(1); expect(db.notices[0].last_error).toBe('send_outcome_unknown');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('distinguishes provider acceptance from a matching delivered callback', async () => {
    const db = database();
    expect((await runEmailDomainFailureNotices(db.client)).ownersNotified).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      settingsUrl: expect.stringMatching(/\/dashboard\/settings#email-domain$/),
    }));
    expect(db.notices[0].state).toBe('accepted');
    db.events['provider-1'] = { account_id: 'account-1', status: 'delivered' };
    expect((await runEmailDomainFailureNotices(db.client)).errors).toBe(0);
    expect(db.notices[0].state).toBe('resolved'); expect(db.notices[0].resolved_by).toBe('signed_provider_webhook');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each(['bounced', 'complained', 'failed', 'suppressed', 'canceled'])('keeps %s delivery actionable without changing sender to retry', async status => {
    const db = database(); await runEmailDomainFailureNotices(db.client);
    db.events['provider-1'] = { account_id: 'account-1', status };
    expect((await runEmailDomainFailureNotices(db.client)).errors).toBe(1);
    expect(db.notices[0].last_error).toBe(`delivery_${status}`); expect(send).toHaveBeenCalledTimes(1);
  });

  it('refuses a delivered event attributed to another workspace', async () => {
    const db = database(); await runEmailDomainFailureNotices(db.client);
    db.events['provider-1'] = { account_id: 'account-2', status: 'delivered' };
    expect((await runEmailDomainFailureNotices(db.client)).errors).toBe(1);
    expect(db.notices[0].last_error).toBe('delivery_account_mismatch');
  });

  it('escalates unconfirmed delivery after the observation deadline', async () => {
    const db = database(); await runEmailDomainFailureNotices(db.client);
    db.notices[0].accepted_at = new Date(Date.now() - 31 * 60_000).toISOString();
    expect((await runEmailDomainFailureNotices(db.client)).errors).toBe(1);
    expect(db.notices[0].last_error).toBe('delivery_unconfirmed'); expect(send).toHaveBeenCalledTimes(1);
  });

  it('does not claim delivery when its evidence cannot be read', async () => {
    const db = database({ eventReadFails: true });
    await expect(runEmailDomainFailureNotices(db.client)).rejects.toThrow('verify');
    expect(db.notices[0].state).toBe('accepted');
  });

  it('reports a bounded processing backlog instead of a false healthy run', async () => {
    const db = database({ pending: 3 });
    const result = await runEmailDomainFailureNotices(db.client);
    expect(result.notificationBacklog).toBe(3); expect(result.errors).toBe(3);
  });
});
