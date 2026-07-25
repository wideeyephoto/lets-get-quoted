import { NextResponse } from 'next/server';
import { computeInvoiceTotals, getPublicInvoice } from '@/lib/invoices';
import { generateInvoicePdf } from '@/emails/InvoicePdf';

export const dynamic = 'force-dynamic';

// Streams the invoice as a PDF. Public by the same reasoning as /invoice/[id]:
// the client has no login, and the invoice is already viewable by id. Used by
// the "Download PDF" buttons on both the owner and client invoice pages.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const record = await getPublicInvoice(params.id);
  if (!record) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const { invoice, items } = record;
  const totals = computeInvoiceTotals(items, Number(invoice.discount_percent) || 0, Number(invoice.tax_rate) || 0);

  const pdf = await generateInvoicePdf({
    businessName: invoice.account?.business_name || 'Your contractor',
    invoiceRef: invoice.ref,
    clientName: invoice.job?.client_name || 'Client',
    jobRef: invoice.job?.ref || '',
    total: totals.total,
    subtotal: totals.subtotal,
    discountPercent: totals.discountPercent,
    discountAmount: totals.discountAmount,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    items,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Invoice-${invoice.ref}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
