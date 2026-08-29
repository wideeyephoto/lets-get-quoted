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
    burden_amount: null,
    crew_id: null,
    crew_name: 'Owner',
    crew_role_label: null,
    supplier: 'Home Depot',
    receipt_url: 'https://example.com/receipt.jpg',
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
    burden_amount: null,
    crew_id: null,
    crew_name: 'Apex Air Inc.',
    crew_role_label: null,
    supplier: 'Apex Air Inc.',
    receipt_url: null,
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
});
