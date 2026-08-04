import { escapeHtml, renderBrandedEmail, safeAccent, type EmailBrand } from './brand';

// The invoice email: the branded shell, with the line items and totals as its
// body.
//
// Two things were wrong with the version this replaces, and both were invisible
// unless you opened it in the wrong client:
//
//   - The totals were laid out with display:flex. Outlook renders through Word
//     and ignores flex entirely, so every "Subtotal / Discount / Tax / Total"
//     row collapsed into a single column there. It is a table now.
//   - Business name, client name and every line-item description went in
//     unescaped. An ampersand in a company name is common; a "<" in a
//     description would eat the rest of the email.
//
// The footer used to promise "Questions? Please contact ${businessName}
// directly" while Reply-To pointed at us. The shell makes that line true.

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
  const money = (n: number) => '$' + Math.round(n).toLocaleString();
  const accent = safeAccent(params.brand.accent);
  const subtotal = params.subtotal ?? params.total;
  const discountAmount = params.discountAmount ?? 0;
  const taxAmount = params.taxAmount ?? 0;

  const summaryRow = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:${strong ? '10px 0 0' : '6px 0'};font-size:${strong ? '15px' : '13px'};color:${strong ? '#1c2230' : '#6b7280'};font-weight:${strong ? '700' : '400'}">${escapeHtml(label)}</td>
      <td align="right" style="padding:${strong ? '10px 0 0' : '6px 0'};font-size:${strong ? '18px' : '13px'};color:${strong ? '#1c2230' : '#6b7280'};font-weight:${strong ? '700' : '400'}">${escapeHtml(value)}</td>
    </tr>`;

  const breakdown = discountAmount > 0 || taxAmount > 0
    ? summaryRow('Subtotal', money(subtotal)) +
      (discountAmount > 0 ? summaryRow(`Discount (${params.discountPercent ?? 0}%)`, '-' + money(discountAmount)) : '') +
      (taxAmount > 0 ? summaryRow(`Tax (${params.taxRate ?? 0}%)`, money(taxAmount)) : '')
    : '';

  const itemRows = params.items
    .map((item) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f0f2f5;font-size:14px;color:#1c2230">${escapeHtml(item.description)}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #f0f2f5;font-size:14px;color:#1c2230;white-space:nowrap">${escapeHtml(money(item.amount))}</td>
      </tr>`)
    .join('');

  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px">
      <tr>
        <td style="padding-bottom:8px;border-bottom:2px solid #e6e9ef;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280">Description</td>
        <td align="right" style="padding-bottom:8px;border-bottom:2px solid #e6e9ef;font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280">Amount</td>
      </tr>
      ${itemRows}
    </table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px;border-top:1px solid #e6e9ef">
      ${breakdown}
      ${summaryRow('Total', money(params.total), true)}
    </table>`;

  return renderBrandedEmail({
    brand: params.brand,
    preheader: `Invoice ${params.invoiceRef} · ${money(params.total)}`,
    eyebrow: `Invoice ${params.invoiceRef}`,
    heading: `${params.clientName}, here is your invoice`,
    paragraphs: [`Job ${params.jobRef} · ${money(params.total)} due`],
    bodyHtml,
    cta: { label: 'View invoice', url: params.invoiceLink },
    footerHtml: `<p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#6b7280">A PDF copy is attached. <span style="color:${accent}">&#9679;</span> Invoice ${escapeHtml(params.invoiceRef)}</p>`,
  });
}
