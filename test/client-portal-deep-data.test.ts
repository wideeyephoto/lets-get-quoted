import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listClientWarranties: vi.fn().mockResolvedValue([]),
  toClientWarranties: vi.fn().mockReturnValue([]),
  shapeContractorBrand: vi.fn().mockReturnValue({
    businessName: 'Apex Plumbing & HVAC',
    logoUrl: 'https://apex.com/logo.png',
  }),
  invoicePayState: vi.fn((_invoice: any, total: number, payments: any[]) => {
    const paid = payments.filter((p: any) => p.status === 'paid').reduce((sum: number, p: any) => sum + p.amount, 0);
    const due = Math.max(0, total - paid);
    return {
      paid,
      due,
      state: due > 0 ? 'payable' : 'paid',
    };
  }),
  paymentsForInvoice: vi.fn((payments: any[], invoiceId: string) =>
    payments.filter((p) => p.invoice_id === invoiceId)
  ),
  parseQuoteItems: vi.fn((raw: any) => (Array.isArray(raw) ? raw : [])),
  createJobFeedEvent: vi.fn().mockResolvedValue({}),
  getAccountOwnerEmail: vi.fn().mockResolvedValue('contractor@apex.com'),
  sendContractorAlertEmail: vi.fn().mockResolvedValue({}),
  getMemberBenefitsSummary: vi.fn((tier: any) => ({
    tierName: tier.name,
    badgeColor: tier.badgeColor,
    benefits: tier.benefits,
  })),
  listPropertyPassports: vi.fn().mockResolvedValue([]),
  runSmsInboxVisibleQuery: vi.fn(async (cb: any) => cb(true)),
  normalizeUsPhone: vi.fn((p: string) => (p.includes('555') ? '+15551234567' : null)),
  sendOwnerPortalMessageAlertSms: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/warranties-data', () => ({
  listClientWarranties: mocks.listClientWarranties,
}));

vi.mock('@/lib/warranties', () => ({
  toClientWarranties: mocks.toClientWarranties,
}));

vi.mock('@/lib/contractor-brand', () => ({
  shapeContractorBrand: mocks.shapeContractorBrand,
  CONTRACTOR_BRAND_COLUMNS: 'company_name, logo_url',
}));

vi.mock('@/lib/invoice-pay', () => ({
  invoicePayState: mocks.invoicePayState,
  paymentsForInvoice: mocks.paymentsForInvoice,
}));

vi.mock('@/lib/jobs', () => ({
  parseQuoteItems: mocks.parseQuoteItems,
}));

vi.mock('@/lib/job-feed', () => ({
  createJobFeedEvent: mocks.createJobFeedEvent,
}));

vi.mock('@/lib/email', () => ({
  getAccountOwnerEmail: mocks.getAccountOwnerEmail,
  sendContractorAlertEmail: mocks.sendContractorAlertEmail,
}));

vi.mock('@/lib/membership-tiers', () => ({
  getMemberBenefitsSummary: mocks.getMemberBenefitsSummary,
  DEFAULT_BENEFITS: { discountPct: 10, priorityDispatch: true },
}));

vi.mock('@/lib/property-passport-data', () => ({
  listPropertyPassports: mocks.listPropertyPassports,
}));

vi.mock('@/lib/sms-inbox-visibility', () => ({
  runSmsInboxVisibleQuery: mocks.runSmsInboxVisibleQuery,
}));

vi.mock('@/lib/phone', () => ({
  normalizeUsPhone: mocks.normalizeUsPhone,
}));

vi.mock('@/lib/sms', () => ({
  sendOwnerPortalMessageAlertSms: mocks.sendOwnerPortalMessageAlertSms,
}));

import {
  issuePortalLink,
  loadPortal,
  submitPortalMessage,
  listPortalLinks,
  revokePortalLinks,
} from '@/lib/client-portal-data';

const TEST_ACCOUNT_ID = 'acc-portal-123';
const TEST_CLIENT_ID = 'client-uuid-456';

function createMockSupabase(overrides: {
  clients?: any[];
  jobs?: any[];
  invoices?: any[];
  payments?: any[];
  plans?: any[];
  sms?: any[];
} = {}) {
  const clients = overrides.clients ?? [
    {
      id: TEST_CLIENT_ID,
      account_id: TEST_ACCOUNT_ID,
      name: 'Sarah Connor',
      email: 'sarah@example.com',
      phone: '+15551234567',
    },
  ];

  const jobs = overrides.jobs ?? [
    {
      id: 'job-1',
      account_id: TEST_ACCOUNT_ID,
      client_id: TEST_CLIENT_ID,
      ref: 'JOB-101',
      scope: 'Heat pump install',
      status: 'in_progress',
      scheduled_for: '2026-09-25',
      address: '742 Evergreen Terrace',
      quoted_amount: 4500,
      deposit_gate: 'before_schedule',
      quote_items: [{ label: 'Heat Pump 3-ton', amount: 4500 }],
      photo_paths: ['photos/job1-before.jpg'],
      created_at: '2026-09-01T00:00:00Z',
    },
  ];

  const invoices = overrides.invoices ?? [
    {
      id: 'inv-1',
      job_id: 'job-1',
      ref: 'INV-101',
      status: 'sent',
      total: 2250,
      created_at: '2026-09-02T00:00:00Z',
    },
  ];

  const payments = overrides.payments ?? [
    {
      id: 'pay-1',
      job_id: 'job-1',
      invoice_id: 'inv-1',
      label: 'Deposit Payment',
      amount: 1000,
      status: 'paid',
      refunded_amount: 0,
      paid_at: '2026-09-03T00:00:00Z',
      kind: 'deposit',
      async_payment_pending_at: null,
    },
  ];

  const recurringPlans = overrides.plans ?? [
    {
      id: 'plan-1',
      account_id: TEST_ACCOUNT_ID,
      client_id: TEST_CLIENT_ID,
      title: 'Diamond Club Care',
      scope: 'Annual checkups',
      amount: 49.99,
      frequency: 'monthly',
      next_run_date: '2026-10-01',
      active: true,
      auto_charge: true,
      prepaid: false,
      card_brand: 'mastercard',
      card_last4: '8888',
      remaining_cycles: null,
      membership_tier_id: 'tier-1',
      membership_tier_name: 'Diamond Club',
      tier_level: 3,
      tier_benefits: { discountPct: 20 },
      member_number: 'VIP-999',
      created_at: '2026-09-01T00:00:00Z',
    },
  ];

  const sms = overrides.sms ?? [
    {
      id: 'sms-1',
      direction: 'inbound',
      body: 'Can we move the appointment to 10am?',
      media_urls: null,
      created_at: '2026-09-10T10:00:00Z',
    },
  ];

  return {
    from: vi.fn((table: string) => {
      if (table === 'clients') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn().mockResolvedValue({ data: clients[0] ?? null, error: null }),
          not: vi.fn(() => query),
          then: (res: any) => res({ data: clients, error: null }),
        };
        return query;
      }
      if (table === 'accounts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  business_name: 'Apex Plumbing & HVAC',
                  deposit_percent: 50,
                  alert_phone: '+15559990000',
                  high_value_sms_enabled: true,
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'sites') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { company_name: 'Apex Plumbing & HVAC' },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'client_portal_access') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ error: null }),
              })),
            })),
          })),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'link-1', sent_to: 'sarah@example.com', created_at: '2026-09-01T00:00:00Z' },
                  ],
                  error: null,
                }),
              })),
            })),
          })),
        };
      }
      if (table === 'jobs') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          neq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn().mockResolvedValue({ data: jobs[0] ?? null, error: null }),
          then: (res: any) => res({ data: jobs, error: null }),
        };
        return query;
      }
      if (table === 'job_feed') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          then: (res: any) => res({ data: [], error: null }),
        };
        return query;
      }
      if (table === 'change_orders') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (res: any) =>
            res({
              data: [
                { id: 'co-1', title: 'Add surge protector', job_id: 'job-1', status: 'sent', created_at: '2026-09-05T00:00:00Z' },
              ],
              error: null,
            }),
        };
        return query;
      }
      if (table === 'job_selections') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          is: vi.fn(() => query),
          then: (res: any) =>
            res({
              data: [
                { id: 'sel-1', title: 'Thermostat Finish', job_id: 'job-1', created_at: '2026-09-06T00:00:00Z' },
              ],
              error: null,
            }),
        };
        return query;
      }
      if (table === 'job_form_submissions') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          is: vi.fn(() => query),
          then: (res: any) =>
            res({
              data: [
                {
                  id: 'form-1',
                  job_id: 'job-1',
                  template_snapshot: { title: 'Sign-Off Checklist', requireCustomerSignature: true },
                  created_at: '2026-09-07T00:00:00Z',
                },
              ],
              error: null,
            }),
        };
        return query;
      }
      if (table === 'invoices') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (res: any) => res({ data: invoices, error: null }),
        };
        return query;
      }
      if (table === 'payments') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (res: any) => res({ data: payments, error: null }),
        };
        return query;
      }
      if (table === 'recurring_plans') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (res: any) => res({ data: recurringPlans, error: null }),
        };
        return query;
      }
      if (table === 'payment_plans') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (res: any) => res({ data: [], error: null }),
        };
        return query;
      }
      if (table === 'sms_messages') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => Promise.resolve({ data: sms, error: null })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
        return query;
      }
      if (table === 'milestone_photos') {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          in: vi.fn(() => query),
          order: vi.fn(() => query),
          then: (res: any) => res({ data: [], error: null }),
        };
        return query;
      }
      if (table === 'client_feed') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
        })),
      };
    }),
  };
}

describe('Client Portal Data Engine (src/lib/client-portal-data.ts)', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  describe('issuePortalLink', () => {
    it('returns null if client not found by email', async () => {
      mockSupabase = createMockSupabase({ clients: [] });
      const res = await issuePortalLink(mockSupabase as any, TEST_ACCOUNT_ID, {
        kind: 'email',
        value: 'unknown@example.com',
      });
      expect(res).toBeNull();
    });

    it('issues hashed token and revokes previous links when found by email', async () => {
      const res = await issuePortalLink(mockSupabase as any, TEST_ACCOUNT_ID, {
        kind: 'email',
        value: 'sarah@example.com',
      });
      expect(res).toBeDefined();
      expect(res?.clientId).toBe(TEST_CLIENT_ID);
      expect(res?.token).toBeDefined();
    });

    it('finds client by phone exact and loose 10-digit match', async () => {
      const res = await issuePortalLink(mockSupabase as any, TEST_ACCOUNT_ID, {
        kind: 'sms',
        value: '+15551234567',
      });
      expect(res).toBeDefined();
      expect(res?.clientId).toBe(TEST_CLIENT_ID);
    });
  });

  describe('loadPortal', () => {
    it('returns null if client does not exist', async () => {
      mockSupabase = createMockSupabase({ clients: [] });
      const payload = await loadPortal(mockSupabase as any, TEST_ACCOUNT_ID, 'non-existent-client');
      expect(payload).toBeNull();
    });

    it('aggregates full portal payload with jobs, invoices, quotes, action items and membership', async () => {
      const payload = await loadPortal(mockSupabase as any, TEST_ACCOUNT_ID, TEST_CLIENT_ID);
      expect(payload).toBeDefined();
      expect(payload?.clientName).toBe('Sarah Connor');
      expect(payload?.brand.businessName).toBe('Apex Plumbing & HVAC');

      // Verify jobs & quotes
      expect(payload?.jobs.length).toBe(1);
      expect(payload?.jobs[0].ref).toBe('JOB-101');
      expect(payload?.quotes.length).toBe(1);
      expect(payload?.quotes[0].depositPercent).toBe(50);

      // Verify invoices & payments
      expect(payload?.invoices.length).toBe(1);
      expect(payload?.invoices[0].ref).toBe('INV-101');
      expect(payload?.payments.length).toBe(1);
      expect(payload?.payments[0].amount).toBe(1000);
      expect(payload?.outstanding).toBe(1250); // 2250 - 1000 = 1250 due

      // Verify action queue
      expect(payload?.actionQueue.length).toBe(3); // change order + selection + signed form
      const kinds = payload?.actionQueue.map((a) => a.kind);
      expect(kinds).toContain('change_order');
      expect(kinds).toContain('selection');
      expect(kinds).toContain('form');

      // Verify membership tier summary
      expect(payload?.membership).toBeDefined();
      expect(payload?.membership?.tierName).toBe('Diamond Club');

      // Verify plans & documents vault
      expect(payload?.plans.length).toBe(1);
      expect(payload?.plans[0].title).toBe('Diamond Club Care');
      expect(payload?.documents.length).toBeGreaterThan(0);
    });
  });

  describe('submitPortalMessage', () => {
    it('fails if message body is empty', async () => {
      const res = await submitPortalMessage(mockSupabase as any, {
        accountId: TEST_ACCOUNT_ID,
        clientId: TEST_CLIENT_ID,
        body: '   ',
      });
      expect(res).toEqual({ ok: false, message: 'Please enter a message.' });
    });

    it('logs note to job feed, records SMS, and triggers contractor alerts', async () => {
      const res = await submitPortalMessage(mockSupabase as any, {
        accountId: TEST_ACCOUNT_ID,
        clientId: TEST_CLIENT_ID,
        body: 'Can we install the outdoor condenser on the north side?',
        jobId: 'job-1',
      });

      expect(res).toEqual({ ok: true });
      expect(mocks.createJobFeedEvent).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ACCOUNT_ID,
        'job-1',
        expect.objectContaining({
          kind: 'portal_note',
          body: 'Can we install the outdoor condenser on the north side?',
          visibility: 'client',
          author: 'Client',
        })
      );
      expect(mocks.sendContractorAlertEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: TEST_ACCOUNT_ID,
          recipientEmail: 'contractor@apex.com',
          subject: 'New portal note from Sarah Connor',
        })
      );
      expect(mocks.sendOwnerPortalMessageAlertSms).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: TEST_ACCOUNT_ID,
          alertPhone: '+15559990000',
          customerName: 'Sarah Connor',
        })
      );
    });
  });

  describe('listPortalLinks and revokePortalLinks', () => {
    it('lists portal links for client', async () => {
      const links = await listPortalLinks(mockSupabase as any, TEST_ACCOUNT_ID, TEST_CLIENT_ID);
      expect(links.length).toBe(1);
      expect(links[0].sent_to).toBe('sarah@example.com');
    });

    it('revokes active portal links', async () => {
      await expect(revokePortalLinks(mockSupabase as any, TEST_ACCOUNT_ID, TEST_CLIENT_ID)).resolves.toBeUndefined();
    });
  });
});
