import Link from 'next/link';
import { formatMoney } from '@/lib/jobs';
import {
  PAYROLL_PERIODS,
  resolvePayrollRange,
  summarizePayrollCosts,
  type PayrollCostRow,
  type PayrollPeriod,
} from '@/lib/payroll';
import type { CrewMember } from '@/lib/crew';
import { DEMO_CREW } from '@/lib/demo-data';
import { APP_SIGNUP_URL } from '@/components/marketing/links';

export const metadata = { title: 'Payroll — Live Demo' };

export const dynamic = 'force-dynamic';

// Fictional hours logged by each active crew member, scaled by pay period.
// Amount is hours × the member's hourly rate — exactly what the real field app
// stores as each labor entry's cost.
type CrewHoursEntry = { jobId: string; hours: number };
const BASE_HOURS: Record<string, CrewHoursEntry[]> = {
  'crew-1': [ // Mike Torres — Crew Lead
    { jobId: 'job-9', hours: 24 },
    { jobId: 'job-10', hours: 18 },
  ],
  'crew-2': [ // Jamal Reed — Landscaper
    { jobId: 'job-9', hours: 16 },
    { jobId: 'job-11', hours: 24 },
  ],
  'crew-3': [ // Sam Whitaker — Mow Technician
    { jobId: 'job-10', hours: 20 },
    { jobId: 'job-11', hours: 18 },
  ],
  'crew-4': [ // Elena Ruiz — Operations Manager
    { jobId: 'job-9', hours: 12 },
    { jobId: 'job-10', hours: 10 },
  ],
};

const PERIOD_MULTIPLIERS: Record<PayrollPeriod, number> = {
  'this-week': 1.0,
  'last-week': 0.95,
  'this-month': 3.8,
  'last-month': 4.1,
};

function buildDemoCostRows(crew: CrewMember[], period: PayrollPeriod): PayrollCostRow[] {
  const mult = PERIOD_MULTIPLIERS[period] ?? 1.0;
  const rows: PayrollCostRow[] = [];
  for (const member of crew) {
    for (const entry of BASE_HOURS[member.id] ?? []) {
      const scaledHours = Math.round(entry.hours * mult);
      rows.push({
        crew_id: member.id,
        crew_name: member.name,
        crew_role_label: member.role_label,
        hours: scaledHours,
        amount: scaledHours * member.hourly_rate,
        job_id: entry.jobId,
      });
    }
  }
  return rows;
}

function rangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(new Date(endIso).getTime() - 1); // inclusive end for display
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

export default async function DemoPayrollPage({
  searchParams: searchParamsPromise,
}: {
  searchParams?: Promise<{ period?: string }>;
}) {
  const searchParams = (await searchParamsPromise) || {};
  const validPeriods = PAYROLL_PERIODS.map((p) => p.id);
  const period: PayrollPeriod = (validPeriods.includes(searchParams?.period as PayrollPeriod)
    ? searchParams?.period
    : 'this-week') as PayrollPeriod;

  const activeCrew = DEMO_CREW.filter((member) => member.active);
  const { rows, totalHours, totalPay } = summarizePayrollCosts(buildDemoCostRows(activeCrew, period));
  const { startIso, endIso, label } = resolvePayrollRange(period);

  return (
    <main className="wide-shell workspace-shell">
      <section className="workspace-hero panel">
        <div className="workspace-hero-copy">
          <p className="eyebrow">Crew &amp; Labor</p>
          <h1 className="workspace-title">Hours &amp; pay</h1>
          <p className="workspace-lead">
            Hours your crew logs from the field (and any labor you add to a job) roll up here by pay period — so you
            know what to pay, and can export it in a tap. A rollup to pay from, not a payroll run: no tax is
            calculated or withheld.
          </p>
        </div>
      </section>

      <section className="panel workspace-section-card">
        <div className="section-heading workspace-section-heading compact-heading rebook-heading">
          <div className="status-tabs workspace-status-tabs" role="tablist" aria-label="Pay period selection">
            {PAYROLL_PERIODS.map((option) => (
              <Link
                key={option.id}
                href={`/demo/payroll?period=${option.id}`}
                className={`status-tab${option.id === period ? ' active' : ''}`}
                role="tab"
                aria-selected={option.id === period}
              >
                {option.label}
              </Link>
            ))}
          </div>
          <button type="button" className="btn ghost" disabled>
            Export CSV
          </button>
        </div>
        <p className="payroll-range">{label} · {rangeLabel(startIso, endIso)}</p>

        <div className="payroll-table" role="table">
          <div className="payroll-row payroll-head" role="row">
            <span role="columnheader">Crew member</span>
            <span role="columnheader" className="payroll-num">Hours</span>
            <span role="columnheader" className="payroll-num">Jobs</span>
            <span role="columnheader" className="payroll-num">Pay</span>
          </div>
          {rows.map((row) => (
            <div className="payroll-row" role="row" key={row.crewId ?? 'unassigned'}>
              <span role="cell">
                <strong>{row.name}</strong>
                {row.roleLabel ? <span className="payroll-role">{row.roleLabel}</span> : null}
              </span>
              <span role="cell" className="payroll-num">{row.hours}</span>
              <span role="cell" className="payroll-num">{row.jobCount}</span>
              <span role="cell" className="payroll-num payroll-pay">{formatMoney(row.pay)}</span>
            </div>
          ))}
          <div className="payroll-row payroll-total" role="row">
            <span role="cell">Total</span>
            <span role="cell" className="payroll-num">{totalHours}</span>
            <span role="cell" className="payroll-num" aria-hidden="true"></span>
            <span role="cell" className="payroll-num payroll-pay">{formatMoney(totalPay)}</span>
          </div>
        </div>
        <p className="payroll-note">Pay is each labor entry&apos;s hours × rate at the time it was logged. Grouped by when it was logged.</p>
      </section>

      <section className="panel workspace-section-card demo-locked-card">
        <div className="section-heading workspace-section-heading">
          <p className="eyebrow">Try it yourself</p>
          <h2>Track your own crew hours</h2>
        </div>
        <p className="workspace-card-copy">
          Your crew logs hours from the field, and every pay period totals up here ready to export — this demo account
          is read-only.
        </p>
        <a href={APP_SIGNUP_URL} className="btn primary">
          Build my free site
        </a>
      </section>
    </main>
  );
}
