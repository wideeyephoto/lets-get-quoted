import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/auth';
import { loadBusinessName } from '@/lib/business-name';
import { computeInvoiceTotals, getPublicInvoice } from '@/lib/invoices';
import { generateInvoicePdf } from '@/emails/InvoicePdf';
import { checkRateLimit, clientIpFrom } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Streams the invoice as a PDF. Public by the same reasoning as /invoice/[id]:
// the client has no login, and the invoice is already viewable by id. Used by
// the "Download PDF" buttons on both the owner and client invoice pages.
export async function GET(request: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const admin = createAdminClient();
  const ip = clientIpFrom(request.headers);
  if (!(await checkRateLimit(admin, `invpdf:ip:${ip}`, 60, 60))) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
  }

  const record = await getPublicInvoice(params.id);
  if (!record) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  const { invoice, items } = record;
  const totals = computeInvoiceTotals(items, Number(invoice.discount_percent) || 0, Number(invoice.tax_rate) || 0);
  // The embedded `invoice.account` carries accounts.business_name, which is the
  // "My Business" placeholder on every live account. The invoice page beside
  // this route already resolves the real name via loadContractorBrand; the PDF
  // a customer downloads and keeps has to agree with it.
  const businessName = await loadBusinessName(createAdminClient(), invoice.account_id);

  // Generation is wrapped because it reaches the filesystem for its fonts, and
  // when that fails it fails for EVERY invoice at once. Without this the route
  // returned a bare 500 with an empty body — which is what a contractor sees as
  // "the download link is dead", with nothing anywhere saying why.
  let pdf: Buffer;
  try {
    pdf = await generateInvoicePdf({
      businessName,
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
  } catch (error) {
    console.error(`Invoice PDF generation failed for ${invoice.ref}:`, error);
    return NextResponse.json(
      { error: 'Could not build the PDF for this invoice.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Invoice-${invoice.ref}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
