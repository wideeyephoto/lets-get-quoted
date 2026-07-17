import PDFDocument from 'pdfkit';

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
  items: Array<{
    description: string;
    amount: number;
  }>;
}): Promise<Buffer> {
  const formatMoney = (n: number) => '$' + Math.round(n).toLocaleString();

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // Header
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000').text(params.businessName);
      doc.font('Helvetica').fontSize(11).fillColor('#666666').text(`Invoice ${params.invoiceRef}`);
      doc.moveDown(1.5);

      // Bill to
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('Bill to:');
      doc.font('Helvetica').fontSize(11).fillColor('#666666').text(params.clientName);
      doc.fontSize(10).fillColor('#999999').text(`Job ${params.jobRef}`);
      doc.moveDown(1.5);

      // Items table header
      const descX = PAGE_MARGIN;
      const amountX = PAGE_MARGIN + DESC_COL_WIDTH;
      let y = doc.y;

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
      doc.text('Description', descX, y, { width: DESC_COL_WIDTH });
      doc.text('Amount', amountX, y, { width: AMOUNT_COL_WIDTH, align: 'right' });
      y += 16;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor('#eeeeee').lineWidth(1).stroke();
      y += 10;

      // Items
      doc.font('Helvetica').fontSize(10).fillColor('#333333');
      for (const item of params.items) {
        if (y > 680) {
          doc.addPage();
          y = PAGE_MARGIN;
        }

        const rowHeight = Math.max(doc.heightOfString(item.description, { width: DESC_COL_WIDTH - 10 }), 14);
        doc.text(item.description, descX, y, { width: DESC_COL_WIDTH - 10 });
        doc.text(formatMoney(item.amount), amountX, y, { width: AMOUNT_COL_WIDTH, align: 'right' });
        y += rowHeight + 10;
        doc.moveTo(PAGE_MARGIN, y - 6).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y - 6).strokeColor('#f0f0f0').lineWidth(1).stroke();
      }

      y += 10;
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000');
      doc.text('Total', descX, y, { width: DESC_COL_WIDTH });
      doc.fontSize(15).text(formatMoney(params.total), amountX, y - 1, { width: AMOUNT_COL_WIDTH, align: 'right' });

      // Footer
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#999999')
        .text(`This invoice was sent from ${params.businessName} via Let's Get Quoted.`, PAGE_MARGIN, 720, {
          width: CONTENT_WIDTH,
          align: 'center',
        });
      doc.text(`Questions? Please contact ${params.businessName} directly.`, PAGE_MARGIN, 734, {
        width: CONTENT_WIDTH,
        align: 'center',
      });

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
