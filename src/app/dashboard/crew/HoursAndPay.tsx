'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ENTRY_ISSUE_HELP,
  ENTRY_ISSUE_LABEL,
  PERIOD_MODES,
  PERIOD_STATUS_LABEL,
  QUICK_PERIODS,
  type CrewLaborRow,
  type PayPeriod,
  type PeriodStatus,
} from '@/lib/labor';
import { EXPORT_FORMAT_LABEL, ROUNDING_LABEL, type LaborSettings } from '@/lib/labor-settings';
import SaveButton from '@/components/save-button';
import { addLaborEntryAction, deleteLaborEntryAction } from './actions';
import { saveLaborSettingsAction } from './settings-actions';
import styles from './crew.module.css';

// Hours & pay.
//
// Named for what it does. This product does not run payroll — it does not
// calculate or withhold tax, file anything, or move money to anyone's bank —
// so calling the screen "Payroll" promised four things it has never done. Every
// money figure here is an estimate off logged hours, and says so.

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function money2(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function loggedLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function HoursAndPay({
  rows,
  totals,
  period,
  status,
  exportBlocked,
  csv,
  crewFilter,
  crewOptions,
  assignableJobs,
  jobLookup,
  settings,
}: {
  rows: CrewLaborRow[];
  totals: { hours: number; pay: number; overtime: number; needsReview: number; activeCrew: number };
  period: PayPeriod;
  status: PeriodStatus;
  exportBlocked: string | null;
  csv: string;
  crewFilter: string | null;
  crewOptions: { id: string; name: string }[];
  assignableJobs: { id: string; ref: string; clientName: string }[];
  jobLookup: Record<string, string>;
  settings: LaborSettings;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOnly, setReviewOnly] = useState(false);

  const visible = useMemo(() => (reviewOnly ? rows.filter((row) => row.issues.length > 0) : rows), [rows, reviewOnly]);

  function periodHref(patch: Record<string, string | null>): string {
    const query = new URLSearchParams();
    query.set('tab', 'hours');
    query.set('period', period.mode);
    if (period.offset) query.set('offset', String(period.offset));
    if (crewFilter) query.set('crew', crewFilter);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) query.delete(key);
      else query.set(key, value);
    }
    return `/dashboard/crew?${query.toString()}`;
  }

  function download() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hours-${period.rangeLabel.replace(/[^\w]+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const filteredName = crewFilter ? crewOptions.find((option) => option.id === crewFilter)?.name : null;

  return (
    <>
      <div className={styles.hpHead}>
        <div>
          <h2 className={styles.hpTitle}>Hours &amp; pay</h2>
          <p className={styles.hpLead}>
            Review crew hours, check them against the jobs they were logged on, and prepare pay totals.
          </p>
        </div>
        <span className={styles.periodStatus} data-status={status}>{PERIOD_STATUS_LABEL[status]}</span>
      </div>

      {/* Pay-period selector: arrows step whole periods, the select changes the
          length, and the quick filters are shortcuts to common ones. */}
      <div className={styles.periodBar}>
        <div className={styles.periodNav}>
          <Link
            href={periodHref({ offset: String(period.offset - 1), from: null, to: null })}
            className={styles.periodArrow}
            aria-label="Previous pay period"
          >
            ←
          </Link>
          <div className={styles.periodLabel}>
            <strong>{period.label}</strong>
            <small>{period.rangeLabel}</small>
          </div>
          <Link
            href={periodHref({ offset: String(period.offset + 1), from: null, to: null })}
            className={styles.periodArrow}
            aria-label="Next pay period"
          >
            →
          </Link>
        </div>

        <div className={styles.periodModes}>
          {PERIOD_MODES.filter((mode) => mode.id !== 'custom').map((mode) => (
            <Link
              key={mode.id}
              href={`/dashboard/crew?tab=hours&period=${mode.id}${crewFilter ? `&crew=${crewFilter}` : ''}`}
              className={`${styles.periodMode}${period.mode === mode.id ? ` ${styles.periodModeOn}` : ''}`}
            >
              {mode.label}
            </Link>
          ))}
          <form className={styles.customRange} action="/dashboard/crew" method="get">
            <input type="hidden" name="tab" value="hours" />
            <input type="hidden" name="period" value="custom" />
            {crewFilter ? <input type="hidden" name="crew" value={crewFilter} /> : null}
            <input type="date" name="from" aria-label="Range start" required />
            <span aria-hidden="true">→</span>
            <input type="date" name="to" aria-label="Range end" required />
            <button type="submit" className={styles.periodMode}>Go</button>
          </form>
        </div>
      </div>

      <div className={styles.quickRow}>
        {QUICK_PERIODS.map((quick) => (
          <Link
            key={quick.id}
            href={`/dashboard/crew?tab=hours&period=${quick.mode}&offset=${quick.offset}${crewFilter ? `&crew=${crewFilter}` : ''}`}
            className={`${styles.quick}${period.mode === quick.mode && period.offset === quick.offset ? ` ${styles.quickOn}` : ''}`}
          >
            {quick.label}
          </Link>
        ))}
        {filteredName ? (
          <Link href={periodHref({ crew: null })} className={styles.crewFilterChip}>
            Showing {filteredName} only ✕
          </Link>
        ) : null}
      </div>

      <div className={styles.cards}>
        <div className={styles.card} data-tone="pay">
          <small title="Hours × the rate on each entry. An estimate of what to pay — this product does not run payroll, withhold tax, or move money.">
            Estimated pay
          </small>
          <strong>{money(totals.pay)}</strong>
        </div>
        <div className={styles.card}>
          <small>Total hours</small>
          <strong>{totals.hours}</strong>
        </div>
        <div className={styles.card} data-tone={totals.overtime > 0 ? 'warn' : undefined}>
          <small title={`Hours past ${settings.overtimeThreshold} in any single week, counted per crew member. No overtime premium is added to estimated pay — set your own rule and apply it when you pay.`}>
            Overtime hours
          </small>
          <strong>{totals.overtime}</strong>
        </div>
        <div className={styles.card}>
          <small>Active crew</small>
          <strong>{totals.activeCrew}</strong>
        </div>
        <div className={styles.card} data-tone={totals.needsReview > 0 ? 'alert' : 'ok'}>
          <small>Entries needing review</small>
          <strong>{totals.needsReview}</strong>
        </div>
      </div>

      {totals.needsReview > 0 ? (
        <div className={styles.reviewBanner}>
          <div>
            <strong>{totals.needsReview} {totals.needsReview === 1 ? 'entry needs' : 'entries need'} a look</strong>
            <span>Hours with no rate, or entries with no hours on them, don&apos;t add up to a payable total.</span>
          </div>
          <button type="button" className="btn secondary" onClick={() => setReviewOnly((v) => !v)}>
            {reviewOnly ? 'Show everyone' : 'Review time entries'}
          </button>
        </div>
      ) : null}

      <div className={styles.hpActions}>
        <button type="button" className="btn secondary" onClick={() => setAddOpen((v) => !v)} aria-expanded={addOpen}>
          + Add labor manually
        </button>
        <button
          type="button"
          className="btn secondary"
          onClick={download}
          disabled={Boolean(exportBlocked)}
          title={exportBlocked ?? 'Download this period as a CSV'}
        >
          Export CSV
        </button>
        <button type="button" className="btn ghost" onClick={() => setSettingsOpen((v) => !v)} aria-expanded={settingsOpen}>
          Labor settings
        </button>
      </div>

      {/* A dimmed button with no reason is a dead end. Say what's wrong and
          the owner can go fix it. */}
      {exportBlocked ? <p className={styles.exportBlocked}>Export is off: {exportBlocked}</p> : null}

      {addOpen ? (
        <form action={addLaborEntryAction} className={styles.addLabor}>
          <label>
            <span>Crew member</span>
            <select name="crewId">
              <option value="">Unassigned</option>
              {crewOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Job</span>
            <select name="jobId" required>
              <option value="">Choose a job</option>
              {assignableJobs.map((job) => (
                <option key={job.id} value={job.id}>{job.ref} · {job.clientName}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Hours</span>
            <input name="hours" type="number" min="0.25" step="0.25" required placeholder="6.5" />
          </label>
          <label>
            <span>Rate ($/hr)</span>
            <input name="rate" type="number" min="0" step="0.01" placeholder="Their saved rate" />
          </label>
          <label className={styles.addLaborWide}>
            <span>Note</span>
            <input name="description" placeholder="Framing, second floor" />
          </label>
          <SaveButton className="btn primary" pendingLabel="Adding…" savedLabel="Added ✓">Add labor</SaveButton>
        </form>
      ) : null}

      {settingsOpen ? (
        <form action={saveLaborSettingsAction} className={styles.settings}>
          <p className={styles.settingsLead}>
            How this account counts hours. Saved to this browser — they change the totals on this screen and in the export,
            not the entries themselves.
          </p>
          <label>
            <span>Pay-period frequency</span>
            <select name="periodMode" defaultValue={settings.periodMode}>
              {PERIOD_MODES.filter((mode) => mode.id !== 'custom').map((mode) => (
                <option key={mode.id} value={mode.id}>{mode.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Overtime after (hours per week)</span>
            <input name="overtimeThreshold" type="number" min="1" max="168" step="0.5" defaultValue={settings.overtimeThreshold} />
          </label>
          <label>
            <span>Rounding</span>
            <select name="rounding" defaultValue={settings.rounding}>
              {Object.entries(ROUNDING_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Export format</span>
            <select name="exportFormat" defaultValue={settings.exportFormat}>
              {Object.entries(EXPORT_FORMAT_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <p className={styles.settingsNote}>
            Default hourly rates live on each person — set them under{' '}
            <Link href="/dashboard/crew?tab=crew">Crew members</Link>.
          </p>
          <SaveButton className="btn primary" pendingLabel="Saving…" savedLabel="Saved ✓">Save settings</SaveButton>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <h3>No crew hours yet</h3>
          <p>Hours logged through the field app or added to a job will appear here.</p>
          <div className={styles.emptyActions}>
            <button type="button" className="btn primary" onClick={() => setAddOpen(true)}>Add labor manually</button>
            <Link href="/dashboard/crew?tab=crew" className="btn secondary">Invite crew to the field app</Link>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.hoursTable}>
              <thead>
                <tr>
                  <th>Crew member</th>
                  <th className={styles.num}>Regular</th>
                  <th className={styles.num}>Overtime</th>
                  <th className={styles.num}>Rate</th>
                  <th className={styles.num}>Estimated pay</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const key = row.crewId ?? 'unassigned';
                  const open = expanded === key;
                  return (
                    // Keyed Fragment: the key belongs on the outermost element a
                    // map returns, and a bare <>…</> can't carry one.
                    <Fragment key={key}>
                      <tr
                        className={`${styles.hoursRow}${open ? ` ${styles.hoursRowOn}` : ''}`}
                        onClick={() => setExpanded(open ? null : key)}
                      >
                        <td>
                          <button type="button" className={styles.expandBtn} aria-expanded={open}>
                            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                            <span>
                              <strong>{row.name}</strong>
                              {row.roleLabel ? <small>{row.roleLabel}</small> : null}
                            </span>
                          </button>
                        </td>
                        <td className={styles.num}>{row.regularHours}</td>
                        <td className={styles.num}>
                          {row.overtimeHours > 0 ? <span className={styles.otCell}>{row.overtimeHours}</span> : '—'}
                        </td>
                        <td className={styles.num}>
                          {row.rateVaries ? <span title="This period has entries at more than one rate.">Varies</span> : row.rate ? `${money2(row.rate)}` : '—'}
                        </td>
                        <td className={`${styles.num} ${styles.payCell}`}>{money2(row.estimatedPay)}</td>
                        <td>
                          {row.issues.length === 0 ? (
                            <span className={styles.entryStatus} data-state="ok">Complete</span>
                          ) : (
                            row.issues.map((issue) => (
                              <span key={issue} className={styles.entryStatus} data-state="warn" title={ENTRY_ISSUE_HELP[issue]}>
                                {ENTRY_ISSUE_LABEL[issue]}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                      {open ? (
                        <tr className={styles.detailRow}>
                          <td colSpan={6}>
                            <div className={styles.entryList}>
                              <div className={styles.entryHead} aria-hidden="true">
                                <span>Job</span>
                                <span>Logged</span>
                                <span className={styles.num}>Hours</span>
                                <span className={styles.num}>Rate</span>
                                <span className={styles.num}>Amount</span>
                                <span />
                              </div>
                              {row.entries.map((entry) => (
                                <div key={entry.id} className={styles.entryRow}>
                                  <span>
                                    {entry.jobId ? (
                                      <Link href={`/dashboard/jobs/${entry.jobId}`}>{jobLookup[entry.jobId] ?? 'Job'}</Link>
                                    ) : (
                                      <span className={styles.dim}>No job</span>
                                    )}
                                    <small>{entry.description}</small>
                                  </span>
                                  <span>
                                    {loggedLabel(entry.loggedAt)}
                                    <small className={styles.dim} title="When this entry was logged. A labor entry has no separate date for when the work was done.">
                                      logged
                                    </small>
                                  </span>
                                  <span className={styles.num}>{entry.hours}</span>
                                  <span className={styles.num}>{entry.rate > 0 ? money2(entry.rate) : '—'}</span>
                                  <span className={styles.num}>{money2(entry.amount)}</span>
                                  <span className={styles.entryAction}>
                                    {entry.issue ? (
                                      <span className={styles.entryStatus} data-state="warn" title={ENTRY_ISSUE_HELP[entry.issue]}>
                                        {ENTRY_ISSUE_LABEL[entry.issue]}
                                      </span>
                                    ) : null}
                                    <form action={deleteLaborEntryAction.bind(null, entry.id)}>
                                      <button type="submit" className={styles.entryDelete} title="Remove this labor entry">
                                        Remove
                                      </button>
                                    </form>
                                  </span>
                                </div>
                              ))}
                              <p className={styles.entryFoot}>
                                {row.jobIds.length} {row.jobIds.length === 1 ? 'job' : 'jobs'} · {row.entryCount}{' '}
                                {row.entryCount === 1 ? 'entry' : 'entries'} · {row.hours} hours total
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

          {/* Sticky, so the total and the export stay reachable while you scroll
              a long period rather than living at the bottom of it. */}
          <div className={styles.stickyBar}>
            <span>
              <small>{period.rangeLabel}</small>
              <strong>{totals.hours} hrs · {money2(totals.pay)} estimated</strong>
            </span>
            <span className={styles.stickyActions}>
              {totals.needsReview > 0 ? <span className={styles.stickyWarn}>{totals.needsReview} to review</span> : null}
              <button type="button" className="btn primary" onClick={download} disabled={Boolean(exportBlocked)} title={exportBlocked ?? undefined}>
                Export CSV
              </button>
            </span>
          </div>

          <p className={styles.hpNote}>
            Estimated pay is each entry&apos;s hours × the rate it was logged at. Periods are cut on when time was logged —
            a labor entry has no separate &ldquo;worked on&rdquo; date. This is a rollup to pay from, not a payroll run:
            no tax is calculated or withheld and no money moves.
          </p>
        </>
      )}
    </>
  );
}
