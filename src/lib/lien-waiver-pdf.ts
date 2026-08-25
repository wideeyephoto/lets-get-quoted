import PDFDocument from 'pdfkit';
import type { LienWaiverDocument } from '@/lib/lien-waiver';
import { formatUsdExact } from '@/lib/money-format';

const PAGE_MARGIN = 40;

/**
 * Generates an official, legal-grade Lien Waiver PDF document.
 */
export function generateLienWaiverPdf(waiver: LienWaiverDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const contentWidth = doc.page.width - PAGE_MARGIN * 2;

      // Outer Decorative Border
      doc.rect(PAGE_MARGIN - 10, PAGE_MARGIN - 10, contentWidth + 20, doc.page.height - PAGE_MARGIN * 2 + 20)
        .lineWidth(1.5)
        .strokeColor('#334155')
        .stroke();

      doc.rect(PAGE_MARGIN - 6, PAGE_MARGIN - 6, contentWidth + 12, doc.page.height - PAGE_MARGIN * 2 + 12)
        .lineWidth(0.5)
        .strokeColor('#94a3b8')
        .stroke();

      // Top Title Bar
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#0f172a')
        .text(waiver.title, { align: 'center', characterSpacing: 0.5 });

      doc.moveDown(0.3);
      doc.font('Helvetica')
        .fontSize(9)
        .fillColor('#64748b')
        .text(`Document Reference: ${waiver.id} • Generated via Let's Get Quoted`, { align: 'center' });

      doc.moveDown(0.8);

      // Statutory Notice Box
      const noticeY = doc.y;
      doc.rect(PAGE_MARGIN, noticeY, contentWidth, 50)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      doc.font('Helvetica-Bold')
        .fontSize(7.5)
        .fillColor('#b91c1c')
        .text('STATUTORY NOTICE:', PAGE_MARGIN + 10, noticeY + 8, { width: contentWidth - 20 });

      const noticeText = waiver.isConditional
        ? 'THIS DOCUMENT WAIVES THE CLAIMANT\'S LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS EFFECTIVE ON RECEIPT OF PAYMENT. DO NOT RELY ON THIS DOCUMENT UNLESS SATISFIED THAT THE CLAIMANT HAS RECEIVED PAYMENT.'
        : 'THIS DOCUMENT WAIVES AND RELEASES LIEN, STOP PAYMENT NOTICE, AND PAYMENT BOND RIGHTS UNCONDITIONALLY AND STATES THAT YOU HAVE BEEN PAID FOR GIVING UP THOSE RIGHTS.';

      doc.font('Helvetica')
        .fontSize(7)
        .fillColor('#334155')
        .text(noticeText, PAGE_MARGIN + 10, noticeY + 18, { width: contentWidth - 20, lineGap: 1.5 });

      doc.y = noticeY + 58;

      // Project & Identification Grid
      doc.moveDown(0.5);
      const gridTop = doc.y;
      const colWidth = (contentWidth - 20) / 2;

      // Left Column
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('CLAIMANT (CONTRACTOR):', PAGE_MARGIN, gridTop);
      doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b').text(waiver.claimantName, PAGE_MARGIN, gridTop + 12);

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('CUSTOMER / PROPERTY OWNER:', PAGE_MARGIN, gridTop + 32);
      doc.font('Helvetica').fontSize(9.5).fillColor('#1e293b').text(waiver.customerName, PAGE_MARGIN, gridTop + 44);

      // Right Column
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('JOB LOCATION & PROPERTY ADDRESS:', PAGE_MARGIN + colWidth + 20, gridTop);
      doc.font('Helvetica').fontSize(9).fillColor('#1e293b').text(waiver.propertyAddress || 'Address on file', PAGE_MARGIN + colWidth + 20, gridTop + 12, { width: colWidth });

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('WAIVER SUM & THROUGH-DATE:', PAGE_MARGIN + colWidth + 20, gridTop + 38);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#047857').text(`${formatUsdExact(waiver.paymentAmount)}  •  Through ${waiver.throughDate}`, PAGE_MARGIN + colWidth + 20, gridTop + 50);

      doc.y = gridTop + 72;
      doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + contentWidth, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.8);

      // Legal Release Text
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a').text('TERMS OF WAIVER AND RELEASE:');
      doc.moveDown(0.3);

      doc.font('Helvetica')
        .fontSize(8.5)
        .fillColor('#334155')
        .text(waiver.legalBody, {
          width: contentWidth,
          align: 'left',
          lineGap: 2.5,
        });

      doc.moveDown(1.2);

      // Signature & Execution Block
      const sigTop = Math.max(doc.y, 630);
      doc.rect(PAGE_MARGIN, sigTop, contentWidth, 80)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      doc.font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor('#0f172a')
        .text('EXECUTION AND CERTIFICATION:', PAGE_MARGIN + 12, sigTop + 10);

      doc.font('Helvetica')
        .fontSize(8)
        .fillColor('#475569')
        .text(`The undersigned warrants that they are an authorized representative of ${waiver.claimantName} with full authority to execute this waiver.`, PAGE_MARGIN + 12, sigTop + 22, { width: contentWidth - 24 });

      // Signature line & date
      doc.moveTo(PAGE_MARGIN + 12, sigTop + 62).lineTo(PAGE_MARGIN + 220, sigTop + 62).strokeColor('#94a3b8').stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Authorized Officer Signature', PAGE_MARGIN + 12, sigTop + 65);

      doc.moveTo(PAGE_MARGIN + 260, sigTop + 62).lineTo(PAGE_MARGIN + 380, sigTop + 62).strokeColor('#94a3b8').stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text(`Date: ${waiver.throughDate}`, PAGE_MARGIN + 260, sigTop + 65);

      doc.moveTo(PAGE_MARGIN + 400, sigTop + 62).lineTo(PAGE_MARGIN + contentWidth - 12, sigTop + 62).strokeColor('#94a3b8').stroke();
      doc.font('Helvetica').fontSize(7.5).fillColor('#64748b').text('Title: Authorized Representative', PAGE_MARGIN + 400, sigTop + 65);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
