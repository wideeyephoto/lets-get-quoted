import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoice: vi.fn(),
  payments: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: mocks.payments, error: null }).then(resolve),
      };
      return query;
    },
  }),
}));
vi.mock('@/lib/invoices', async (original) => ({
  ...await original<typeof import('@/lib/invoices')>(),
  getPublicInvoice: mocks.invoice,
}));
vi.mock('@/lib/jobs', () => ({
  formatMoneyExact: (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
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

async function invoiceHtml(amount: number) {
  mocks.invoice.mockResolvedValue({
    invoice: {
      id: 'invoice-1', account_id: 'account-1', job_id: 'job-1',
      ref: 'INV-1001', status: 'sent', discount_percent: 0, tax_rate: 0,
      signed_at: null, created_at: '2026-09-05T12:00:00Z',
      job: { ref: 'J-1', client_name: 'Homeowner' },
      account: { stripe_connect_id: 'acct_1', connect_onboarded: true, payouts_restricted_at: null },
    },
    items: [{ id: 'item-1', description: 'Home repairs', amount }],
  });
  return renderToStaticMarkup(await PublicInvoicePage({
    params: Promise.resolve({ id: 'invoice-1' }),
  }));
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  mocks.payments = [];
});
afterEach(() => vi.unstubAllGlobals());

describe('Wisetack remains unavailable before partner approval', () => {
  it.each([499, 500, 4800, 30000, 50000])('a $%i invoice offers payment without a fictitious financing offer', async (amount) => {
    const html = await invoiceHtml(amount);
    expect(html).toContain(`Pay $${amount.toLocaleString('en-US')}.00`);
    expect(html).not.toMatch(/financing|as low as|Affirm|Klarna|APR|\$[\d,.]+\/mo/i);
  });

  it('still collects only the outstanding balance after a partial payment', async () => {
    mocks.payments = [{ id: 'paid-1', invoice_id: 'invoice-1', amount: 1000, status: 'paid', refunded_amount: 0 }];
    const html = await invoiceHtml(4800);
    expect(html).toContain('Pay $3,800.00');
    expect(html).not.toContain('Pay $4,800.00');
    expect(html).not.toMatch(/financing|APR/i);
  });

  it('does not offer payment or financing on a settled invoice', async () => {
    mocks.payments = [{ id: 'paid-1', invoice_id: 'invoice-1', amount: 4800, status: 'paid', refunded_amount: 0 }];
    const html = await invoiceHtml(4800);
    expect(html).toContain('This invoice is paid in full.');
    expect(html).not.toMatch(/Pay \$|financing|APR/i);
  });

  it('describes financing as pending in the feature catalog', () => {
    const feature = ALL_FEATURES_CATALOG.flatMap((category) => category.features)
      .find((item) => item.id === 'monthly-financing-display');
    expect(feature?.name).toMatch(/Wisetack.*Pending approval/);
    expect(feature?.desc).toContain('not available yet');
    expect(JSON.stringify(feature)).not.toMatch(/as low as|\$\d+\/mo|0%/i);
  });

  it('operator reports request partner approval instead of enabling an unavailable payment option', () => {
    const reports = [
      generateWeeklyStrategyReport().strategicPriorities,
      generateExecutiveFinancialForecast({ currentMrrDollars: 168, currentPaidAccounts: 2 }).recommendations,
    ];
    for (const report of reports) {
      expect(report.some((item) => /Wisetack partner approval/.test(item))).toBe(true);
      expect(report.some((item) => /enable.*(BNPL|financing)/i.test(item))).toBe(false);
    }
  });
});
