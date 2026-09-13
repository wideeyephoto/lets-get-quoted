import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  loadEmailBrand: vi.fn(),
  generateInvoicePdf: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

vi.mock('@/lib/email-brand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email-brand')>();
  return {
    ...actual,
    loadEmailBrand: mocks.loadEmailBrand,
  };
});

vi.mock('@/emails/InvoicePdf', () => ({
  generateInvoicePdf: mocks.generateInvoicePdf,
}));

import {
  getAccountOwnerEmail,
  sendContractorAlertEmail,
  sendClientQuoteEmail,
  sendAppointmentReminderEmail,
  sendInvoiceEmail,
  sendDailyDigestEmail,
  sendLeadNotificationEmail,
  sendCardSetupEmail,
  sendCardUpdateEmail,
  sendCampaignEmail,
  describeDelivery,
} from '@/lib/email';

describe('Email Engine & Notification System (lib/email)', () => {
  let fakeAdmin: any;

  const createFluentBuilder = (dataResult: any = null, error: any = null) => {
    const builder: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: dataResult, error }),
      single: vi.fn().mockResolvedValue({ data: dataResult, error }),
      then: (resolve: any) => Promise.resolve({ data: dataResult, error }).then(resolve),
    };
    return builder;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_key_123';
    mocks.send.mockResolvedValue({ data: { id: 'msg_123' }, error: null });
    mocks.loadEmailBrand.mockResolvedValue({
      businessName: 'Ace Contracting',
      accent: '#0284c7',
      theme: 'spotlight',
      logoUrl: 'https://example.com/logo.png',
      replyTo: 'support@acecontracting.com',
    });
    mocks.generateInvoicePdf.mockResolvedValue(Buffer.from('%PDF-1.4 mock pdf'));
  });

  describe('getAccountOwnerEmail', () => {
    it('returns reply_to_email from accounts if configured', async () => {
      fakeAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return createFluentBuilder({ reply_to_email: 'custom-reply@contractor.com' });
          }
          return createFluentBuilder(null);
        }),
      };

      const email = await getAccountOwnerEmail(fakeAdmin, 'acc-1');
      expect(email).toBe('custom-reply@contractor.com');
    });

    it('falls back to owner user in memberships and auth.users if reply_to_email is unset', async () => {
      fakeAdmin = {
        from: vi.fn((table: string) => {
          if (table === 'accounts') {
            return createFluentBuilder({ reply_to_email: null });
          }
          if (table === 'memberships') {
            return createFluentBuilder({ user_id: 'user-owner-123' });
          }
          return createFluentBuilder(null);
        }),
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: { user: { email: 'owner-auth@contractor.com' } },
              error: null,
            }),
          },
        },
      };

      const email = await getAccountOwnerEmail(fakeAdmin, 'acc-1');
      expect(email).toBe('owner-auth@contractor.com');
    });

    it('returns null if account does not exist or has no owner', async () => {
      fakeAdmin = {
        from: vi.fn(() => createFluentBuilder(null)),
      };

      const email = await getAccountOwnerEmail(fakeAdmin, 'acc-nonexistent');
      expect(email).toBeNull();
    });
  });

  describe('sendContractorAlertEmail', () => {
    it('sends branded alert email with action CTA and info tone', async () => {
      await sendContractorAlertEmail({
        accountId: 'acc-1',
        recipientEmail: 'owner@example.com',
        businessName: 'Ace Roofing',
        subject: 'New Lead: Roof Inspection',
        heading: 'You have a new inquiry',
        bodyLines: ['Customer requested an estimate for a hail damage repair.'],
        ctaLabel: 'Review Inquiry',
        ctaUrl: 'https://app.letsgetquoted.com/leads/123',
        tone: 'info',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('owner@example.com');
      expect(call.subject).toBe('New Lead: Roof Inspection');
      expect(call.html).toContain('You have a new inquiry');
      expect(call.html).toContain('Customer requested an estimate');
      expect(call.html).toContain('Review Inquiry');
    });
  });

  describe('sendClientQuoteEmail', () => {
    it('renders quote email with line items, total, and direct approval link', async () => {
      await sendClientQuoteEmail({
        accountId: 'acc-1',
        recipientEmail: 'homeowner@contractorclient.test',
        businessName: 'Apex Renovations',
        clientName: 'Jane Smith',
        jobRef: 'JOB-2026',
        quotedAmount: 4500,
        quoteUrl: 'https://app.letsgetquoted.com/portal/quotes/xyz',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('homeowner@contractorclient.test');
      expect(call.subject).toContain('Apex Renovations');
      expect(call.html).toContain('Jane Smith');
      expect(call.html).toContain('$4,500.00');
      expect(call.html).toContain('https://app.letsgetquoted.com/portal/quotes/xyz');
    });
  });

  describe('sendAppointmentReminderEmail', () => {
    it('dispatches reminder with appointment date, time window, and address', async () => {
      await sendAppointmentReminderEmail({
        accountId: 'acc-1',
        recipientEmail: 'client@contractorclient.test',
        businessName: 'Ace Contracting',
        clientName: 'Bob Miller',
        whenLabel: 'Monday, June 15, 2026 · 9:00 AM – 11:00 AM',
        jobRef: 'JOB-101',
        address: '742 Evergreen Terrace, Springfield',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('client@contractorclient.test');
      expect(call.html).toContain('Monday, June 15, 2026');
      expect(call.html).toContain('9:00 AM – 11:00 AM');
      expect(call.html).toContain('742 Evergreen Terrace');
    });
  });

  describe('sendInvoiceEmail', () => {
    it('sends invoice with item breakdown and generated PDF attachment', async () => {
      const invoiceData: any = {
        invoice: {
          id: 'inv-101',
          ref: 'INV-101',
          amount: 850,
          due_date: '2026-06-30',
        },
        items: [
          { description: 'Emergency drain clearing', amount: 350 },
          { description: 'Main pipe replacement parts', amount: 500 },
        ],
        businessName: 'Precision Plumbing',
        clientName: 'Alice Client',
        jobRef: 'JOB-700',
        recipientEmail: 'customer@contractorclient.test',
        origin: 'https://app.letsgetquoted.com',
      };

      await sendInvoiceEmail(invoiceData);
      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('customer@contractorclient.test');
      expect(call.subject).toContain('INV-101');
      expect(call.attachments).toBeDefined();
      expect(call.attachments?.length).toBeGreaterThan(0);
      expect(call.attachments?.[0].filename).toContain('Invoice-INV-101.pdf');
    });
  });

  describe('sendDailyDigestEmail', () => {
    it('aggregates daily activity metrics for business owner', async () => {
      const digest: any = {
        dateKey: '2026-06-12',
        dateLabel: 'Friday, June 12',
        moneyInCount: 3,
        moneyInTotal: 3400,
        failedCount: 0,
        openRequestsCount: 1,
        openRequestsTotal: 500,
        leadsNewCount: 4,
        leadsDeclinedCount: 0,
        appointmentsCount: 2,
        appointmentsPendingCount: 1,
        appointmentsPendingUrgentCount: 0,
        rebookSentCount: 0,
        reviewsCount: 1,
        reviewsTotalRating: 5,
        quotesSentCount: 2,
        quotesSentTotal: 4200,
        quotesApprovedCount: 1,
        quotesApprovedTotal: 2500,
        quotesDeclinedCount: 0,
        todaysJobs: [],
        availability: {
          moneyIn: true,
          failed: true,
          openRequests: true,
          leads: true,
          appointments: true,
          reviews: true,
          quotes: true,
        },
      };

      await sendDailyDigestEmail({
        accountId: 'acc-1',
        recipientEmail: 'boss@contractorclient.test',
        businessName: 'Ace Contracting',
        digest,
        dashboardUrl: 'https://app.letsgetquoted.com/dashboard',
        manageUrl: 'https://app.letsgetquoted.com/dashboard/settings',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('boss@contractorclient.test');
      expect(call.subject).toContain('daily digest');
      expect(call.html).toContain('Friday, June 12');
      expect(call.html).toContain('3,400');
    });
  });

  describe('sendLeadNotificationEmail', () => {
    it('notifies contractor of incoming lead with quote request details', async () => {
      const lead: any = {
        id: 'lead-1',
        name: 'David Lee',
        phone: '5125550100',
        email: 'david@contractorclient.test',
        address: '100 Congress Ave',
        message: 'Needs quick roof shingle patch',
      };

      await sendLeadNotificationEmail({
        accountId: 'acc-1',
        recipientEmail: 'owner@contractorclient.test',
        businessName: 'Ace Contracting',
        lead,
        dashboardUrl: 'https://app.letsgetquoted.com/dashboard/leads/lead-1',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('owner@contractorclient.test');
      expect(call.html).toContain('David Lee');
      expect(call.html).toContain('100 Congress Ave');
    });
  });

  describe('Payment & Card Setup Emails', () => {
    it('sendCardSetupEmail invites customer to securely store card', async () => {
      await sendCardSetupEmail({
        recipientEmail: 'client@example.com',
        businessName: 'Ace Contracting',
        planTitle: 'Monthly Lawn Care',
        url: 'https://app.letsgetquoted.com/card/setup/token123',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('client@example.com');
      expect(call.subject).toContain('Save your card for Ace Contracting');
      expect(call.html).toContain('Monthly Lawn Care');
      expect(call.html).toContain('https://app.letsgetquoted.com/card/setup/token123');
    });

    it('sendCardUpdateEmail alerts client when saved card was declined', async () => {
      await sendCardUpdateEmail({
        recipientEmail: 'client@example.com',
        businessName: 'Ace Contracting',
        planTitle: 'Quarterly Pest Control',
        url: 'https://app.letsgetquoted.com/card/update/token456',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('client@example.com');
      expect(call.subject).toContain('update your card');
      expect(call.html).toContain('Quarterly Pest Control');
    });
  });

  describe('Campaign Marketing & Delivery Helpers', () => {
    it('sendCampaignEmail delivers marketing email with CAN-SPAM footer and unsubscribe link', async () => {
      await sendCampaignEmail({
        accountId: 'acc-1',
        recipientEmail: 'homeowner@example.com',
        businessName: 'Ace Contracting',
        subject: 'Spring Gutter Cleaning Special: 20% Off',
        body: 'Book your spring service before April 1st to save 20%.',
        mailingAddress: '123 Main St, Austin, TX 78701',
      });

      expect(mocks.send).toHaveBeenCalledTimes(1);
      const call = mocks.send.mock.calls[0][0];
      expect(call.to).toBe('homeowner@example.com');
      expect(call.subject).toContain('Spring Gutter Cleaning Special');
      expect(call.html).toContain('123 Main St, Austin, TX 78701');
      expect(call.html).toContain('Unsubscribe');
    });

    it('describeDelivery formats delivery status accurately across channels', () => {
      expect(describeDelivery('sms', '+15125550199')).toBe('Texted to +15125550199.');
      expect(describeDelivery('email', 'client@example.com')).toBe('Emailed to client@example.com.');
      expect(describeDelivery('none', null)).toContain('Not delivered');
    });
  });
});
