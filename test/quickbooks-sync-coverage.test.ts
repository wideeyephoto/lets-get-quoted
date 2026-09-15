/**
 * QuickBooks Online sync coverage test — Phase 4B
 *
 * Targets:
 *   - src/lib/quickbooks/sync.ts (prepare, resolveCustomer, syncAccount,
 *     pullCustomersFromQuickBooks, pullPaymentsAndReconcileInvoices,
 *     pullFromQuickBooks, backfillAccount, syncAllAccounts)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  activeConnection: vi.fn(),
  qboAutomatedSalesTax: vi.fn(),
  qboCreate: vi.fn(),
  qboFindCustomerByName: vi.fn(),
  qboQueryCustomers: vi.fn(),
  qboQueryInvoices: vi.fn(),
  qboQueryPayments: vi.fn(),
  qboResolveServiceItem: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@/lib/quickbooks/connection', () => ({
  activeConnection: mocks.activeConnection,
}));

vi.mock('@/lib/quickbooks/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/quickbooks/api')>('@/lib/quickbooks/api');
  return {
    ...actual,
    qboAutomatedSalesTax: mocks.qboAutomatedSalesTax,
    qboCreate: mocks.qboCreate,
    qboFindCustomerByName: mocks.qboFindCustomerByName,
    qboQueryCustomers: mocks.qboQueryCustomers,
    qboQueryInvoices: mocks.qboQueryInvoices,
    qboQueryPayments: mocks.qboQueryPayments,
    qboResolveServiceItem: mocks.qboResolveServiceItem,
  };
});

import {
  syncAccount,
  pullCustomersFromQuickBooks,
  pullPaymentsAndReconcileInvoices,
  pullFromQuickBooks,
  backfillAccount,
  syncAllAccounts,
} from '@/lib/quickbooks/sync';
import { QuickBooksApiError } from '@/lib/quickbooks/api';

describe('QuickBooks Online Sync Engine', () => {
  let mockAdmin: any;

  function createQueryChain(resultData: any = null, resultError: any = null) {
    const chain: any = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      maybeSingle: vi.fn().mockResolvedValue({ data: resultData, error: resultError }),
      then: (resolve: any) => Promise.resolve({ data: resultData, error: resultError }).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain({
            qbo_item_id: 'item-123',
            automated_sales_tax: false,
            sync_from: null,
          });
        }
        if (table === 'invoices') {
          return createQueryChain([]);
        }
        if (table === 'invoice_items') {
          return createQueryChain([]);
        }
        if (table === 'jobs') {
          return createQueryChain([]);
        }
        if (table === 'clients') {
          return createQueryChain([]);
        }
        if (table === 'payments') {
          return createQueryChain([]);
        }
        return createQueryChain(null);
      }),
    };

    mocks.createAdminClient.mockReturnValue(mockAdmin);
    mocks.activeConnection.mockResolvedValue({
      realmId: '123456789',
      accessToken: 'test-token',
      expiresAt: Date.now() + 3600000,
    });
    mocks.qboAutomatedSalesTax.mockResolvedValue(false);
    mocks.qboResolveServiceItem.mockResolvedValue('item-123');
    mocks.qboQueryCustomers.mockResolvedValue([]);
    mocks.qboQueryInvoices.mockResolvedValue([]);
    mocks.qboQueryPayments.mockResolvedValue([]);
  });

  describe('syncAccount — connection handling', () => {
    it('returns NOT_CONNECTED when activeConnection returns null', async () => {
      mocks.activeConnection.mockResolvedValue(null);

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(false);
      expect(result.message).toContain('QuickBooks isn’t linked');
      expect(result.invoices).toBe(0);
    });

    it('handles connection error gracefully without throwing', async () => {
      mocks.activeConnection.mockRejectedValue(new Error('OAuth token expired'));

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(false);
      expect(result.message).toBe('OAuth token expired');
    });

    it('populates missing itemId and automatedSalesTax via API when not cached', async () => {
      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain({
            qbo_item_id: null,
            automated_sales_tax: null,
            sync_from: null,
          });
        }
        return createQueryChain([]);
      });

      mocks.qboResolveServiceItem.mockResolvedValue('resolved-item-99');
      mocks.qboAutomatedSalesTax.mockResolvedValue(true);

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(true);
      expect(mocks.qboResolveServiceItem).toHaveBeenCalled();
      expect(mocks.qboAutomatedSalesTax).toHaveBeenCalled();
    });
  });

  describe('syncAccount — outbound invoice sync', () => {
    it('processes eligible invoices and creates them in QuickBooks', async () => {
      const mockInvoices = [
        {
          id: 'inv-1',
          ref: 'INV-1001',
          total: 500,
          status: 'sent',
          created_at: '2026-01-15T12:00:00Z',
          discount_percent: 0,
          tax_rate: 0,
          job_id: 'job-1',
        },
      ];

      const mockJob = {
        id: 'job-1',
        ref: 'J-101',
        scope: 'Roof leak repair',
        client_id: 'client-1',
        client_name: 'Alice Homeowner',
        client_email: 'alice@example.com',
        client_phone: '555-111-2222',
        address: '123 Main St',
      };

      const mockClient = {
        id: 'client-1',
        name: 'Alice Homeowner',
        email: 'alice@example.com',
        phone: '555-111-2222',
        address: '123 Main St',
        qbo_customer_id: 'qbo-cust-1',
      };

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain({ qbo_item_id: 'item-1', automated_sales_tax: false, sync_from: null });
        }
        if (table === 'invoices') {
          return createQueryChain(mockInvoices);
        }
        if (table === 'jobs') {
          return createQueryChain([mockJob]);
        }
        if (table === 'clients') {
          return createQueryChain([mockClient]);
        }
        if (table === 'invoice_items') {
          return createQueryChain([{ invoice_id: 'inv-1', description: 'Labor', amount: 500, sort_order: 1 }]);
        }
        return createQueryChain([]);
      });

      mocks.qboCreate.mockResolvedValue({ Id: 'qbo-inv-999' });

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(true);
      expect(result.invoices).toBe(1);
      expect(mocks.qboCreate).toHaveBeenCalledWith(
        expect.anything(),
        'Invoice',
        expect.objectContaining({
          CustomerRef: { value: 'qbo-cust-1' },
        }),
        'inv-1', // idempotency key
      );
    });

    it('holds invoices with invalid state (zero total or missing customer)', async () => {
      const mockInvoices = [
        {
          id: 'inv-zero',
          ref: 'INV-000',
          total: 0,
          status: 'sent',
          created_at: '2026-01-15T12:00:00Z',
          discount_percent: 0,
          tax_rate: 0,
          job_id: 'job-zero',
        },
      ];

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain({ qbo_item_id: 'item-1', automated_sales_tax: false, sync_from: null });
        }
        if (table === 'invoices') return createQueryChain(mockInvoices);
        return createQueryChain([]);
      });

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(true);
      expect(result.held).toBeGreaterThanOrEqual(1);
      expect(mocks.qboCreate).not.toHaveBeenCalled();
    });

    it('records failed count when qboCreate throws', async () => {
      const mockInvoices = [
        {
          id: 'inv-err',
          ref: 'INV-ERR',
          total: 300,
          status: 'sent',
          created_at: '2026-01-15T12:00:00Z',
          discount_percent: 0,
          tax_rate: 0,
          job_id: 'job-err',
        },
      ];

      const mockJob = {
        id: 'job-err',
        ref: 'J-ERR',
        scope: 'Siding',
        client_id: null,
        client_name: 'Bob Error',
        client_email: null,
        client_phone: null,
        address: null,
      };

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain({ qbo_item_id: 'item-1', automated_sales_tax: false, sync_from: null });
        }
        if (table === 'invoices') return createQueryChain(mockInvoices);
        if (table === 'jobs') return createQueryChain([mockJob]);
        return createQueryChain([]);
      });

      mocks.qboFindCustomerByName.mockResolvedValue('qbo-cust-bob');
      mocks.qboCreate.mockRejectedValue(new Error('Intuit API internal error'));

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(true);
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });

    it('resolves duplicate customer name gracefully when error code is 6240', async () => {
      const mockInvoices = [
        {
          id: 'inv-dup',
          ref: 'INV-DUP',
          total: 450,
          status: 'sent',
          created_at: '2026-01-15T12:00:00Z',
          discount_percent: 0,
          tax_rate: 0,
          job_id: 'job-dup',
        },
      ];

      const mockJob = {
        id: 'job-dup',
        ref: 'J-DUP',
        scope: 'Paint',
        client_id: 'client-dup',
        client_name: 'Carol Dupe',
      };

      const mockClient = {
        id: 'client-dup',
        name: 'Carol Dupe',
        qbo_customer_id: null,
      };

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain({ qbo_item_id: 'item-1', automated_sales_tax: false, sync_from: null });
        }
        if (table === 'invoices') return createQueryChain(mockInvoices);
        if (table === 'jobs') return createQueryChain([mockJob]);
        if (table === 'clients') return createQueryChain([mockClient]);
        return createQueryChain([]);
      });

      // First lookup fails
      mocks.qboFindCustomerByName.mockResolvedValueOnce(null);
      // Customer creation fails with 6240 duplicate name
      mocks.qboCreate.mockImplementationOnce(() => {
        throw new QuickBooksApiError('Duplicate Name Exists', 400, '6240');
      });
      // Second lookup succeeds
      mocks.qboFindCustomerByName.mockResolvedValueOnce('qbo-existing-carol');
      // Invoice creation succeeds
      mocks.qboCreate.mockResolvedValueOnce({ Id: 'qbo-inv-carol' });

      const result = await syncAccount('acc-1');
      expect(result.ok).toBe(true);
      expect(result.invoices).toBe(1);
    });
  });

  describe('pullCustomersFromQuickBooks', () => {
    const fakeCache = {
      connection: { realmId: '123', accessToken: 'tok', expiresAt: 999999999 },
      itemId: 'item-1',
      automatedSalesTax: false,
      syncFrom: null,
    };

    it('returns { pulled: 0, failed: 0 } when no customers in QBO', async () => {
      mocks.qboQueryCustomers.mockResolvedValue([]);
      const result = await pullCustomersFromQuickBooks(fakeCache, 'acc-1');
      expect(result).toEqual({ pulled: 0, failed: 0 });
    });

    it('matches existing client by qbo_customer_id and updates missing fields', async () => {
      mocks.qboQueryCustomers.mockResolvedValue([
        {
          Id: 'qbo-c1',
          DisplayName: 'Dave Contractor',
          PrimaryEmailAddr: { Address: 'dave@newemail.com' },
          PrimaryPhone: { FreeFormNumber: '555-444-3333' },
        },
      ]);

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'clients') {
          return createQueryChain([
            {
              id: 'client-dave',
              name: 'Dave Contractor',
              email: null,
              phone: null,
              address: null,
              qbo_customer_id: 'qbo-c1',
            },
          ]);
        }
        return createQueryChain([]);
      });

      const result = await pullCustomersFromQuickBooks(fakeCache, 'acc-1');
      expect(result.pulled).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('matches existing client by phone number when qbo_customer_id not set', async () => {
      mocks.qboQueryCustomers.mockResolvedValue([
        {
          Id: 'qbo-c2',
          DisplayName: 'Eve Smith',
          PrimaryPhone: { FreeFormNumber: '(555) 987-6543' },
        },
      ]);

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'clients') {
          return createQueryChain([
            {
              id: 'client-eve',
              name: 'Eve Smith',
              email: 'eve@example.com',
              phone: '5559876543',
              address: null,
              qbo_customer_id: null,
            },
          ]);
        }
        return createQueryChain([]);
      });

      const result = await pullCustomersFromQuickBooks(fakeCache, 'acc-1');
      expect(result.pulled).toBe(1);
    });

    it('inserts new client when no match found', async () => {
      mocks.qboQueryCustomers.mockResolvedValue([
        {
          Id: 'qbo-new-1',
          DisplayName: 'Frank Newbie',
          PrimaryEmailAddr: { Address: 'frank@new.com' },
          PrimaryPhone: { FreeFormNumber: '555-000-1111' },
        },
      ]);

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'clients') {
          const chain = createQueryChain([]);
          chain.insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'client-frank-created' }, error: null }),
            }),
          });
          return chain;
        }
        return createQueryChain([]);
      });

      const result = await pullCustomersFromQuickBooks(fakeCache, 'acc-1');
      expect(result.pulled).toBe(1);
      expect(result.failed).toBe(0);
    });
  });

  describe('pullPaymentsAndReconcileInvoices', () => {
    const fakeCache = {
      connection: { realmId: '123', accessToken: 'tok', expiresAt: 999999999 },
      itemId: 'item-1',
      automatedSalesTax: false,
      syncFrom: null,
    };

    it('returns zeroes when no synced QBO invoices exist', async () => {
      mockAdmin.from.mockReturnValue(createQueryChain([]));

      const result = await pullPaymentsAndReconcileInvoices(fakeCache, 'acc-1');
      expect(result).toEqual({ paymentsPulled: 0, invoicesReconciled: 0, failed: 0 });
    });

    it('reconciles unpaid invoice when QBO payment links to it', async () => {
      const mockInvoices = [
        {
          id: 'inv-unpaid-1',
          ref: 'INV-100',
          total: 1000,
          status: 'sent',
          qbo_id: 'qbo-inv-100',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];

      mocks.qboQueryPayments.mockResolvedValue([
        {
          Id: 'qbo-pay-1',
          TotalAmt: 1000,
          TxnDate: '2026-01-05',
          Line: [
            {
              LinkedTxn: [
                {
                  TxnId: 'qbo-inv-100',
                  TxnType: 'Invoice',
                },
              ],
            },
          ],
        },
      ]);

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'invoices') return createQueryChain(mockInvoices);
        if (table === 'payments') return createQueryChain([]);
        return createQueryChain([]);
      });

      const result = await pullPaymentsAndReconcileInvoices(fakeCache, 'acc-1');
      expect(result.paymentsPulled).toBe(1);
      expect(result.invoicesReconciled).toBe(1);
    });

    it('reconciles invoices marked paid by zero balance query', async () => {
      const mockInvoices = [
        {
          id: 'inv-bal-0',
          ref: 'INV-200',
          total: 500,
          status: 'sent',
          qbo_id: 'qbo-inv-200',
          created_at: '2026-01-01T00:00:00Z',
        },
      ];

      mocks.qboQueryPayments.mockResolvedValue([]);
      mocks.qboQueryInvoices.mockResolvedValue([
        {
          Id: 'qbo-inv-200',
          TotalAmt: 500,
          Balance: 0,
        },
      ]);

      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'invoices') return createQueryChain(mockInvoices);
        return createQueryChain([]);
      });

      const result = await pullPaymentsAndReconcileInvoices(fakeCache, 'acc-1');
      expect(result.invoicesReconciled).toBe(1);
    });
  });

  describe('pullFromQuickBooks', () => {
    it('executes inbound customer and payment pulls and logs summary', async () => {
      mocks.qboQueryCustomers.mockResolvedValue([]);
      mocks.qboQueryPayments.mockResolvedValue([]);

      const result = await pullFromQuickBooks('acc-1');
      expect(result.ok).toBe(true);
      expect(result.invoices).toBe(0);
      expect(result.message).toBeDefined();
    });
  });

  describe('backfillAccount', () => {
    it('resets sync_from to null and calls syncAccount', async () => {
      const updateMock = vi.fn().mockReturnThis();
      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          const chain = createQueryChain({ qbo_item_id: 'item-1', automated_sales_tax: false, sync_from: null });
          chain.update = updateMock;
          return chain;
        }
        return createQueryChain([]);
      });

      const result = await backfillAccount('acc-1');
      expect(result.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ sync_from: null }));
    });
  });

  describe('syncAllAccounts', () => {
    it('iterates through connected accounts and aggregates results', async () => {
      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain([{ account_id: 'acc-1' }, { account_id: 'acc-2' }]);
        }
        return createQueryChain([]);
      });

      const result = await syncAllAccounts();
      expect(result.accounts).toBe(2);
      expect(result.failed).toBe(0);
    });

    it('isolates failures so one failing account does not stop others', async () => {
      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'quickbooks_connections') {
          return createQueryChain([{ account_id: 'acc-good' }, { account_id: 'acc-bad' }]);
        }
        if (table === 'invoices') {
          return createQueryChain([
            {
              id: 'inv-1',
              ref: 'INV-1',
              total: 100,
              status: 'sent',
              created_at: '2026-01-01T00:00:00Z',
              discount_percent: 0,
              tax_rate: 0,
              job_id: 'job-1',
            },
          ]);
        }
        if (table === 'jobs') {
          return createQueryChain([{ id: 'job-1', ref: 'J-1', client_name: 'Client 1' }]);
        }
        return createQueryChain([]);
      });

      // qboFindCustomerByName resolves for both
      mocks.qboFindCustomerByName.mockResolvedValue('qbo-c1');

      // qboCreate succeeds once, then fails for the second account
      mocks.qboCreate
        .mockResolvedValueOnce({ Id: 'qbo-inv-good' })
        .mockRejectedValueOnce(new Error('Rate limited by QuickBooks'));

      const result = await syncAllAccounts();
      expect(result.accounts).toBe(2);
      expect(result.invoices).toBe(1);
      expect(result.failed).toBeGreaterThanOrEqual(1);
    });
  });
});
