import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const enrollmentRows: Array<Record<string, unknown>> = [];
  const payments: Array<Record<string, unknown>> = [];
  const invoice = vi.fn();
  const createAdminClient = () => ({
    from: (table: string) => {
      if (table === 'homeowner_financing_enrollments') {
        let accountFilter: string | null = null;
        let providerFilter: string | null = null;
        const query: any = {
          select: () => query,
          eq: (col: string, val: string) => {
            if (col === 'account_id') accountFilter = val;
            if (col === 'provider') providerFilter = val;
            return query;
          },
          maybeSingle: () => {
            const found = mocks.enrollmentRows.find(
              (r) =>
                (!accountFilter || r.account_id === accountFilter) &&
                (!providerFilter || r.provider === providerFilter),
            );
            return Promise.resolve({ data: found || null, error: null });
          },
        };
        return query;
      }

      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: mocks.payments, error: null }).then(resolve),
      };
      return query;
    },
  });

  return {
    invoice,
    payments,
    enrollmentRows,
    createAdminClient,
  };
});

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));
vi.mock('@/lib/invoices', async (original) => ({
  ...(await original<typeof import('@/lib/invoices')>()),
  getPublicInvoice: mocks.invoice,
}));
vi.mock('@/lib/jobs', () => ({
  formatMoneyExact: (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount),
}));
vi.mock('@/lib/contractor-brand', () => ({
  loadContractorBrand: async () => ({ businessName: 'Test Contractor' }),
}));
vi.mock('@/components/contractor-brand', () => ({
  ContractorBrandBar: () => null,
  ContractorBrandFoot: () => null,
}));
vi.mock('@/app/invoice/[id]/actions', () => ({
  payInvoiceAction: vi.fn(),
  signInvoiceAction: vi.fn(),
}));

import PublicInvoicePage from '@/app/invoice/[id]/page';
import { ALL_FEATURES_CATALOG } from '@/lib/all-features-catalog';
import { generateExecutiveFinancialForecast } from '@/lib/ai-operator/financial-forecasting';
import { generateWeeklyStrategyReport } from '@/lib/ai-operator/weekly-strategy-report';
import {
  HOMEOWNER_FINANCING,
  resolveHomeownerFinancing,
} from '@/lib/bnpl-financing';
import {
  ACORN_MIN_LOAN_AMOUNT,
  buildAcornApplyUrl,
} from '@/lib/acorn-financing';
import { generateInvoiceHtml } from '@/emails/InvoiceEmail';
import { renderClientQuoteEmailHtml } from '@/emails/renderers';
import { nameOnlyBrand } from '@/lib/email-brand';

async function invoiceHtml(
  amount: number,
  overrides?: {
    invoice?: Record<string, unknown>;
    account?: Record<string, unknown>;
  },
) {
  mocks.invoice.mockResolvedValue({
    invoice: {
      id: 'invoice-1',
      account_id: 'account-1',
      job_id: 'job-1',
      ref: 'INV-1001',
      status: 'sent',
      discount_percent: 0,
      tax_rate: 0,
      signed_at: null,
      created_at: '2026-09-05T12:00:00Z',
      job: { ref: 'J-1', client_name: 'Homeowner' },
      account: {
        stripe_connect_id: 'acct_1',
        connect_onboarded: true,
        payouts_restricted_at: null,
        ...(overrides?.account || {}),
      },
      ...(overrides?.invoice || {}),
    },
    items: [{ id: 'item-1', description: 'Home repairs', amount }],
  });
  return renderToStaticMarkup(
    await PublicInvoicePage({
      params: Promise.resolve({ id: 'invoice-1' }),
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  mocks.payments = [];
  mocks.enrollmentRows = [];
  delete process.env.LGQ_HOMEOWNER_FINANCING_ENABLED;
  delete process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LGQ_HOMEOWNER_FINANCING_ENABLED;
  delete process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED;
});

describe('Homeowner financing availability and Reg Z compliance guards', () => {
  describe('Disabled path (safe dark state)', () => {
    it.each([499, 500, 4800, 30000, 50000])(
      'a $%i invoice offers payment without a fictitious financing offer',
      async (amount) => {
        const html = await invoiceHtml(amount);
        expect(html).toContain(`Pay $${amount.toLocaleString('en-US')}.00`);
        expect(html).not.toMatch(
          /financing|as low as|Affirm|Klarna|APR|\$[\d,.]+\/mo/i,
        );
      },
    );

    it('still collects only the outstanding balance after a partial payment', async () => {
      mocks.payments = [
        {
          id: 'paid-1',
          invoice_id: 'invoice-1',
          amount: 1000,
          status: 'paid',
          refunded_amount: 0,
        },
      ];
      const html = await invoiceHtml(4800);
      expect(html).toContain('Pay $3,800.00');
      expect(html).not.toContain('Pay $4,800.00');
      expect(html).not.toMatch(/financing|APR/i);
    });

    it('does not offer payment or financing on a settled invoice', async () => {
      mocks.payments = [
        {
          id: 'paid-1',
          invoice_id: 'invoice-1',
          amount: 4800,
          status: 'paid',
          refunded_amount: 0,
        },
      ];
      const html = await invoiceHtml(4800);
      expect(html).toContain('This invoice is paid in full.');
      expect(html).not.toMatch(/Pay \$|financing|APR/i);
    });
  });

  describe('Enabled path (customer surfaces live)', () => {
    beforeEach(() => {
      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '1';
      process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED = '1';
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'account-1',
          provider: 'acorn',
          provider_code: 'DEALER_ACORN_99',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
    });

    it('renders prequalification CTA and Acorn disclosure without trigger terms on eligible invoice', async () => {
      const html = await invoiceHtml(4800);

      // Presence assertions: CTA, dealer code attribution, disclosure
      expect(html).toContain('Monthly payment options');
      expect(html).toContain('See options');
      expect(html).toContain('DEALER_ACORN_99');
      expect(html).toContain('amount=4800');
      expect(html).toContain('Acorn Finance is an independent lending marketplace');

      // REG Z / TILA MANDATE: Absolute zero tolerance for trigger terms even when active
      expect(html).not.toMatch(/APR|as low as|\$[\d,.]+\/mo|\d+ months|0%/i);
    });

    it('suppresses financing when invoice is settled, even with active enrollment', async () => {
      mocks.payments = [
        {
          id: 'paid-1',
          invoice_id: 'invoice-1',
          amount: 4800,
          status: 'paid',
          refunded_amount: 0,
        },
      ];
      const html = await invoiceHtml(4800);
      expect(html).toContain('This invoice is paid in full.');
      expect(html).not.toContain('See options');
      expect(html).not.toContain('DEALER_ACORN_99');
      expect(html).not.toMatch(/APR|as low as|\$[\d,.]+\/mo|\d+ months|0%/i);
    });

    it('suppresses financing when invoice amount is below $500 floor', async () => {
      const html = await invoiceHtml(499);
      expect(html).toContain('Pay $499.00');
      expect(html).not.toContain('See options');
      expect(html).not.toContain('DEALER_ACORN_99');
      expect(html).not.toMatch(/APR|as low as|\$[\d,.]+\/mo|\d+ months|0%/i);
    });

    it('suppresses financing when contractor Stripe payouts are restricted', async () => {
      const html = await invoiceHtml(4800, {
        account: {
          payouts_restricted_at: '2026-09-01T00:00:00Z',
        },
      });
      expect(html).not.toContain('See options');
      expect(html).not.toContain('DEALER_ACORN_99');
      expect(html).not.toMatch(/APR|as low as|\$[\d,.]+\/mo|\d+ months|0%/i);
    });

    it('renders financing notice in transactional invoice email without forbidden trigger terms', () => {
      const brand = nameOnlyBrand('Acme Roofing');
      const html = generateInvoiceHtml({
        brand,
        businessName: 'Acme Roofing',
        invoiceRef: 'INV-2001',
        clientName: 'Jane Doe',
        jobRef: 'JOB-500',
        total: 5500,
        items: [{ description: 'Roof inspection & shingles repair', amount: 5500 }],
        invoiceLink: 'https://letsgetquoted.com/invoice/inv-1',
        financingAvailable: true,
      });

      expect(html).toContain('Monthly payment options');
      expect(html).toContain('Acorn Finance');
      expect(html).toContain('Review options on your invoice');
      // Must not link out directly to third-party lenders from transactional email body
      expect(html).not.toContain('acornfinance.com');
      // REG Z / TILA MANDATE: zero trigger terms
      expect(html).not.toMatch(/APR|as low as|\$[\d,.]+\/mo|\d+ months|(?<!\d)0%/i);
    });

    it('omits financing notice in transactional invoice email when financingAvailable is false', () => {
      const brand = nameOnlyBrand('Acme Roofing');
      const html = generateInvoiceHtml({
        brand,
        businessName: 'Acme Roofing',
        invoiceRef: 'INV-2001',
        clientName: 'Jane Doe',
        jobRef: 'JOB-500',
        total: 5500,
        items: [{ description: 'Roof inspection & shingles repair', amount: 5500 }],
        invoiceLink: 'https://letsgetquoted.com/invoice/inv-1',
        financingAvailable: false,
      });

      expect(html).not.toContain('Monthly payment options');
      expect(html).not.toContain('Acorn Finance');
    });

    it('renders financing notice in transactional quote email without forbidden trigger terms', () => {
      const brand = nameOnlyBrand('Acme Roofing');
      const html = renderClientQuoteEmailHtml({
        brand,
        businessName: 'Acme Roofing',
        clientName: 'Jane Doe',
        jobRef: 'JOB-500',
        recipientEmail: 'jane@example.com',
        quotedAmount: 4200,
        quoteUrl: 'https://letsgetquoted.com/client/jobs/quote-token',
        financingAvailable: true,
      });

      expect(html).toContain('Monthly payment options');
      expect(html).toContain('Acorn Finance');
      expect(html).toContain('Review options on your quote');
      // REG Z / TILA MANDATE: zero trigger terms
      expect(html).not.toMatch(/APR|as low as|\$[\d,.]+\/mo|\d+ months|(?<!\d)0%/i);
    });

    it('omits financing notice in transactional quote email when financingAvailable is false', () => {
      const brand = nameOnlyBrand('Acme Roofing');
      const html = renderClientQuoteEmailHtml({
        brand,
        businessName: 'Acme Roofing',
        clientName: 'Jane Doe',
        jobRef: 'JOB-500',
        recipientEmail: 'jane@example.com',
        quotedAmount: 4200,
        quoteUrl: 'https://letsgetquoted.com/client/jobs/quote-token',
        financingAvailable: false,
      });

      expect(html).not.toContain('Monthly payment options');
      expect(html).not.toContain('Acorn Finance');
    });
  });

  describe('Resolver contract and Reg Z compliance', () => {
    beforeEach(() => {
      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '1';
      process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED = '1';
    });

    it('resolves to available: false when account is not enrolled', async () => {
      mocks.enrollmentRows = [];
      const res = await resolveHomeownerFinancing('acc-1', 'invoice', 5000);
      expect(res.available).toBe(false);
      if (!res.available) {
        expect(res.reason).toBe('not_enrolled');
      }
    });

    it('resolves to available: true when actively enrolled and surface is enabled', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'DEALER_123',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      const res = await resolveHomeownerFinancing('acc-1', 'invoice', 5000);
      expect(res.available).toBe(true);
      if (res.available) {
        expect(res.provider).toBe('acorn');
        expect(res.providerName).toBe('Acorn Finance');
        expect(res.applyUrl).toContain('d=DEALER_123');
        expect(res.applyUrl).toContain('amount=5000');
        expect(res.disclosure).toContain('Acorn Finance is an independent lending marketplace');

        // REG Z / TILA MANDATE: Must NOT contain trigger terms (monthly figures, APR, terms)
        const serialized = JSON.stringify(res);
        expect(serialized).not.toMatch(
          /as low as|\$[\d,.]+\/mo|\d+ months|0%|APR/i,
        );
      }
    });

    it('strictly isolates tenant dealer codes (acc-2 never sees acc-1 code)', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'SECRET_DEALER_A',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
        {
          id: 'enr-2',
          account_id: 'acc-2',
          provider: 'acorn',
          provider_code: 'DEALER_B',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      const resB = await resolveHomeownerFinancing('acc-2', 'invoice', 2500);
      expect(resB.available).toBe(true);
      if (resB.available) {
        expect(resB.applyUrl).toContain('DEALER_B');
        expect(resB.applyUrl).not.toContain('SECRET_DEALER_A');
      }
    });

    it('rejects loan amounts below the minimum threshold ($500)', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'DEALER_123',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      const res = await resolveHomeownerFinancing('acc-1', 'invoice', 499);
      expect(res.available).toBe(false);
      if (!res.available) {
        expect(res.reason).toBe('amount_ineligible');
      }
    });

    it('rejects in-house payment plan installments', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'DEALER_123',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      const res = await resolveHomeownerFinancing('acc-1', 'payment_request', 1500, {
        paymentKind: 'plan_installment',
      });
      expect(res.available).toBe(false);
      if (!res.available) {
        expect(res.reason).toBe('kind_ineligible');
      }
    });

    it('suppresses financing on settled invoices even when contractor is active', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'DEALER_123',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      const res = await resolveHomeownerFinancing('acc-1', 'invoice', 3000, {
        isSettled: true,
      });
      expect(res.available).toBe(false);
      if (!res.available) {
        expect(res.reason).toBe('invoice_settled');
      }
    });

    it('suppresses financing when contractor checkout is blocked', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'DEALER_123',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      const res = await resolveHomeownerFinancing('acc-1', 'invoice', 3000, {
        isBlocked: true,
      });
      expect(res.available).toBe(false);
      if (!res.available) {
        expect(res.reason).toBe('checkout_blocked');
      }
    });

    it('respects surface toggles (quote vs invoice)', async () => {
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'acc-1',
          provider: 'acorn',
          provider_code: 'DEALER_123',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: false,
        },
      ];
      const resQuote = await resolveHomeownerFinancing('acc-1', 'quote', 2000);
      expect(resQuote.available).toBe(true);

      const resInvoice = await resolveHomeownerFinancing('acc-1', 'invoice', 2000);
      expect(resInvoice.available).toBe(false);
      if (!resInvoice.available) {
        expect(resInvoice.reason).toBe('surface_disabled');
      }
    });
  });

  describe('Catalog and AI operator synchronizations', () => {
    it('describes Acorn financing in the feature catalog without fabricated terms', () => {
      const feature = ALL_FEATURES_CATALOG.flatMap(
        (category) => category.features,
      ).find((item) => item.id === 'monthly-financing-display');
      expect(feature?.name).toMatch(/Acorn Finance.*Pending/);
      expect(JSON.stringify(feature)).not.toMatch(/as low as|\$\d+\/mo|0%/i);
    });

    it('operator reports suggest Acorn partner onboarding', () => {
      const reports = [
        generateWeeklyStrategyReport().strategicPriorities,
        generateExecutiveFinancialForecast({
          currentMrrDollars: 168,
          currentPaidAccounts: 2,
        }).recommendations,
      ];
      for (const report of reports) {
        expect(
          report.some((item) => /Acorn Finance partner/i.test(item)),
        ).toBe(true);
        expect(
          report.some((item) => /Wisetack/i.test(item)),
        ).toBe(false);
      }
    });

    it('URL generator strictly omits customer PII from prequalification link parameters', () => {
      const url = buildAcornApplyUrl({
        dealerCode: 'DEALER_TEST_123',
        amount: 8500,
      });

      expect(url).toContain('d=DEALER_TEST_123');
      expect(url).toContain('amount=8500');
      // Must not carry PII in any parameter
      expect(url).not.toMatch(/email|name|phone|address|ssn|client/i);
    });

    it('financing resolution never creates payments or modifies invoice balances', async () => {
      mocks.payments = [];
      mocks.enrollmentRows = [
        {
          id: 'enr-1',
          account_id: 'account-1',
          provider: 'acorn',
          provider_code: 'DEALER_ACORN_99',
          status: 'active',
          enabled_on_quotes: true,
          enabled_on_invoices: true,
        },
      ];
      process.env.LGQ_HOMEOWNER_FINANCING_ENABLED = '1';
      process.env.LGQ_HOMEOWNER_FINANCING_CUSTOMER_SURFACES_ENABLED = '1';

      const res = await resolveHomeownerFinancing('account-1', 'invoice', 6000);
      expect(res.available).toBe(true);

      // Payments array remains untouched — no payments or disbursements created
      expect(mocks.payments).toHaveLength(0);
    });
  });
});
