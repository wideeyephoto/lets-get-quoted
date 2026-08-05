'use client';

import Link from 'next/link';
import type { JobDetailDto } from '@/lib/job-detail';
import type { JobViewItem } from './JobsWorkspace';
import styles from '../focus.module.css';

/**
 * The five detail panels of a job, and the tab strip that names them.
 *
 * Lifted out of FocusView unchanged so Smoothie renders the SAME panels rather
 * than a second set that drifts. The only addition is `headingLevel`: Focus
 * puts these under an <h2> two levels up and uses <h4>; Smoothie's pane heading
 * is closer, so it passes 3. The default is 4, which is what Focus had.
 */

export const JOB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'checklist', label: 'Checklist' },
  { id: 'photos', label: 'Photos' },
  { id: 'money', label: 'Quote & Payment' },
] as const;

export type JobTabId = (typeof JOB_TABS)[number]['id'];

export function marginClass(pct: number): string {
  if (pct >= 35) return 'margin-good';
  if (pct >= 20) return 'margin-ok';
  return 'margin-bad';
}

export function JobDetailSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

export default function JobDetailTabs({
  tab,
  detail,
  job,
  base,
  headingLevel = 4,
}: {
  tab: JobTabId;
  detail: JobDetailDto;
  job: JobViewItem;
  base: string;
  headingLevel?: 3 | 4;
}) {
  const H = (headingLevel === 3 ? 'h3' : 'h4') as 'h3' | 'h4';

  if (tab === 'overview') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <H>Details</H>
          <dl className={styles.defs}>
            <div><dt>Client</dt><dd>{detail.clientName}</dd></div>
            <div><dt>Phone</dt><dd>{detail.clientPhone || 'Not on file'}</dd></div>
            <div><dt>Email</dt><dd>{detail.clientEmail || 'Not on file'}</dd></div>
            <div><dt>Address</dt><dd>{detail.address || 'Not on file'}</dd></div>
            <div><dt>Created</dt><dd>{detail.createdAtLabel}</dd></div>
            <div>
              <dt>Crew</dt>
              <dd>{detail.crew.length > 0 ? detail.crew.map((c) => c.name).join(', ') : 'None assigned'}</dd>
            </div>
          </dl>
        </section>

        {/* There is no notes feature in this product — no job_notes table and no
            jobs.notes column. This is the job's scope, labelled as what it is
            rather than dressed up as notes. */}
        <section className={styles.card}>
          <H>Job description</H>
          {detail.scope ? (
            <p className={styles.scope}>{detail.scope}</p>
          ) : (
            <p className={styles.muted}>Nothing written down yet.</p>
          )}
          <Link className={styles.cardLink} href={`${base}/jobs/${detail.id}`}>Edit on the job page →</Link>
        </section>

        <section className={styles.card}>
          <H>Recent activity</H>
          {detail.feed.length === 0 ? (
            <p className={styles.muted}>Nothing has happened on this job yet.</p>
          ) : (
            <ul className={styles.feed}>
              {detail.feed.slice(0, 4).map((event) => (
                <li key={event.id}>
                  <span className={styles.feedIcon} aria-hidden="true">{event.icon}</span>
                  <span>
                    <strong>{event.title}</strong>
                    <small>{event.at}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  if (tab === 'timeline') {
    return detail.feed.length === 0 ? (
      <p className={styles.muted}>Nothing has happened on this job yet.</p>
    ) : (
      <ul className={styles.timeline}>
        {detail.feed.map((event) => (
          <li key={event.id}>
            <span className={styles.feedIcon} aria-hidden="true">{event.icon}</span>
            <span className={styles.timelineBody}>
              <strong>{event.title}</strong>
              {event.body ? <p>{event.body}</p> : null}
              <small>{event.kindLabel} · {event.at}</small>
            </span>
          </li>
        ))}
      </ul>
    );
  }

  if (tab === 'checklist') {
    return detail.tasks.total === 0 ? (
      <p className={styles.muted}>
        No checklist on this job yet. <Link href={`${base}/jobs/${detail.id}`}>Add one →</Link>
      </p>
    ) : (
      <>
        <p className={styles.progress}>
          <span style={{ width: `${detail.tasks.pct}%` }} />
          <em>{detail.tasks.done} of {detail.tasks.total} done</em>
        </p>
        <ul className={styles.tasks}>
          {detail.tasks.items.map((task) => (
            <li key={task.id} className={task.done ? styles.taskDone : undefined}>
              <span aria-hidden="true">{task.done ? '✓' : ''}</span>
              {task.title}
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (tab === 'photos') {
    // Files on a job are photos. There's no document upload in this product, so
    // this doesn't pretend to be a file manager.
    return detail.photos.length === 0 ? (
      <p className={styles.muted}>
        No photos on this job. <Link href={`${base}/jobs/${detail.id}`}>Upload some →</Link>
      </p>
    ) : (
      <>
        <div className={styles.photos}>
          {detail.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.path} src={photo.url} alt="" loading="lazy" />
          ))}
        </div>
        {detail.photoCount > detail.photos.length && (
          <p className={styles.muted}>
            Showing {detail.photos.length} of {detail.photoCount}.{' '}
            <Link href={`${base}/jobs/${detail.id}`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <H>Quote &amp; invoice</H>
        <dl className={styles.defs}>
          <div><dt>Quoted</dt><dd>{job.quotedAmount > 0 ? job.quotedLabel : 'No quote yet'}</dd></div>
          <div><dt>Invoice</dt><dd>{detail.invoice ? `${detail.invoice.ref} · ${detail.invoice.statusLabel}` : 'None raised'}</dd></div>
          <div><dt>Paid</dt><dd>{detail.money.paidLabel}</dd></div>
          <div><dt>Still owed</dt><dd className={styles.owed}>{detail.money.outstandingLabel}</dd></div>
          <div><dt>Payment</dt><dd>{detail.paymentStatusLabel ?? 'None requested'}</dd></div>
        </dl>
        <Link className={styles.cardLink} href={`${base}/jobs/${detail.id}?open=payment#request-payment`}>
          Request payment →
        </Link>
      </section>

      <section className={styles.card}>
        <H>Costs &amp; margin</H>
        <dl className={styles.defs}>
          <div><dt>Materials</dt><dd>{detail.money.materialsLabel}</dd></div>
          <div><dt>Labor</dt><dd>{detail.money.laborLabel}</dd></div>
          <div><dt>Overhead</dt><dd>{detail.money.overheadLabel}</dd></div>
          <div><dt>Total cost</dt><dd>{detail.money.totalCostLabel}</dd></div>
          <div><dt>Profit</dt><dd>{detail.money.profitLabel}</dd></div>
          <div>
            <dt>Margin</dt>
            <dd className={marginClass(detail.money.marginPct)}>{detail.money.marginLabel}</dd>
          </div>
        </dl>
        <Link className={styles.cardLink} href={`${base}/jobs/${detail.id}?open=costs`}>
          Add an expense →
        </Link>
      </section>
    </div>
  );
}
