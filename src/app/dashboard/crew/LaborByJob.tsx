'use client';

import { Fragment, useMemo, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import ViewGear, { type ViewOption } from '@/components/view-gear';
import { setCrewOverviewAction, setCrewSkinAction } from '@/app/dashboard/view-actions';
import type { CrewSkin } from '@/lib/dashboard-views';
import {
  DEFAULT_OVERTIME_THRESHOLD,
  PERIOD_MODES,
  QUICK_PERIODS,
  round2,
  splitOvertime,
  startOfWeek,
  toDateKey,
  type JobLaborRow,
  type PayPeriod,
} from '@/lib/labor';
import { hoursLabel, payMoney } from '@/lib/crew-pay';
import { CREW_SKIN_OPTIONS, applyCrewSkin } from './crew-skins';
import OverviewBoard, { overviewOption, type OverviewItem } from './OverviewBoard';
import styles from './crew.module.css';

// Labor by job — where the hours went, and which jobs are eating their quote.
//
// A NOTE ON "quoted labor allowance". A quote in this product is a total (with
// optional add-on lines); it has no separate labor line, so there is no dollar
// allowance to compare against and inventing one would be a made-up number on a
// screen about money. What a job DOES carry is the hours it was estimated at,
// which is the number the owner actually quoted against — so that is the
// allowance here, and variance is in hours. Labor cost is shown beside it in
// dollars, as a share of the quote, which is the real budget question.
//
// THE WORD "QUOTE" MEANT TWO COLUMNS IN ONE CELL, AND THE ROW READ AS A LIE.
// A completed job showed "0 hours · $960 · Not quoted · 1745.45% of quote" and
// every one of those figures was correct. "Not quoted" meant estimated_hours is
// null. "% of quote" meant a percentage OF quoted_amount, which was $55. Two
// different columns, one word, side by side in the same cell — so the row said
// the job had no quote and then measured it against one. The comment directly
// above set the trap out loud (hours are the allowance, dollars are the share)
// and the rendering collapsed both onto "quote" anyway.
//
// The fix is in the words and in the shape. The value names its own column —
// "No hours estimated", "% of the quoted total" — and the hours figures and the
// money figures are now two labelled groups of columns rather than four mixed
// numbers in a row, so the eye never has to work out which allowance a cell
// belongs to. Nothing about the arithmetic changed; it was never wrong.

type EntryRow = {
  id: string;
  jobId: string | null;
  crewId: string | null;
  crewName: string;
  description: string;
  hours: number;
  amount: number;
  loggedAt: string;
};

const JOB_STATUS_LABEL: Record<string, string> = {
  new_lead: 'New request',
  in_progress: 'In progress',
  complete: 'Complete',
  archived: 'Archived',
};

// MONEY IS FORMATTED ONCE FOR THE WHOLE PAGE. This file used to carry its own
// `money` with maximumFractionDigits: 0 while Hours & pay rendered the very same
// entry amounts through payMoney, which keeps cents — so one labor entry read
// "$305" on this tab and "$304.50" on the next tab of the same page, and an
// owner reconciling the two found a difference that does not exist. payMoney is
// pure and client-safe (crew-pay.ts), and it is now the only money formatter
// here.
//
// HOURS ARE FORMATTED ONCE TOO, and in the same words Hours & pay uses:
// hoursLabel gives "23h 30m". The decimal figures this tab used to print (7.75)
// are the same number said a way no contractor says it, and having both on one
// page made two columns look like two different quantities.

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/** "+2h 15m" / "−45m under" — variance has to carry its direction in the value. */
function varianceLabel(hours: number): string {
  if (Math.abs(hours) < 0.005) return 'On the estimate';
  return `${hours > 0 ? '+' : '−'}${hoursLabel(Math.abs(hours))}`;
}

// -- How at risk is this job? -------------------------------------------------
//
// TWO PROBLEMS THAT ARE NOT THE SAME PROBLEM, kept apart because the fix is not
// the same either:
//
//   Over the quoted hours     the job took longer than it was estimated at. It
//                             may still be perfectly profitable. The fix is the
//                             next estimate, or a change order for the extra
//                             time.
//   Labor past the quoted     the wages alone have passed what the client is
//   total                     paying for the whole job. Materials and burden
//                             are on top of that, so this job is losing money
//                             now. The fix is the price, or stopping.
//
// A single "over budget" flag answered both with one word and pointed at
// neither. They are also independent: a job quoted at 4 hours and $200 that
// took 5 hours at $150 of labor is over its hours and nowhere near its total,
// and a job with no estimated hours at all can still eat its quote whole.

type Severity = 'critical' | 'over-cost' | 'over-hours' | 'watch' | 'ok' | 'unmeasured';

/**
 * Where labor stops being comfortable as a share of the quoted total.
 *
 * This is a DISPLAY threshold, not a rule that exists in the data — no account
 * setting says what share of a quote may go on labor. It is set where it is
 * because labor running past ~60% of the price leaves little for materials,
 * burden and profit on almost any job, and the exact percentage is always
 * printed beside the chip, so the owner judges the number rather than trusting
 * the word.
 */
const LABOR_SHARE_WATCH = 60;

const SEVERITY: Record<Severity, { rank: number; label: string; tone: 'ok' | 'warn' | 'alert' | 'muted'; help: string }> = {
  critical: {
    rank: 5,
    label: 'Over on both',
    tone: 'alert',
    help: 'This job is past the hours it was estimated at AND its wages have passed the whole quoted total.',
  },
  'over-cost': {
    rank: 4,
    label: 'Labor past the quoted total',
    tone: 'alert',
    help: 'Wages alone have passed what this job was quoted at. Materials and employer burden are on top of that.',
  },
  'over-hours': {
    rank: 3,
    label: 'Over the quoted hours',
    tone: 'alert',
    help: 'This job took more hours than it was estimated at. That is an estimating or a change-order question, not necessarily a losing job.',
  },
  watch: {
    rank: 2,
    label: 'Labor eating the quote',
    tone: 'warn',
    help: `Wages are past ${LABOR_SHARE_WATCH}% of the quoted total, which leaves little of the price for materials, burden and profit.`,
  },
  ok: {
    rank: 1,
    label: 'Within the quote',
    tone: 'ok',
    help: 'Inside the hours it was estimated at, with labor a reasonable share of the quoted total.',
  },
  unmeasured: {
    rank: 0,
    label: 'Nothing to measure',
    tone: 'muted',
    help: 'This job has no estimated hours and no quoted amount, so there is nothing to compare its labor against.',
  },
};

type RankedJob = {
  row: JobLaborRow;
  severity: Severity;
  /** Actual hours past the job's estimated hours. */
  overHours: boolean;
  /** Wages have passed the job's quoted dollar total. A different question. */
  overQuotedTotal: boolean;
  /**
   * What the hours past the estimate cost, at this job's own average logged
   * rate. Wages only — see the note at the foot of the tab.
   */
  overrunCost: number;
  /** Scheduled hours for this job, when the caller has scheduling data. */
  scheduled: number | null;
};

function rankJob(row: JobLaborRow, scheduled: number | null): RankedJob {
  const overHours = row.overBudget;
  const overQuotedTotal = row.laborShare !== null && row.laborShare >= 100;
  const watching = row.laborShare !== null && row.laborShare >= LABOR_SHARE_WATCH;
  // A job with neither an estimate nor a quoted amount cannot be judged at all,
  // and saying "Within the quote" about it would be an answer we do not have.
  const unmeasured = row.quotedHours === null && row.laborShare === null;
  const severity: Severity =
    overHours && overQuotedTotal
      ? 'critical'
      : overQuotedTotal
        ? 'over-cost'
        : overHours
          ? 'over-hours'
          : watching
            ? 'watch'
            : unmeasured
              ? 'unmeasured'
              : 'ok';
  // Dividing by hours is safe here only because a row exists at all when hours
  // were logged against the job — but an entry can carry 0 hours and a real
  // amount, so the guard stays.
  const overrunCost =
    row.varianceHours !== null && row.varianceHours > 0 && row.hours > 0
      ? round2((row.laborCost / row.hours) * row.varianceHours)
      : 0;
  return { row, severity, overHours, overQuotedTotal, overrunCost, scheduled };
}

// This tab has never had a gear, because it has only ever had one layout. It
// gets one now for a reason that is not about this tab: Overview is the whole
// page's mode, and a mode you can enter from two tabs out of three is one you
// cannot leave from the third.
type LaborView = 'table' | 'overview';

const LABOR_VIEW_OPTIONS: ViewOption<LaborView>[] = [
  { id: 'table', label: 'Table', hint: 'Every job in one list, with its entries underneath' },
  overviewOption<LaborView>('One job open beside the list — all three tabs'),
];

type CrewSortKey = 'hours' | 'cost' | 'jobs' | 'overtime';

export default function LaborByJob({
  rows,
  period,
  crewOptions,
  entries,
  initialSkin,
  initialOverview,
  scheduledHours,
  overtimeThreshold = DEFAULT_OVERTIME_THRESHOLD,
  basePath = '/dashboard/crew',
}: {
  rows: JobLaborRow[];
  period: PayPeriod;
  crewOptions: { id: string; name: string }[];
  entries: EntryRow[];
  initialSkin: CrewSkin;
  /** Whether the whole page is in Overview. */
  initialOverview: boolean;
  basePath?: string;
  /**
   * Scheduled hours per job id, when the page has scheduling data to give.
   *
   * OPTIONAL, AND ABSENT MEANS ABSENT. Scheduled hours are not part of the
   * labor rollup — they come off the schedule, which this tab does not read —
   * so the Scheduled column and the scheduled-vs-actual line only appear when a
   * caller actually supplies them. The alternative was a column of em-dashes
   * implying every job was unscheduled, which is a claim, not a blank.
   */
  scheduledHours?: Record<string, number> | null;
  /** Hours past this in one WEEK are overtime. The account's rule when it has one. */
  overtimeThreshold?: number;
}) {
  const [grouping, setGrouping] = useState<'job' | 'crew'>('job');
  const [statusFilter, setStatusFilter] = useState('all');
  const [crewFilter, setCrewFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [crewSort, setCrewSort] = useState<{ key: CrewSortKey; dir: 'asc' | 'desc' }>({ key: 'cost', dir: 'desc' });
  const [overview, setOverview] = useState(initialOverview);
  const [skin, setSkin] = useState<CrewSkin>(initialSkin);
  const [, startViewSave] = useTransition();

  function pickView(next: LaborView) {
    const on = next === 'overview';
    setOverview(on);
    startViewSave(() => {
      void setCrewOverviewAction(on).catch(() => {});
    });
  }

  // The shell wears the skin, and the page above renders it — so swap the class
  // now and let the cookie catch up. Layout is deliberately untouched.
  function pickSkin(next: CrewSkin) {
    setSkin(next);
    applyCrewSkin(next);
    startViewSave(() => {
      void setCrewSkinAction(next).catch(() => {});
    });
  }

  // THE PERIOD SELECTOR LIVES HERE NOW. It used to live only on Hours & pay,
  // and this tab carried a sentence telling you to go there to change the date
  // range — on the one tab whose whole subject is "what did this period cost
  // per job". The period is a page-level thing held in the URL, so both tabs
  // read the same one and this is genuinely the same control, not a copy with
  // its own state.
  function periodHref(patch: Record<string, string | null>): string {
    const query = new URLSearchParams();
    query.set('tab', 'jobs');
    query.set('period', period.mode);
    if (period.offset) query.set('offset', String(period.offset));
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    return `${basePath}?${query.toString()}`;
  }

  const ranked = useMemo(
    () =>
      rows.map((row) => {
        const value = scheduledHours?.[row.jobId];
        return rankJob(row, typeof value === 'number' && Number.isFinite(value) ? value : null);
      }),
    [rows, scheduledHours],
  );

  // The Scheduled column exists only if SOMETHING is scheduled. A column of
  // em-dashes would read as "none of these jobs was scheduled", which is a
  // claim about the schedule rather than the absence of schedule data.
  const showScheduled = useMemo(() => ranked.some((item) => item.scheduled !== null), [ranked]);

  const visible = useMemo(
    () =>
      ranked
        .filter((item) => {
          const { row } = item;
          if (statusFilter !== 'all' && row.status !== statusFilter) return false;
          if (riskFilter === 'risk' && SEVERITY[item.severity].rank < SEVERITY.watch.rank) return false;
          if (riskFilter === 'over-hours' && !item.overHours) return false;
          if (riskFilter === 'over-cost' && !item.overQuotedTotal) return false;
          if (riskFilter === 'within' && item.severity !== 'ok') return false;
          if (riskFilter === 'unmeasured' && item.severity !== 'unmeasured') return false;
          if (crewFilter !== 'all') {
            const name = crewOptions.find((option) => option.id === crewFilter)?.name;
            if (!name || !row.crewNames.includes(name)) return false;
          }
          return true;
        })
        // MOST AT RISK FIRST, and "at risk" is now a level rather than a
        // boolean: losing money outranks running long, running long outranks
        // eating the quote, and everything measurable outranks a job there is
        // nothing to say about. Inside a level the tie is broken by what the
        // overrun has actually cost, so the biggest hole is the first row.
        .sort((a, b) => {
          const rank = SEVERITY[b.severity].rank - SEVERITY[a.severity].rank;
          if (rank !== 0) return rank;
          if (b.overrunCost !== a.overrunCost) return b.overrunCost - a.overrunCost;
          return b.row.laborCost - a.row.laborCost;
        }),
    [ranked, statusFilter, riskFilter, crewFilter, crewOptions],
  );

  // The same entries, pivoted onto people instead of jobs.
  //
  // Overtime is bucketed by WEEK, the way splitOvertime demands — a person on 45
  // hours one week and 35 the next has five hours of overtime, and a period
  // total of 80 hides that completely.
  const byCrew = useMemo(() => {
    const map = new Map<
      string,
      { name: string; hours: number; cost: number; jobs: Set<string>; hoursByWeek: Map<string, number> }
    >();
    for (const entry of entries) {
      if (crewFilter !== 'all' && entry.crewId !== crewFilter) continue;
      const key = entry.crewId ?? 'unassigned';
      const bucket =
        map.get(key) ?? { name: entry.crewName, hours: 0, cost: 0, jobs: new Set<string>(), hoursByWeek: new Map<string, number>() };
      bucket.hours += entry.hours;
      bucket.cost += entry.amount;
      if (entry.jobId) bucket.jobs.add(entry.jobId);
      const week = toDateKey(startOfWeek(new Date(entry.loggedAt)));
      bucket.hoursByWeek.set(week, (bucket.hoursByWeek.get(week) ?? 0) + entry.hours);
      map.set(key, bucket);
    }
    return [...map.entries()].map(([id, bucket]) => ({
      id,
      name: bucket.name,
      hours: round2(bucket.hours),
      cost: round2(bucket.cost),
      jobCount: bucket.jobs.size,
      overtime: splitOvertime(bucket.hoursByWeek, overtimeThreshold).overtime,
    }));
  }, [entries, crewFilter, overtimeThreshold]);

  const sortedCrew = useMemo(() => {
    const sign = crewSort.dir === 'asc' ? 1 : -1;
    return [...byCrew].sort((a, b) => {
      const value = (row: (typeof byCrew)[number]) =>
        crewSort.key === 'hours' ? row.hours : crewSort.key === 'jobs' ? row.jobCount : crewSort.key === 'overtime' ? row.overtime : row.cost;
      const delta = value(a) - value(b);
      // Names break every tie, so the order is stable and reading down the
      // column twice gives the same table twice.
      return delta !== 0 ? delta * sign : a.name.localeCompare(b.name);
    });
  }, [byCrew, crewSort]);

  // -- The four totals ---------------------------------------------------------
  //
  // They are four DIFFERENT quantities and they are labelled as such: hours the
  // crew logged, dollars those hours cost in wages, hours the jobs were
  // estimated at, and what the overrun has cost. Adding a column of hours to a
  // column of dollars was never the risk; calling both of them "budget" was.
  const totals = useMemo(() => {
    let hours = 0;
    let cost = 0;
    let quotedHours = 0;
    let unquoted = 0;
    let overrun = 0;
    let scheduled = 0;
    let scheduledJobs = 0;
    for (const item of visible) {
      hours += item.row.hours;
      cost += item.row.laborCost;
      if (item.row.quotedHours === null) unquoted += 1;
      else quotedHours += item.row.quotedHours;
      overrun += item.overrunCost;
      if (item.scheduled !== null) {
        scheduled += item.scheduled;
        scheduledJobs += 1;
      }
    }
    return {
      hours: round2(hours),
      cost: round2(cost),
      quotedHours: round2(quotedHours),
      unquoted,
      overrun: round2(overrun),
      scheduled: round2(scheduled),
      scheduledJobs,
      jobs: visible.length,
    };
  }, [visible]);

  const overHoursCount = visible.filter((item) => item.overHours).length;
  const overCostCount = visible.filter((item) => item.overQuotedTotal).length;

  // The entries behind whichever row is open. Without them Overview's pane would
  // be three numbers, and the entries are the reason anybody opens a job on this
  // tab at all. The table's expanded row uses the same function, so the two
  // places that show one job's entries cannot drift apart.
  function entryList(match: (entry: EntryRow) => boolean, foot?: ReactNode) {
    const mine = entries.filter(match);
    if (mine.length === 0) return <p className={styles.entryFoot}>No entries in this period.</p>;
    return (
      <div className={styles.entryList}>
        <div className={styles.entryHead} aria-hidden="true">
          <span>Crew member</span>
          <span>Logged</span>
          <span className={styles.num}>Hours</span>
          <span className={styles.num}>Amount</span>
        </div>
        {mine.map((entry) => (
          <div key={entry.id} className={styles.entryRow} data-cols="4">
            <span>
              <strong>{entry.crewName}</strong>
              <small>{entry.description}</small>
            </span>
            <span>{new Date(entry.loggedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
            <span className={styles.num}>{hoursLabel(entry.hours)}</span>
            <span className={styles.num}>{payMoney(entry.amount)}</span>
          </div>
        ))}
        {foot}
      </div>
    );
  }

  // Overview follows the grouping toggle rather than ignoring it: "by job" and
  // "by crew member" are two different questions, and answering only the first
  // would make picking a style quietly throw the second one away.
  const overviewItems: OverviewItem[] =
    grouping === 'crew'
      ? sortedCrew.map((row) => ({
          id: row.id,
          initials: initialsOf(row.name),
          name: row.name,
          sub: `${row.jobCount} ${row.jobCount === 1 ? 'job' : 'jobs'} this period`,
          amount: payMoney(row.cost),
          headline: `${hoursLabel(row.hours)} across ${row.jobCount} ${row.jobCount === 1 ? 'job' : 'jobs'}.`,
          stats: [
            { label: 'Jobs', value: row.jobCount },
            { label: 'Labor hours', value: hoursLabel(row.hours) },
            { label: 'Labor cost', value: payMoney(row.cost), title: 'Wages only. Employer burden is not in this figure.' },
          ],
          note:
            row.overtime > 0 ? (
              <span className={styles.dim}>
                {hoursLabel(row.overtime)} of that is past {overtimeThreshold} hours in a single week.
              </span>
            ) : null,
          detail: entryList((entry) => (entry.crewId ?? 'unassigned') === row.id),
          actions:
            row.id === 'unassigned' ? null : (
              <Link href={`/dashboard/crew?tab=timecards&crew=${row.id}`} className="btn primary">
                View timecards
              </Link>
            ),
        }))
      : visible.map((item) => ({
          id: item.row.jobId,
          initials: initialsOf(item.row.clientName),
          name: `${item.row.ref} · ${item.row.clientName}`,
          sub: JOB_STATUS_LABEL[item.row.status] ?? item.row.status,
          amount: payMoney(item.row.laborCost),
          amountTitle: 'Labor cost, in wages. Employer burden is not in this figure.',
          badge: { label: SEVERITY[item.severity].label, tone: SEVERITY[item.severity].tone, title: SEVERITY[item.severity].help },
          headline: item.row.crewNames.length > 0 ? item.row.crewNames.join(', ') : 'Nobody assigned to this job.',
          stats: [
            { label: 'Actual labor hours', value: hoursLabel(item.row.hours) },
            {
              label: 'Quoted hours',
              value: item.row.quotedHours === null ? 'No hours estimated' : hoursLabel(item.row.quotedHours),
              title: 'The hours this job was estimated at. A quote in this product has no separate labor line, so its estimated hours are the allowance.',
            },
            {
              label: 'Variance',
              value:
                item.row.varianceHours === null ? (
                  '—'
                ) : (
                  <span className={item.overHours ? styles.varianceOver : styles.varianceOk}>{varianceLabel(item.row.varianceHours)}</span>
                ),
            },
          ],
          note: (
            <span className={styles.dim}>
              {item.row.laborShare !== null
                ? `${payMoney(item.row.laborCost)} of labor — ${item.row.laborShare}% of the quoted total of ${payMoney(item.row.quotedAmount)}.`
                : `${payMoney(item.row.laborCost)} of labor. This job has no quoted amount to measure it against.`}
              {item.scheduled !== null ? ` Scheduled for ${hoursLabel(item.scheduled)}.` : ''}
            </span>
          ),
          detail: entryList((entry) => entry.jobId === item.row.jobId),
          actions: (
            <Link href={`/dashboard/jobs/${item.row.jobId}`} className="btn primary">
              Open {item.row.ref}
            </Link>
          ),
        }));

  const riskNote =
    overHoursCount > 0 || overCostCount > 0 ? (
      <p className={styles.overNote}>
        {overCostCount > 0 ? (
          <>
            {overCostCount} {overCostCount === 1 ? 'job has' : 'jobs have'} spent more on wages than the whole quoted total.{' '}
          </>
        ) : null}
        {overHoursCount > 0 ? (
          <>
            {overHoursCount} {overHoursCount === 1 ? 'job is' : 'jobs are'} past the hours {overHoursCount === 1 ? 'it was' : 'they were'} estimated at.
          </>
        ) : null}
      </p>
    ) : null;

  // The caveat that keeps the word "labor cost" honest across two screens. It
  // is not a disclaimer for its own sake: the job's own page adds employer
  // burden (jobs.ts sums amount + burden_amount for margin) and this tab does
  // not, so the same job's labor is DELIBERATELY smaller here. Both figures are
  // right; calling both of them "labor cost" without saying which is which is
  // what sends someone looking for a bug.
  const costCaveat = (
    <p className={styles.hpNote}>
      <strong>Labor cost here is wages only</strong> — the sum of what the crew earned, the same figure Hours &amp; pay pays out. The job&apos;s own
      page adds employer burden on top when it works out margin, so the same job&apos;s labor is smaller on this tab than on its page. This tab
      answers &ldquo;what did I pay the crew&rdquo;; the job page answers &ldquo;what did this job cost me&rdquo;.
    </p>
  );

  return (
    <>
      <div className={styles.hpHead}>
        <div>
          <h2 className={styles.hpTitle}>Labor by job</h2>
          <p className={styles.hpLead}>
            What each job cost in crew time this period, against the hours it was estimated at and the total it was quoted for.
          </p>
        </div>
        <div className={styles.groupToggle} role="group" aria-label="Group by">
          <button type="button" className={grouping === 'job' ? styles.groupOn : undefined} onClick={() => setGrouping('job')}>
            By job
          </button>
          <button type="button" className={grouping === 'crew' ? styles.groupOn : undefined} onClick={() => setGrouping('crew')}>
            By crew member
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <label className={styles.filter}>
            <span>Job status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All</option>
              {Object.entries(JOB_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className={styles.filter}>
            <span>Crew member</span>
            <select value={crewFilter} onChange={(event) => setCrewFilter(event.target.value)}>
              <option value="all">Anyone</option>
              {crewOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          {/* Was one "Budget" select whose two options meant hours. Risk is two
              questions now, because over the hours and over the money are two
              different jobs to go and fix. */}
          <label className={styles.filter}>
            <span>Risk</span>
            <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
              <option value="all">All jobs</option>
              <option value="risk">Anything at risk</option>
              <option value="over-hours">Over the quoted hours</option>
              <option value="over-cost">Labor past the quoted total</option>
              <option value="within">Within the quote</option>
              <option value="unmeasured">Nothing to measure</option>
            </select>
          </label>

          {/* The same gear the other two tabs carry, in the same place. Until
              now this tab was the one place on the page you could not change
              how it looked. */}
          <div className={styles.filterGear}>
            <ViewGear
              views={LABOR_VIEW_OPTIONS}
              activeView={overview ? 'overview' : 'table'}
              onPickView={pickView}
              skins={CREW_SKIN_OPTIONS}
              activeSkin={skin}
              onPickSkin={pickSkin}
              label="View"
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <h3>No labor logged in this period</h3>
          <p>Once crew log hours against a job, this is where you&apos;ll see what it cost you against what you quoted.</p>
          <Link href="/dashboard/crew?tab=timecards" className="btn secondary">Go to Timecards</Link>
        </div>
      ) : (
        <>
          {grouping === 'job' ? (
            <div className={styles.periodStats}>
              <div className={styles.periodStat}>
                <small>Actual labor hours</small>
                <strong>{hoursLabel(totals.hours)}</strong>
                <em>
                  across {totals.jobs} {totals.jobs === 1 ? 'job' : 'jobs'}
                  {showScheduled && totals.scheduledJobs > 0 ? ` · ${hoursLabel(totals.scheduled)} scheduled` : ''}
                </em>
              </div>
              <div className={styles.periodStat} data-tone="pay">
                <small>Labor cost</small>
                <strong>{payMoney(totals.cost)}</strong>
                <em>wages only, no burden</em>
              </div>
              <div className={styles.periodStat} title="The hours these jobs were estimated at. A quote here has no separate labor line, so estimated hours are the allowance.">
                <small>Quoted allowance</small>
                <strong>{hoursLabel(totals.quotedHours)}</strong>
                <em>{totals.unquoted > 0 ? `${totals.unquoted} of these ${totals.unquoted === 1 ? 'jobs has' : 'jobs have'} no estimate` : 'every job estimated'}</em>
              </div>
              {/* Projected margin impact, stated as what it IS: the wages spent
                  on hours past the estimate, priced at each job's own average
                  logged rate. It is not a margin calculation — burden and
                  materials are not in it — which is why it is labelled as the
                  cost of the overrun rather than as lost profit. */}
              <div
                className={styles.periodStat}
                data-tone={totals.overrun > 0 ? 'alert' : 'ok'}
                title="Wages spent on the hours past each job's estimate, at that job's own average logged rate. Wages only — the job page's margin also carries employer burden and materials."
              >
                <small>Margin impact</small>
                <strong>{totals.overrun > 0 ? `−${payMoney(totals.overrun)}` : payMoney(0)}</strong>
                <em>cost of hours past the estimate</em>
              </div>
            </div>
          ) : null}

          {overview ? (
            <>
              {grouping === 'job' ? riskNote : null}
              <OverviewBoard
                items={overviewItems}
                listLabel={grouping === 'crew' ? 'Crew members' : 'Jobs'}
                empty={grouping === 'crew' ? 'Nobody logged hours in this period.' : 'No jobs match those filters.'}
              />
              {costCaveat}
            </>
          ) : grouping === 'crew' ? (
            <>
              <div className={styles.tableWrap}>
                <table className={styles.hoursTable}>
                  <caption className="sr-only">Labor entries by crew member</caption>
                  <thead>
                    <tr>
                      <th>Crew member</th>
                      <CrewSortHeader label="Jobs" sortKey="jobs" sort={crewSort} onSort={setCrewSort} />
                      <CrewSortHeader label="Labor hours" sortKey="hours" sort={crewSort} onSort={setCrewSort} />
                      <CrewSortHeader
                        label="Overtime"
                        sortKey="overtime"
                        sort={crewSort}
                        onSort={setCrewSort}
                        title={`Hours past ${overtimeThreshold} in any single week of this period. Hours & pay is the record — weeks are cut there in your account's timezone.`}
                      />
                      <CrewSortHeader label="Labor cost" sortKey="cost" sort={crewSort} onSort={setCrewSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCrew.map((row) => (
                      <tr key={row.id}>
                        <td><strong>{row.name}</strong></td>
                        <td className={styles.num}>{row.jobCount}</td>
                        <td className={styles.num}>{hoursLabel(row.hours)}</td>
                        <td className={`${styles.num}${row.overtime > 0 ? ` ${styles.otCell}` : ''}`}>
                          {row.overtime > 0 ? hoursLabel(row.overtime) : '—'}
                        </td>
                        <td className={`${styles.num} ${styles.payCell}`}>{payMoney(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {costCaveat}
            </>
          ) : (
            <>
              {riskNote}
              <div className={styles.tableWrap}>
                <table className={styles.hoursTable}>
                  <caption className="sr-only">Labor entries by job</caption>
                  {/* TWO HEADER ROWS, because the four figures in this table are
                      two different quantities. Hours in one group, money in the
                      other, each column naming which allowance it measures
                      against — so no cell has to be read twice to work out
                      whether "quote" meant hours or dollars. */}
                  <thead>
                    <tr>
                      <th rowSpan={2}>Job</th>
                      <th rowSpan={2}>Crew</th>
                      <th className={styles.num} colSpan={showScheduled ? 4 : 3} scope="colgroup">
                        Hours
                      </th>
                      <th className={styles.num} colSpan={2} scope="colgroup">
                        Cost
                      </th>
                    </tr>
                    <tr>
                      <th className={styles.num} scope="col">Actual</th>
                      {showScheduled ? (
                        <th className={styles.num} scope="col" title="Hours this job was scheduled for. Scheduling, not estimating — the quoted hours are the next column.">
                          Scheduled
                        </th>
                      ) : null}
                      <th className={styles.num} scope="col" title="The hours this job was estimated at. A quote in this product has no separate labor line, so its estimated hours are the allowance.">
                        Quoted hours
                      </th>
                      <th className={styles.num} scope="col">Variance</th>
                      <th className={styles.num} scope="col" title="Wages logged against this job. Employer burden is not in this figure.">
                        Labor cost
                      </th>
                      <th className={styles.num} scope="col" title="Labor cost as a share of the job's quoted DOLLAR total — a different column from the quoted hours beside it.">
                        % of the quoted total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((item) => {
                      const { row } = item;
                      const open = openJob === row.jobId;
                      const detailId = `labor-breakdown-${row.jobId}`;
                      const severity = SEVERITY[item.severity];
                      return (
                        <Fragment key={row.jobId}>
                          <tr
                            className={`${styles.hoursRow}${item.overHours || item.overQuotedTotal ? ` ${styles.overRow}` : ''}${open ? ` ${styles.hoursRowOn}` : ''}`}
                            onClick={() => setOpenJob(open ? null : row.jobId)}
                          >
                            <td>
                              {/* The job name is a LINK to the job, which is
                                  where anyone reading this row wants to go
                                  next; it used to be the label of a disclosure
                                  triangle and the only way through was the tiny
                                  arrow at the bottom of the expanded panel.
                                  stopPropagation so following the link doesn't
                                  also toggle the row underneath it. */}
                              <Link
                                href={`/dashboard/jobs/${row.jobId}`}
                                className={styles.tableName}
                                onClick={(event) => event.stopPropagation()}
                              >
                                <strong>{row.ref} · {row.clientName}</strong>
                              </Link>
                              <small className={styles.paySub}>{JOB_STATUS_LABEL[row.status] ?? row.status}</small>
                              {item.severity === 'ok' || item.severity === 'unmeasured' ? null : (
                                <span className={styles.flagChips}>
                                  <span
                                    className={styles.flagChip}
                                    data-severity={severity.tone === 'alert' ? 'block' : undefined}
                                    title={severity.help}
                                  >
                                    {severity.label}
                                  </span>
                                </span>
                              )}
                              {/* A real button with real button semantics. The
                                  triangle it replaces was a glyph with no name:
                                  a screen reader read "▸" and a keyboard user
                                  had nothing to press, because the only thing
                                  that opened the panel was a click on the row. */}
                              <button
                                type="button"
                                className={styles.expandBtn}
                                aria-expanded={open}
                                aria-controls={detailId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenJob(open ? null : row.jobId);
                                }}
                              >
                                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                                <span>{open ? 'Hide breakdown' : 'View breakdown'}</span>
                              </button>
                            </td>
                            <td className={styles.crewCell}>
                              {row.crewNames.length > 0 ? row.crewNames.join(', ') : <span className={styles.dim}>Unassigned</span>}
                            </td>
                            <td className={styles.num}>{hoursLabel(row.hours)}</td>
                            {showScheduled ? (
                              <td className={styles.num}>
                                {item.scheduled === null ? <span className={styles.dim}>Not scheduled</span> : hoursLabel(item.scheduled)}
                              </td>
                            ) : null}
                            <td className={styles.num}>
                              {row.quotedHours === null ? (
                                <span className={styles.dim} title="This job carries no estimated hours, so there is nothing to compare its hours against.">
                                  No hours estimated
                                </span>
                              ) : (
                                hoursLabel(row.quotedHours)
                              )}
                            </td>
                            <td className={styles.num}>
                              {row.varianceHours === null ? (
                                '—'
                              ) : (
                                <span className={item.overHours ? styles.varianceOver : styles.varianceOk}>{varianceLabel(row.varianceHours)}</span>
                              )}
                            </td>
                            <td className={`${styles.num} ${styles.payCell}`}>{payMoney(row.laborCost)}</td>
                            <td className={styles.num}>
                              {row.laborShare === null ? (
                                <span className={styles.dim} title="This job has no quoted amount, so labor cost has no total to be a share of.">
                                  No quoted total
                                </span>
                              ) : (
                                <span className={item.overQuotedTotal ? styles.varianceOver : undefined} title={`${payMoney(row.laborCost)} of wages against a quoted total of ${payMoney(row.quotedAmount)}.`}>
                                  {row.laborShare}%
                                </span>
                              )}
                            </td>
                          </tr>
                          {open ? (
                            <tr className={styles.detailRow} id={detailId}>
                              <td colSpan={showScheduled ? 8 : 7}>
                                {entryList(
                                  (entry) => entry.jobId === row.jobId,
                                  <p className={styles.entryFoot}>
                                    <Link href={`/dashboard/jobs/${row.jobId}`}>Open {row.ref} →</Link>
                                  </p>,
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visible.length === 0 ? <p className="empty-state">No jobs match those filters.</p> : null}
              {costCaveat}
            </>
          )}
        </>
      )}
    </>
  );
}

/**
 * One sortable column header for the By crew member table.
 *
 * Same shape as the Hours & pay table's: aria-sort on the th so a screen reader
 * announces the order, a real button inside so it can be reached and pressed,
 * and the arrow purely decorative.
 */
function CrewSortHeader({
  label,
  sortKey,
  sort,
  onSort,
  title,
}: {
  label: string;
  sortKey: CrewSortKey;
  sort: { key: CrewSortKey; dir: 'asc' | 'desc' };
  onSort: (next: { key: CrewSortKey; dir: 'asc' | 'desc' }) => void;
  title?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th className={styles.num} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} title={title}>
      <button
        type="button"
        className={styles.sortBtn}
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === 'desc' ? 'asc' : 'desc' })}
      >
        {label}
        <span aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
      </button>
    </th>
  );
}
