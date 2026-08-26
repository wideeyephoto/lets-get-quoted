import { describe, it, expect } from 'vitest';
import {
  mapJobToAccountingInvoice,
  mapPermitFeeToVendorBill,
  mapPurchaseOrderToVendorBill,
  calculateJobFinancialLedger,
} from '../src/lib/accounting/accounting-sync-engine';

describe('QuickBooks Online & Xero Accounting Sync Engine', () => {
  it('maps job quotes and line items into standard accounting invoices', () => {
    const invoice = mapJobToAccountingInvoice({
      jobId: '11111111-1111-4111-a111-111111111111',
      jobRef: 'JOB-8841',
      clientName: 'Marcus Vance',
      clientEmail: 'marcus@example.com',
      clientPhone: '(248) 555-4920',
      address: '211 S Williams St, Royal Oak, MI',
      quotedAmount: 14500,
      lineItems: [
        { description: 'Tear off and install GAF Timberline HDZ 24 sq', quantity: 24, unitPrice: 500, total: 12000 },
        { description: 'Replace damaged plywood sheathing', quantity: 5, unitPrice: 100, total: 500 },
        { description: 'Seamless aluminum gutters and downspouts', quantity: 1, unitPrice: 2000, total: 2000 },
      ],
    });

    expect(invoice.invoiceNumber).toBe('INV-8841');
    expect(invoice.customer.displayName).toBe('Marcus Vance');
    expect(invoice.customer.email).toBe('marcus@example.com');
    expect(invoice.lineItems).toHaveLength(3);
    expect(invoice.total).toBe(14500);
  });

  it('maps permit fees and material purchase orders into vendor bills', () => {
    const permitBill = mapPermitFeeToVendorBill({
      jobRef: 'JOB-8841',
      authorityName: 'City of Royal Oak',
      feeAmount: 155,
      permitNumber: 'ROOF-2026-991',
    });

    expect(permitBill.billNumber).toBe('PERMIT-ROOF-2026-991');
    expect(permitBill.vendorName).toBe('City of Royal Oak');
    expect(permitBill.billCategory).toBe('permit_fee');
    expect(permitBill.amount).toBe(155);
    expect(permitBill.status).toBe('paid');

    const materialBill = mapPurchaseOrderToVendorBill({
      poNumber: 'PO-ABC-20260826-4491',
      jobRef: 'JOB-8841',
      distributorName: 'ABC Supply Co., Inc.',
      wholesaleAmount: 4200,
    });

    expect(materialBill.billNumber).toBe('PO-ABC-20260826-4491');
    expect(materialBill.vendorName).toBe('ABC Supply Co., Inc.');
    expect(materialBill.billCategory).toBe('materials');
    expect(materialBill.amount).toBe(4200);
  });

  it('calculates job gross margin and P&L financial ledger', () => {
    const invoice = mapJobToAccountingInvoice({
      jobId: '11111111-1111-4111-a111-111111111111',
      jobRef: 'JOB-8841',
      clientName: 'Marcus Vance',
      quotedAmount: 14500,
    });

    const bills = [
      mapPermitFeeToVendorBill({
        jobRef: 'JOB-8841',
        authorityName: 'City of Royal Oak',
        feeAmount: 155,
      }),
      mapPurchaseOrderToVendorBill({
        poNumber: 'PO-ABC-1',
        jobRef: 'JOB-8841',
        distributorName: 'ABC Supply Co.',
        wholesaleAmount: 4200,
      }),
    ];

    const ledger = calculateJobFinancialLedger({
      jobId: '11111111-1111-4111-a111-111111111111',
      jobRef: 'JOB-8841',
      customerName: 'Marcus Vance',
      invoice,
      bills,
    });

    expect(ledger.revenue.quotedTotal).toBe(14500);
    expect(ledger.expenses.totalExpenses).toBe(4355);
    expect(ledger.profitability.grossProfit).toBe(14500 - 4355);
    expect(ledger.profitability.grossMarginPercent).toBe(70);
    expect(ledger.profitability.isProfitable).toBe(true);
  });
});
