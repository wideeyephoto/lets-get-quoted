import type { Metadata } from 'next';
import FeatureDetailLayout from '@/components/marketing/feature-detail-layout';
import ExampleFrame from '@/components/marketing/example-frame';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './client-portal.module.css';

export const metadata: Metadata = {
  title: 'Contractor Texting and Client Portals',
  // The old line named the parts and not the outcome. This one says what the
  // homeowner does NOT have to do, which is the thing that sells a portal.
  description:
    'Give every contractor job one client portal for texts, quotes, scheduling, arrival updates, approvals and payments — no customer app or password required.',
  alternates: { canonical: 'https://letsgetquoted.com/features/client-portal' },
  /* THE SOCIAL CARD IS THIS PAGE'S, NOT THE HOMEPAGE'S.
     Next replaces the parent metadata's `openGraph` object wholesale rather
     than merging into it — but only if the child declares one. Without this
     block every share of this URL unfurled as the homepage: its title, its
     description, a screenshot of a website template, and an og:url pointing at
     letsgetquoted.com, so the card sent people somewhere else entirely. */
  openGraph: {
    type: 'website',
    url: 'https://letsgetquoted.com/features/client-portal',
    siteName: "Let's Get Quoted",
    title: 'Every customer message tied to the right job.',
    description:
      'Give every contractor job one client portal for texts, quotes, scheduling, arrival updates, approvals and payments — no customer app or password required.',
    images: [{ url: '/features/og-client-portal.jpg', width: 1200, height: 630, alt: 'Let’s Get Quoted client portal and two-way texting for contractors' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Every customer message tied to the right job.',
    description:
      'Give every contractor job one client portal for texts, quotes, scheduling, arrival updates, approvals and payments — no customer app or password required.',
    images: ['/features/og-client-portal.jpg'],
  },
};

/* One customer, one job, three panels.
 *
 * Every mock on this page is the SAME homeowner and the SAME job — Dana
 * Whitfield's water heater, JOB-2418 — because the claim the page is making is
 * that the thread, the record and the portal are one thing rather than three.
 * Two panels showing two different invented customers would quietly argue the
 * opposite. The names live here so they cannot drift apart. */
const JOB = {
  business: 'Ridgeline Plumbing',
  customer: 'Dana Whitfield',
  customerShort: 'Dana',
  crew: 'Marcus',
  work: 'Water heater replacement',
  address: '118 Ridgeline Dr',
  ref: 'JOB-2418',
  link: 'ridgelineplumbing.com/j/2418',
  total: '$1,240.00',
};

/** The identical header both demonstration panels open with. */
function JobStrip() {
  return (
    <div className={styles.jobStrip}>
      <span className={styles.jobWho}>{JOB.customer}</span>
      <span className={styles.jobWhat}>
        {JOB.work} &middot; {JOB.address}
      </span>
      <span className={styles.jobRef}>{JOB.ref}</span>
    </div>
  );
}

export default function ClientPortalPage() {
  return (
    <FeatureDetailLayout
      eyebrow="Text messaging + a portal for every job"
      title={
        <>
          Every customer knows what&rsquo;s next. <em>Every message stays attached.</em>
        </>
      }
      lede="Give every job its own client portal and keep two-way text conversations connected to the same customer record—from quote approval through final payment."
      // Not the fee — the closing band already states it. On a page about the
      // conversation, the useful reassurance is that the homeowner does not
      // have to install anything to take part: the portal is /client/jobs/[token]
      // (a link, no account) and the texts go out over Twilio as ordinary SMS.
      heroNote="Texting and the portal are both included. The homeowner needs no app and no account — the portal is a link, and the texts are ordinary texts."
      demo={
        <ExampleFrame
          label="The job record on the contractor’s side. The conversation is part of the record, not a separate inbox."
          note="Invented customer and invented amounts, shown to explain the layout."
        >
          <div className={styles.record}>
            <div className={styles.recordTop}>
              <span className={styles.recordName}>{JOB.customer}</span>
              <span className={styles.jobRef}>{JOB.ref}</span>
              <span className={styles.recordJob}>
                {JOB.work} &middot; {JOB.address}
              </span>
            </div>

            <dl className={styles.recordRows}>
              <dt>Quote</dt>
              <dd>
                <span className={styles.money}>{JOB.total}</span> &middot; approved Tue
              </dd>
              <dt>Scheduled</dt>
              <dd>Thu, 8:00&ndash;9:00 AM</dd>
              <dt>Arrival update</dt>
              <dd>Sent 7:58 AM, revised 8:22 AM</dd>
              <dt>Crew</dt>
              <dd>{JOB.crew} T.</dd>
              <dt>Balance</dt>
              <dd className={styles.paid}>Paid Thu, 3:06 PM</dd>
            </dl>

            <div className={styles.recordFoot}>
              <span>Messages &middot; 11 in this thread</span>
              <span className={styles.unread}>2 new</span>
            </div>
          </div>
        </ExampleFrame>
      }
      /* The page promises a portal; the button promised a website. Same free
         account, named for the thing the reader came about — the free site is
         supporting value, and the note under the buttons still says so. */
      primary={{ label: 'Start free' }}
      secondary={{ label: 'See the contractor and customer views', href: '#one-job' }}
      proof={[
        { title: 'Two-way texting', body: 'Replies stay connected to the right job.' },
        { title: 'A unique job portal', body: 'One customer view for every project.' },
        {
          title: 'Quote to payment',
          body: 'Approvals, schedule, updates and money together.',
        },
        {
          title: 'One conversation',
          body: 'The office and field team share the same context.',
        },
      ]}
      story={{
        eyebrow: 'Communication that doesn’t drift',
        title: 'Stop making customers hunt through old texts and emails.',
        body: 'The portal becomes the homeowner’s clear source of truth. Your team can text naturally while the important job details remain organized behind the conversation.',
      }}
      benefits={[
        {
          title: 'Keep every reply with the job',
          body: 'See the conversation alongside the customer, property, quote and schedule.',
        },
        {
          title: 'Give customers one clear destination',
          body: 'A direct job-specific link puts the current quote, status, updates and payment in one view.',
        },
        {
          title: 'Make handoffs less fragile',
          body: 'The owner, office and crew can see the same history without asking the customer to repeat it.',
        },
        {
          title: 'Keep the next action obvious',
          body: 'Approval, scheduling, arrival updates and payment each have a clear place to happen.',
        },
        {
          title: 'Answer the repeated questions once',
          body: 'Are we still on for Thursday, what did I approve, what do I owe, did you get my payment — all four are already on the page the homeowner has, so they get asked far less often and answered without stopping work.',
        },
      ]}
      stepsTitle="One job record for your team. One clear experience for the homeowner."
      steps={[
        {
          title: 'Create the job record',
          body: 'The qualified lead becomes one connected project.',
        },
        {
          title: 'Send the portal link',
          body: 'The homeowner receives their job-specific customer view.',
        },
        {
          title: 'Text through the work',
          body: 'Messages and important updates remain connected.',
        },
        {
          title: 'Finish in the same place',
          body: 'Final details, payment and follow-up close the loop.',
        },
      ]}
      cta={{
        title: 'Give every job a conversation customers can follow.',
        note: `No subscription. The platform fee is ${FEE_TIERS[0].rate} of what you collect and falls to ${FEE_TIERS[FEE_TIERS.length - 1].rate} as your volume grows, plus Stripe processing (${STRIPE_PROCESSING_NOTE}).`,
      }}
    >
      <section className="section-block" id="one-job" aria-labelledby="one-job-title">
        <div className={styles.demoHead}>
          <p className="eyebrow">The same job, from both sides</p>
          <h2 id="one-job-title">The thread the crew sees. The page the homeowner sees.</h2>
          <p>
            Both panels below are {JOB.customer}&rsquo;s {JOB.work.toLowerCase()} at{' '}
            {JOB.address} &mdash; job {JOB.ref}, the same record shown in the hero. The link
            the homeowner taps in the thread on the left opens the page on the right, so the
            quote they approved, the arrival window that moved and the balance they paid are
            never in a different place than the conversation about them.
          </p>
        </div>

        <div className={styles.twoPanel}>
          <ExampleFrame
            label={`The text thread, as ${JOB.business} sees it.`}
            note="Arrival texts and the invoice text are sent by the system; the rest are typed. Every one of them stays on this job."
          >
            <JobStrip />
            <div className={styles.thread}>
              <p className={styles.dayRow}>Tuesday</p>

              <div className={`${styles.msg} ${styles.msgOut}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.business}</span>
                  <span>9:12 AM</span>
                </span>
                <p className={styles.msgBody}>
                  Your quote for the {JOB.work.toLowerCase()} at {JOB.address} is ready.
                  Review and approve it here:{' '}
                  <span className={styles.msgLink}>{JOB.link}</span>
                </p>
              </div>

              <div className={`${styles.msg} ${styles.msgIn}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.customerShort}</span>
                  <span>9:31 AM</span>
                </span>
                <p className={styles.msgBody}>Approved. Is Thursday still good?</p>
              </div>

              <div className={`${styles.msg} ${styles.msgOut}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.business}</span>
                  <span>9:34 AM</span>
                </span>
                <p className={styles.msgBody}>
                  Booked &mdash; Thursday, 8:00 to 9:00 AM. It&rsquo;s on your job page with
                  everything else.
                </p>
              </div>

              <p className={styles.sysRow}>
                <span className={styles.sysDot}>&bull;</span> Quote approved &middot;{' '}
                <span className={styles.money}>{JOB.total}</span> &middot; e-signed 9:31 AM
              </p>

              <p className={styles.dayRow}>Wednesday</p>

              <div className={`${styles.msg} ${styles.msgIn}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.customerShort}</span>
                  <span>6:48 PM</span>
                </span>
                <p className={styles.msgBody}>
                  Do I need to clear anything out of the utility room first?
                </p>
              </div>

              <div className={`${styles.msg} ${styles.msgOut}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.business}</span>
                  <span>7:02 PM</span>
                </span>
                <p className={styles.msgBody}>
                  Just the shelf beside the tank. {JOB.crew} will handle the rest.
                </p>
              </div>

              <p className={styles.dayRow}>Thursday</p>

              <div className={`${styles.msg} ${styles.msgOut}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.business}</span>
                  <span>7:58 AM</span>
                  <span className={`${styles.tag} ${styles.tagArrival}`}>Arrival update</span>
                </span>
                <p className={styles.msgBody}>
                  {JOB.crew} is on the way and should reach you between 8:10 and 8:40 AM.
                  Track the visit here: <span className={styles.msgLink}>{JOB.link}</span>
                </p>
                <span className={styles.msgOptOut}>Reply STOP to opt out.</span>
              </div>

              <div className={`${styles.msg} ${styles.msgOut}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.business}</span>
                  <span>8:22 AM</span>
                  <span className={`${styles.tag} ${styles.tagArrival}`}>Arrival update</span>
                </span>
                <p className={styles.msgBody}>
                  Running behind &mdash; {JOB.crew} now expects to reach you between 8:40 and
                  9:10 AM. Sorry about that.
                </p>
              </div>

              <div className={`${styles.msg} ${styles.msgIn}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.customerShort}</span>
                  <span>8:23 AM</span>
                </span>
                <p className={styles.msgBody}>No problem &mdash; thanks for the heads up.</p>
              </div>

              <div className={`${styles.msg} ${styles.msgOut}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.business}</span>
                  <span>2:41 PM</span>
                  <span className={`${styles.tag} ${styles.tagMoney}`}>Invoice</span>
                </span>
                <p className={styles.msgBody}>
                  The new heater is in and tested. Your final invoice for{' '}
                  <span className={styles.money}>{JOB.total}</span> is on your job page &mdash;
                  pay by card there whenever you&rsquo;re ready.
                </p>
              </div>

              <div className={`${styles.msg} ${styles.msgIn}`}>
                <span className={styles.msgWho}>
                  <span className={styles.msgWhoName}>{JOB.customerShort}</span>
                  <span>3:06 PM</span>
                </span>
                <p className={styles.msgBody}>Paid. Thanks {JOB.crew}.</p>
              </div>

              <p className={styles.sysRow}>
                <span className={styles.sysDot}>&bull;</span> Payment received &middot;{' '}
                <span className={styles.money}>{JOB.total}</span> &middot; card &middot;&middot;&middot;&middot;4242
              </p>
            </div>
          </ExampleFrame>

          <ExampleFrame
            label={`The same job in ${JOB.customerShort}’s portal — the page the link in that thread opens.`}
            note="No password and no app. The link is job-specific, so it shows this project and nothing else about your business."
          >
            <JobStrip />
            <div className={styles.portal}>
              <div className={styles.portalTop}>
                <span className={styles.portalBrand}>{JOB.business}</span>
                <span className={styles.statusPill}>Complete &middot; paid</span>
              </div>

              <p className={styles.nextLine}>
                <span className={styles.nextLabel}>What&rsquo;s next:</span> nothing needed
                from you. Your receipt and the 6-year tank warranty are below.
              </p>

              <div>
                <p className={styles.blockTitle}>Job status</p>
                <ol className={styles.timeline}>
                  <li className={styles.tlItem}>
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div>
                      <span className={styles.tlTitle}>Quote approved</span>
                      <span className={styles.tlMeta}>
                        Tue 9:31 AM &middot; <span className={styles.money}>{JOB.total}</span>{' '}
                        &middot; e-signed
                      </span>
                    </div>
                  </li>
                  <li className={styles.tlItem}>
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div>
                      <span className={styles.tlTitle}>Scheduled</span>
                      <span className={styles.tlMeta}>Thursday, 8:00&ndash;9:00 AM</span>
                    </div>
                  </li>
                  <li className={styles.tlItem}>
                    <span className={`${styles.tlDot} ${styles.tlDotArrival}`} aria-hidden="true" />
                    <div>
                      <span className={styles.tlTitle}>{JOB.crew} on the way</span>
                      <span className={styles.tlMeta}>
                        Arrival window 8:10&ndash;8:40 AM,{' '}
                        <span className={styles.tlAmend}>
                          updated at 8:22 AM to 8:40&ndash;9:10 AM
                        </span>
                        . This page changed at the same time the text went out.
                      </span>
                    </div>
                  </li>
                  <li className={styles.tlItem}>
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div>
                      <span className={styles.tlTitle}>Work complete</span>
                      <span className={styles.tlMeta}>
                        Thu 2:38 PM &middot; 40-gallon heater installed and tested
                      </span>
                    </div>
                  </li>
                  <li className={styles.tlItem}>
                    <span className={styles.tlDot} aria-hidden="true" />
                    <div>
                      <span className={styles.tlTitle}>Paid in full</span>
                      <span className={styles.tlMeta}>
                        Thu 3:06 PM &middot; card &middot;&middot;&middot;&middot;4242
                      </span>
                    </div>
                  </li>
                </ol>
              </div>

              <div>
                <p className={styles.blockTitle}>Your money</p>
                <ul className={styles.kvList}>
                  <li className={styles.kv}>
                    <span className={styles.kvKey}>Approved quote</span>
                    <span className={`${styles.kvVal} ${styles.money}`}>{JOB.total}</span>
                  </li>
                  <li className={styles.kv}>
                    <span className={styles.kvKey}>Paid Thursday, 3:06 PM</span>
                    <span className={`${styles.kvVal} ${styles.money} ${styles.paid}`}>
                      &minus;{JOB.total}
                    </span>
                  </li>
                  <li className={styles.kv}>
                    <span className={styles.kvKey}>Balance due</span>
                    <span className={`${styles.kvVal} ${styles.money}`}>$0.00</span>
                  </li>
                </ul>
              </div>

              <div className={styles.portalActions}>
                <span className={styles.ghostBtn}>Receipt</span>
                <span className={styles.ghostBtn}>Warranty</span>
                <span className={styles.ghostBtn}>Message {JOB.business}</span>
              </div>
            </div>
          </ExampleFrame>
        </div>
      </section>
    </FeatureDetailLayout>
  );
}
