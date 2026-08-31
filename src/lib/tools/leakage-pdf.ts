import PDFDocument from 'pdfkit';

export interface LeakageAuditData {
  revenue: number;
  unbilledScopePct: number;
  supplyHouseHours: number;
  hourlyBillingRate: number;
  checkTripsPerMonth: number;
  contractorName?: string;
  reportDate?: string;
  referenceNumber?: string;
}

export interface LeakageAuditCalculations {
  annualScopeLoss: number;
  annualSupplyHouseLoss: number;
  annualCheckChasingLoss: number;
  annualCashFlowCost: number;
  totalAnnualLeakage: number;
  recoverableWithLGQ: number;
}

const PAGE_MARGIN = 36;
const PAGE_WIDTH = 612; // US Letter width in points (8.5in)
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const FOOTER_Y = 744;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Generates an executive-grade US Letter PDF diagnostic report for Contractor Cash Flow & Profit Leakage.
 * Engineered for exact 1-page letter layout with high-contrast executive formatting.
 */
export function generateLeakagePdf(
  data: LeakageAuditData,
  calculations: LeakageAuditCalculations,
): Promise<Buffer> {
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
      const refNum = data.referenceNumber || 'AUD-2026-LEAK';
      const formattedDate = data.reportDate || new Date().toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      // ==========================================
      // 1. TOP HEADER: Brand + Meta Card
      // ==========================================
      const metaCardWidth = 190;
      const metaCardX = PAGE_WIDTH - PAGE_MARGIN - metaCardWidth;
      const metaCardY = startY;
      const metaCardHeight = 68;
      const leftColWidth = metaCardX - PAGE_MARGIN - 16;

      // Title & Subtitle
      doc.font('Helvetica-Bold').fontSize(19).fillColor('#0f172a').text(
        'Contractor Cash Flow & Profit Leakage Audit',
        PAGE_MARGIN,
        startY,
        { width: leftColWidth, lineGap: 2 },
      );

      doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(
        'Executive Financial Diagnostic & Bottom-Line Profit Recovery Analysis',
        PAGE_MARGIN,
        doc.y + 3,
        { width: leftColWidth },
      );

      if (data.contractorName?.trim()) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#ea580c').text(
          `Prepared for: ${data.contractorName.trim()}`,
          PAGE_MARGIN,
          doc.y + 3,
          { width: leftColWidth },
        );
      }

      // Meta Card
      doc.roundedRect(metaCardX, metaCardY, metaCardWidth, metaCardHeight, 6)
        .fillColor('#f8fafc')
        .fillAndStroke('#cbd5e1');

      // AUDIT REPORT Badge
      doc.roundedRect(metaCardX + 8, metaCardY + 8, 90, 16, 4)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(
        'AUDIT REPORT',
        metaCardX + 8,
        metaCardY + 12,
        { width: 90, align: 'center' },
      );

      // Meta Rows
      const row1Y = metaCardY + 29;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('REF #:', metaCardX + 8, row1Y);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a').text(refNum, metaCardX + 60, row1Y, {
        width: metaCardWidth - 68,
        align: 'right',
      });

      const row2Y = metaCardY + 41;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('DATE:', metaCardX + 8, row2Y);
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155').text(formattedDate, metaCardX + 60, row2Y, {
        width: metaCardWidth - 68,
        align: 'right',
      });

      const row3Y = metaCardY + 53;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text('STATUS:', metaCardX + 8, row3Y);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b91c1c').text('RECOVERY OPP', metaCardX + 60, row3Y, {
        width: metaCardWidth - 68,
        align: 'right',
      });

      // Divider Line
      const headerBottomY = metaCardY + metaCardHeight + 10;
      doc.moveTo(PAGE_MARGIN, headerBottomY)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, headerBottomY)
        .strokeColor('#0f172a')
        .lineWidth(1.5)
        .stroke();

      // ==========================================
      // 2. EXECUTIVE KPI CARDS (2 COLUMNS)
      // ==========================================
      const kpiCardY = headerBottomY + 10;
      const kpiCardWidth = (CONTENT_WIDTH - 12) / 2;
      const kpiCardHeight = 62;

      // Leakage KPI Box (Left - Warning/Red)
      doc.roundedRect(PAGE_MARGIN, kpiCardY, kpiCardWidth, kpiCardHeight, 6)
        .fillColor('#fef2f2')
        .fillAndStroke('#fecaca');

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#991b1b').text(
        '🚨 TOTAL ESTIMATED ANNUAL PROFIT LEAKAGE',
        PAGE_MARGIN + 10,
        kpiCardY + 8,
        { width: kpiCardWidth - 20 },
      );

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#b91c1c').text(
        `${formatCurrency(calculations.totalAnnualLeakage)} / yr`,
        PAGE_MARGIN + 10,
        kpiCardY + 21,
        { width: kpiCardWidth - 20 },
      );

      doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
        'Drained annually via unbilled change orders, supply runs, and check collection.',
        PAGE_MARGIN + 10,
        kpiCardY + 44,
        { width: kpiCardWidth - 20 },
      );

      // Recovery KPI Box (Right - Success/Green)
      const recCardX = PAGE_MARGIN + kpiCardWidth + 12;
      doc.roundedRect(recCardX, kpiCardY, kpiCardWidth, kpiCardHeight, 6)
        .fillColor('#ecfdf5')
        .fillAndStroke('#a7f3d0');

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#065f46').text(
        '💰 RECOVERABLE WITH LET’S GET QUOTED',
        recCardX + 10,
        kpiCardY + 8,
        { width: kpiCardWidth - 20 },
      );

      doc.font('Helvetica-Bold').fontSize(18).fillColor('#047857').text(
        `+${formatCurrency(calculations.recoverableWithLGQ)} / yr`,
        recCardX + 10,
        kpiCardY + 21,
        { width: kpiCardWidth - 20 },
      );

      doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
        'Reclaimed via automated deposit locks, 1-tap change orders & mobile pay.',
        recCardX + 10,
        kpiCardY + 44,
        { width: kpiCardWidth - 20 },
      );

      // ==========================================
      // 3. SECTION I: BASELINE OPERATIONAL PROFILE
      // ==========================================
      const sec1Y = kpiCardY + kpiCardHeight + 12;
      
      // Section Header Banner
      doc.roundedRect(PAGE_MARGIN, sec1Y, CONTENT_WIDTH, 18, 3)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(
        'I. BASELINE OPERATIONAL PROFILE',
        PAGE_MARGIN + 8,
        sec1Y + 5,
      );

      // Table Header
      let currentTableY = sec1Y + 22;
      const colParamW = 240;
      const colBaseW = 140;
      const colImpactW = CONTENT_WIDTH - colParamW - colBaseW;

      doc.rect(PAGE_MARGIN, currentTableY, CONTENT_WIDTH, 16)
        .fillColor('#f8fafc')
        .fillAndStroke('#e2e8f0');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b');
      doc.text('OPERATIONAL PARAMETER', PAGE_MARGIN + 8, currentTableY + 4, { width: colParamW });
      doc.text('BASELINE VALUE', PAGE_MARGIN + colParamW, currentTableY + 4, { width: colBaseW - 8, align: 'right' });
      doc.text('ANNUALIZED METRIC', PAGE_MARGIN + colParamW + colBaseW, currentTableY + 4, { width: colImpactW - 8, align: 'right' });

      currentTableY += 16;

      const profileRows = [
        {
          param: 'Annual Gross Revenue',
          value: formatCurrency(data.revenue),
          metric: '100% Volume Base',
          metricColor: '#64748b',
        },
        {
          param: 'Unbilled Scope Creep / Extras Rate',
          value: `${data.unbilledScopePct}% of projects`,
          metric: `-${formatCurrency(calculations.annualScopeLoss)}/yr`,
          metricColor: '#b91c1c',
        },
        {
          param: 'Unbilled Supply House & Parts Runs',
          value: `${data.supplyHouseHours} hrs / week`,
          metric: `-${formatCurrency(calculations.annualSupplyHouseLoss)}/yr`,
          metricColor: '#b91c1c',
        },
        {
          param: 'Target Hourly Labor Billing Rate',
          value: `$${data.hourlyBillingRate} / hour`,
          metric: '50 Working Weeks',
          metricColor: '#64748b',
        },
        {
          param: 'In-Person Paper Check Pickup Trips',
          value: `${data.checkTripsPerMonth} trips / month`,
          metric: `-${formatCurrency(calculations.annualCheckChasingLoss)}/yr`,
          metricColor: '#b91c1c',
        },
      ];

      profileRows.forEach((row, idx) => {
        const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        doc.rect(PAGE_MARGIN, currentTableY, CONTENT_WIDTH, 15)
          .fillColor(bg)
          .fillAndStroke('#e2e8f0');

        doc.font('Helvetica').fontSize(8).fillColor('#1e293b');
        doc.text(row.param, PAGE_MARGIN + 8, currentTableY + 4, { width: colParamW });

        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a');
        doc.text(row.value, PAGE_MARGIN + colParamW, currentTableY + 4, { width: colBaseW - 8, align: 'right' });

        doc.font('Helvetica-Bold').fontSize(8).fillColor(row.metricColor);
        doc.text(row.metric, PAGE_MARGIN + colParamW + colBaseW, currentTableY + 4, { width: colImpactW - 8, align: 'right' });

        currentTableY += 15;
      });

      // ==========================================
      // 4. SECTION II: ITEMIZED PROFIT LEAKAGE ANALYSIS
      // ==========================================
      const sec2Y = currentTableY + 10;
      
      // Section Header Banner
      doc.roundedRect(PAGE_MARGIN, sec2Y, CONTENT_WIDTH, 18, 3)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(
        'II. ITEMIZED PROFIT LEAKAGE BREAKDOWN',
        PAGE_MARGIN + 8,
        sec2Y + 5,
      );

      currentTableY = sec2Y + 22;
      const colCatW = 200;
      const colCauseW = 210;
      const colLossW = CONTENT_WIDTH - colCatW - colCauseW;

      doc.rect(PAGE_MARGIN, currentTableY, CONTENT_WIDTH, 16)
        .fillColor('#f8fafc')
        .fillAndStroke('#e2e8f0');

      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#64748b');
      doc.text('LEAKAGE CATEGORY', PAGE_MARGIN + 8, currentTableY + 4, { width: colCatW });
      doc.text('ROOT CAUSE MECHANISM', PAGE_MARGIN + colCatW, currentTableY + 4, { width: colCauseW });
      doc.text('ANNUAL LOSS', PAGE_MARGIN + colCatW + colCauseW, currentTableY + 4, { width: colLossW - 8, align: 'right' });

      currentTableY += 16;

      const lossRows = [
        {
          category: 'Unbilled Scope Creep & Extras',
          cause: 'Unsigned verbal requests & framing/fixture changes',
          loss: formatCurrency(calculations.annualScopeLoss),
        },
        {
          category: 'Supply House Windshield Hours',
          cause: 'Unbilled drive time & technician downtime',
          loss: formatCurrency(calculations.annualSupplyHouseLoss),
        },
        {
          category: 'Paper Check Pickup Trips',
          cause: 'Vehicle fuel, site return drives & delayed deposits',
          loss: formatCurrency(calculations.annualCheckChasingLoss),
        },
        {
          category: 'Net-30 Cash Flow Carrying Float',
          cause: 'Carrying upfront materials before final balance cleared',
          loss: formatCurrency(calculations.annualCashFlowCost),
        },
      ];

      lossRows.forEach((row, idx) => {
        const bg = idx % 2 === 1 ? '#f8fafc' : '#ffffff';
        doc.rect(PAGE_MARGIN, currentTableY, CONTENT_WIDTH, 17)
          .fillColor(bg)
          .fillAndStroke('#e2e8f0');

        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a');
        doc.text(row.category, PAGE_MARGIN + 8, currentTableY + 4, { width: colCatW });

        doc.font('Helvetica').fontSize(7.5).fillColor('#475569');
        doc.text(row.cause, PAGE_MARGIN + colCatW, currentTableY + 4, { width: colCauseW });

        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#b91c1c');
        doc.text(row.loss, PAGE_MARGIN + colCatW + colCauseW, currentTableY + 4, { width: colLossW - 8, align: 'right' });

        currentTableY += 17;
      });

      // Total Row
      doc.rect(PAGE_MARGIN, currentTableY, CONTENT_WIDTH, 18)
        .fillColor('#fef2f2')
        .fillAndStroke('#fecaca');

      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#991b1b');
      doc.text('TOTAL ANNUAL PROFIT EROSION', PAGE_MARGIN + 8, currentTableY + 5, { width: colCatW });
      doc.font('Helvetica').fontSize(8).fillColor('#7f1d1d');
      doc.text('Combined Bottom-Line Loss', PAGE_MARGIN + colCatW, currentTableY + 5, { width: colCauseW });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#b91c1c');
      doc.text(`${formatCurrency(calculations.totalAnnualLeakage)} / yr`, PAGE_MARGIN + colCatW + colCauseW, currentTableY + 4, { width: colLossW - 8, align: 'right' });

      currentTableY += 18;

      // ==========================================
      // 5. SECTION III: STRATEGIC RECOVERY ACTION PLAN
      // ==========================================
      const sec3Y = currentTableY + 10;
      doc.roundedRect(PAGE_MARGIN, sec3Y, CONTENT_WIDTH, 18, 3)
        .fillColor('#0f172a')
        .fill();
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff').text(
        'III. STRATEGIC REVENUE RECOVERY PLAN (POWERED BY LET’S GET QUOTED)',
        PAGE_MARGIN + 8,
        sec3Y + 5,
      );

      const actionTopY = sec3Y + 22;
      const actionItems = [
        {
          num: '1',
          title: '1-Tap Digital Change Orders:',
          desc: 'Require customer e-signature directly from phone before performing out-of-scope work. Captures 100% of extras instantly.',
        },
        {
          num: '2',
          title: 'Automated Upfront Material Deposits:',
          desc: 'Lock in 30%–50% materials deposit via Apple Pay/credit card before crew scheduling to eliminate out-of-pocket cash float.',
        },
        {
          num: '3',
          title: 'Instant Text-to-Pay Settlement:',
          desc: 'Text signable invoices upon final walkthrough to eliminate paper check collection drives and 30-day payment lag.',
        },
      ];

      let itemY = actionTopY;
      actionItems.forEach((action) => {
        doc.roundedRect(PAGE_MARGIN, itemY, CONTENT_WIDTH, 22, 4)
          .fillColor('#f8fafc')
          .fillAndStroke('#e2e8f0');

        // Number Pill
        doc.roundedRect(PAGE_MARGIN + 6, itemY + 4, 14, 14, 3)
          .fillColor('#ff6a24')
          .fill();
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text(
          action.num,
          PAGE_MARGIN + 6,
          itemY + 6.5,
          { width: 14, align: 'center' },
        );

        // Text
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(
          action.title,
          PAGE_MARGIN + 26,
          itemY + 6,
          { continued: true },
        );
        doc.font('Helvetica').fontSize(7.5).fillColor('#475569').text(
          ` ${action.desc}`,
        );

        itemY += 25;
      });

      // ==========================================
      // 6. FOOTER
      // ==========================================
      doc.moveTo(PAGE_MARGIN, FOOTER_Y - 8)
        .lineTo(PAGE_WIDTH - PAGE_MARGIN, FOOTER_Y - 8)
        .strokeColor('#cbd5e1')
        .lineWidth(1)
        .stroke();

      doc.font('Helvetica-Bold').fontSize(8).fillColor('#64748b').text(
        '✓ Prepared via Let’s Get Quoted • Financial Diagnostic Suite',
        PAGE_MARGIN,
        FOOTER_Y,
        { width: CONTENT_WIDTH / 2 },
      );

      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(
        'https://letsgetquoted.com/tools/leakage-calculator',
        PAGE_MARGIN + CONTENT_WIDTH / 2,
        FOOTER_Y,
        { width: CONTENT_WIDTH / 2, align: 'right' },
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
