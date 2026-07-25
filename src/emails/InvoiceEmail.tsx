export function generateInvoiceHtml(params: {
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
  items: Array<{
    description: string;
    amount: number;
  }>;
  invoiceLink: string;
}): string {
  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString();
  const subtotal = params.subtotal ?? params.total;
  const discountAmount = params.discountAmount ?? 0;
  const taxAmount = params.taxAmount ?? 0;
  const summaryRow = (label: string, value: string, strong = false) =>
    `<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:${strong ? '18px' : '14px'};color:${strong ? '#000' : '#555'};font-weight:${strong ? 'bold' : 'normal'};">${strong ? `<div style="font-weight:bold;font-size:15px;">${label}</div>` : `<div>${label}</div>`}<div>${value}</div></div>`;
  const breakdownHtml = discountAmount > 0 || taxAmount > 0
    ? summaryRow('Subtotal', formatMoney(subtotal)) +
      (discountAmount > 0 ? summaryRow(`Discount (${params.discountPercent ?? 0}%)`, '-' + formatMoney(discountAmount)) : '') +
      (taxAmount > 0 ? summaryRow(`Tax (${params.taxRate ?? 0}%)`, formatMoney(taxAmount)) : '')
    : '';

  const itemsHtml = params.items
    .map(
      (item) => `
    <tr style="border-bottom: 1px solid #f0f0f0;">
      <td style="padding: 12px 0; font-size: 13px; color: #333;">${item.description}</td>
      <td style="padding: 12px 0; text-align: right; font-size: 13px; color: #333;">${formatMoney(item.amount)}</td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Invoice ${params.invoiceRef}</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="margin-bottom: 40px;">
      <h2 style="font-size: 24px; font-weight: bold; margin: 0 0 8px 0;">${params.businessName}</h2>
      <p style="margin: 0; color: #666; font-size: 14px;">Invoice ${params.invoiceRef}</p>
    </div>

    <!-- Bill To -->
    <div style="margin-bottom: 40px;">
      <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">Bill to:</p>
      <p style="margin: 0; color: #666; font-size: 14px;">${params.clientName}</p>
      <p style="margin: 4px 0 0 0; color: #999; font-size: 13px;">Job ${params.jobRef}</p>
    </div>

    <!-- Items Table -->
    <div style="margin-bottom: 40px;">
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #eee; padding-bottom: 12px; margin-bottom: 12px;">
            <th style="text-align: left; font-weight: bold; font-size: 13px; padding-bottom: 12px; border-bottom: 2px solid #eee;">Description</th>
            <th style="text-align: right; font-weight: bold; font-size: 13px; padding-bottom: 12px; border-bottom: 2px solid #eee;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="margin-top: 16px; border-top: 1px solid #eee; padding-top: 12px;">
        ${breakdownHtml}
        ${summaryRow('Total', formatMoney(params.total), true)}
      </div>
    </div>

    <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0;" />

    <!-- CTA -->
    <div style="margin-bottom: 40px; text-align: center;">
      <a href="${params.invoiceLink}" style="display: inline-block; padding: 12px 24px; background-color: #000; color: #fff; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">View Invoice</a>
    </div>

    <!-- Footer -->
    <div style="margin-top: 60px; border-top: 1px solid #eee; padding-top: 20px;">
      <p style="margin: 0; color: #999; font-size: 12px; text-align: center;">This invoice was sent from ${params.businessName} via Let&apos;s Get Quoted.</p>
      <p style="margin: 8px 0 0 0; color: #999; font-size: 12px; text-align: center;">Questions? Please contact ${params.businessName} directly.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}
