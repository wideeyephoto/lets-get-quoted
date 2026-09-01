import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  mapQboCustomerToClient,
  mapQboPaymentToInbound,
  mapQboInvoiceStatus,
  summarizeBidirectional,
} from '../src/lib/quickbooks/map';
import {
  pullCustomersFromQuickBooks,
  pullPaymentsAndReconcileInvoices,
  pullFromQuickBooks,
} from '../src/lib/quickbooks/sync';

// Mock dependencies
vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('../src/lib/quickbooks/api', () => ({
  qboQueryCustomers: vi.fn(),
  qboQueryInvoices: vi.fn(),
  qboQueryPayments: vi.fn(),
  qboResolveServiceItem: vi.fn().mockResolvedValue('item-svc-1'),
  qboAutomatedSalesTax: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/lib/quickbooks/connection', () => ({
  activeConnection: vi.fn().mockResolvedValue({
    accessToken: 'test-token',
    realmId: 'realm-123',
  }),
}));

describe('QuickBooks Inbound Mapping', () => {
  describe('mapQboCustomerToClient', () => {
    it('maps standard customer with full details', () => {
      const qboCustomer = {
        Id: 'cust-101',
        DisplayName: 'Sarah Jenkins',
        GivenName: 'Sarah',
        FamilyName: 'Jenkins',
        PrimaryEmailAddr: { Address: 'SARAH@Example.com ' },
        PrimaryPhone: { FreeFormNumber: '(248) 555-9012' },
        BillAddr: {
          Line1: '400 E Lincoln Ave',
          City: 'Royal Oak',
          CountrySubDivisionCode: 'MI',
          PostalCode: '48067',
        },
        Notes: 'Referred by Dave',
        Active: true,
      };

      const mapped = mapQboCustomerToClient(qboCustomer);
      expect(mapped).toEqual({
        qboCustomerId: 'cust-101',
        name: 'Sarah Jenkins',
        email: 'sarah@example.com',
        phone: '(248) 555-9012',
        address: '400 E Lincoln Ave, Royal Oak, MI 48067',
        notes: 'Referred by Dave',
        active: true,
      });
    });

    it('falls back to GivenName + FamilyName when DisplayName is absent', () => {
      const qboCustomer = {
        Id: 'cust-102',
        GivenName: 'Marcus',
        FamilyName: 'Vance',
      };

      const mapped = mapQboCustomerToClient(qboCustomer);
      expect(mapped?.name).toBe('Marcus Vance');
      expect(mapped?.qboCustomerId).toBe('cust-102');
    });

    it('falls back to CompanyName when individual name is absent', () => {
      const qboCustomer = {
        Id: 'cust-103',
        CompanyName: 'Apex Properties LLC',
      };

      const mapped = mapQboCustomerToClient(qboCustomer);
      expect(mapped?.name).toBe('Apex Properties LLC');
    });

    it('returns null for missing Id or blank name', () => {
      expect(mapQboCustomerToClient({})).toBeNull();
      expect(mapQboCustomerToClient({ Id: 'cust-104', DisplayName: '   ' })).toBeNull();
    });
  });

  describe('mapQboPaymentToInbound', () => {
    it('extracts payment amounts and linked invoice IDs', () => {
      const qboPayment = {
        Id: 'pay-501',
        TotalAmt: 1250.5,
        TxnDate: '2026-08-15',
        CustomerRef: { value: 'cust-101' },
        Line: [
          {
            Amount: 1250.5,
            LinkedTxn: [
              { TxnId: 'inv-qbo-991', TxnType: 'Invoice' },
              { TxnId: 'est-qbo-112', TxnType: 'Estimate' },
            ],
          },
        ],
      };

      const mapped = mapQboPaymentToInbound(qboPayment);
      expect(mapped).toEqual({
        qboPaymentId: 'pay-501',
        amount: 1250.5,
        paidAt: '2026-08-15',
        qboCustomerId: 'cust-101',
        linkedInvoiceQboIds: ['inv-qbo-991'],
      });
    });

    it('handles payments with no linked transactions', () => {
      const qboPayment = {
        Id: 'pay-502',
        TotalAmt: 500,
        TxnDate: '2026-08-16',
      };

      const mapped = mapQboPaymentToInbound(qboPayment);
      expect(mapped?.linkedInvoiceQboIds).toEqual([]);
      expect(mapped?.amount).toBe(500);
    });
  });

  describe('mapQboInvoiceStatus', () => {
    it('recognizes a fully paid invoice with zero balance', () => {
      const qboInvoice = {
        Id: 'inv-qbo-991',
        DocNumber: 'INV-1042',
        TotalAmt: 1250.5,
        Balance: 0,
        LinkedTxn: [{ TxnId: 'pay-501', TxnType: 'Payment' }],
      };

      const mapped = mapQboInvoiceStatus(qboInvoice);
      expect(mapped).toEqual({
        qboInvoiceId: 'inv-qbo-991',
        docNumber: 'INV-1042',
        total: 1250.5,
        balance: 0,
        isPaid: true,
        linkedPaymentQboIds: ['pay-501'],
      });
    });

    it('recognizes an unpaid invoice with positive balance', () => {
      const qboInvoice = {
        Id: 'inv-qbo-992',
        TotalAmt: 2400,
        Balance: 2400,
      };

      const mapped = mapQboInvoiceStatus(qboInvoice);
      expect(mapped?.isPaid).toBe(false);
      expect(mapped?.balance).toBe(2400);
    });
  });

  describe('summarizeBidirectional', () => {
    it('summarizes both push and pull activities clearly', () => {
      const summary = summarizeBidirectional({
        invoicesPushed: 3,
        paymentsPushed: 2,
        customersPulled: 5,
        paymentsPulled: 1,
        invoicesReconciled: 1,
        held: 1,
        failed: 0,
      });

      expect(summary).toBe(
        'Pushed 3 invoices and 2 payments · Pulled 5 customers, 1 payment and 1 invoice reconciliation · 1 waiting on you',
      );
    });

    it('summarizes inbound pull only runs', () => {
      const summary = summarizeBidirectional({
        customersPulled: 2,
        paymentsPulled: 1,
        invoicesReconciled: 0,
        failed: 0,
      });

      expect(summary).toBe('Pulled 2 customers and 1 payment');
    });

    it('handles empty sync cycles gracefully', () => {
      expect(summarizeBidirectional({})).toBe('Nothing new to sync');
    });
  });
});

describe('QuickBooks Inbound Sync Execution', () => {
  const accountId = 'acc-test-123';
  const mockCache = {
    connection: { accessToken: 'token', realmId: 'realm-123' },
    itemId: 'item-svc-1',
    automatedSalesTax: false,
    syncFrom: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pulls new customers from QuickBooks and inserts into clients table', async () => {
    const { qboQueryCustomers } = await import('../src/lib/quickbooks/api');
    const { createAdminClient } = await import('@/lib/auth');

    vi.mocked(qboQueryCustomers).mockResolvedValueOnce([
      {
        Id: 'qbo-cust-1',
        DisplayName: 'Bob Builder',
        PrimaryEmailAddr: { Address: 'bob@example.com' },
        PrimaryPhone: { FreeFormNumber: '2485551234' },
      },
    ]);

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'client-new-1' }, error: null }),
      }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'clients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
            insert: mockInsert,
          };
        }
        return {};
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const result = await pullCustomersFromQuickBooks(mockCache, accountId);
    expect(result.pulled).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: accountId,
        name: 'Bob Builder',
        email: 'bob@example.com',
        qbo_customer_id: 'qbo-cust-1',
      }),
    );
  });

  it('deduplicates and updates existing clients by phone number', async () => {
    const { qboQueryCustomers } = await import('../src/lib/quickbooks/api');
    const { createAdminClient } = await import('@/lib/auth');

    vi.mocked(qboQueryCustomers).mockResolvedValueOnce([
      {
        Id: 'qbo-cust-existing',
        DisplayName: 'Alice Cooper',
        PrimaryEmailAddr: { Address: 'alice@example.com' },
        PrimaryPhone: { FreeFormNumber: '(248) 555-9988' },
        BillAddr: { Line1: '123 Elm St', City: 'Detroit' },
      },
    ]);

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'clients') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'client-alice',
                    name: 'Alice Cooper',
                    phone: '(248) 555-9988',
                    email: null,
                    address: null,
                    qbo_customer_id: null,
                  },
                ],
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const result = await pullCustomersFromQuickBooks(mockCache, accountId);
    expect(result.pulled).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        qbo_customer_id: 'qbo-cust-existing',
        email: 'alice@example.com',
        address: '123 Elm St, Detroit',
      }),
    );
  });

  it('reconciles paid QuickBooks payments against Let’s Get Quoted invoices', async () => {
    const { qboQueryPayments, qboQueryInvoices } = await import('../src/lib/quickbooks/api');
    const { createAdminClient } = await import('@/lib/auth');

    vi.mocked(qboQueryPayments).mockResolvedValueOnce([
      {
        Id: 'qbo-pay-100',
        TotalAmt: 850,
        TxnDate: '2026-08-20',
        Line: [
          {
            Amount: 850,
            LinkedTxn: [{ TxnId: 'qbo-inv-55', TxnType: 'Invoice' }],
          },
        ],
      },
    ]);
    vi.mocked(qboQueryInvoices).mockResolvedValueOnce([]);

    const mockInsertPayment = vi.fn().mockResolvedValue({ error: null });
    const mockUpdateInvoice = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    });

    const mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'invoices') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'lgq-inv-55',
                      ref: 'INV-1055',
                      total: 850,
                      status: 'sent',
                      qbo_id: 'qbo-inv-55',
                      created_at: '2026-08-10',
                    },
                  ],
                }),
              }),
            }),
            update: mockUpdateInvoice,
          };
        }
        if (table === 'payments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockResolvedValue({ data: [] }),
              }),
            }),
            insert: mockInsertPayment,
          };
        }
        return {};
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdmin as any);

    const result = await pullPaymentsAndReconcileInvoices(mockCache, accountId);
    expect(result.paymentsPulled).toBe(1);
    expect(result.invoicesReconciled).toBe(1);
    expect(mockInsertPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        account_id: accountId,
        invoice_id: 'lgq-inv-55',
        amount: 850,
        status: 'paid',
        qbo_id: 'qbo-pay-100',
      }),
    );
    expect(mockUpdateInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'paid',
      }),
    );
  });
});
