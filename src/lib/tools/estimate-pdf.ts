import PDFDocument from 'pdfkit';
import type { EstimateData, EstimateTotals } from '@/lib/tools/estimate-generator-utils';
import { formatCurrency, formatDisplayDate } from '@/lib/tools/estimate-generator-utils';

const PAGE_MARGIN = 32;
const PAGE_WIDTH = 612; // US Letter width in points
const PAGE_HEIGHT = 792; // US Letter height in points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BOTTOM_LIMIT = PAGE_HEIGHT - PAGE_MARGIN - 20;

/**
 * Generates an exact, deterministic US Letter PDF document for a contractor estimate.
 * Designed with a strict 1-page budget for typical estimates (up to 6 items + concise terms),
 * while cleanly flowing to 2 pages when oversized content exceeds single-page capacity.
 */
export function generateEstimatePdf(estimate: EstimateData, totals: EstimateTotals): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'LETTER',
        margin: PAGE_MARGIN,
        autoFirstPage: true,
        bufferPages: true,
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const startY = PAGE_MARGIN;

      // ==========================================
      // 1. TOP HEADER: Contractor Info + Meta Card
      // ==========================================
      const companyName = estimate.contractorName?.trim() || 'Contractor Estimate';
      const contractorPhone = estimate.contractorPhone?.trim();
      const contractorEmail = estimate.contractorEmail?.trim();
      const contractorLicense = estimate.contractorLicense?.trim();

      // Left Column: Business Info
      doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f172a').text(companyName, PAGE_MARGIN, startY, {
        width: 330,
        lineGap: 1,
      });

      let contactY = doc.y + 2;
      const contactBits: string[] = [];
      if (contractorPhone) contactBits.push(`Phone: ${contractorPhone}`);
      if (contractorEmail) contactBits.push(`Email: ${contractorEmail}`);
      if (contractorLicense) contactBits.push(contractorLicense.startsWith('LIC') ? contractorLicense : `Lic: ${contractorLicense}`);

      doc.font('Helvetica').fontSize(9).fillColor('#475569');
      if (contactBits.length > 0) {
        doc.text(contactBits.join('  •  '), PAGE_MARGIN, contactY, { width: 330 });
      } else {
        doc.text('Professional Contractor & Trade Services', PAGE_MARGIN, contactY, { width: 330 });
      }

      // Right Column: Estimate Meta Card
      const metaCardWidth = 180;
      const metaCardX = PAGE_WIDTH - PAGE_MARGIN - metaCardWidth;
      const metaCardY = startY;
      const metaCardHeight = 64;

      doc.roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      // ESTIMATE Badge
      doc.roundedRect(metaCardX + 8, metaCardY + 8, 76, 15, 3)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text('ESTIMATE', metaCardX + 8, metaCardY + 12, {
        width: 76,
        align: 'center',
      });

      // Meta Rows
      const row1Y = metaCardY + 28;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('ESTIMATE #:', metaCardX + 8, row1Y);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(estimate.estimateNumber || 'EST-001', metaCardX + 68, row1Y, {
        width: metaCardWidth - 76,
        align: 'right',
      });

      const row2Y = metaCardY + 40;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('DATE:', metaCardX + 8, row2Y);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(formatDisplayDate(estimate.estimateDate) || 'Today', metaCardX + 68, row2Y, {
        width: metaCardWidth - 76,
        align: 'right',
      });

      const row3Y = metaCardY + 52;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('VALID FOR:', metaCardX + 8, row3Y);
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#047857').text('30 DAYS', metaCardX + 68, row3Y, {
        width: metaCardWidth - 76,
        align: 'right',
      });

      // Divider Line
      const headerBottomY = Math.max(doc.y + 6, metaCardY + metaCardHeight + 8);
      doc.moveTo(PAGE_MARGIN, headerBottomY)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, headerBottomY)
        .strokeColor('#0f172a')
        .lineWidth(1.5)
        .stroke();

      // ==========================================
      // 2. CLIENT & PROJECT LOCATION BOX
      // ==========================================
      const clientBoxY = headerBottomY + 8;
      const clientBoxHeight = 44;

      doc.roundedRect(PAGE_MARGIN, clientBoxY, CONTENT_WIDTH, clientBoxHeight, 5)
        .fillColor('#f8fafc')
        .fillAndStroke('#e2e8f0');

      const colHalf = (CONTENT_WIDTH - 24) / 2;

      // Left: Prepared For
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text('PREPARED FOR / CLIENT:', PAGE_MARGIN + 10, clientBoxY + 7);
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#0f172a').text(estimate.clientName?.trim() || 'Valued Client', PAGE_MARGIN + 10, clientBoxY + 18, {
        width: colHalf,
      });
      if (estimate.clientAddress?.trim()) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(estimate.clientAddress.trim(), PAGE_MARGIN + 10, clientBoxY + 31, {
          width: colHalf,
        });
      }

      // Right: Trade & Scope
      const tradeLabel = (estimate.selectedTrade || 'General').toUpperCase();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b').text('PROJECT TRADE / SCOPE:', PAGE_MARGIN + 14 + colHalf, clientBoxY + 7);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#ea580c').text(`${tradeLabel} SERVICES`, PAGE_MARGIN + 14 + colHalf, clientBoxY + 18, {
        width: colHalf,
      });
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Itemized breakdown of labor, materials & components', PAGE_MARGIN + 14 + colHalf, clientBoxY + 31, {
        width: colHalf,
      });

      // ==========================================
      // 3. LINE ITEMS TABLE
      // ==========================================
      const tableTopY = clientBoxY + clientBoxHeight + 10;
      const colDescWidth = 270;
      const colTypeWidth = 68;
      const colQtyWidth = 48;
      const colRateWidth = 76;
      const colTotalWidth = CONTENT_WIDTH - (colDescWidth + colTypeWidth + colQtyWidth + colRateWidth);

      const xDesc = PAGE_MARGIN;
      const xType = xDesc + colDescWidth;
      const xQty = xType + colTypeWidth;
      const xRate = xQty + colQtyWidth;
      const xTotal = xRate + colRateWidth;

      // Table Header
      const thHeight = 18;
      doc.roundedRect(PAGE_MARGIN, tableTopY, CONTENT_WIDTH, thHeight, 3)
        .fillColor('#f1f5f9')
        .fill();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b');
      doc.text('DESCRIPTION / SCOPE', xDesc + 6, tableTopY + 5, { width: colDescWidth - 8 });
      doc.text('CATEGORY', xType + 4, tableTopY + 5, { width: colTypeWidth - 6 });
      doc.text('QTY', xQty, tableTopY + 5, { width: colQtyWidth - 4, align: 'right' });
      doc.text('RATE', xRate, tableTopY + 5, { width: colRateWidth - 6, align: 'right' });
      doc.text('TOTAL', xTotal, tableTopY + 5, { width: colTotalWidth - 6, align: 'right' });

      let currentY = tableTopY + thHeight + 2;

      const items = estimate.items || [];
      for (const item of items) {
        if (item.isOptional && item.selected === false) continue;

        const isDisc = item.isDiscount || item.type === 'Discount';
        const qty = item.quantity || 1;
        const rate = item.unitPrice || 0;
        const lineTotal = qty * rate;

        // Check if page overflow would occur
        if (currentY > BOTTOM_LIMIT - 140) {
          doc.addPage();
          currentY = PAGE_MARGIN;
        }

        const rowHeight = 20;

        // Description
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a');
        doc.text(item.description || 'Line Item', xDesc + 6, currentY + 4, {
          width: colDescWidth - 10,
        });

        // Category Tag
        doc.font('Helvetica').fontSize(7.5).fillColor('#475569');
        doc.text(item.type || 'Service', xType + 4, currentY + 5, {
          width: colTypeWidth - 6,
        });

        // Qty
        doc.font('Helvetica').fontSize(8.5).fillColor('#1e293b');
        doc.text(String(qty), xQty, currentY + 4, { width: colQtyWidth - 4, align: 'right' });

        // Rate
        doc.text(formatCurrency(rate), xRate, currentY + 4, { width: colRateWidth - 6, align: 'right' });

        // Total
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(isDisc ? '#dc2626' : '#0f172a');
        const formattedTotal = isDisc ? `-${formatCurrency(lineTotal)}` : formatCurrency(lineTotal);
        doc.text(formattedTotal, xTotal, currentY + 4, { width: colTotalWidth - 6, align: 'right' });

        // Row underline
        doc.moveTo(PAGE_MARGIN, currentY + rowHeight)
          .lineTo(PAGE_WIDTH - PAGE_MARGIN, currentY + rowHeight)
          .strokeColor('#f1f5f9')
          .lineWidth(0.75)
          .stroke();

        currentY += rowHeight;
      }

      // ==========================================
      // 4. TERMS, MILESTONES & TOTALS GRID
      // ==========================================
      const bottomSectionHeight = 110;
      if (currentY + bottomSectionHeight > BOTTOM_LIMIT) {
        doc.addPage();
        currentY = PAGE_MARGIN;
      }

      const gridY = currentY + 8;
      const leftColWidth = 320;
      const rightColWidth = CONTENT_WIDTH - leftColWidth - 14;
      const rightColX = PAGE_MARGIN + leftColWidth + 14;

      // Left Box: Terms & Conditions
      const termsBoxHeight = estimate.milestonesEnabled ? 52 : 78;
      doc.roundedRect(PAGE_MARGIN, gridY, leftColWidth, termsBoxHeight, 5)
        .fillColor('#fafbfc')
        .fillAndStroke('#e2e8f0');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#475569')
        .text('TERMS, CONDITIONS & WARRANTY:', PAGE_MARGIN + 8, gridY + 6);

      const termsText = estimate.terms?.trim() ||
        'Estimate valid for 30 days. Deposit required upon authorization to schedule crew and order materials. Workmanship backed by standard warranty.';
      doc.font('Helvetica').fontSize(7.5).fillColor('#334155')
        .text(termsText, PAGE_MARGIN + 8, gridY + 18, {
          width: leftColWidth - 16,
          lineGap: 1.5,
        });

      // Milestone schedule if enabled
      if (estimate.milestonesEnabled && totals.milestones && totals.milestones.length > 0) {
        const msBoxY = gridY + termsBoxHeight + 5;
        const msBoxHeight = 36;
        doc.roundedRect(PAGE_MARGIN, msBoxY, leftColWidth, msBoxHeight, 4)
          .fillColor('#f8fafc')
          .fillAndStroke('#e2e8f0');

        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text('PAYMENT MILESTONE SCHEDULE:', PAGE_MARGIN + 8, msBoxY + 5);
        let msY = msBoxY + 16;
        for (const m of totals.milestones.slice(0, 3)) {
          doc.font('Helvetica').fontSize(7).fillColor('#475569').text(m.name, PAGE_MARGIN + 8, msY, { width: 210 });
          doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a').text(`${formatCurrency(m.amount)} (${m.percentage}%)`, PAGE_MARGIN + 220, msY, { width: 90, align: 'right' });
          msY += 9;
        }
      }

      // Right Box: Totals Card
      const totalsCardHeight = 88;
      doc.roundedRect(rightColX, gridY, rightColWidth, totalsCardHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      let tY = gridY + 7;
      const tKeyWidth = 100;
      const tValWidth = rightColWidth - tKeyWidth - 16;

      // Subtotal
      doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text('Subtotal:', rightColX + 8, tY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(formatCurrency(totals.subtotal), rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
      tY += 13;

      // Discounts if any
      if (totals.discountTotal > 0) {
        doc.font('Helvetica').fontSize(8.5).fillColor('#dc2626').text('Discounts:', rightColX + 8, tY);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#dc2626').text(`-${formatCurrency(totals.discountTotal)}`, rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
        tY += 13;
      }

      // Tax
      doc.font('Helvetica').fontSize(8.5).fillColor('#475569').text(`Estimated Tax (${estimate.taxRate}%):`, rightColX + 8, tY);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(formatCurrency(totals.taxAmount), rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
      tY += 14;

      // Total
      doc.moveTo(rightColX + 8, tY - 2)
        .lineTo(rightColX + rightColWidth - 8, tY - 2)
        .strokeColor('#0f172a')
        .lineWidth(1)
        .stroke();

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Total:', rightColX + 8, tY);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#0f172a').text(formatCurrency(totals.grandTotal), rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
      tY += 16;

      // Deposit Due (highlighted)
      doc.roundedRect(rightColX + 6, tY, rightColWidth - 12, 17, 3)
        .fillColor('#ecfdf5')
        .fillAndStroke('#a7f3d0');
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#065f46').text(`Deposit Due (${estimate.depositPct}%):`, rightColX + 10, tY + 4);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#065f46').text(formatCurrency(totals.depositDue), rightColX + tKeyWidth, tY + 4, { width: tValWidth - 6, align: 'right' });

      // ==========================================
      // 5. SIGNATURE & ACCEPTANCE BLOCK
      // ==========================================
      const sigSectionY = Math.max(gridY + termsBoxHeight + (estimate.milestonesEnabled ? 45 : 0), gridY + totalsCardHeight) + 12;

      doc.moveTo(PAGE_MARGIN, sigSectionY)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, sigSectionY)
        .strokeColor('#0f172a')
        .lineWidth(1)
        .stroke();

      doc.font('Helvetica-Bold').fontSize(7).fillColor('#0f172a').text('AUTHORIZATION & ACCEPTANCE OF SCOPE: ', PAGE_MARGIN, sigSectionY + 6, { continued: true });
      doc.font('Helvetica').fontSize(7).fillColor('#475569').text('By signing below, the client agrees to the specified scope of work, total pricing, and payment terms outlined in this estimate and authorizes the contractor to proceed as scheduled.');

      const sigGridY = sigSectionY + 24;
      const sigColWidth = (CONTENT_WIDTH - 24) / 2;

      // Left Signature: Client
      doc.moveTo(PAGE_MARGIN, sigGridY + 22)
        .lineTo(PAGE_MARGIN + sigColWidth, sigGridY + 22)
        .strokeColor('#0f172a')
        .lineWidth(1)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text('AUTHORIZED CLIENT / HOMEOWNER SIGNATURE', PAGE_MARGIN, sigGridY + 26);
      doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Print Name: __________________________   Date: ____________', PAGE_MARGIN, sigGridY + 36);

      // Right Signature: Contractor
      const sigRightX = PAGE_MARGIN + sigColWidth + 24;
      doc.moveTo(sigRightX, sigGridY + 22)
        .lineTo(sigRightX + sigColWidth, sigGridY + 22)
        .strokeColor('#0f172a')
        .lineWidth(1)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0f172a').text('CONTRACTOR REPRESENTATIVE SIGNATURE', sigRightX, sigGridY + 26);
      doc.font('Helvetica').fontSize(7).fillColor('#64748b').text('Authorized Rep: ______________________   Date: ____________', sigRightX, sigGridY + 36);

      // ==========================================
      // 6. FOOTER
      // ==========================================
      const footerY = sigGridY + 50;
      doc.moveTo(PAGE_MARGIN, footerY)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, footerY)
        .strokeColor('#e2e8f0')
        .lineWidth(0.5)
        .stroke();

      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text('✓ Thank you for the opportunity to earn your business!', PAGE_MARGIN, footerY + 4, { width: 300 });
      doc.font('Helvetica').fontSize(7).fillColor('#94a3b8')
        .text("Prepared via Let's Get Quoted • Instant Contractor Estimate", PAGE_MARGIN + 300, footerY + 4, {
          width: CONTENT_WIDTH - 300,
          align: 'right',
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
