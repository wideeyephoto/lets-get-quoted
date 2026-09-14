import { describe, expect, it, vi } from 'vitest';
import { sendCustomDomainConnectedEmail } from '@/lib/email';

const send = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'email' }, error: null }));
vi.mock('resend', () => ({ Resend: class { key = 'synthetic'; emails = { send }; fetchRequest(_path: string, options: { body: string }) { return send(JSON.parse(options.body)); } } }));
vi.mock('@/lib/auth', () => ({ createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }) }) }) }));
vi.mock('@/lib/email-brand', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/email-brand')>(), loadEmailBrand: async () => { throw new Error('Use fallback brand'); } }));

describe('website certificate owner notification', () => {
  it('rejects an acceptance response without a provider message ID', async () => {
    send.mockResolvedValueOnce({ data: {} as { id: string }, error: null });
    await expect(sendCustomDomainConnectedEmail({
      prepareIntent: async () => {},
      noticeId: '11111111-1111-4111-8111-111111111111', accountId: 'workspace-a',
      recipientEmail: 'owner@example.com', businessName: 'Contractor', domain: 'fixture.contractor.com',
      siteUrl: 'https://fixture.contractor.com', settingsUrl: 'https://app.letsgetquoted.com/dashboard/sites',
    })).rejects.toThrow('no message ID');
    send.mockClear();
  });
  it('describes connection readiness without claiming an unpublished site is public, and matches its support reply address', async () => {
    await sendCustomDomainConnectedEmail({
      prepareIntent: async () => {},
      noticeId: '11111111-1111-4111-8111-111111111111',
      accountId: 'workspace-a',
      recipientEmail: 'owner@example.com', businessName: 'Contractor', domain: 'fixture.contractor.com',
      siteUrl: 'https://fixture.contractor.com', settingsUrl: 'https://app.letsgetquoted.com/dashboard/sites',
    });
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0];
    expect(payload.subject).toBe('fixture.contractor.com is connected');
    expect(payload.reply_to).toBe('hello@letsgetquoted.com');
    expect(payload.html).toContain('Your secure domain connection is ready');
    expect(payload.html).toContain('If your website is still a draft, publish it when you are ready');
    expect(payload.html).toContain('href="https://app.letsgetquoted.com/dashboard/sites"');
    expect(payload.html).not.toContain('website is live');
    expect(payload.html).not.toContain('nothing left for you to do');
    expect(payload.html).not.toContain('reach Contractor directly');
    expect(payload.html).toContain('Reply to this email to reach Let&#39;s Get Quoted.');
  });
});
