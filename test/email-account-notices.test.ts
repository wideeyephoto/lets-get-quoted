import { beforeEach, describe, expect, it, vi } from 'vitest';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
vi.mock('@/lib/email-brand', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/email-brand')>(),
  loadEmailBrand: async () => ({ businessName: 'Sample Plumbing', accent: '#0284c7', theme: 'spotlight', logoUrl: null, phone: null, siteUrl: null, replyTo: null }),
}));
import { sendMessagingApplicationSubmittedEmail, sendMessagingApplicationStatusEmail } from '@/lib/email';

const input = { accountId: 'sample-account', recipientEmail: 'owner@sampleplumbing.com', businessName: 'Sample Plumbing', desiredAreaCode: '248' };
beforeEach(() => { send.mockReset().mockResolvedValue({ data: { id: 'mock-message' }, error: null }); });

describe('Messaging setup notices', () => {
  it('does not invent a paid setup fee or an approval deadline', async () => {
    await sendMessagingApplicationSubmittedEmail(input);
    const html = send.mock.calls[0][0].html;
    expect(html).not.toContain('$49.99');
    expect(html).not.toContain('Fee Confirmed');
    expect(html).not.toContain('1–3 business days');
    expect(html).toContain('#07131d');
    expect(html).toContain('favicon.png');
  });

  it('distinguishes a listed amount from confirmed payment', async () => {
    await sendMessagingApplicationSubmittedEmail({ ...input, amountPaid: '$49.99' });
    const html = send.mock.calls[0][0].html;
    expect(html).toContain('Setup fee listed for this application: $49.99');
    expect(html).toContain('Check your dashboard for payment status');
  });

  it('uses the same platform identity for an action-required notice', async () => {
    await sendMessagingApplicationStatusEmail({ ...input, status: 'action_required', detail: 'Confirm your business address.' });
    const html = send.mock.calls[0][0].html;
    expect(html).toContain('#07131d');
    expect(html).toContain('Confirm your business address.');
    expect(html).not.toContain('Unsubscribe');
  });
});
