import PDFDocument from 'pdfkit';
import type { EstimateData, EstimateTotals } from '@/lib/tools/estimate-generator-utils';
import { formatCurrency, formatDisplayDate } from '@/lib/tools/estimate-generator-utils';

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 612; // US Letter width in points (8.5in)
const _PAGE_HEIGHT = 792; // US Letter height in points (11in)
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FOOTER_Y = 734;
const BOTTOM_LIMIT = 714;

/**
 * Generates a polished, executive-grade US Letter PDF document for contractor estimates.
 * Dynamically balances vertical rhythm across the full page for standard scopes (up to 7 items),
 * while cleanly flowing across multiple pages when oversized scopes exceed single-page capacity.
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
      const companyName = estimate.contractorName?.trim() || 'Apex Trade Solutions';
      const contractorPhone = estimate.contractorPhone?.trim();
      const contractorEmail = estimate.contractorEmail?.trim();
      const contractorLicense = estimate.contractorLicense?.trim();

      const metaCardWidth = 190;
      const metaCardX = PAGE_WIDTH - PAGE_MARGIN - metaCardWidth;
      const metaCardY = startY;
      const metaCardHeight = 72;
      const leftColHeaderWidth = metaCardX - PAGE_MARGIN - 14;

      // Left Column: Business Info
      doc.font('Helvetica-Bold').fontSize(21).fillColor('#0f172a').text(companyName, PAGE_MARGIN, startY, {
        width: leftColHeaderWidth,
        lineGap: 2,
      });

      let contactY = doc.y + 3;
      const phoneEmailBits: string[] = [];
      if (contractorPhone) phoneEmailBits.push(`Phone: ${contractorPhone}`);
      if (contractorEmail) phoneEmailBits.push(`Email: ${contractorEmail}`);

      doc.font('Helvetica').fontSize(9.5).fillColor('#475569');
      if (phoneEmailBits.length > 0) {
        doc.text(phoneEmailBits.join('   •   '), PAGE_MARGIN, contactY, { width: leftColHeaderWidth });
        contactY = doc.y + 2;
      }

      const cleanLicNumber = contractorLicense.replace(/^lic[:\s#-]*\s*/i, '');
      const licText = cleanLicNumber
        ? `Contractor Lic: ${cleanLicNumber}   •   Licensed & Insured`
        : 'Licensed & Insured Trade Contractor';
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(licText, PAGE_MARGIN, contactY, {
        width: leftColHeaderWidth,
      });

      // Right Column: Estimate Meta Card
      doc.roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      // ESTIMATE / PROPOSAL Badge
      doc.roundedRect(metaCardX + 8, metaCardY + 8, 84, 18, 4)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(
        estimate.mode === 'multi_tier' ? 'PROPOSAL' : 'ESTIMATE',
        metaCardX + 8,
        metaCardY + 13,
        { width: 84, align: 'center' }
      );

      // Meta Rows
      const row1Y = metaCardY + 32;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#64748b').text('ESTIMATE #:', metaCardX + 8, row1Y);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(estimate.estimateNumber || 'EST-001', metaCardX + 70, row1Y, {
        width: metaCardWidth - 78,
        align: 'right',
      });

      const row2Y = metaCardY + 45;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#64748b').text('DATE:', metaCardX + 8, row2Y);
      doc.font('Helvetica').fontSize(9).fillColor('#334155').text(formatDisplayDate(estimate.estimateDate) || 'Today', metaCardX + 70, row2Y, {
        width: metaCardWidth - 78,
        align: 'right',
      });

      const row3Y = metaCardY + 57;
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#64748b').text('VALID FOR:', metaCardX + 8, row3Y);
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#047857').text('30 DAYS', metaCardX + 70, row3Y, {
        width: metaCardWidth - 78,
        align: 'right',
      });

      // Divider Line
      const headerBottomY = Math.max(doc.y + 10, metaCardY + metaCardHeight + 10);
      doc.moveTo(PAGE_MARGIN, headerBottomY)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, headerBottomY)
        .strokeColor('#0f172a')
        .lineWidth(2)
        .stroke();

      // ==========================================
      // 2. CLIENT & PROJECT LOCATION BOX
      // ==========================================
      const clientBoxY = headerBottomY + 12;
      const clientBoxHeight = 56;

      doc.roundedRect(PAGE_MARGIN, clientBoxY, CONTENT_WIDTH, clientBoxHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#e2e8f0');

      const colHalf = (CONTENT_WIDTH - 24) / 2;

      // Left: Prepared For
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('PREPARED FOR / CLIENT:', PAGE_MARGIN + 12, clientBoxY + 9);
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#0f172a').text(estimate.clientName?.trim() || 'Valued Client', PAGE_MARGIN + 12, clientBoxY + 22, {
        width: colHalf - 12,
      });
      if (estimate.clientAddress?.trim()) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(estimate.clientAddress.trim(), PAGE_MARGIN + 12, clientBoxY + 37, {
          width: colHalf - 12,
        });
      }

      // Right: Trade & Scope
      const tradeLabel = (estimate.selectedTrade ? estimate.selectedTrade.replace(/_/g, ' ') : 'General').toUpperCase();
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('PROJECT TRADE / SCOPE:', PAGE_MARGIN + 14 + colHalf, clientBoxY + 9);
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#ea580c').text(`${tradeLabel} SERVICES`, PAGE_MARGIN + 14 + colHalf, clientBoxY + 22, {
        width: colHalf - 14,
      });
      doc.font('Helvetica').fontSize(9).fillColor('#64748b').text('Itemized breakdown of labor, materials, permits & scope', PAGE_MARGIN + 14 + colHalf, clientBoxY + 37, {
        width: colHalf - 14,
      });

      // ==========================================
      // 3. LINE ITEMS TABLE
      // ==========================================
      const tableTopY = clientBoxY + clientBoxHeight + 14;
      const colDescWidth = 260;
      const colTypeWidth = 70;
      const colQtyWidth = 46;
      const colRateWidth = 80;
      const colTotalWidth = CONTENT_WIDTH - (colDescWidth + colTypeWidth + colQtyWidth + colRateWidth);

      const xDesc = PAGE_MARGIN;
      const xType = xDesc + colDescWidth;
      const xQty = xType + colTypeWidth;
      const xRate = xQty + colQtyWidth;
      const xTotal = xRate + colRateWidth;

      // Table Header
      const thHeight = 24;
      doc.roundedRect(PAGE_MARGIN, tableTopY, CONTENT_WIDTH, thHeight, 4)
        .fillColor('#0f172a')
        .fill();

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff');
      doc.text('DESCRIPTION / SCOPE OF WORK', xDesc + 10, tableTopY + 7, { width: colDescWidth - 14 });
      doc.text('CATEGORY', xType + 6, tableTopY + 7, { width: colTypeWidth - 8 });
      doc.text('QTY', xQty, tableTopY + 7, { width: colQtyWidth - 4, align: 'right' });
      doc.text('RATE', xRate, tableTopY + 7, { width: colRateWidth - 6, align: 'right' });
      doc.text('AMOUNT', xTotal, tableTopY + 7, { width: colTotalWidth - 10, align: 'right' });

      let currentY = tableTopY + thHeight + 2;

      const items = (estimate.items || []).filter((item) => !(item.isOptional && item.selected === false));
      const itemCount = items.length;
      // Allow slightly more row padding when few items are present
      const baseRowPadding = itemCount <= 4 ? 16 : 12;

      let rowIndex = 0;
      for (const item of items) {
        const isDisc = item.isDiscount || item.type === 'Discount';
        const qty = item.quantity || 1;
        const rate = item.unitPrice || 0;
        const lineTotal = qty * rate;

        // Calculate dynamic height based on text wrapping
        const descText = item.description || 'Line Item';
        doc.font('Helvetica-Bold').fontSize(9.5);
        const descHeight = doc.heightOfString(descText, { width: colDescWidth - 20, lineGap: 2 });
        const rowHeight = Math.max(itemCount <= 4 ? 32 : 28, descHeight + baseRowPadding);

        // Check if page overflow would occur
        if (currentY + rowHeight > BOTTOM_LIMIT - 230) {
          doc.addPage();
          currentY = PAGE_MARGIN;
        }

        // Alternating row background
        if (rowIndex % 2 === 1) {
          doc.rect(PAGE_MARGIN, currentY, CONTENT_WIDTH, rowHeight)
            .fillColor('#f8fafc')
            .fill();
        }

        // Description
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a');
        doc.text(descText, xDesc + 10, currentY + 7, {
          width: colDescWidth - 20,
          lineGap: 2,
        });

        // Category Tag
        doc.font('Helvetica').fontSize(8.5).fillColor('#475569');
        doc.text(item.type || 'Labor', xType + 6, currentY + 8, {
          width: colTypeWidth - 8,
        });

        // Qty
        doc.font('Helvetica').fontSize(9.5).fillColor('#334155');
        doc.text(String(qty), xQty, currentY + 7, { width: colQtyWidth - 4, align: 'right' });

        // Rate
        doc.text(formatCurrency(rate), xRate, currentY + 7, { width: colRateWidth - 6, align: 'right' });

        // Total
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor(isDisc ? '#dc2626' : '#0f172a');
        const formattedTotal = isDisc ? `-${formatCurrency(lineTotal)}` : formatCurrency(lineTotal);
        doc.text(formattedTotal, xTotal, currentY + 7, { width: colTotalWidth - 10, align: 'right' });

        // Row underline
        doc.moveTo(PAGE_MARGIN, currentY + rowHeight)
          .lineTo(PAGE_WIDTH - PAGE_MARGIN, currentY + rowHeight)
          .strokeColor('#e2e8f0')
          .lineWidth(0.75)
          .stroke();

        currentY += rowHeight;
        rowIndex++;
      }

      // ==========================================
      // 4. TERMS, MILESTONES & TOTALS GRID
      // ==========================================
      const bottomSectionNeeded = 220;
      if (currentY + bottomSectionNeeded > BOTTOM_LIMIT) {
        doc.addPage();
        currentY = PAGE_MARGIN;
      }

      // Calculate vertical breathing room to distribute space gracefully on single page
      const remainingSpace = Math.max(0, BOTTOM_LIMIT - currentY - bottomSectionNeeded);
      const gapBeforeGrid = Math.min(28, Math.max(12, remainingSpace * 0.3));

      const gridY = currentY + gapBeforeGrid;
      const leftColWidth = 310;
      const rightColWidth = CONTENT_WIDTH - leftColWidth - 14;
      const rightColX = PAGE_MARGIN + leftColWidth + 14;

      // Left Box: Terms & Conditions
      const termsBoxHeight = estimate.milestonesEnabled ? 64 : 110;
      doc.roundedRect(PAGE_MARGIN, gridY, leftColWidth, termsBoxHeight, 6)
        .fillColor('#fafbfc')
        .fillAndStroke('#e2e8f0');

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#475569')
        .text('TERMS, CONDITIONS & WARRANTY:', PAGE_MARGIN + 12, gridY + 9);

      const termsText = estimate.terms?.trim() ||
        'Estimate valid for 30 days. Deposit required upon authorization to schedule crew and order materials. Workmanship backed by standard contractor warranty. Change orders require written mutual authorization.';
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155')
        .text(termsText, PAGE_MARGIN + 12, gridY + 24, {
          width: leftColWidth - 24,
          lineGap: 3,
        });

      // Milestone schedule if enabled
      if (estimate.milestonesEnabled && totals.milestones && totals.milestones.length > 0) {
        const msBoxY = gridY + termsBoxHeight + 6;
        const msBoxHeight = 44;
        doc.roundedRect(PAGE_MARGIN, msBoxY, leftColWidth, msBoxHeight, 5)
          .fillColor('#f8fafc')
          .fillAndStroke('#e2e8f0');

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('PAYMENT MILESTONE SCHEDULE:', PAGE_MARGIN + 12, msBoxY + 7);
        let msY = msBoxY + 20;
        for (const m of totals.milestones.slice(0, 3)) {
          doc.font('Helvetica').fontSize(8).fillColor('#475569').text(m.name, PAGE_MARGIN + 12, msY, { width: 185 });
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(`${formatCurrency(m.amount)} (${m.percentage}%)`, PAGE_MARGIN + 195, msY, { width: 102, align: 'right' });
          msY += 11;
        }
      }

      // Right Box: Totals Card
      const totalsCardHeight = 110;
      doc.roundedRect(rightColX, gridY, rightColWidth, totalsCardHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      let tY = gridY + 11;
      const tKeyWidth = 105;
      const tValWidth = rightColWidth - tKeyWidth - 22;

      // Subtotal
      doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text('Subtotal:', rightColX + 11, tY);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(formatCurrency(totals.subtotal), rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
      tY += 16;

      // Discounts if any
      if (totals.discountTotal > 0) {
        doc.font('Helvetica').fontSize(9.5).fillColor('#dc2626').text('Discounts:', rightColX + 11, tY);
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#dc2626').text(`-${formatCurrency(totals.discountTotal)}`, rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
        tY += 16;
      }

      // Tax
      doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(`Estimated Tax (${estimate.taxRate}%):`, rightColX + 11, tY);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#0f172a').text(formatCurrency(totals.taxAmount), rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
      tY += 17;

      // Total
      doc.moveTo(rightColX + 11, tY - 2)
        .lineTo(rightColX + rightColWidth - 11, tY - 2)
        .strokeColor('#0f172a')
        .lineWidth(1.5)
        .stroke();

      doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#0f172a').text('Total:', rightColX + 11, tY);
      doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(formatCurrency(totals.grandTotal), rightColX + tKeyWidth, tY, { width: tValWidth, align: 'right' });
      tY += 21;

      // Deposit Due (highlighted)
      doc.roundedRect(rightColX + 8, tY, rightColWidth - 16, 22, 4)
        .fillColor('#ecfdf5')
        .fillAndStroke('#a7f3d0');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#065f46').text(`Deposit Due (${estimate.depositPct}%):`, rightColX + 14, tY + 5);
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#065f46').text(formatCurrency(totals.depositDue), rightColX + tKeyWidth, tY + 5, { width: tValWidth - 6, align: 'right' });

      // ==========================================
      // 5. SIGNATURE & ACCEPTANCE BLOCK
      // ==========================================
      const contentHeightSoFar = Math.max(gridY + termsBoxHeight + (estimate.milestonesEnabled ? 56 : 0), gridY + totalsCardHeight);
      const remainingForSig = Math.max(0, FOOTER_Y - contentHeightSoFar - 95);
      const gapBeforeSig = Math.min(28, Math.max(14, remainingForSig * 0.35));
      const sigSectionY = contentHeightSoFar + gapBeforeSig;

      doc.moveTo(PAGE_MARGIN, sigSectionY)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, sigSectionY)
        .strokeColor('#0f172a')
        .lineWidth(1.5)
        .stroke();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text('AUTHORIZATION & ACCEPTANCE OF SCOPE: ', PAGE_MARGIN, sigSectionY + 8, { continued: true });
      doc.font('Helvetica').fontSize(8).fillColor('#475569').text('By signing below, the client agrees to the specified scope of work, total pricing, and payment terms outlined in this estimate and authorizes the contractor to proceed as scheduled.');

      const sigGridY = sigSectionY + 34;
      const sigColWidth = (CONTENT_WIDTH - 28) / 2;

      // Left Signature: Client
      doc.moveTo(PAGE_MARGIN, sigGridY + 28)
        .lineTo(PAGE_MARGIN + sigColWidth, sigGridY + 28)
        .strokeColor('#0f172a')
        .lineWidth(1.2)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('AUTHORIZED CLIENT / HOMEOWNER SIGNATURE', PAGE_MARGIN, sigGridY + 33);
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Print Name: __________________________   Date: ____________', PAGE_MARGIN, sigGridY + 45);

      // Right Signature: Contractor
      const sigRightX = PAGE_MARGIN + sigColWidth + 28;
      doc.moveTo(sigRightX, sigGridY + 28)
        .lineTo(sigRightX + sigColWidth, sigGridY + 28)
        .strokeColor('#0f172a')
        .lineWidth(1.2)
        .stroke();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text('CONTRACTOR REPRESENTATIVE SIGNATURE', sigRightX, sigGridY + 33);
      doc.font('Helvetica').fontSize(8).fillColor('#64748b').text('Authorized Rep: ______________________   Date: ____________', sigRightX, sigGridY + 45);

      // ==========================================
      // 6. FOOTER
      // ==========================================
      doc.moveTo(PAGE_MARGIN, FOOTER_Y - 4)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, FOOTER_Y - 4)
        .strokeColor('#cbd5e1')
        .lineWidth(0.75)
        .stroke();

      doc.font('Helvetica').fontSize(8).fillColor('#64748b')
        .text('Thank you for the opportunity to earn your business!', PAGE_MARGIN, FOOTER_Y, { width: 300 });
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8')
        .text("Prepared via Let's Get Quoted • Instant Contractor Estimate", PAGE_MARGIN + 300, FOOTER_Y, {
          width: CONTENT_WIDTH - 300,
          align: 'right',
        });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
