'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import type { JobLaborRow, PayPeriod } from '@/lib/labor';
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

export default function LaborByJob({
  rows,
  period,
  crewOptions,
  entries,
}: {
  rows: JobLaborRow[];
  period: PayPeriod;
  crewOptions: { id: string; name: string }[];
  entries: EntryRow[];
}) {
  const [grouping, setGrouping] = useState<'job' | 'crew'>('job');
  const [statusFilter, setStatusFilter] = useState('all');
  const [crewFilter, setCrewFilter] = useState('all');
  const [budgetFilter, setBudgetFilter] = useState('all');
  const [openJob, setOpenJob] = useState<string | null>(null);

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
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <h3>No labor logged in this period</h3>
          <p>Once crew log hours against a job, this is where you&apos;ll see what it cost you against what you quoted.</p>
          <Link href="/dashboard/crew?tab=hours" className="btn secondary">Go to Hours &amp; pay</Link>
        </div>
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
