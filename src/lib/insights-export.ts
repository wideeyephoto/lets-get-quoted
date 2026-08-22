// Turns a built `Insights` object into the two files the Export modal offers: a
// full CSV of every metric, and a formatted Business-Performance PDF. Both are
// PURE renderers — buildInsights (src/lib/insights.ts) has already done the
// tenant-scoped reads, so these functions only shape data that's in hand and can
// be unit-tested against a fixture with exact expectations.
//
// The Excel (.xlsx) option is deliberately absent: only a read-only xlsx reader
// is installed, no writer, so the modal renders that choice disabled rather than
// shipping a broken download. Everything approximate in the dashboard is labeled
// approximate here too — the report must never read as more certain than the
// screen it came from.

import PDFDocument from 'pdfkit';
import { gridToCsv } from '@/lib/import-formats';
import { formatUsdExact } from '@/lib/money-format';
import { AUDIENCE_DEFS } from '@/lib/campaign-audiences';
import type { Delta, Insights } from '@/lib/insights';
import type { InsightsKpis, Kpi } from '@/lib/insights-metrics';

export type InsightsExportMeta = { businessName: string; generatedLabel: string };

/* -------------------------------------------------------------------------- */
/* Shared formatting                                                           */
/* -------------------------------------------------------------------------- */

// Bare two-decimal number for CSV cells — sums cleanly in a spreadsheet, the
// same choice the tax P&L export makes.
function money2(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

/**
 * To the cent. This comment used to say the PDF was "for glancing, not summing",
 * and its own tables disprove it: Revenue by service prints every slice through
 * this AND the Total beneath them, and the revenue trend prints each point beside
 * a Period total in its heading. An exhaustive breakdown whose rows are each
 * rounded does not add up to the total printed under them.
 *
 * It also cited the invoice PDF's style, which no longer rounds either -- that
 * document goes to a customer and had the same defect.
 */
function moneyLabel(value: number): string {
  return formatUsdExact(value);
}

// A delta as a signed string with its unit, or an em-dash when there's no honest
// comparison (a point-in-time balance). computeDelta/computePointDelta already
// carry the sign in `pct`, so a positive value just needs a leading '+'.
function formatDelta(delta: Delta | null, unit: '%' | 'pp'): string {
  if (!delta || delta.pct === null) return '—';
  const sign = delta.pct > 0 ? '+' : '';
  return `${sign}${delta.pct}${unit}`;
}

const CHANNEL_LABEL: Record<string, string> = { email: 'Email', sms: 'Text', both: 'Email + text' };

function audienceLabel(id: string): string {
  return AUDIENCE_DEFS.find((audience) => audience.id === id)?.label ?? id;
}

// Campaign timestamps out as a plain YYYY-MM-DD (UTC) — deterministic for a file
// export, where a locale-formatted date would vary by server.
function exportDate(iso: string): string {
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? '' : new Date(time).toISOString().slice(0, 10);
}

function kpiList(kpis: InsightsKpis): Kpi[] {
  return [kpis.grossRevenue, kpis.netCollected, kpis.jobsCompleted, kpis.quoteConversion, kpis.outstandingBalance, kpis.newCustomers];
}

function kpiCsvValue(kpi: Kpi): string {
  return kpi.format === 'money' ? money2(kpi.value) : String(kpi.value);
}

function kpiUnit(kpi: Kpi): string {
  return kpi.format === 'money' ? '$' : kpi.format === 'percent' ? '%' : 'count';
}

function kpiPdfValue(kpi: Kpi): string {
  const value = kpi.format === 'money' ? moneyLabel(kpi.value) : kpi.format === 'percent' ? `${kpi.value}%` : String(kpi.value);
  const change = formatDelta(kpi.delta, kpi.deltaUnit);
  return change === '—' ? value : `${value}   (${change})`;
}

/* -------------------------------------------------------------------------- */
/* CSV — every metric in one file, section by section                          */
/* -------------------------------------------------------------------------- */

export function buildInsightsCsv(insights: Insights, meta: InsightsExportMeta): string {
  const rows: string[][] = [];
  const section = (title: string, sub?: string) => rows.push(sub ? [title, sub] : [title]);
  const blank = () => rows.push([]);

  rows.push([`${meta.businessName} — Business Performance`]);
  rows.push(['Period', insights.period.label]);
  rows.push(['Generated', meta.generatedLabel]);
  blank();

  // Key business metrics
  section('Key business metrics');
  rows.push(['Metric', 'Value', 'Unit', 'Change vs previous period', 'Note']);
  for (const kpi of kpiList(insights.kpis)) {
    rows.push([kpi.label, kpiCsvValue(kpi), kpiUnit(kpi), formatDelta(kpi.delta, kpi.deltaUnit), kpi.note ?? '']);
  }
  blank();

  // Revenue collected over time
  const trend = insights.revenueTrend;
  section('Revenue collected over time', `Grouped by ${trend.grouping}`);
  rows.push(['Period', 'Collected', 'Previous period']);
  for (const point of trend.points) rows.push([point.label, money2(point.current), money2(point.previous)]);
  rows.push(['Total', money2(trend.total), money2(trend.previousTotal)]);
  blank();

  // Sales activity. No conversion column: these are six independent counts, so
  // the ratio of two of them is not a rate. See buildSalesActivity.
  section('Sales activity', 'What happened this period, counted — not one group of customers followed through');
  rows.push(['Stage', 'Count']);
  for (const stage of insights.salesActivity.stages) rows.push([stage.label, String(stage.count)]);
  blank();

  // Schedule utilization
  const su = insights.scheduleUtilization;
  section('Schedule utilization', `Next ${su.lookaheadDays} days`);
  if (!su.configured) {
    rows.push(['Booking availability is not set up, so utilization cannot be measured']);
  } else {
    rows.push(['Booked days', String(su.bookedDays)]);
    rows.push(['Open days', String(su.openDays)]);
    rows.push(['Working days', String(su.workingDays)]);
    rows.push(['Utilization', su.utilizationPct === null ? '—' : `${su.utilizationPct}%`]);
    rows.push(['Estimated open-day opportunity', su.estimatedOpportunity === null ? '—' : money2(su.estimatedOpportunity)]);
  }
  blank();

  // Payment health
  const ph = insights.paymentHealth;
  section('Payment health', 'Age-based, not due-date-based');
  rows.push(['Money 30+ days old', money2(ph.overdueBalance)]);
  rows.push(['Invoices 30+ days old', String(ph.overdueCount)]);
  rows.push(['Average days to get paid', ph.avgDaysToCollect === null ? '—' : String(ph.avgDaysToCollect)]);
  rows.push(['Failed payments', String(ph.failedPayments)]);
  blank();

  // Customers
  const ci = insights.customerInsights;
  section('Customers');
  rows.push(['Total customers', String(ci.totalClients)]);
  rows.push(['Repeat customers', String(ci.repeatClients)]);
  rows.push(['Repeat rate', ci.repeatRatePct === null ? '—' : `${ci.repeatRatePct}%`]);
  rows.push([`Gone quiet (${ci.inactiveThresholdDays}+ days, nothing booked)`, String(ci.inactiveClients)]);
  rows.push(['Active maintenance plans', String(ci.activeMaintenancePlans)]);
  rows.push(['Maintenance monthly value', money2(ci.maintenanceMonthly)]);
  blank();

  // Revenue by service (approximate)
  const rbs = insights.revenueByService;
  section('Revenue by service', 'Approximate — grouped from invoice line-item labels');
  rows.push(['Service', 'Amount', 'Share', 'Line items']);
  for (const slice of rbs.slices) rows.push([slice.label, money2(slice.amount), `${slice.pct}%`, String(slice.count)]);
  rows.push(['Total', money2(rbs.total), '', '']);
  blank();

  // Marketing performance
  const mkt = insights.marketingPerformance;
  section('Marketing performance', 'Opens, clicks, replies and revenue are not tracked');
  rows.push(['Sent on', 'Channel', 'Audience', 'Recipients', 'Emails sent', 'Texts queued', 'Failed', 'Skipped']);
  for (const c of mkt.campaigns) {
    rows.push([
      exportDate(c.sentAt),
      CHANNEL_LABEL[c.channel] ?? c.channel,
      audienceLabel(c.audience),
      String(c.recipients),
      String(c.emailSent),
      String(c.smsQueued),
      String(c.failed),
      String(c.skipped),
    ]);
  }
  blank();

  // Top opportunities
  section('Top opportunities', 'Ranked by money at stake');
  rows.push(['Priority', 'Opportunity', 'Detail', 'Value', 'Count']);
  for (const opp of insights.topOpportunities) {
    rows.push([opp.priority, opp.title, opp.detail, opp.value === null ? '' : money2(opp.value), opp.count === null ? '' : String(opp.count)]);
  }

  return gridToCsv(rows);
}

/* -------------------------------------------------------------------------- */
/* PDF — a formatted one-page-per-few-sections report                          */
/* -------------------------------------------------------------------------- */

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 612; // US Letter, points
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const PAGE_BOTTOM = 740;

export function buildInsightsPdf(insights: Insights, meta: InsightsExportMeta): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'LETTER', margin: PAGE_MARGIN });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      let y = PAGE_MARGIN;
      const ensure = (need: number) => {
        if (y + need > PAGE_BOTTOM) {
          doc.addPage();
          y = PAGE_MARGIN;
        }
      };

      const heading = (text: string, sub?: string) => {
        ensure(38);
        y += 8;
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#0f172a').text(text, PAGE_MARGIN, y);
        y += 18;
        if (sub) {
          doc.font('Helvetica').fontSize(8.5).fillColor('#94a3b8').text(sub, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
          y += 13;
        }
        doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
        y += 8;
      };

      const kv = (label: string, value: string, note?: string) => {
        ensure(16);
        const valueWidth = 220;
        const labelWidth = CONTENT_WIDTH - valueWidth;
        doc.font('Helvetica').fontSize(10).fillColor('#475569').text(label, PAGE_MARGIN, y, { width: labelWidth });
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text(value, PAGE_MARGIN + labelWidth, y, { width: valueWidth, align: 'right' });
        y += 15;
        if (note) {
          doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(note, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
          y += 12;
        }
      };

      const table = (headers: string[], body: string[][], widths: number[], aligns: Array<'left' | 'right'>) => {
        ensure(24);
        let hx = PAGE_MARGIN;
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#64748b');
        headers.forEach((header, i) => {
          doc.text(header, hx, y, { width: widths[i], align: aligns[i] });
          hx += widths[i];
        });
        y += 14;
        doc.moveTo(PAGE_MARGIN, y - 3).lineTo(PAGE_MARGIN + widths.reduce((a, b) => a + b, 0), y - 3).strokeColor('#eef2f6').lineWidth(1).stroke();
        for (const row of body) {
          doc.font('Helvetica').fontSize(9).fillColor('#334155');
          let rowHeight = 12;
          row.forEach((cell, i) => {
            rowHeight = Math.max(rowHeight, doc.heightOfString(cell, { width: widths[i] }));
          });
          ensure(rowHeight + 6);
          let cx = PAGE_MARGIN;
          row.forEach((cell, i) => {
            doc.text(cell, cx, y, { width: widths[i], align: aligns[i] });
            cx += widths[i];
          });
          y += rowHeight + 6;
        }
        y += 4;
      };

      // Title block
      doc.font('Helvetica-Bold').fontSize(20).fillColor('#0f172a').text(meta.businessName, PAGE_MARGIN, y, { width: CONTENT_WIDTH });
      y += 26;
      doc.font('Helvetica').fontSize(11).fillColor('#64748b').text('Business Performance', PAGE_MARGIN, y);
      y += 15;
      doc.font('Helvetica').fontSize(9).fillColor('#94a3b8').text(`${insights.period.label}   ·   Generated ${meta.generatedLabel}`, PAGE_MARGIN, y);
      y += 10;

      // Key business metrics
      heading('Key business metrics');
      for (const kpi of kpiList(insights.kpis)) kv(kpi.label, kpiPdfValue(kpi), kpi.note);

      // Revenue collected over time
      const trend = insights.revenueTrend;
      heading('Revenue collected over time', `Grouped by ${trend.grouping} · Period total ${moneyLabel(trend.total)} (previous ${moneyLabel(trend.previousTotal)})`);
      if (trend.hasData) {
        table(
          ['Period', 'Collected', 'Previous'],
          trend.points.map((point) => [point.label, moneyLabel(point.current), moneyLabel(point.previous)]),
          [CONTENT_WIDTH - 220, 110, 110],
          ['left', 'right', 'right'],
        );
      } else {
        kv('No payments recorded in this period', '—');
      }

      // Sales activity. No conversion column — see buildSalesActivity.
      heading('Sales activity', 'What happened this period, counted — not one group of customers followed through');
      table(
        ['Stage', 'Count'],
        insights.salesActivity.stages.map((stage) => [stage.label, String(stage.count)]),
        [CONTENT_WIDTH - 110, 110],
        ['left', 'right'],
      );

      // Schedule utilization
      const su = insights.scheduleUtilization;
      heading('Schedule utilization', `Next ${su.lookaheadDays} days`);
      if (!su.configured) {
        kv('Booking availability not set up', '—');
      } else {
        kv('Booked days', String(su.bookedDays));
        kv('Open days', String(su.openDays));
        kv('Working days', String(su.workingDays));
        kv('Utilization', su.utilizationPct === null ? '—' : `${su.utilizationPct}%`);
        kv('Estimated open-day opportunity', su.estimatedOpportunity === null ? '—' : moneyLabel(su.estimatedOpportunity));
      }

      // Payment health
      const ph = insights.paymentHealth;
      heading('Payment health', 'Age-based, not due-date-based');
      kv('Money 30+ days old', moneyLabel(ph.overdueBalance));
      kv('Invoices 30+ days old', String(ph.overdueCount));
      kv('Average days to get paid', ph.avgDaysToCollect === null ? '—' : `${ph.avgDaysToCollect} days`);
      kv('Failed payments', String(ph.failedPayments));

      // Customers
      const ci = insights.customerInsights;
      heading('Customers');
      kv('Total customers', String(ci.totalClients));
      kv('Repeat customers', ci.repeatRatePct === null ? String(ci.repeatClients) : `${ci.repeatClients}   (${ci.repeatRatePct}%)`);
      kv(`Gone quiet (${ci.inactiveThresholdDays}+ days)`, String(ci.inactiveClients));
      kv('Active maintenance plans', ci.maintenanceMonthly > 0 ? `${ci.activeMaintenancePlans}   (${moneyLabel(ci.maintenanceMonthly)}/mo)` : String(ci.activeMaintenancePlans));

      // Revenue by service
      const rbs = insights.revenueByService;
      heading('Revenue by service', 'Approximate — grouped from invoice line-item labels, not a service catalog');
      if (rbs.hasData) {
        table(
          ['Service', 'Amount', 'Share', 'Items'],
          rbs.slices.map((slice) => [slice.label, moneyLabel(slice.amount), `${slice.pct}%`, String(slice.count)]),
          [CONTENT_WIDTH - 260, 120, 70, 70],
          ['left', 'right', 'right', 'right'],
        );
        kv('Total', moneyLabel(rbs.total));
      } else {
        kv('No signed or paid invoices with line items yet', '—');
      }

      // Marketing performance
      const mkt = insights.marketingPerformance;
      heading('Marketing performance', 'Opens, clicks, replies and revenue are not tracked — this is what was sent, not how it performed');
      if (mkt.hasData) {
        table(
          ['Sent', 'Channel', 'Audience', 'Recipients', 'Failed'],
          mkt.campaigns.map((campaign) => [
            exportDate(campaign.sentAt),
            CHANNEL_LABEL[campaign.channel] ?? campaign.channel,
            audienceLabel(campaign.audience),
            String(campaign.recipients),
            String(campaign.failed),
          ]),
          [80, 90, 130, 122, 90],
          ['left', 'left', 'left', 'right', 'right'],
        );
      } else {
        kv('No campaigns sent yet', '—');
      }

      // Top opportunities
      heading('Top opportunities', 'Ranked by money at stake');
      if (insights.topOpportunities.length > 0) {
        table(
          ['Priority', 'Opportunity', 'Value'],
          insights.topOpportunities.map((opp) => [opp.priority, opp.detail ? `${opp.title} — ${opp.detail}` : opp.title, opp.value === null ? '—' : moneyLabel(opp.value)]),
          [70, CONTENT_WIDTH - 70 - 100, 100],
          ['left', 'left', 'right'],
        );
      } else {
        kv('Nothing outstanding — nice work', '—');
      }

      // Honest footnotes — the same caveats the cards carry, in one place.
      ensure(60);
      y += 8;
      doc.moveTo(PAGE_MARGIN, y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, y).strokeColor('#e2e8f0').lineWidth(1).stroke();
      y += 8;
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor('#94a3b8')
        .text(
          'Notes: Revenue by service is approximate, grouped from invoice line-item labels rather than a true service catalog. Payment health is age-based, not due-date-based — invoices carry no due date. Marketing shows what was sent and how it delivered; opens, clicks, replies and booked revenue are not tracked anywhere. The funnel is period volume, not a tracked cohort. Outstanding balance is a current snapshot, net of deposits and part-payments, with no period comparison.',
          PAGE_MARGIN,
          y,
          { width: CONTENT_WIDTH, align: 'left' },
        );

      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
