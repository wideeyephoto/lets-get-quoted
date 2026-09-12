import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/invoices/[id]/pdf/route';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/business-name', () => ({
  loadBusinessName: vi.fn(),
}));

vi.mock('@/lib/invoices', () => ({
  computeInvoiceTotals: vi.fn(),
  getPublicInvoice: vi.fn(),
}));

vi.mock('@/emails/InvoicePdf', () => ({
  generateInvoicePdf: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  clientIpFrom: vi.fn(),
}));

describe('Invoices PDF Route', () => {
  let createAdminClientMock: any;
  let checkRateLimitMock: any;
  let clientIpFromMock: any;
  let getPublicInvoiceMock: any;
  let computeInvoiceTotalsMock: any;
  let loadBusinessNameMock: any;
  let generateInvoicePdfMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    createAdminClientMock = (await import('@/lib/auth')).createAdminClient;
    createAdminClientMock.mockReturnValue('fake_admin');

    checkRateLimitMock = (await import('@/lib/rate-limit')).checkRateLimit;
    checkRateLimitMock.mockResolvedValue(true);

    clientIpFromMock = (await import('@/lib/rate-limit')).clientIpFrom;
    clientIpFromMock.mockReturnValue('1.2.3.4');

    getPublicInvoiceMock = (await import('@/lib/invoices')).getPublicInvoice;
    getPublicInvoiceMock.mockResolvedValue({
      invoice: {
        ref: 'INV-123',
        account_id: 'acct_1',
        job: { client_name: 'John Doe', ref: 'JOB-456' }
      },
      items: [{ name: 'Test Item' }]
    });

    computeInvoiceTotalsMock = (await import('@/lib/invoices')).computeInvoiceTotals;
    computeInvoiceTotalsMock.mockReturnValue({
      total: 100, subtotal: 100, discountPercent: 0, discountAmount: 0, taxRate: 0, taxAmount: 0
    });

    loadBusinessNameMock = (await import('@/lib/business-name')).loadBusinessName;
    loadBusinessNameMock.mockResolvedValue('Acme Corp');

    generateInvoicePdfMock = (await import('@/emails/InvoicePdf')).generateInvoicePdf;
    generateInvoicePdfMock.mockResolvedValue(Buffer.from('fake_pdf_data'));
  });

  it('fails if rate limited', async () => {
    checkRateLimitMock.mockResolvedValue(false);
    
    const req = new NextRequest('http://localhost/api/invoices/inv_1/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: 'inv_1' }) });
    
    expect(res.status).toBe(429);
  });

  it('fails if invoice not found', async () => {
    getPublicInvoiceMock.mockResolvedValue(null);
    
    const req = new NextRequest('http://localhost/api/invoices/inv_1/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: 'inv_1' }) });
    
    expect(res.status).toBe(404);
  });

  it('generates pdf successfully', async () => {
    const req = new NextRequest('http://localhost/api/invoices/inv_1/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: 'inv_1' }) });
    
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="Invoice-INV-123.pdf"');
    
    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.toString()).toBe('fake_pdf_data');

    expect(generateInvoicePdfMock).toHaveBeenCalledWith({
      businessName: 'Acme Corp',
      invoiceRef: 'INV-123',
      clientName: 'John Doe',
      jobRef: 'JOB-456',
      total: 100,
      subtotal: 100,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      items: [{ name: 'Test Item' }]
    });
  });

  it('fails with 500 if pdf generation throws', async () => {
    generateInvoicePdfMock.mockRejectedValue(new Error('font loading failed'));
    
    const req = new NextRequest('http://localhost/api/invoices/inv_1/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: 'inv_1' }) });
    
    expect(res.status).toBe(500);
  });
});
