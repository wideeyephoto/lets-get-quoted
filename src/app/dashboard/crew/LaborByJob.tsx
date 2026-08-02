'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import ViewGear, { type ViewOption } from '@/components/view-gear';
import { setCrewOverviewAction, setCrewSkinAction } from '@/app/dashboard/view-actions';
import type { CrewSkin } from '@/lib/dashboard-views';
import type { JobLaborRow, PayPeriod } from '@/lib/labor';
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

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
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

export default function LaborByJob({
  rows,
  period,
  crewOptions,
  entries,
  initialSkin,
  initialOverview,
}: {
  rows: JobLaborRow[];
  period: PayPeriod;
  crewOptions: { id: string; name: string }[];
  entries: EntryRow[];
  initialSkin: CrewSkin;
  /** Whether the whole page is in Overview. */
  initialOverview: boolean;
}) {
  const [grouping, setGrouping] = useState<'job' | 'crew'>('job');
  const [statusFilter, setStatusFilter] = useState('all');
  const [crewFilter, setCrewFilter] = useState('all');
  const [budgetFilter, setBudgetFilter] = useState('all');
  const [openJob, setOpenJob] = useState<string | null>(null);
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

  const visible = useMemo(
    () =>
      rows.filter((row) => {
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (budgetFilter === 'over' && !row.overBudget) return false;
        if (budgetFilter === 'within' && row.overBudget) return false;
        if (crewFilter !== 'all') {
          const name = crewOptions.find((option) => option.id === crewFilter)?.name;
          if (!name || !row.crewNames.includes(name)) return false;
        }
        return true;
      }),
    [rows, statusFilter, budgetFilter, crewFilter, crewOptions],
  );

  // The same entries, pivoted onto people instead of jobs.
  const byCrew = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; cost: number; jobs: Set<string> }>();
    for (const entry of entries) {
      if (crewFilter !== 'all' && entry.crewId !== crewFilter) continue;
      const key = entry.crewId ?? 'unassigned';
      const bucket = map.get(key) ?? { name: entry.crewName, hours: 0, cost: 0, jobs: new Set<string>() };
      bucket.hours += entry.hours;
      bucket.cost += entry.amount;
      if (entry.jobId) bucket.jobs.add(entry.jobId);
      map.set(key, bucket);
    }
    return [...map.entries()]
      .map(([id, bucket]) => ({
        id,
        name: bucket.name,
        hours: Math.round(bucket.hours * 100) / 100,
        cost: Math.round(bucket.cost * 100) / 100,
        jobCount: bucket.jobs.size,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [entries, crewFilter]);

  const overCount = rows.filter((row) => row.overBudget).length;

  // The entries behind whichever row is open, as the pane's block. Without them
  // Overview's pane would be three numbers, and the entries are the reason
  // anybody opens a job on this tab at all.
  function entryList(match: (entry: EntryRow) => boolean) {
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
            <span className={styles.num}>{Math.round(entry.hours * 100) / 100}</span>
            <span className={styles.num}>{money(entry.amount)}</span>
          </div>
        ))}
      </div>
    );
  }

  // Overview follows the grouping toggle rather than ignoring it: "by job" and
  // "by crew member" are two different questions, and answering only the first
  // would make picking a style quietly throw the second one away.
  const overviewItems: OverviewItem[] =
    grouping === 'crew'
      ? byCrew.map((row) => ({
          id: row.id,
          initials: initialsOf(row.name),
          name: row.name,
          sub: `${row.jobCount} ${row.jobCount === 1 ? 'job' : 'jobs'} this period`,
          amount: money(row.cost),
          headline: `${row.hours} labor hours across ${row.jobCount} ${row.jobCount === 1 ? 'job' : 'jobs'}.`,
          stats: [
            { label: 'Jobs', value: row.jobCount },
            { label: 'Labor hours', value: row.hours },
            { label: 'Labor cost', value: money(row.cost) },
          ],
          detail: entryList((entry) => (entry.crewId ?? 'unassigned') === row.id),
          actions:
            row.id === 'unassigned' ? null : (
              <Link href={`/dashboard/crew?tab=hours&crew=${row.id}`} className="btn primary">
                View hours &amp; pay
              </Link>
            ),
        }))
      : visible.map((row) => ({
          id: row.jobId,
          initials: initialsOf(row.clientName),
          name: `${row.ref} · ${row.clientName}`,
          sub: JOB_STATUS_LABEL[row.status] ?? row.status,
          amount: money(row.laborCost),
          badge: row.overBudget
            ? { label: 'Over the quoted hours', tone: 'alert' as const }
            : row.quotedHours === null
              ? { label: 'Not quoted', tone: 'muted' as const, title: "No estimated hours on this job, so there's nothing to compare against." }
              : { label: 'Within the quote', tone: 'ok' as const },
          headline: row.crewNames.length > 0 ? row.crewNames.join(', ') : 'Nobody assigned to this job.',
          stats: [
            { label: 'Labor hours', value: row.hours },
            {
              label: 'Quoted hours',
              value: row.quotedHours ?? '—',
              title: 'The hours this job was estimated at. A quote in this product has no separate labor line, so its estimated hours are the allowance.',
            },
            {
              label: 'Variance',
              value:
                row.varianceHours === null ? (
                  '—'
                ) : (
                  <span className={row.overBudget ? styles.varianceOver : styles.varianceOk}>
                    {row.varianceHours > 0 ? '+' : ''}
                    {row.varianceHours}
                  </span>
                ),
            },
          ],
          note:
            row.laborShare !== null ? (
              <span className={styles.dim}>
                {money(row.laborCost)} of labor — {row.laborShare}% of what this job was quoted at.
              </span>
            ) : (
              <span className={styles.dim}>{money(row.laborCost)} of labor. This job has no quoted amount to measure it against.</span>
            ),
          detail: entryList((entry) => entry.jobId === row.jobId),
          actions: (
            <Link href={`/dashboard/jobs/${row.jobId}`} className="btn primary">
              Open {row.ref}
            </Link>
          ),
        }));

  return (
    <>
      <div className={styles.hpHead}>
        <div>
          <h2 className={styles.hpTitle}>Labor by job</h2>
          <p className={styles.hpLead}>
            What each job cost in crew time this period, against the hours it was quoted for.
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
          <label className={styles.filter}>
            <span>Budget</span>
            <select value={budgetFilter} onChange={(event) => setBudgetFilter(event.target.value)}>
              <option value="all">All jobs</option>
              <option value="over">Over the quoted hours</option>
              <option value="within">Within the quoted hours</option>
            </select>
          </label>
          <span className={styles.rangeNote}>
            Date range follows the period on <Link href="/dashboard/crew?tab=hours">Hours &amp; pay</Link> — {period.rangeLabel}
          </span>

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
          <Link href="/dashboard/crew?tab=hours" className="btn secondary">Go to Hours &amp; pay</Link>
        </div>
      ) : overview ? (
        <>
          {grouping === 'job' && overCount > 0 ? (
            <p className={styles.overNote}>
              {overCount} {overCount === 1 ? 'job is' : 'jobs are'} past the hours {overCount === 1 ? 'it was' : 'they were'} quoted for.
            </p>
          ) : null}
          <OverviewBoard
            items={overviewItems}
            listLabel={grouping === 'crew' ? 'Crew members' : 'Jobs'}
            empty={grouping === 'crew' ? 'Nobody logged hours in this period.' : 'No jobs match those filters.'}
          />
        </>
      ) : grouping === 'crew' ? (
        <div className={styles.tableWrap}>
          <table className={styles.hoursTable}>
            <thead>
              <tr>
                <th>Crew member</th>
                <th className={styles.num}>Jobs</th>
                <th className={styles.num}>Labor hours</th>
                <th className={styles.num}>Labor cost</th>
              </tr>
            </thead>
            <tbody>
              {byCrew.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.name}</strong></td>
                  <td className={styles.num}>{row.jobCount}</td>
                  <td className={styles.num}>{row.hours}</td>
                  <td className={`${styles.num} ${styles.payCell}`}>{money(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {overCount > 0 ? (
            <p className={styles.overNote}>
              {overCount} {overCount === 1 ? 'job is' : 'jobs are'} past the hours {overCount === 1 ? 'it was' : 'they were'} quoted for.
            </p>
          ) : null}
          <div className={styles.tableWrap}>
            <table className={styles.hoursTable}>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Crew</th>
                  <th className={styles.num}>Labor hours</th>
                  <th className={styles.num} title="The hours this job was estimated at. A quote in this product has no separate labor line, so its estimated hours are the allowance.">
                    Quoted hours
                  </th>
                  <th className={styles.num}>Variance</th>
                  <th className={styles.num}>Labor cost</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const open = openJob === row.jobId;
                  return (
                    <Fragment key={row.jobId}>
                      <tr
                        className={`${styles.hoursRow}${row.overBudget ? ` ${styles.overRow}` : ''}${open ? ` ${styles.hoursRowOn}` : ''}`}
                        onClick={() => setOpenJob(open ? null : row.jobId)}
                      >
                        <td>
                          <button type="button" className={styles.expandBtn} aria-expanded={open}>
                            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                            <span>
                              <strong>{row.ref} · {row.clientName}</strong>
                              <small>{JOB_STATUS_LABEL[row.status] ?? row.status}</small>
                            </span>
                          </button>
                        </td>
                        <td className={styles.crewCell}>
                          {row.crewNames.length > 0 ? row.crewNames.join(', ') : <span className={styles.dim}>Unassigned</span>}
                        </td>
                        <td className={styles.num}>{row.hours}</td>
                        <td className={styles.num}>{row.quotedHours ?? <span className={styles.dim} title="No estimated hours on this job, so there's nothing to compare against.">Not quoted</span>}</td>
                        <td className={styles.num}>
                          {row.varianceHours === null ? (
                            '—'
                          ) : (
                            <span className={row.overBudget ? styles.varianceOver : styles.varianceOk}>
                              {row.varianceHours > 0 ? '+' : ''}{row.varianceHours}
                            </span>
                          )}
                        </td>
                        <td className={`${styles.num} ${styles.payCell}`}>
                          {money(row.laborCost)}
                          {row.laborShare !== null ? <small>{row.laborShare}% of quote</small> : null}
                        </td>
                      </tr>
                      {open ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <div className={styles.entryList}>
                              <div className={styles.entryHead} aria-hidden="true">
                                <span>Crew member</span>
                                <span>Logged</span>
                                <span className={styles.num}>Hours</span>
                                <span className={styles.num}>Amount</span>
                              </div>
                              {entries
                                .filter((entry) => entry.jobId === row.jobId)
                                .map((entry) => (
                                  <div key={entry.id} className={styles.entryRow} data-cols="4">
                                    <span>
                                      <strong>{entry.crewName}</strong>
                                      <small>{entry.description}</small>
                                    </span>
                                    <span>{new Date(entry.loggedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                    <span className={styles.num}>{Math.round(entry.hours * 100) / 100}</span>
                                    <span className={styles.num}>{money(entry.amount)}</span>
                                  </div>
                                ))}
                              <p className={styles.entryFoot}>
                                <Link href={`/dashboard/jobs/${row.jobId}`}>Open {row.ref} →</Link>
                              </p>
                            </div>
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
        </>
      )}
    </>
  );
}
