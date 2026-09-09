import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailCampaignAdmin } from './helpers/email-campaign-admin';

const mocks = vi.hoisted(() => ({ send: vi.fn(), record: vi.fn(), admin: null as any }));
vi.mock('resend', () => ({ Resend: class {
  key = 'mock-key';
  fetchRequest(path: string, options: { body: string; headers: Record<string, string> }) {
    expect(path).toBe('/emails');
    return mocks.send(JSON.parse(options.body), options);
  }
} }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => mocks.admin }));
vi.mock('@/lib/account-events', () => ({ recordAccountEvent: mocks.record }));

import { runContractorLifecycleSweep, sendActivationNudgeBatch, sendContractorWelcomeEmail } from '@/lib/contractor-lifecycle-emails';
import { resolvePlatformCampaignRecipients } from '@/lib/admin-platform-campaigns';
import { CONTRACTOR_LIFECYCLE_STEPS } from '@/lib/contractor-lifecycle-content';
import { PLATFORM_CAMPAIGN_TEMPLATES } from '@/lib/platform-campaign-templates';
import { renderPlatformEmail } from '@/emails/platform';
import { contrastRatio, platformEmailPaint } from '@/emails/brand';

const owner = { account_id: 'account-one', email: 'morgan@reliabletrades.com' };
const recipient = { accountId: owner.account_id, email: owner.email, businessName: 'Reliable Trades' };
const account = { id: owner.account_id, business_name: recipient.businessName, reply_to_email: 'customers@reliabletrades.com', connect_onboarded: false };
const aged = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
const event = (step: string, days: number) => ({ account_id: account.id, kind: 'contractor_lifecycle_email_sent', meta: { step_id: step, sent_at: aged(days) } });
const tables = (extra: Record<string, any[]> = {}) => ({ accounts: [{ ...account, created_at: aged(7) }], owners: [owner], ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-09T14:00:00Z'));
  mocks.send.mockReset().mockResolvedValue({ data: { id: 'mock-email' }, error: null });
  mocks.record.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('Lifecycle send boundaries', () => {
  it('targets the owner instead of the customer reply address and includes text + unsubscribe headers', async () => {
    const admin = emailCampaignAdmin(tables());
    await runContractorLifecycleSweep(admin as any);
    expect(mocks.send).toHaveBeenCalledOnce();
    const [payload, options] = mocks.send.mock.calls[0];
    expect(payload.to).toBe(owner.email);
    expect(payload.text).toContain('Open my workspace');
    expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(options.headers['Idempotency-Key']).toBe('contractor-lifecycle/account-one/welcome_day0');
  });

  it.each(['account_events', 'jobs', 'email_suppression'])('sends nothing when %s cannot be checked', async (table) => {
    await expect(runContractorLifecycleSweep(emailCampaignAdmin(tables(), { [table]: 'unavailable' }) as any)).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('waits 48 hours after any lifecycle email', async () => {
    const result = await runContractorLifecycleSweep(emailCampaignAdmin(tables({ account_events: [event('welcome_day0', 1)] })) as any);
    expect(result.sent).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not repeat payment education after a payment setup nudge', async () => {
    const result = await runContractorLifecycleSweep(emailCampaignAdmin(tables({
      accounts: [{ ...account, created_at: aged(6) }],
      account_events: [event('welcome_day0', 6), event('nudge_incomplete_stripe', 3), event('nudge_zero_quotes', 3)],
    })) as any);
    expect(result.sent).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('welcome fails closed on suppression lookup errors', async () => {
    mocks.admin = emailCampaignAdmin(tables(), { email_suppression: 'unavailable' });
    const result = await sendContractorWelcomeEmail({ accountId: account.id, ownerEmail: owner.email });
    expect(result).toMatchObject({ ok: false, error: 'suppression_lookup_failed' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('welcome retry uses the same provider key as the sweep', async () => {
    mocks.admin = emailCampaignAdmin(tables());
    await sendContractorWelcomeEmail({ accountId: account.id, ownerEmail: owner.email });
    const immediateKey = mocks.send.mock.calls[0][1].headers['Idempotency-Key'];
    await runContractorLifecycleSweep(mocks.admin);
    expect(mocks.send.mock.calls[1][1].headers['Idempotency-Key']).toBe(immediateKey);
  });

  it('does not resend a recorded welcome', async () => {
    mocks.admin = emailCampaignAdmin(tables({ account_events: [event('welcome_day0', 3)] }));
    const result = await sendContractorWelcomeEmail({ accountId: account.id, ownerEmail: owner.email });
    expect(result.error).toBe('already_sent');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('Approved activation batches', () => {
  it('deduplicates repeated accounts and sends the same keyed message the sweep uses', async () => {
    const result = await sendActivationNudgeBatch(emailCampaignAdmin(tables()) as any, { recipients: [recipient, recipient] });
    expect(result).toMatchObject({ sent: 1, skipped: 1 });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0][1].headers['Idempotency-Key']).toBe('contractor-lifecycle/account-one/nudge_zero_quotes');
  });

  it.each([
    ['has a quote', { jobs: [{ id: 'job-one', account_id: account.id, quoted_amount: 100 }] }],
    ['owner changed', { owners: [{ ...owner, email: 'newowner@reliabletrades.com' }] }],
    ['too old', { accounts: [{ ...account, created_at: '2026-01-01' }] }],
    ['test account', { accounts: [{ ...account, created_at: '2026-09-02', test_marker: 'fixture' }] }],
    ['suspended', { accounts: [{ ...account, created_at: '2026-09-02', suspended_at: '2026-09-08' }] }],
    ['suppressed', { email_suppression: [{ account_id: account.id, email: owner.email }] }],
  ] as const)('skips a stale approval when the account %s', async (_label, extra) => {
    const result = await sendActivationNudgeBatch(emailCampaignAdmin(tables(extra as any)) as any, { recipients: [recipient] });
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('refuses to send when the sent ledger is unavailable', async () => {
    await expect(sendActivationNudgeBatch(emailCampaignAdmin(tables(), { account_events: 'unavailable' }) as any, { recipients: [recipient] })).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('Campaign audiences and presentation', () => {
  it.each([['paid_tier', 'growth', 'active'], ['free_tier', 'flex', 'free']] as const)('resolves %s using current entitlements and the owner email', async (audience, plan, status) => {
    const admin = emailCampaignAdmin(tables({ workspace_entitlements: [{ account_id: account.id, plan_code: plan, billing_status: status, entitlement_state: 'active' }] }));
    const recipients = await resolvePlatformCampaignRecipients(admin as any, audience);
    expect(recipients.map(r => r.email)).toEqual([owner.email]);
    expect(admin.queries.some(q => q.table === 'workspace_entitlements')).toBe(true);
    expect(admin.queries.flatMap(q => q.filters).some(([, column]) => column === 'plan')).toBe(false);
  });

  it('refuses a plan audience when billing data is unavailable', async () => {
    await expect(resolvePlatformCampaignRecipients(emailCampaignAdmin(tables(), { workspace_entitlements: 'unavailable' }) as any, 'paid_tier')).rejects.toThrow('Plan audience');
  });

  it('keeps all 23 templates free of the unsupported sales claims found in the audit', () => {
    const all = [...CONTRACTOR_LIFECYCLE_STEPS, ...PLATFORM_CAMPAIGN_TEMPLATES];
    expect(all).toHaveLength(23);
    for (const template of all) {
      expect(`${template.subject} ${template.body}`).not.toMatch(/2\.8x|4x faster|\+30%|\+\$1,200|zero limits|unlimited|negative feedback firewall|lifetime of your account/i);
      expect(template.body.split(/\s+/).length).toBeLessThan(210);
    }
  });

  it('renders one readable brand with escaped recipient content', () => {
    const html = renderPlatformEmail({ ...PLATFORM_CAMPAIGN_TEMPLATES[0] }, { name: '<script>alert(1)</script>', businessName: 'A & B' });
    expect(html).toContain('#07131d');
    expect(html).toContain('#ff6a24');
    expect(html).toContain('favicon.png');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('Powered by');
    expect(html).not.toContain('For Let');
    const paint = platformEmailPaint();
    expect(contrastRatio(paint.ctaText, paint.ctaBackground)).toBeGreaterThanOrEqual(4.5);
  });
});
