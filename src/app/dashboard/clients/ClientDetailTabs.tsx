'use client';

import Link from 'next/link';
import type { ClientDetailDto } from '@/lib/client-detail';
import styles from '../focus.module.css';

/**
 * The four detail panels of a customer, and the tab strip that names them.
 *
 * Lifted out of ClientFocusView unchanged so Smoothie renders the SAME panels
 * rather than a second set that drifts. The only addition is `headingLevel`:
 * Focus puts these under an <h2> two levels up and used <h4>; Smoothie's pane
 * heading is closer, so it passes 3. The default is 4, which is what Focus had.
 */

export const CLIENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'money', label: 'Money' },
  { id: 'notes', label: 'Notes' },
] as const;

export type ClientTabId = (typeof CLIENT_TABS)[number]['id'];

export function ClientDetailSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

export default function ClientDetailTabs({
  tab,
  detail,
  base,
  headingLevel = 4,
}: {
  tab: ClientTabId;
  detail: ClientDetailDto;
  base: string;
  headingLevel?: 3 | 4;
}) {
  const H = (headingLevel === 3 ? 'h3' : 'h4') as 'h3' | 'h4';
  if (tab === 'overview') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <H>Contact</H>
          <dl className={styles.defs}>
            <div>
              <dt>Phone</dt>
              <dd>{detail.phoneDigits ? <a href={`tel:${detail.phoneDigits}`}>{detail.phone}</a> : 'Not on file'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'Not on file'}</dd>
            </div>
            <div><dt>Address</dt><dd>{detail.address || 'Not on file'}</dd></div>
            <div><dt>Customer since</dt><dd>{detail.customerSinceLabel}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <H>Standing</H>
          <dl className={styles.defs}>
            <div><dt>Jobs</dt><dd>{detail.jobCount}</dd></div>
            <div><dt>Open now</dt><dd>{detail.openJobCount || 'None'}</dd></div>
            <div><dt>Open requests</dt><dd>{detail.openRequestCount || 'None'}</dd></div>
            <div><dt>Last invited back</dt><dd>{detail.lastInvitedLabel ?? 'Never'}</dd></div>
          </dl>
        </section>

        <section className={styles.card}>
          <H>Money</H>
          <dl className={styles.defs}>
            <div><dt>Billed</dt><dd>{detail.totals.quotedLabel}</dd></div>
            <div><dt>Paid</dt><dd>{detail.totals.paidLabel}</dd></div>
            <div>
              <dt>Outstanding</dt>
              <dd className={detail.totals.outstanding > 0 ? styles.waiting : undefined}>
                {detail.totals.outstandingLabel}
              </dd>
            </div>
          </dl>
          {detail.totals.outstanding <= 0 && detail.jobCount > 0 ? (
            <p className={styles.muted}>Everything billed has been paid.</p>
          ) : null}
        </section>
      </div>
    );
  }

  if (tab === 'jobs') {
    if (detail.jobs.length === 0) {
      return <p className={styles.muted}>No jobs for this customer yet.</p>;
    }
    return (
      <div className={styles.grid}>
        {detail.jobs.map((job) => (
          <Link key={job.id} href={`${base}/jobs/${job.id}`} className={`${styles.card} ${styles.cardLink}`}>
            <H>{job.ref}</H>
            <dl className={styles.defs}>
              <div><dt>Stage</dt><dd>{job.statusLabel}</dd></div>
              <div><dt>Started</dt><dd>{job.dateLabel}</dd></div>
              <div><dt>Quoted</dt><dd>{job.quotedLabel}</dd></div>
              <div>
                <dt>Balance</dt>
                <dd className={job.balance > 0 ? styles.waiting : undefined}>{job.balanceLabel}</dd>
              </div>
            </dl>
          </Link>
        ))}
      </div>
    );
  }

  if (tab === 'money') {
    if (detail.payments.length === 0) {
      return <p className={styles.muted}>Nothing has been charged to this customer yet.</p>;
    }
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <H>Payments</H>
          <dl className={styles.defs}>
            {detail.payments.map((payment) => (
              <div key={payment.id}>
                <dt>
                  {payment.label}
                  <span className={styles.muted}> · {payment.jobRef}</span>
                </dt>
                <dd>
                  {payment.amountLabel}
                  <span className={styles.muted}> · {payment.status} · {payment.dateLabel}</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <H>Notes</H>
        {detail.notes ? (
          <p className={styles.scope}>{detail.notes}</p>
        ) : (
          <p className={styles.muted}>
            Nothing noted about this customer. Gate codes, dogs, where they like the truck parked — the
            things the next person on this job would have to ask.
          </p>
        )}
      </section>
    </div>
  );
}
