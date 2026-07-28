import { describe, it, expect } from 'vitest';
import { mapInvoiceStatus } from '@/lib/invoice-import';

describe('mapInvoiceStatus', () => {
  it('treats paid-like statuses as paid', () => {
    expect(mapInvoiceStatus('Paid')).toEqual({ invoiceStatus: 'paid', paid: true });
    expect(mapInvoiceStatus('Complete')).toEqual({ invoiceStatus: 'paid', paid: true });
    expect(mapInvoiceStatus('settled')).toEqual({ invoiceStatus: 'paid', paid: true });
  });

  it('maps unpaid states without recording a payment', () => {
    expect(mapInvoiceStatus('Sent')).toEqual({ invoiceStatus: 'sent', paid: false });
    expect(mapInvoiceStatus('Unpaid')).toEqual({ invoiceStatus: 'sent', paid: false });
    expect(mapInvoiceStatus('Overdue')).toEqual({ invoiceStatus: 'sent', paid: false });
    expect(mapInvoiceStatus('Draft')).toEqual({ invoiceStatus: 'draft', paid: false });
    expect(mapInvoiceStatus('Signed')).toEqual({ invoiceStatus: 'signed', paid: false });
    expect(mapInvoiceStatus('Voided')).toEqual({ invoiceStatus: 'void', paid: false });
  });

  it('defaults blank / unknown to unpaid (never invents revenue)', () => {
    expect(mapInvoiceStatus('')).toEqual({ invoiceStatus: 'sent', paid: false });
    expect(mapInvoiceStatus(null)).toEqual({ invoiceStatus: 'sent', paid: false });
    expect(mapInvoiceStatus('whatever')).toEqual({ invoiceStatus: 'sent', paid: false });
  });
});
