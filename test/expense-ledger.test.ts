import { describe, it, expect } from 'vitest';
import { generateExpensesCsv, type ExpenseRow, type ExpenseMetrics } from '@/lib/expense-ledger';

const SAMPLE_EXPENSES: ExpenseRow[] = [
  {
    id: 'cost-1',
    account_id: 'acc-123',
    job_id: 'job-1',
    type: 'material',
    category: 'Materials',
    description: '2x4 lumber and screws',
    amount: 150.5,
    burden_amount: 0,
    crew_id: null,
    crew_name: 'Owner',
    crew_role_label: null,
    supplier: 'Home Depot',
    receipt_url: 'https://example.com/receipt.jpg',
    client_charge_payment_id: null,
    client_charge_requested_at: null,
    cost_source: 'receipt',
    hours: null,
    rate: null,
    created_at: '2026-08-25T14:30:00Z',
    job_ref: 'J-101',
    job_client_name: 'Jane Doe',
    job_status: 'in_progress',
  },
  {
    id: 'cost-2',
    account_id: 'acc-123',
    job_id: 'job-1',
    type: 'labor',
    category: 'Labor',
    description: 'Mike T. framing shift',
    amount: 240.0,
    burden_amount: 96.0,
    crew_id: 'crew-1',
    crew_name: 'Mike T.',
    crew_role_label: 'Lead Carpenter',
    supplier: null,
    receipt_url: null,
    client_charge_payment_id: null,
    client_charge_requested_at: null,
    cost_source: 'clocked',
    hours: 8,
    rate: 30,
    created_at: '2026-08-26T17:00:00Z',
    job_ref: 'J-101',
    job_client_name: 'Jane Doe',
    job_status: 'in_progress',
  },
  {
    id: 'cost-3',
    account_id: 'acc-123',
    job_id: 'job-2',
    type: 'sub',
    category: 'Subcontractor',
    description: 'HVAC rough-in ductwork, master bedroom',
    amount: 1200.0,
    burden_amount: 0,
    crew_id: null,
    crew_name: 'Apex Air Inc.',
    crew_role_label: null,
    supplier: 'Apex Air Inc.',
    receipt_url: null,
    client_charge_payment_id: null,
    client_charge_requested_at: null,
    cost_source: 'supplier_invoice',
    hours: null,
    rate: null,
    created_at: '2026-08-27T10:15:00Z',
    job_ref: 'J-102',
    job_client_name: 'Bob Smith',
    job_status: 'in_progress',
  },
];

describe('generateExpensesCsv', () => {
  it('generates a CSV containing headers and correctly formatted rows', () => {
    const csv = generateExpensesCsv(SAMPLE_EXPENSES);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe(
      'Date,Job Ref,Client,Category,Type,Description,Supplier / Vendor,Amount ($),Labor Burden ($),Total Cost ($),Hours,Rate ($/hr),Logged By,Cost Provenance Source',
    );
    expect(lines.length).toBe(4); // header + 3 rows

    // Material row
    expect(lines[1]).toContain('2026-08-25');
    expect(lines[1]).toContain('J-101');
    expect(lines[1]).toContain('Jane Doe');
    expect(lines[1]).toContain('150.50');
    expect(lines[1]).toContain('Home Depot');
    expect(lines[1]).toContain('receipt');

    // Labor row (includes wages + burden)
    expect(lines[2]).toContain('2026-08-26');
    expect(lines[2]).toContain('Mike T.');
    expect(lines[2]).toContain('240.00');
    expect(lines[2]).toContain('96.00');
    expect(lines[2]).toContain('336.00'); // total cost
    expect(lines[2]).toContain('clocked');

    // Subcontractor row with comma in description escaped
    expect(lines[3]).toContain('"HVAC rough-in ductwork, master bedroom"');
    expect(lines[3]).toContain('1200.00');
    expect(lines[3]).toContain('supplier_invoice');
  });

  it('handles empty expense list safely', () => {
    const csv = generateExpensesCsv([]);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Date,Job Ref,Client');
  });

  it('correctly handles general overhead expenses with null job_id and ref', () => {
    const overheadExpenses: ExpenseRow[] = [
      {
        id: 'cost-overhead-1',
        account_id: 'acc-123',
        job_id: null,
        type: 'other',
        category: 'Operating Overhead',
        description: 'Commercial vehicle insurance',
        amount: 350.0,
        burden_amount: 0,
        crew_id: null,
        crew_name: 'Owner / Office',
        crew_role_label: null,
        supplier: 'Geico Commercial',
        receipt_url: 'https://example.com/receipt-insurance.pdf',
        client_charge_payment_id: null,
        client_charge_requested_at: null,
        cost_source: 'supplier_invoice',
        hours: null,
        rate: null,
        created_at: '2026-08-30T10:00:00Z',
        job_ref: null,
        job_client_name: null,
        job_status: null,
      },
    ];

    const csv = generateExpensesCsv(overheadExpenses);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);
    // Date,Job Ref,Client,Category...
    // Job Ref and Client should be empty strings
    const parts = lines[1].split(',');
    expect(parts[0]).toBe('2026-08-30');
    expect(parts[1]).toBe(''); // Job Ref
    expect(parts[2]).toBe(''); // Client
    expect(parts[5]).toBe('Commercial vehicle insurance');
    expect(parts[6]).toBe('Geico Commercial');
    expect(parts[7]).toBe('350.00');
  });

  it('neutralizes spreadsheet formula injection in CSV cells', () => {
    const maliciousExpenses: ExpenseRow[] = [
      {
        id: 'cost-injection-1',
        account_id: 'acc-123',
        job_id: 'job-1',
        type: 'material',
        category: 'Materials',
        description: '=cmd|\'/C calc\'!A0',
        amount: 100,
        burden_amount: 0,
        crew_id: null,
        crew_name: 'Owner',
        crew_role_label: null,
        supplier: '+1234567890',
        receipt_url: null,
        client_charge_payment_id: null,
        client_charge_requested_at: null,
        cost_source: 'receipt',
        hours: null,
        rate: null,
        created_at: '2026-08-30T10:00:00Z',
        job_ref: '@malicious_ref',
        job_client_name: '-dangerous_client',
        job_status: null,
      },
    ];

    const csv = generateExpensesCsv(maliciousExpenses);
    const lines = csv.trim().split('\n');
    expect(lines.length).toBe(2);

    // Any cell starting with =, +, -, @ must be prepended with '
    expect(lines[1]).toContain("'@malicious_ref");
    expect(lines[1]).toContain("'-dangerous_client");
    expect(lines[1]).toContain("'=cmd|'/C calc'!A0");
    expect(lines[1]).toContain("'+1234567890");
  });

  it('correctly aligns UTC timestamp to local calendar date using account timezone', async () => {
    const { formatExpenseLocalDate } = await import('@/lib/expense-ledger');
    // An expense created at 8:00 PM EDT on August 31, 2026 is stored in UTC as 2026-09-01T00:00:00.000Z
    const utcTimestamp = '2026-09-01T00:00:00.000Z';
    const edtDate = formatExpenseLocalDate(utcTimestamp, 'America/New_York');
    expect(edtDate).toBe('2026-08-31');
  });
});

describe('listAccountExpenses & getExpenseSummaryMetrics unit tests', () => {
  it('allows limit up to 5000 and does not clamp at 200', async () => {
    const { listAccountExpenses } = await import('@/lib/expense-ledger');

    let capturedLimit = 0;
    let capturedOffset = 0;

    const mockQuery: any = {
      eq: () => mockQuery,
      is: () => mockQuery,
      gte: () => mockQuery,
      lte: () => mockQuery,
      or: () => mockQuery,
      order: () => mockQuery,
      range: (from: number, to: number) => {
        capturedOffset = from;
        capturedLimit = to - from + 1;
        return Promise.resolve({
          data: [],
          count: 0,
          error: null,
        });
      },
    };

    const mockSupabase: any = {
      from: () => ({
        select: () => mockQuery,
      }),
    };

    // Requesting limit: 1000 should NOT be clamped to 200 anymore
    await listAccountExpenses(mockSupabase, 'acc-123', { limit: 1000, offset: 0 });
    expect(capturedLimit).toBe(1000);
    expect(capturedOffset).toBe(0);

    // Requesting limit: 3500 should be preserved
    await listAccountExpenses(mockSupabase, 'acc-123', { limit: 3500, offset: 50 });
    expect(capturedLimit).toBe(3500);
    expect(capturedOffset).toBe(50);
  });

  it('filters by supplier using eq(supplier, ...)', async () => {
    const { listAccountExpenses } = await import('@/lib/expense-ledger');

    let eqArgs: [string, any][] = [];

    const mockQuery: any = {
      eq: (col: string, val: any) => {
        eqArgs.push([col, val]);
        return mockQuery;
      },
      is: () => mockQuery,
      gte: () => mockQuery,
      lte: () => mockQuery,
      or: () => mockQuery,
      order: () => mockQuery,
      range: () =>
        Promise.resolve({
          data: [],
          count: 0,
          error: null,
        }),
    };

    const mockSupabase: any = {
      from: () => ({
        select: () => mockQuery,
      }),
    };

    await listAccountExpenses(mockSupabase, 'acc-123', { supplier: '84 Lumber' });
    expect(eqArgs).toContainEqual(['supplier', '84 Lumber']);
  });

  it('filters overhead expenses using is(job_id, null)', async () => {
    const { listAccountExpenses } = await import('@/lib/expense-ledger');

    let isCalledWith: [string, any] | null = null;

    const mockQuery: any = {
      eq: () => mockQuery,
      is: (col: string, val: any) => {
        isCalledWith = [col, val];
        return mockQuery;
      },
      gte: () => mockQuery,
      lte: () => mockQuery,
      or: () => mockQuery,
      order: () => mockQuery,
      range: () =>
        Promise.resolve({
          data: [
            {
              id: 'c-1',
              account_id: 'acc-123',
              job_id: null,
              type: 'other',
              category: 'Overhead',
              description: 'Fuel card',
              amount: 85,
              burden_amount: 0,
              cost_source: 'receipt',
              created_at: '2026-09-01T00:00:00Z',
              jobs: null,
            },
          ],
          count: 1,
          error: null,
        }),
    };

    const mockSupabase: any = {
      from: () => ({
        select: () => mockQuery,
      }),
    };

    const result = await listAccountExpenses(mockSupabase, 'acc-123', { jobId: 'overhead' });
    expect(isCalledWith).toEqual(['job_id', null]);
    expect(result.rows[0].job_id).toBeNull();
    expect(result.rows[0].description).toBe('Fuel card');
  });

  it('computes metrics accurately and handles evidenced ratio with fetchAllPages', async () => {
    const { getExpenseSummaryMetrics } = await import('@/lib/expense-ledger');

    const mockQuery: any = {
      eq: () => mockQuery,
      is: () => mockQuery,
      in: () => mockQuery,
      gte: () => mockQuery,
      lte: () => mockQuery,
      order: () => mockQuery,
      range: () =>
        Promise.resolve({
          data: [
            { type: 'material', amount: 500, burden_amount: 0, cost_source: 'receipt' },
            { type: 'labor', amount: 1000, burden_amount: 250, cost_source: 'clocked' },
            { type: 'sub', amount: 2000, burden_amount: 0, cost_source: 'supplier_invoice' },
            { type: 'other', amount: 300, burden_amount: 0, cost_source: 'estimated' },
          ],
          error: null,
        }),
    };

    const mockSupabase: any = {
      from: () => ({
        select: () => mockQuery,
      }),
    };

    const metrics = await getExpenseSummaryMetrics(mockSupabase, 'acc-123');
    expect(metrics.materialsTotal).toBe(500);
    expect(metrics.laborWagesTotal).toBe(1000);
    expect(metrics.laborBurdenTotal).toBe(250);
    expect(metrics.laborTotal).toBe(1250);
    expect(metrics.subcontractorsTotal).toBe(2000);
    expect(metrics.otherTotal).toBe(300);
    // 500 + 1250 + 2000 + 300 = 4050
    expect(metrics.totalSpend).toBe(4050);
    expect(metrics.transactionCount).toBe(4);
    // 3 out of 4 are evidenced (receipt, clocked, supplier_invoice)
    expect(metrics.evidencedCount).toBe(3);
    expect(metrics.evidencedRatio).toBe(0.75);
  });

  it('paginates over >1000 rows in getExpenseSummaryMetrics without silent truncation', async () => {
    const { getExpenseSummaryMetrics } = await import('@/lib/expense-ledger');

    let callCount = 0;
    const mockQuery: any = {
      eq: () => mockQuery,
      is: () => mockQuery,
      in: () => mockQuery,
      gte: () => mockQuery,
      lte: () => mockQuery,
      order: () => mockQuery,
      range: (from: number, to: number) => {
        callCount++;
        // Page 1: 1000 items of $10 material each
        if (from === 0) {
          return Promise.resolve({
            data: Array.from({ length: 1000 }, () => ({
              type: 'material',
              amount: 10,
              burden_amount: 0,
              cost_source: 'receipt',
            })),
            error: null,
          });
        }
        // Page 2: 500 items of $20 subcontractor each
        return Promise.resolve({
          data: Array.from({ length: 500 }, () => ({
            type: 'sub',
            amount: 20,
            burden_amount: 0,
            cost_source: 'supplier_invoice',
          })),
          error: null,
        });
      },
    };

    const mockSupabase: any = {
      from: () => ({
        select: () => mockQuery,
      }),
    };

    const metrics = await getExpenseSummaryMetrics(mockSupabase, 'acc-123');
    // Page 1 (1000 * 10 = 10000) + Page 2 (500 * 20 = 10000) = 20000
    expect(callCount).toBe(2);
    expect(metrics.transactionCount).toBe(1500);
    expect(metrics.materialsTotal).toBe(10000);
    expect(metrics.subcontractorsTotal).toBe(10000);
    expect(metrics.totalSpend).toBe(20000);
  });
});
