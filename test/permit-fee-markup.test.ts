import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/jobs', () => ({
  getJob: vi.fn().mockResolvedValue({ id: 'job-1', ref: 'JOB-101' }),
  createCost: vi.fn().mockResolvedValue({ id: 'cost-1', amount: 125 }),
}));

vi.mock('../src/lib/invoices', () => ({
  listInvoices: vi.fn(),
  selectPrimaryInvoice: vi.fn(),
  addInvoiceItem: vi.fn(),
}));

import { createCost } from '../src/lib/jobs';
import { listInvoices, selectPrimaryInvoice, addInvoiceItem } from '../src/lib/invoices';
import { recordPermitFeeExpense } from '../src/lib/permit-intel/permit-workflow';

describe('Permit Fee Markup & Auto-Invoicing Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const mockSupabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'job_permit_cases') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'case-1', application_status: 'draft' },
                  error: null,
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'case-1', actual_fee: 125 },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'job_feed') {
        return { insert: mockInsert };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      };
    }),
  } as any;

  it('records raw government fee to costs and adds marked-up total to customer invoice', async () => {
    vi.mocked(listInvoices).mockResolvedValueOnce([
      { id: 'inv-1', status: 'draft', total: 5000 } as any,
    ]);
    vi.mocked(selectPrimaryInvoice).mockReturnValueOnce({
      id: 'inv-1',
      status: 'draft',
      total: 5000,
    } as any);

    vi.mocked(addInvoiceItem).mockResolvedValueOnce({
      id: 'item-1',
      invoice_id: 'inv-1',
      description: 'Building Permit & Municipal Filing Fee (City of Royal Oak)',
      amount: 175,
      sort_order: 1,
    } as any);

    const result = await recordPermitFeeExpense(
      mockSupabase,
      'acc-1',
      'job-1',
      {
        feeAmount: 125,
        markupAmount: 50,
        authorityName: 'City of Royal Oak',
        addToInvoice: true,
      },
    );

    expect(result.cost.amount).toBe(125);
    expect(result.totalBilled).toBe(175);
    expect(result.markupAmount).toBe(50);
    expect(result.invoiceItem).toBeDefined();
    expect(result.invoiceItem?.amount).toBe(175);

    expect(createCost).toHaveBeenCalledWith(
      mockSupabase,
      'acc-1',
      'job-1',
      expect.objectContaining({
        amount: 125,
        description: 'Municipal Permit Fee — City of Royal Oak',
      }),
    );

    expect(addInvoiceItem).toHaveBeenCalledWith(
      mockSupabase,
      'acc-1',
      'inv-1',
      expect.objectContaining({
        description: 'Building Permit & Municipal Filing Fee (City of Royal Oak)',
        amount: 175,
      }),
      'job-1',
    );
  });
});
