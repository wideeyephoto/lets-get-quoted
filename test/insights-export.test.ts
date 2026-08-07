import { describe, it, expect } from 'vitest';
import { buildInsightsCsv, buildInsightsPdf } from '@/lib/insights-export';
import type { Insights } from '@/lib/insights';

// The exporters read only the second-generation dashboard fields, so the fixture
// supplies exactly those (cast through unknown rather than hand-building the ~40
// legacy Insights fields the report never touches). Every number here is chosen
// so the expected CSV lines below are exact — no fabricated or rounded surprises.
function makeInsights(): Insights {
  return {
    period: { key: '30', label: 'Last 30 days', sentenceLabel: 'in the last 30 days', fromMs: 0, toMs: 0, days: 30, custom: false },
    kpis: {
      grossRevenue: { key: 'grossRevenue', label: 'Gross Revenue', value: 4500, format: 'money', delta: { pct: 12, direction: 'up' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
      netCollected: { key: 'netCollected', label: 'Net Collected', value: 3800.5, format: 'money', delta: { pct: -8, direction: 'down' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
      jobsCompleted: { key: 'jobsCompleted', label: 'Jobs Completed', value: 12, format: 'count', delta: { pct: null, direction: 'up' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
      quoteConversion: { key: 'quoteConversion', label: 'Quote Conversion', value: 45, format: 'percent', delta: { pct: 5, direction: 'up' }, deltaUnit: 'pp', upIsGood: true, spark: [], hint: '' },
      outstandingBalance: { key: 'outstandingBalance', label: 'Outstanding Balance', value: 2300, format: 'money', delta: null, deltaUnit: '%', upIsGood: false, spark: [], hint: '', note: '3 unpaid invoices · current total, not a period change' },
      newCustomers: { key: 'newCustomers', label: 'New Customers', value: 5, format: 'count', delta: { pct: 0, direction: 'flat' }, deltaUnit: '%', upIsGood: true, spark: [], hint: '' },
    },
    revenueTrend: {
      grouping: 'day',
      points: [
        { key: 'a', label: 'Aug 1', current: 100, previous: 80 },
        { key: 'b', label: 'Aug 2', current: 200.25, previous: 0 },
      ],
      total: 300.25,
      previousTotal: 80,
      hasData: true,
    },
    salesActivity: {
      stages: [
        { key: 'leads', label: 'Leads', count: 10 },
        { key: 'quotes_sent', label: 'Quotes sent', count: 8 },
        { key: 'jobs_paid', label: 'Jobs paid', count: 2 },
      ],
    },
    scheduleUtilization: { configured: true, lookaheadDays: 21, workingDays: 15, bookedDays: 9, openDays: 6, utilizationPct: 60, estimatedOpportunity: 3000, avgJobValue: 500 },
    paymentHealth: { overdueBalance: 1200, overdueCount: 2, avgDaysToCollect: 9, failedPayments: 1 },
    customerInsights: { totalClients: 40, repeatClients: 12, repeatRatePct: 30, inactiveClients: 5, inactiveThresholdDays: 90, activeMaintenancePlans: 3, maintenanceMonthly: 450 },
    revenueByService: {
      slices: [
        { label: 'Lawn mowing', amount: 2000, pct: 50, count: 8 },
        { label: 'Other', amount: 2000, pct: 50, count: 4 },
      ],
      total: 4000,
      approximate: true,
      hasData: true,
    },
    marketingPerformance: {
      campaigns: [{ id: 'c1', channel: 'both', audience: 'all', sentAt: '2026-07-15T10:00:00.000Z', recipients: 120, emailSent: 100, smsSent: 20, failed: 2, skipped: 1 }],
      totalRecipients: 120,
      hasData: true,
      tracksEngagement: false,
      tracksRevenue: false,
    },
    topOpportunities: [
      { id: 'collect-outstanding', icon: 'unpaid-invoices', title: 'Collect $2,300 in unpaid invoices', detail: '2 of them are 30+ days old ($1,200).', value: 2300, count: 3, priority: 'high', href: '/dashboard/jobs', cta: 'Open jobs' },
    ],
  } as unknown as Insights;
}

const META = { businessName: 'Green Thumb', generatedLabel: 'August 6, 2026' };

describe('buildInsightsCsv', () => {
  const csv = buildInsightsCsv(makeInsights(), META);
  const lines = csv.split('\n');

  it('opens with a titled header, and quotes the comma in the generated date', () => {
    expect(lines[0]).toBe('Green Thumb — Business Performance');
    expect(lines).toContain('Period,Last 30 days');
    expect(lines).toContain('Generated,"August 6, 2026"');
  });

  it('renders each KPI with value, unit, signed change and note', () => {
    expect(lines).toContain('Metric,Value,Unit,Change vs previous period,Note');
    expect(lines).toContain('Gross Revenue,4500.00,$,+12%,');
    expect(lines).toContain('Net Collected,3800.50,$,-8%,');
    expect(lines).toContain('Jobs Completed,12,count,—,'); // no prior period → em-dash
    expect(lines).toContain('Quote Conversion,45,%,+5pp,'); // points, not percent-change
    expect(lines).toContain('New Customers,5,count,0%,'); // flat
    // A point-in-time balance: no delta, and its comma-bearing note gets quoted.
    expect(lines).toContain('Outstanding Balance,2300.00,$,—,"3 unpaid invoices · current total, not a period change"');
  });

  it('renders the revenue trend with this/previous and a total', () => {
    expect(lines).toContain('Period,Collected,Previous period');
    expect(lines).toContain('Aug 1,100.00,80.00');
    expect(lines).toContain('Aug 2,200.25,0.00');
    expect(lines).toContain('Total,300.25,80.00');
  });

  it('exports sales activity as counts, with no conversion column', () => {
    // The export used to carry a "% of previous stage" column and an overall
    // lead → paid. A spreadsheet outlives the caption that disclaimed them, so
    // the numbers that could not survive being read alone are gone.
    expect(lines).toContain('Leads,10');
    expect(lines).toContain('Quotes sent,8');
    expect(lines.some((line) => line.includes('% of previous'))).toBe(false);
    expect(lines.some((line) => line.startsWith('Overall lead'))).toBe(false);
  });

  it('renders marketing with human channel/audience labels and a UTC date', () => {
    expect(lines).toContain('Sent on,Channel,Audience,Recipients,Emails sent,Texts sent,Failed,Skipped');
    expect(lines).toContain('2026-07-15,Email + text,Everyone,120,100,20,2,1');
  });

  it('renders opportunities, quoting titles/details that contain commas', () => {
    expect(lines).toContain('high,"Collect $2,300 in unpaid invoices","2 of them are 30+ days old ($1,200).",2300.00,3');
  });
});

describe('buildInsightsPdf', () => {
  it('returns a non-empty PDF buffer', async () => {
    const pdf = await buildInsightsPdf(makeInsights(), META);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(800);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
