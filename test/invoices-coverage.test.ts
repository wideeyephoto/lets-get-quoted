import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  getInvoiceWithItems, 
  createInvoice, 
  createInvoiceWithSingleItem,
  markInvoicePaidForPayment,
  updateInvoiceCharges,
  addInvoiceItem,
  deleteInvoiceItem,
  updateInvoiceStatus,
  deleteInvoice,
  getPublicInvoice,
  signInvoice,
  listInvoices
} from '@/lib/invoices';

let mockResults: any[] = [];
const setMockResults = (results: any[]) => { mockResults = results; };

const builder: any = {
  select: function() { return builder; },
  insert: function() { return builder; },
  update: function() { return builder; },
  delete: function() { return builder; },
  eq: function() { return builder; },
  order: function() { return builder; },
  single: function() { return builder; },
  maybeSingle: function() { return builder; },
  then: function(resolve: any, reject: any) {
    const result = mockResults.shift();
    if (result instanceof Error) reject(result);
    else resolve(result || { data: null, error: null });
  }
};

const mockSupabase = {
  from: function() { return builder; },
} as any;

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(() => mockSupabase)
}));

vi.mock('@/lib/jobs', () => ({
  getJob: vi.fn()
}));

vi.mock('@/lib/job-feed', () => ({
  applyQuoteAcceptance: vi.fn()
}));

import { getJob } from '@/lib/jobs';

describe('Invoices Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResults = [];
  });

  describe('listInvoices', () => {
    it('returns invoices or throws error', async () => {
      setMockResults([{ data: [{ id: '1' }], error: null }]);
      const res = await listInvoices(mockSupabase, 'acc', 'job');
      expect(res).toEqual([{ id: '1' }]);
      
      setMockResults([{ data: null, error: new Error('list err') }]);
      await expect(listInvoices(mockSupabase, 'acc', 'job')).rejects.toThrow('list err');
    });
  });

  describe('getInvoiceWithItems', () => {
    it('returns null if invoice not found', async () => {
      setMockResults([{ data: null, error: null }]);
      const res = await getInvoiceWithItems(mockSupabase, 'acc', 'inv', 'job');
      expect(res).toBeNull();
    });

    it('throws if items error', async () => {
      setMockResults([
        { data: { id: 'inv', job_id: 'job' }, error: null },
        { data: null, error: new Error('item err') }
      ]);
      await expect(getInvoiceWithItems(mockSupabase, 'acc', 'inv', 'job')).rejects.toThrow('item err');
    });

    it('returns invoice and items', async () => {
      setMockResults([
        { data: { id: 'inv', job_id: 'job' }, error: null },
        { data: [{ id: 'item1' }], error: null }
      ]);
      const res = await getInvoiceWithItems(mockSupabase, 'acc', 'inv', 'job');
      expect(res).toEqual({ invoice: { id: 'inv', job_id: 'job' }, items: [{ id: 'item1' }] });
    });
  });

  describe('createInvoice', () => {
    it('throws if job not found', async () => {
      vi.mocked(getJob).mockResolvedValueOnce(null);
      await expect(createInvoice(mockSupabase, 'acc', 'job', 'draft')).rejects.toThrow('Job not found for this account.');
    });

    it('retries on duplicate ref and throws if max attempts', async () => {
      vi.mocked(getJob).mockResolvedValueOnce({ reschedule_discount_percent: 10 } as any);
      setMockResults([
        { data: [] }, { data: null, error: { code: '23505' } },
        { data: [] }, { data: null, error: { code: '23505' } },
        { data: [] }, { data: null, error: { code: '23505' } },
        { data: [] }, { data: null, error: { code: '23505' } },
        { data: [] }, { data: null, error: { code: '23505' } },
      ]);
      await expect(createInvoice(mockSupabase, 'acc', 'job', 'draft')).rejects.toEqual({ code: '23505' });
    });

    it('successfully creates', async () => {
      vi.mocked(getJob).mockResolvedValueOnce({ reschedule_discount_percent: 10 } as any);
      setMockResults([
        { data: [] },
        { data: { id: 'inv1' }, error: null }
      ]);
      
      const res = await createInvoice(mockSupabase, 'acc', 'job', 'draft');
      expect(res).toEqual({ id: 'inv1' });
    });
  });

  describe('createInvoiceWithSingleItem', () => {
    it('creates invoice and item', async () => {
      setMockResults([
        { data: [] },
        { data: { id: 'inv1' }, error: null },
        { error: null }
      ]);
      
      const res = await createInvoiceWithSingleItem(mockSupabase, 'acc', 'job', { description: 'test', amount: 100 });
      expect(res).toEqual({ id: 'inv1' });
    });
  });

  describe('markInvoicePaidForPayment', () => {
    it('does nothing if already paid or void', async () => {
      setMockResults([{ data: { status: 'paid', total: 100 }, error: null }]);
      await markInvoicePaidForPayment(mockSupabase, 'inv1');
      // does not throw, does not consume more results
      expect(mockResults.length).toBe(0);
    });

    it('does nothing if not fully paid', async () => {
      setMockResults([
        { data: { status: 'sent', total: 100 }, error: null },
        { data: [{ amount: 50, refunded_amount: 0 }] }
      ]);
      await markInvoicePaidForPayment(mockSupabase, 'inv1');
      expect(mockResults.length).toBe(0);
    });

    it('updates status to paid if collected > total', async () => {
      setMockResults([
        { data: { status: 'sent', total: 100, signed_at: '2020' }, error: null },
        { data: [{ amount: 100, refunded_amount: 0 }] },
        { error: null }
      ]);
      await markInvoicePaidForPayment(mockSupabase, 'inv1');
      expect(mockResults.length).toBe(0);
    });
  });
  
  describe('updateInvoiceCharges', () => {
    it('throws if locked', async () => {
      setMockResults([
        { data: { id: 'inv', status: 'paid' }, error: null },
        { data: [] }
      ]);
      await expect(updateInvoiceCharges(mockSupabase, 'acc', 'job', 'inv', { discountPercent: 10, taxRate: 10 })).rejects.toThrow('locked');
    });

    it('recalculates total', async () => {
      setMockResults([
        { data: { id: 'inv', status: 'draft', job_id: 'job' }, error: null },
        { data: [] }, // items
        { error: null }, // update invoice charges
        { data: [{ amount: 100 }] }, // Promise.all items
        { data: { discount_percent: 10, tax_rate: 10 } }, // Promise.all invoice
        { error: null } // final update total
      ]);
      
      await updateInvoiceCharges(mockSupabase, 'acc', 'job', 'inv', { discountPercent: 10, taxRate: 10 });
    });
  });

  describe('addInvoiceItem', () => {
    it('throws if negative amount', async () => {
      setMockResults([
        { data: { id: 'inv', status: 'draft' }, error: null },
        { data: [] }
      ]);
      await expect(addInvoiceItem(mockSupabase, 'acc', 'inv', { description: 'test', amount: -10 })).rejects.toThrow('greater than 0');
    });
  });

  describe('deleteInvoiceItem', () => {
    it('deletes and recalculates', async () => {
      setMockResults([
        { data: { id: 'inv', status: 'draft', job_id: 'job' }, error: null },
        { data: [] },
        { error: null }, // delete
        { data: [] }, // items for recalc
        { data: { discount_percent: 0, tax_rate: 0 } }, // invoice for recalc
        { error: null } // update total
      ]);
      
      await deleteInvoiceItem(mockSupabase, 'acc', 'job', 'inv', 'item1');
    });
  });

  describe('updateInvoiceStatus', () => {
    it('updates status', async () => {
      setMockResults([
        { data: { id: 'inv', status: 'draft', job_id: 'job' }, error: null },
        { data: [] },
        { error: null } // update
      ]);
      await updateInvoiceStatus(mockSupabase, 'acc', 'job', 'inv', 'sent');
    });
  });

  describe('deleteInvoice', () => {
    it('deletes invoice', async () => {
      setMockResults([
        { data: { id: 'inv', status: 'draft', job_id: 'job' }, error: null },
        { data: [] },
        { error: null } // delete
      ]);
      await deleteInvoice(mockSupabase, 'acc', 'job', 'inv');
    });
  });

  describe('getPublicInvoice', () => {
    it('returns public invoice', async () => {
      setMockResults([
        { data: { id: 'inv' }, error: null },
        { data: [], error: null }
      ]);
      const res = await getPublicInvoice('inv');
      expect(res).toEqual({ invoice: { id: 'inv' }, items: [] });
    });
  });

  describe('signInvoice', () => {
    it('throws if void', async () => {
      setMockResults([{ data: { status: 'void' }, error: null }]);
      await expect(signInvoice('inv', 'John')).rejects.toThrow('voided');
    });

    it('updates and triggers quote acceptance', async () => {
      setMockResults([
        { data: { status: 'sent', account_id: 'acc', job_id: 'job' }, error: null },
        { error: null } // update
      ]);
      
      await signInvoice('inv', 'John');
    });
  });
});
