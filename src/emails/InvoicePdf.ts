import PDFDocument from 'pdfkit';
import { formatUsdExact } from '@/lib/money-format';

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter, points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const AMOUNT_COL_WIDTH = 120;
const DESC_COL_WIDTH = CONTENT_WIDTH - AMOUNT_COL_WIDTH;

/**
 * Renders an invoice as a PDF buffer, suitable for attaching to the invoice
 * email. Mirrors the layout/content of generateInvoiceHtml() in
 * InvoiceEmail.tsx so the emailed PDF matches what the client sees on the
 * hosted invoice page.
 */
export function generateInvoicePdf(params: {
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
}): Promise<Buffer> {
  const formatMoney = formatUsdExact;
  const subtotal = params.subtotal ?? params.total;
  const discountAmount = params.discountAmount ?? 0;
  const taxAmount = params.taxAmount ?? 0;

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const startY = PAGE_MARGIN;

      // Header: Left Business Name, Right Metadata Card
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f172a').text(params.businessName, PAGE_MARGIN, startY, {
        width: 320,
      });
      doc.font('Helvetica').fontSize(9.5).fillColor('#64748b').text('Contractor & Trade Services', PAGE_MARGIN, startY + 28);

      // Metadata Card on the right
      const metaCardWidth = 175;
      const metaCardX = PAGE_WIDTH - PAGE_MARGIN - metaCardWidth;
      const metaCardY = startY;
      const metaCardHeight = 68;

      doc.roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      // INVOICE Badge
      doc.roundedRect(metaCardX + 10, metaCardY + 8, 70, 16, 4)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text('INVOICE', metaCardX + 10, metaCardY + 12, {
        width: 70,
        align: 'center',
      });

      // Meta Rows
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('REF #:', metaCardX + 10, metaCardY + 30);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(params.invoiceRef, metaCardX + 50, metaCardY + 30, {
        width: metaCardWidth - 60,
        align: 'right',
      });

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('JOB #:', metaCardX + 10, metaCardY + 42);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(params.jobRef, metaCardX + 50, metaCardY + 42, {
        width: metaCardWidth - 60,
        align: 'right',
      });

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('STATUS:', metaCardX + 10, metaCardY + 54);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#059669').text('PAYMENT DUE', metaCardX + 50, metaCardY + 54, {
        width: metaCardWidth - 60,
        align: 'right',
      });

      // Bill To Box
      const billToY = startY + 82;
      doc.roundedRect(PAGE_MARGIN, billToY, CONTENT_WIDTH, 42, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#e2e8f0');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text('BILL TO / CLIENT:', PAGE_MARGIN + 12, billToY + 8);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(params.clientName, PAGE_MARGIN + 12, billToY + 20);

      // Items Table Header
      let y = billToY + 54;
      const descX = PAGE_MARGIN;
      const amountX = PAGE_MARGIN + DESC_COL_WIDTH;

      doc.rect(PAGE_MARGIN, y, CONTENT_WIDTH, 20)
        .fillColor('#f1f5f9')
        .fill();

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1e293b');
      doc.text('DESCRIPTION / SCOPE ITEM', descX + 8, y + 6, { width: DESC_COL_WIDTH - 16 });
      doc.text('AMOUNT', amountX - 8, y + 6, { width: AMOUNT_COL_WIDTH, align: 'right' });
      y += 24;

      // Table Rows
      doc.font('Helvetica').fontSize(9.5).fillColor('#0f172a');
      for (const item of params.items) {
        if (y > 640) {
          doc.addPage();
          y = PAGE_MARGIN;
        }

        const rowHeight = Math.max(doc.heightOfString(item.description, { width: DESC_COL_WIDTH - 20 }), 14);
        doc.text(item.description, descX + 8, y, { width: DESC_COL_WIDTH - 20 });
        doc.font('Helvetica-Bold').text(formatMoney(item.amount), amountX - 8, y, { width: AMOUNT_COL_WIDTH, align: 'right' });
        doc.font('Helvetica');

        y += rowHeight + 10;
        doc.moveTo(PAGE_MARGIN, y - 4).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y - 4).strokeColor('#e2e8f0').lineWidth(0.75).stroke();
      }

      y += 8;

      // Summary & Totals Box
      const summaryBoxWidth = 220;
      const summaryX = PAGE_WIDTH - PAGE_MARGIN - summaryBoxWidth;

      const drawSummaryRow = (label: string, value: string, opts: { bold?: boolean; big?: boolean; color?: string } = {}) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(opts.big ? 13 : 9.5)
          .fillColor(opts.color || (opts.bold ? '#0f172a' : '#475569'));
        doc.text(label, summaryX, y, { width: 110 });
        doc.text(value, summaryX + 110, y - (opts.big ? 1 : 0), { width: 110, align: 'right' });
        y += opts.big ? 20 : 16;
      };

      if (discountAmount > 0 || taxAmount > 0) {
        drawSummaryRow('Subtotal', formatMoney(subtotal));
        if (discountAmount > 0) {
          drawSummaryRow(`Discount (${params.discountPercent ?? 0}%)`, '-' + formatMoney(discountAmount), { color: '#b91c1c' });
        }
        if (taxAmount > 0) {
          drawSummaryRow(`Tax (${params.taxRate ?? 0}%)`, formatMoney(taxAmount));
        }
        doc.moveTo(summaryX, y).lineTo(summaryX + summaryBoxWidth, y).strokeColor('#cbd5e1').lineWidth(1).stroke();
        y += 8;
      }

      // Total Due Card
      doc.roundedRect(summaryX - 6, y - 4, summaryBoxWidth + 6, 32, 6)
        .fillColor('#0f172a')
        .fill();

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text('TOTAL DUE:', summaryX + 4, y + 6);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#50e3bd').text(formatMoney(params.total), summaryX + 100, y + 5, {
        width: 110,
        align: 'right',
      });
      y += 44;

      // Payment Notice / Authorization
      const noticeY = Math.max(y, 650);
      doc.roundedRect(PAGE_MARGIN, noticeY, CONTENT_WIDTH, 42, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#e2e8f0');

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('PAYMENT INSTRUCTIONS & TERMS:', PAGE_MARGIN + 10, noticeY + 8);
      doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
        `Thank you for your business! Please make payment payable to ${params.businessName}. Authorized digital payments, ACH, and card payments processed securely via Let's Get Quoted.`,
        PAGE_MARGIN + 10,
        noticeY + 20,
        { width: CONTENT_WIDTH - 20 }
      );

      // Footer
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94a3b8')
        .text(`Official Invoice • Generated via Let's Get Quoted • ${params.invoiceRef}`, PAGE_MARGIN, 740, {
          width: CONTENT_WIDTH,
          align: 'center',
        });

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
