import { escapeHtml, normalizeEmailTheme, renderBrandedEmail, safeAccent, themePaint, type EmailBrand, FONT_STACK } from './brand';
import { moneySummary, contactBlock } from './primitives';
import { formatUsdExact } from '@/lib/money-format';

// The invoice email: the branded shell, with the line items and totals as its
// body.
//
// Driven by theme tokens: Letterhead provides a classic business document rule,
// Blueprint provides strong high-contrast financial structure, Neighborly provides
// warm soft accents, and Studio / Spotlight provide crisp modern execution.

export function generateInvoiceHtml(params: {
  brand: EmailBrand;
  businessName: string;
  invoiceRef: string;
  clientName: string;
  jobRef: string;
  total: number;
  subtotal?: number;
  discountPercent?: number;
  discountAmount?: number;
  taxRate?: number;
  taxAmount?: number;
  items: Array<{ description: string; amount: number }>;
  invoiceLink: string;
}): string {
  const money = formatUsdExact;
  const accent = safeAccent(params.brand.accent);
  const theme = normalizeEmailTheme(params.brand.theme);
  const paint = themePaint(theme, accent);

  const subtotal = params.subtotal ?? params.total;
  const discountAmount = params.discountAmount ?? 0;
  const taxAmount = params.taxAmount ?? 0;

  const itemRows = params.items
    .map((item, idx) => {
      const rowBg = idx % 2 === 0 ? '#ffffff' : paint.subtleBg;
      return `
      <tr style="background:${rowBg}">
        <td style="padding:12px 14px;border-bottom:1px solid ${paint.border};font-family:${FONT_STACK};font-size:14px;color:#1e293b;line-height:1.5">${escapeHtml(item.description)}</td>
        <td align="right" style="padding:12px 14px;border-bottom:1px solid ${paint.border};font-family:${FONT_STACK};font-size:14px;font-weight:700;color:#1e293b;white-space:nowrap">${escapeHtml(money(item.amount))}</td>
      </tr>`;
    })
    .join('');

  const summaryRows: Array<{ label: string; value: string; strong?: boolean; accent?: boolean }> = [];
  if (discountAmount > 0 || taxAmount > 0) {
    summaryRows.push({ label: 'Subtotal', value: money(subtotal) });
    if (discountAmount > 0) {
      summaryRows.push({ label: `Discount (${params.discountPercent ?? 0}%)`, value: `-${money(discountAmount)}` });
    }
    if (taxAmount > 0) {
      summaryRows.push({ label: `Tax (${params.taxRate ?? 0}%)`, value: money(taxAmount) });
    }
  }

  const itemsTable = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;background:${paint.subtleBg};border:1px solid ${paint.border};border-radius:${paint.cardRadius};overflow:hidden">
      <tr>
        <td style="padding:10px 14px;background:${paint.tableHeaderBg};border-bottom:${paint.tableHeaderBorder};font-family:${FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${paint.accessibleAccent}">Description</td>
        <td align="right" style="padding:10px 14px;background:${paint.tableHeaderBg};border-bottom:${paint.tableHeaderBorder};font-family:${FONT_STACK};font-size:11px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${paint.accessibleAccent}">Amount</td>
      </tr>
      ${itemRows}
    </table>
  `;

  const paymentTrustBadge = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 12px;background:${paint.subtleBg};border:1px solid ${paint.border};border-radius:8px;overflow:hidden">
      <tr>
        <td style="padding:10px 14px;font-family:${FONT_STACK};font-size:12px;color:#64748b;text-align:center">
          🔒 <strong>Secure Online Payment</strong> &nbsp;·&nbsp; Visa, Mastercard, Apple Pay, Bank Transfer
        </td>
      </tr>
    </table>
  `;

  const summaryHtml = moneySummary(
    paint,
    summaryRows,
    { label: 'Total Due', value: money(params.total) },
    { dueNotice: `Due upon receipt · Job ${escapeHtml(params.jobRef)}` },
  );

  const contactHtml = contactBlock(paint, params.brand, {
    prompt: `Questions about invoice ${escapeHtml(params.invoiceRef)}?`,
  });

  const bodyHtml = `${itemsTable}${summaryHtml}${paymentTrustBadge}`;

  return renderBrandedEmail({
    brand: params.brand,
    preheader: `Invoice ${params.invoiceRef} · ${money(params.total)} due from ${params.businessName}`,
    eyebrow: `Invoice ${params.invoiceRef}`,
    heading: `${params.clientName}, here is your invoice`,
    paragraphs: [`Please review your invoice details below and complete payment online using the secure payment button.`],
    bodyHtml,
    cta: { label: 'View & pay invoice', url: params.invoiceLink },
    contactCallout: contactHtml,
    footerHtml: `<p style="margin:10px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:1.6;color:#64748b">A PDF copy is attached. <span style="color:${paint.accessibleAccent}">&#9679;</span> Invoice ${escapeHtml(params.invoiceRef)}</p>`,
  });
}
