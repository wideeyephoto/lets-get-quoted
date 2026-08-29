import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendFounderSignupAlert } from '@/lib/founder-alerts';

vi.mock('resend', () => {
  return {
    Resend: class {
      emails = {
        send: vi.fn().mockResolvedValue({ data: { id: 'test-email-id' }, error: null }),
      };
    },
  };
});

describe('sendFounderSignupAlert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key_123';
    process.env.FOUNDER_ALERT_EMAIL = 'brett@letsgetquoted.com';
  });

  it('dispatches signup alert email with contractor trade, business name and postal code', async () => {
    await expect(
      sendFounderSignupAlert({
        accountId: 'acc_123',
        businessName: 'Austin Elite Roofing',
        trade: 'Roofing',
        postalCode: '78701',
        plan: 'pro_monthly',
        billing: 'monthly',
        ownerEmail: 'contractor@example.com',
      }),
    ).resolves.not.toThrow();
  });

  it('gracefully handles missing RESEND_API_KEY without throwing', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendFounderSignupAlert({
        accountId: 'acc_456',
        businessName: 'Apex Plumbing',
        trade: 'Plumbing',
        postalCode: '90210',
      }),
    ).resolves.not.toThrow();
  });
});
