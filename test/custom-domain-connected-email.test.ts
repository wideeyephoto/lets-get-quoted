import { describe, expect, it, vi } from 'vitest';
import { sendCustomDomainConnectedEmail } from '@/lib/email';

const send = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: 'email' }, error: null }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));

describe('website certificate owner notification', () => {
  it('describes connection readiness without claiming an unpublished site is public, and matches its support reply address', async () => {
    await sendCustomDomainConnectedEmail({
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
