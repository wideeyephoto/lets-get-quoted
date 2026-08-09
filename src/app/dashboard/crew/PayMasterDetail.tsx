'use client';

import { useMemo, type ReactNode } from 'react';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATE_LABEL,
  PAY_EVENT_LABEL,
  PAY_STATUS_LABEL,
  PAY_WARNING_FIX,
  PAY_WARNING_HELP,
  PAY_WARNING_SEVERITY,
  approveActionLabel,
  canApproveRow,
  entryHoursLabel,
  hoursLabel,
  needsReapproval,
  payMoney,
  payWarningChip,
  rateBreakdownLabel,
  rowHoursLabel,
  type CrewGroups,
  type CrewPayRow,
  type PayEvent,
} from '@/lib/crew-pay';
import { OVERTIME_POLICY } from '@/lib/labor';
import type { PayEntryLine } from '@/lib/crew-pay-data';
import { PAY_TYPE_LABEL } from '@/lib/pay-types';
import { avatarTone } from '@/lib/avatar-tone';
import styles from './crew.module.css';

// Hours & pay as master-detail: pick one person on the left, see everything
// about their period in the middle, act on it from the right.
//
// The table layouts answer "how does the crew compare"; this answers "is THIS
// person right", which is the question you actually have when something needs
// reviewing. Sixteen columns of a table can't show one person's timesheet, and
// a drawer over the top of the table hides the list you were working through.
//
// What this deliberately does NOT show, because the data does not exist and a
// payroll screen that invents fields is worse than one that omits them:
//   · pay type / employment type / W-9 — nothing on a crew member records these
//   · clock in and out per day — labor entries store hours, not a start and end
//   · deductions — this product does not run payroll or withhold anything, and
//     a "$0.00 deductions" line reads as a calculation rather than an absence

export type MasterDetailProps = {
  rows: CrewPayRow[];
  groups: CrewGroups;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  keyOf: (row: CrewPayRow) => string;
  jobLookup: Record<string, string>;
  jobsByCrew: Record<string, { ref: string; clientName: string }[]>;
  events: PayEvent[];
  payAvailable: boolean;
  approving: boolean;
  onApprove: (crewIds: string[]) => void;
  onPay: (ids: string[]) => void;
  onOpenProfile: (key: string) => void;
  onHistory: () => void;
  periodLabel: string;
  /** The entries each approval was built from, frozen at approval, by crew id. */
  approvedLines: Record<string, PayEntryLine[]>;
  /** The period's one action, rendered by the parent so both layouts agree. */
  periodActionTitle: string | null;
  periodAction: ReactNode;
  periodActionHelp: string | null;
  /** Green once there is money to agree or record; orange while there isn't. */
  periodActionTone: 'go' | 'todo';
};

const GROUP_ORDER: Array<{ id: keyof CrewGroups; label: string; tone: string }> = [
  { id: 'needs_review', label: 'Needs review', tone: 'alert' },
  { id: 'unpaid', label: 'Unpaid', tone: 'warn' },
  { id: 'paid', label: 'Paid', tone: 'ok' },
  { id: 'no_hours', label: 'No hours', tone: 'muted' },
];

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

function entryDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function stamp(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export default function PayMasterDetail({
  rows,
  groups,
  selectedKey,
  onSelect,
  keyOf,
  jobLookup,
  jobsByCrew,
  events,
  payAvailable,
  approving,
  onApprove,
  onPay,
  onOpenProfile,
  onHistory,
  periodLabel,
  approvedLines,
  periodActionTitle,
  periodAction,
  periodActionHelp,
  periodActionTone,
}: MasterDetailProps) {
  // Fall back to the first person who needs looking at rather than to the first
  // alphabetically — the list is ordered by what needs doing, so the top of it
  // is the right place to land.
  const selected = useMemo(() => {
    const byKey = new Map(rows.map((row) => [keyOf(row), row] as const));
    if (selectedKey && byKey.has(selectedKey)) return byKey.get(selectedKey)!;
    return groups.needs_review[0] ?? groups.unpaid[0] ?? groups.paid[0] ?? rows[0] ?? null;
  }, [rows, groups, selectedKey, keyOf]);

  const crewEvents = useMemo(
    () => (selected?.crewId ? events.filter((event) => event.crewId === selected.crewId) : []),
    [events, selected],
  );

  if (!selected) return null;

  const selectedId = keyOf(selected);
  const jobs = selected.crewId ? jobsByCrew[selected.crewId] ?? [] : [];
  const record = selected.record;
  // The frozen evidence for this person, if their hours have been approved.
  const lines = selected.crewId ? approvedLines[selected.crewId] ?? [] : [];
  const frozen = new Map(lines.filter((line) => line.costId).map((line) => [line.costId as string, line] as const));
  const liveIds = new Set(selected.entries.map((entry) => entry.id));
  const gone = lines.filter((line) => line.costId && !liveIds.has(line.costId));

  // canApproveRow lets an already-approved person through when their hours have
  // moved since it was agreed — there is no undo-approval action in this
  // product, so without that this pane could show "Hours added after approval"
  // forever with nothing to press.
  const canApprove = payAvailable && canApproveRow(selected) && selected.blockers.length === 0;
  const canPay = payAvailable && selected.eligible && selected.review === 'approved' && selected.payment !== 'paid';

  return (
    <div className={styles.mdLayout}>
      {/* --- master: who, grouped by what needs doing --- */}
      <aside className={styles.mdList} aria-label="Crew this period">
        {GROUP_ORDER.map((group) => {
          const members = groups[group.id];
          if (members.length === 0) return null;
          return (
            <section key={group.id}>
              <p className={styles.mdGroupHead} data-tone={group.tone}>
                {group.label} <span>{members.length}</span>
              </p>
              <ul>
                {members.map((row) => {
                  const id = keyOf(row);
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        className={styles.mdPerson}
                        data-on={id === selectedId || undefined}
                        aria-current={id === selectedId ? 'true' : undefined}
                        onClick={() => onSelect(id)}
                      >
                        <span className={styles.mdAvatar} data-avatar-tone={avatarTone(row.name)} aria-hidden="true">{initialsOf(row.name)}</span>
                        <span className={styles.mdPersonNames}>
                          <strong>{row.name}</strong>
                          <small>{[row.roleLabel, row.rate != null ? `${payMoney(row.rate)}/hr` : row.rateVaries ? 'Mixed rates' : 'No rate'].filter(Boolean).join(' · ')}</small>
                        </span>
                        <span className={styles.mdPersonFigures}>
                          <b>{rowHoursLabel(row)}</b>
                          <i>{payMoney(row.estimatedPay)}</i>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </aside>

      {/* --- detail: everything about the one person --- */}
      <section className={styles.mdDetail} aria-label={`${selected.name} this period`}>
        <header className={styles.mdHead}>
          <span className={styles.mdAvatarLg} data-avatar-tone={avatarTone(selected.name)} aria-hidden="true">{initialsOf(selected.name)}</span>
          <div className={styles.mdHeadNames}>
            <strong>{selected.name}</strong>
            <small>{[selected.roleLabel, selected.rate != null ? `${payMoney(selected.rate)}/hr` : null].filter(Boolean).join(' · ') || 'No role set'}</small>
          </div>
          <span className={styles.mdBadge} data-state={selected.review === 'approved' ? 'approved' : selected.status}>
            {PAY_STATUS_LABEL[selected.review === 'approved' ? 'approved' : selected.status]}
          </span>
          <button type="button" className={styles.rowBtn} onClick={() => onOpenProfile(selectedId)}>
            Full profile
          </button>
        </header>

        {/* warnings, not warnings + blockers: blockers are the subset of
            warnings severe enough to stop approval, so listing both printed
            every blocker twice. The severity already says which is which. */}
        {selected.warnings.length > 0 ? (
          <ul className={styles.mdFlags}>
            {selected.warnings.map((flag) => (
              // The chip carries the count and, in its tooltip, what to do —
              // "Missing rate" beside a four-figure total, with no way to learn
              // which of eight entries it meant, is what made this screen read
              // as though it were arguing with itself.
              <li key={flag} data-severity={PAY_WARNING_SEVERITY[flag]} title={`${PAY_WARNING_HELP[flag]} ${PAY_WARNING_FIX[flag]}`}>
                {payWarningChip(flag, selected.entries)}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className={styles.mdFacts}>
          <div>
            <dt>Current / next job</dt>
            <dd>{jobs.length > 0 ? `${jobs[0].ref} · ${jobs[0].clientName}` : <span className={styles.dim}>Not assigned</span>}</dd>
          </div>
          <div>
            <dt>Paid</dt>
            {/* selected.rate is what their hours were COSTED at, which for a
                salaried person is derived. Naming their actual arrangement is
                the honest answer to "pay rate". */}
            <dd>
              {selected.payType !== 'hourly'
                ? PAY_TYPE_LABEL[selected.payType]
                : selected.rate != null
                  ? `${payMoney(selected.rate)} / hr`
                  : selected.rateVaries
                    ? 'Varies by entry'
                    : <span className={styles.dim}>Not set</span>}
            </dd>
          </div>
          <div>
            <dt>Hours</dt>
            <dd>
              {rowHoursLabel(selected)}
              {selected.overtimeHours > 0 ? (
                <span className={styles.dim} title={OVERTIME_POLICY}>
                  {` · ${hoursLabel(selected.overtimeHours)} over the threshold`}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>Est. pay</dt>
            <dd>
              {payMoney(selected.estimatedPay)}
              {selected.payType !== 'hourly' ? <span className={styles.dim}> · {selected.payBasis}</span> : null}
              {/* The rates these hours were actually costed at. Where the
                  contradiction lives: a profile saying $30/hour and an entry
                  logged at nothing are both true at once. */}
              {selected.payType === 'hourly' && rateBreakdownLabel(selected.entries) ? (
                <span className={styles.dim}> · {rateBreakdownLabel(selected.entries)}</span>
              ) : null}
            </dd>
          </div>
        </dl>

        <div className={styles.mdSection}>
          <h4>Hours this pay period <span>{periodLabel}</span></h4>
          {selected.entries.length === 0 ? (
            <p className={styles.dim}>No hours logged in this period.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.mdEntries}>
                <thead>
                  <tr>
                    <th scope="col">Logged</th>
                    <th scope="col">Job</th>
                    <th scope="col">What</th>
                    <th scope="col" className={styles.num}>Hours</th>
                    {/* "Rate used" — the rate frozen onto the entry when it was
                        logged, which is the only rate that decided its amount. */}
                    <th scope="col" className={styles.num}>Rate used</th>
                    <th scope="col" className={styles.num}>Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {[...selected.entries]
                    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt))
                    .map((entry) => {
                      // What this entry looked like when the amount was agreed.
                      // A row that has changed since says so where it is read,
                      // which is the difference between "the total moved" and
                      // "Tuesday went from 8 hours to 6".
                      const approved = frozen.get(entry.id);
                      const moved = approved && (approved.hours !== entry.hours || approved.rate !== entry.rate);
                      return (
                        <tr key={entry.id} data-issue={entry.issue ?? undefined} data-moved={moved || undefined}>
                          <td>{entryDate(entry.loggedAt)}</td>
                          <td>{entry.jobId ? jobLookup[entry.jobId] ?? '—' : <span className={styles.dim}>No job</span>}</td>
                          <td>
                            {entry.description}
                            {moved ? (
                              <small className={styles.mdMoved}>
                                approved at {approved!.hours} h × {payMoney(approved!.rate)}
                              </small>
                            ) : null}
                          </td>
                          <td
                            className={styles.num}
                            title={entry.issue === 'incomplete-time' ? 'No hours were ever recorded on this entry. The amount beside it was recorded directly.' : undefined}
                          >
                            {entryHoursLabel(entry)}
                          </td>
                          <td className={styles.num}>
                            {entry.rate > 0 ? payMoney(entry.rate) : <span className={styles.dim} title="This entry was logged with no rate on it, so it adds nothing to the total. The other entries are unaffected.">No rate</span>}
                          </td>
                          <td className={styles.num}>{payMoney(entry.amount)}</td>
                        </tr>
                      );
                    })}
                  {/* Entries that were part of the approval and are no longer
                      here at all. The lock stops this happening from now on, but
                      anything approved before it existed can still show up. */}
                  {gone.map((line) => (
                    <tr key={line.id} data-gone="true">
                      <td>{line.loggedAt ? entryDate(line.loggedAt) : '—'}</td>
                      <td><span className={styles.dim}>—</span></td>
                      <td>{line.description ?? 'Entry'}<small className={styles.mdMoved}>removed since approval</small></td>
                      <td className={styles.num}>{line.hours}</td>
                      <td className={styles.num}>{payMoney(line.rate)}</td>
                      <td className={styles.num}>{payMoney(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.mdSection}>
          <h4>Approval</h4>
          <ul className={styles.mdApproval}>
            <li data-done={selected.review === 'approved' || undefined}>
              <span aria-hidden="true">{selected.review === 'approved' ? '✓' : '○'}</span>
              <div>
                <strong>Hours approved</strong>
                <small>
                  {record?.approvedAt
                    ? `${record.approvedBy ?? 'Someone'} · ${stamp(record.approvedAt)}`
                    : selected.blockers.length > 0
                      ? 'Blocked until the flags above are cleared'
                      : 'Not approved yet'}
                </small>
                {/* The approval is no longer current. Said here, next to the
                    button that fixes it, rather than only as a chip at the top
                    of the pane that nothing could ever clear. */}
                {needsReapproval(selected) ? (
                  <small>
                    Agreed at {payMoney(selected.approvedAmount ?? 0)}, now {payMoney(selected.estimatedPay)} — approve again to agree
                    the new figure, or pay the agreed one and leave the difference as an adjustment.
                  </small>
                ) : null}
              </div>
              {canApprove ? (
                <button type="button" className="btn secondary" disabled={approving} onClick={() => onApprove([selected.crewId!])}>
                  {approving ? 'Approving…' : approveActionLabel(selected)}
                </button>
              ) : null}
            </li>
            <li data-done={selected.payment === 'paid' || undefined}>
              <span aria-hidden="true">{selected.payment === 'paid' ? '✓' : '○'}</span>
              <div>
                <strong>Payment recorded</strong>
                <small>
                  {record?.paidAt
                    ? `${record.paidBy ?? 'Someone'} · ${stamp(record.paidAt)}${record.paymentMethod ? ` · ${PAYMENT_METHOD_LABEL[record.paymentMethod]}` : ''}`
                    : PAYMENT_STATE_LABEL[selected.payment]}
                </small>
              </div>
              {canPay ? (
                <button type="button" className={`btn primary ${styles.goAction}`} onClick={() => onPay([selectedId])}>
                  Mark as paid
                </button>
              ) : null}
            </li>
          </ul>
        </div>
      </section>

      {/* --- rail: what to do, and what has been done --- */}
      <aside className={styles.mdRail}>
        {/* The period's decision leads the rail, above the person-level detail —
            it is the only thing here that is about all of them at once. */}
        {periodAction ? (
          <section className={`${styles.railCard} ${styles.railAction}`} data-tone={periodActionTone}>
            <h3>{periodActionTitle ?? 'Pay period'}</h3>
            {periodAction}
            {periodActionHelp ? <small className={styles.railActionHelp}>{periodActionHelp}</small> : null}
          </section>
        ) : null}

        <section className={styles.railCard}>
          <h3>Payment summary</h3>
          <dl className={styles.railList}>
            <div>
              <dt>Regular hours</dt>
              <dd>{hoursLabel(selected.regularHours)}</dd>
            </div>
            <div>
              {/* "Overtime" is a claim about money, and here it is only ever a
                  count of hours — no premium is applied to anybody, hourly or
                  not (OVERTIME_POLICY). The label says so rather than leaving
                  the number beside "Est. pay" to imply it. */}
              <dt title={OVERTIME_POLICY}>Hours over the threshold (not paid extra)</dt>
              <dd>{selected.overtimeHours > 0 ? hoursLabel(selected.overtimeHours) : '—'}</dd>
            </div>
            <div>
              <dt>Est. pay</dt>
              <dd>{payMoney(selected.estimatedPay)}</dd>
            </div>
            {selected.payType !== 'hourly' ? (
              <div>
                <dt>Basis</dt>
                <dd>{selected.payBasis}</dd>
              </div>
            ) : null}
            {selected.payProblem ? (
              <div>
                <dt>Needs attention</dt>
                <dd>{selected.payProblem}</dd>
              </div>
            ) : null}
            {record?.approvedAmount != null ? (
              <div>
                <dt>Approved at</dt>
                <dd>{payMoney(record.approvedAmount)}</dd>
              </div>
            ) : null}
            {selected.adjustment !== 0 ? (
              <div>
                <dt>Since approved</dt>
                <dd data-delta={selected.adjustment > 0 ? 'up' : 'down'}>
                  {selected.adjustment > 0 ? '+' : ''}{payMoney(selected.adjustment)}
                </dd>
              </div>
            ) : null}
          </dl>
          {/* The line the mockup called "deductions". Saying nothing is deducted
              is the honest version — a $0.00 row reads as a calculation. */}
          <p className={styles.mdNote}>
            Nothing is deducted here. This product doesn&apos;t run payroll, withhold tax, or move money — it records
            what you paid.
          </p>
        </section>

        {crewEvents.length > 0 ? (
          <section className={styles.railCard}>
            <h3>Audit trail</h3>
            <ul className={styles.mdAudit}>
              {crewEvents.slice(0, 8).map((event) => (
                <li key={event.id}>
                  <strong>{PAY_EVENT_LABEL[event.action] ?? event.action}</strong>
                  <small>{stamp(event.createdAt)}{event.actorEmail ? ` · ${event.actorEmail}` : ''}</small>
                  {event.reason ? <em>{event.reason}</em> : null}
                </li>
              ))}
            </ul>
            <button type="button" className="btn secondary" onClick={onHistory}>
              View full audit trail
            </button>
          </section>
        ) : (
          <section className={styles.railCard}>
            <h3>Audit trail</h3>
            <p className={styles.dim}>Nothing has been approved or paid for {selected.name} in this period yet.</p>
            <button type="button" className="btn secondary" onClick={onHistory}>
              View period history
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}
