'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LeadDetailDto } from '@/lib/lead-detail';
import { isContactablePhone } from '@/lib/lead-queue';
import type { LeadViewItem } from './LeadsWorkspace';
import styles from '../focus.module.css';
import leadStyles from './leads.module.css';

/**
 * The five detail panels behind a lead — Overview, Request, Activity, Photos,
 * Quote & visit.
 *
 * Lifted out of LeadFocusView unchanged so Focus and Smoothie render the same
 * content from the same code. It keeps focus.module.css: these panels ARE the
 * Focus look, and Smoothie is meant to look like Focus rather than like a
 * second design.
 *
 * The one addition is `headingLevel`. Focus passes nothing and gets the h4s it
 * always had; Smoothie passes 3, because its pane heading is an h2 and h2 → h4
 * is a level skip. Everything else about the markup is identical.
 */

export const LEAD_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'request', label: 'Request' },
  { id: 'activity', label: 'Activity' },
  { id: 'photos', label: 'Photos' },
  { id: 'quote', label: 'Quote & visit' },
] as const;

export type LeadTabId = (typeof LEAD_TABS)[number]['id'];

export function LeadDetailSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span /><span /><span /><span />
    </div>
  );
}

function Head({ level, children }: { level: 3 | 4; children: ReactNode }) {
  return level === 3 ? <h3>{children}</h3> : <h4>{children}</h4>;
}

export default function LeadDetailTabs({
  tab,
  detail,
  lead,
  base,
  headingLevel = 4,
}: {
  tab: LeadTabId;
  detail: LeadDetailDto;
  lead: LeadViewItem;
  base: string;
  headingLevel?: 3 | 4;
}) {
  const H = headingLevel;

  if (tab === 'overview') {
    const contactablePhone = isContactablePhone(detail.phoneDigits);
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <Head level={H}>Contact</Head>
          <dl className={styles.defs}>
            <div>
              <dt>Phone</dt>
              <dd>
                {contactablePhone ? (
                  <a href={`tel:${detail.phoneDigits}`}>{detail.phone}</a>
                ) : detail.phone ? (
                  <>{detail.phone} <Link href={`${base}/leads/${detail.id}?edit=client#lead-edit-modal`}>Fix phone</Link></>
                ) : 'Not on file'}
              </dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{detail.email ? <a href={`mailto:${detail.email}`}>{detail.email}</a> : 'Not on file'}</dd>
            </div>
            <div><dt>Address</dt><dd>{detail.address || detail.location || 'Not on file'}</dd></div>
            <div><dt>Received</dt><dd>{detail.createdAtLabel}</dd></div>
          </dl>
          {detail.textOnly && <p className={styles.muted}>They asked not to be called — text first.</p>}
        </section>

        <section className={styles.card}>
          <Head level={H}>What the AI read</Head>
          <dl className={styles.defs}>
            <div><dt>Score</dt><dd>{detail.hasTriage ? detail.scoreLabel : 'Unscored'}</dd></div>
            <div><dt>Est. value</dt><dd>{detail.estimateLabel ?? 'No number given'}</dd></div>
            <div><dt>Timeline</dt><dd>{detail.timeline || 'Not said'}</dd></div>
            <div><dt>Est. labor</dt><dd>{detail.estimatedHours ? `${detail.estimatedHours} hrs` : 'Not set'}</dd></div>
          </dl>
          {detail.flags.length > 0 && (
            <div className={styles.chips}>
              {detail.flags.map((flag) => <span className={leadStyles.flagChip} key={flag.key}>{flag.label}</span>)}
            </div>
          )}
        </section>

        <section className={styles.card}>
          <Head level={H}>History</Head>
          {detail.history && (detail.history.jobs > 0 || detail.history.leads > 0) ? (
            <>
              <span className={styles.repeat}>Repeat customer</span>
              <dl className={styles.defs} style={{ marginTop: '0.6rem' }}>
                <div><dt>Past jobs</dt><dd>{detail.history.jobs}</dd></div>
                <div><dt>Other requests</dt><dd>{detail.history.leads}</dd></div>
              </dl>
            </>
          ) : (
            <p className={styles.muted}>
              {detail.history ? 'First time this customer has been in touch.' : 'Not linked to a client profile yet.'}
            </p>
          )}
        </section>
      </div>
    );
  }

  if (tab === 'request') {
    return (
      <div className={styles.grid}>
        <section className={styles.card}>
          <Head level={H}>{detail.projectType || 'Project request'}</Head>
          {detail.message ? (
            <p className={styles.quote}>{detail.message}</p>
          ) : (
            <p className={styles.muted}>They didn&rsquo;t write anything beyond the project type.</p>
          )}
          <Link className={styles.cardLink} href={`${base}/leads/${detail.id}?edit=client#lead-edit-modal`}>
            Edit the details →
          </Link>
        </section>

        <section className={styles.card}>
          <Head level={H}>Where it came from</Head>
          <dl className={styles.defs}>
            <div><dt>Source</dt><dd>{detail.sourceLabel}</dd></div>
            <div><dt>Page</dt><dd>{detail.sourcePage || 'Not recorded'}</dd></div>
            <div><dt>Received</dt><dd>{detail.createdAtLabel}</dd></div>
            <div><dt>Area</dt><dd>{detail.location || detail.address || 'Not given'}</dd></div>
          </dl>
        </section>
      </div>
    );
  }

  if (tab === 'activity') {
    return detail.contactLog.length === 0 ? (
      <p className={styles.muted}>
        Nobody has reached out yet.{' '}
        <Link href={`${base}/leads/${detail.id}#lead-activity`}>Log a call or text →</Link>
      </p>
    ) : (
      <>
        <ul className={styles.timeline}>
          {detail.contactLog.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className={styles.feedIcon} aria-hidden="true">•</span>
              <span className={styles.timelineBody}>
                <strong>{entry.label}</strong>
                {entry.note ? <p>{entry.note}</p> : null}
                <small>{entry.at}</small>
              </span>
            </li>
          ))}
        </ul>
        {detail.contactCount > detail.contactLog.length && (
          <p className={styles.muted} style={{ marginTop: '0.7rem' }}>
            Showing the last {detail.contactLog.length} of {detail.contactCount}.{' '}
            <Link href={`${base}/leads/${detail.id}#lead-activity`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  if (tab === 'photos') {
    // Photos the homeowner sent with the request — often the only way to know
    // what the job actually is before you drive out to it.
    return detail.photos.length === 0 ? (
      <p className={styles.muted}>They didn&rsquo;t send any photos with this request.</p>
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
            <Link href={`${base}/leads/${detail.id}?details=photos#lead-photos-modal`}>See all →</Link>
          </p>
        )}
      </>
    );
  }

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <Head level={H}>Estimate visit</Head>
        {detail.quoteVisit ? (
          <dl className={styles.defs}>
            <div><dt>When</dt><dd>{detail.quoteVisit.whenLabel}</dd></div>
            <div><dt>Length</dt><dd>{detail.quoteVisit.durationLabel}</dd></div>
            <div><dt>Confirmed</dt><dd>{detail.quoteVisit.confirmedLabel ? `Texted ${detail.quoteVisit.confirmedLabel}` : 'Not texted yet'}</dd></div>
            {detail.quoteVisit.notes ? <div><dt>Notes</dt><dd>{detail.quoteVisit.notes}</dd></div> : null}
          </dl>
        ) : (
          <p className={styles.muted}>No visit booked.</p>
        )}
        <Link className={styles.cardLink} href={`${base}/leads/${detail.id}#availability-snapshot`}>
          {detail.quoteVisit ? 'Change the visit →' : 'Book a visit →'}
        </Link>
      </section>

      <section className={styles.card}>
        <Head level={H}>Quote</Head>
        {detail.convertedJob ? (
          <dl className={styles.defs}>
            <div><dt>Job</dt><dd>{detail.convertedJob.ref}</dd></div>
            <div><dt>Stage</dt><dd>{detail.convertedJob.stageLabel}</dd></div>
            <div><dt>Quoted</dt><dd>{detail.convertedJob.quotedLabel}</dd></div>
          </dl>
        ) : (
          <>
            <dl className={styles.defs}>
              <div><dt>Est. value</dt><dd>{detail.estimateLabel ?? 'No number given'}</dd></div>
              <div><dt>Est. labor</dt><dd>{lead.estimatedHours ? `${lead.estimatedHours} hrs` : 'Not set'}</dd></div>
            </dl>
            <p className={styles.muted}>No quote sent yet.</p>
          </>
        )}
        <Link
          className={styles.cardLink}
          href={detail.convertedJob ? `${base}/jobs/${detail.convertedJob.id}` : `${base}/leads/${detail.id}#lead-estimate`}
        >
          {detail.convertedJob ? 'Open the job →' : 'Send a quote →'}
        </Link>
      </section>
    </div>
  );
}
