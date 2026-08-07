/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import { PageCTA, SiteFooter, SiteHeader } from '@/components/flagship/site-chrome';
import { FEE_TIERS } from '@/lib/pricing';
import styles from '@/components/flagship/flagship.module.css';

/**
 * The Product page, in the standalone site's visual language.
 *
 * This page used to render in the app's own design system. It was measurably
 * more decorated than the site it was drawn from — more layered shadows, more
 * heavy weights — and still read flatter, for two reasons that are not about
 * decoration at all: it ran dark from header to footer where the source breaks
 * its pages with light sections, and its product panels sat flat-on where the
 * source tilts them in space. Both are structural, so the page adopts the
 * source language rather than borrowing two tricks from it.
 *
 * What did NOT come across from the source's own Product page: its pipeline is
 * a flat strip and its mocks carry no "this is invented" marker. The pipeline
 * here sits in a tilted stage (see .system-stage in the generator's TWEAKS) and
 * every made-up figure is labelled. Those were improvements over the source and
 * they are kept.
 */

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore the complete no-subscription contractor suite — from website and AI intake to quoting, scheduling, crews and payments, all on one connected job record.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
};

// Read from the one place the rates are defined; /pricing and the calculator
// read the same array, so this page cannot drift from them.
const HIGHEST_FEE = FEE_TIERS[0].rate;
const LOWEST_FEE = FEE_TIERS[FEE_TIERS.length - 1].rate;

type Stage = {
  num: string;
  label: string;
  value: string;
  state: string;
  /** '' is the upcoming state — the source styles it by the absence of a class. */
  status: 'complete' | 'active' | '';
};

const STAGES: Stage[] = [
  { num: '01', label: 'WEBSITE', value: 'Request received', state: '✓ CAPTURED', status: 'complete' },
  { num: '02', label: 'INTAKE', value: 'High-value fit', state: '✓ QUALIFIED', status: 'complete' },
  { num: '03', label: 'QUOTE', value: '$4,250 approved', state: '✓ WON', status: 'complete' },
  { num: '04', label: 'SCHEDULE', value: 'Tuesday · 9–11', state: 'IN PROGRESS', status: 'active' },
  { num: '05', label: 'PAYMENT', value: 'Ready after work', state: 'NEXT', status: '' },
];

// Read out with each stage, so the three states are not carried by colour alone.
const STATUS_READING: Record<Stage['status'], string> = {
  complete: 'Completed stage.',
  active: 'Current stage.',
  '': 'Upcoming stage.',
};

const FLAGSHIPS: [string, string, string, string, string][] = [
  [
    '01',
    'One-click website',
    'Launch a complete, editable contractor site with Smart Intake connected from day one.',
    '/features/website-builder',
    'BUILD THE FRONT DOOR',
  ],
  [
    '02',
    'AI Smart Intake',
    'Ask better questions, build a useful project summary and surface the leads that deserve attention first.',
    '/features/ai-intake',
    'QUALIFY THE OPPORTUNITY',
  ],
  [
    '03',
    'Quick Stops',
    'Turn an opening in today’s route into an optional, prepaid nearby job at a price you choose.',
    '/features/quick-stops',
    'EARN BETWEEN JOBS',
  ],
  [
    '04',
    'Texts + client portal',
    'Keep every conversation, approval, update and payment connected to the right job.',
    '/features/client-portal',
    'KEEP CUSTOMERS INFORMED',
  ],
  [
    '05',
    'Connected back office',
    'Move from quote to schedule, crew, payment, review and recurring work without rebuilding the record.',
    '/features/back-office',
    'RUN THE WORK',
  ],
];

const INCLUDED: [string, string][] = [
  ['Quotes + e-sign', 'Itemized proposals, optional upgrades and clear approvals.'],
  ['Scheduling', 'Arrival windows, capacity and the details needed to keep the promise.'],
  ['Crew + labor', 'Assignments, time clock, hours and estimated pay.'],
  ['Payments', 'Deposits, balances and payment plans through Stripe.'],
  ['Recurring work', 'Automatic visits, saved cards and predictable revenue.'],
  ['Cash flow', 'See customer money, payroll and bills before they move.'],
  ['Customer communication', 'Two-way texts and a job-specific client portal.'],
  ['Reviews + growth', 'Follow-ups, review requests and AI-assisted marketing.'],
];

export default function FeaturesPage() {
  return (
    <main className={`${styles.root} inner-site feature-index-page`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />

      <section className="index-hero" id="main-content">
        <p className="eyebrow">
          <span aria-hidden="true">✦</span> THE FULL CONTRACTOR SUITE
        </p>
        <h1>
          One system for the first click, <em>the final payment and everything between.</em>
        </h1>
        <p>
          Your website, leads, quotes, schedule, crew, customer communication and money share one
          connected workflow—with no monthly subscription.
        </p>
        <div className="hero-actions">
          <a className="button primary" href="https://app.letsgetquoted.com/">
            Build my free site <span aria-hidden="true">→</span>
          </a>
          <a className="button secondary" href="#flagship-index">
            Explore the suite
          </a>
        </div>

        {/* The stage supplies the perspective; the pipeline inside it is what
            tilts. Not .dashboard-card — that is absolutely positioned at a
            fixed height tuned to the homepage hero's box. */}
        <div className="system-stage">
          <div className="system-pipeline" aria-label="One job moving through five connected stages">
            <div className="system-pipeline-head">
              <span>
                <i aria-hidden="true" /> LIVE JOB WORKFLOW
              </span>
              <small>ONE CUSTOMER RECORD · START TO FINISH</small>
            </div>
            <div className="system-pipeline-track">
              <div className="system-flow-line" aria-hidden="true">
                <i />
              </div>
              {STAGES.map((stage) => (
                <article key={stage.num} className={stage.status}>
                  <span>{stage.num}</span>
                  <small>{stage.label}</small>
                  <b>{stage.value}</b>
                  {/* The three states are a colour and a chip; "IN PROGRESS"
                      alone does not say which of the five this job sits on. */}
                  <span className="sr-only">{STATUS_READING[stage.status]}</span>
                  <em>{stage.state}</em>
                </article>
              ))}
            </div>
            <div className="system-job-record">
              <span>JOB #1048</span>
              <b>Kitchen lighting upgrade</b>
              <small>Alex Morgan · Royal Oak</small>
            </div>
          </div>

          <div className="floating-alert">
            <span className="alert-icon" aria-hidden="true">
              ✦
            </span>
            <div>
              <small>AI LEAD ALERT</small>
              <b>Panel upgrade · in your service area</b>
            </div>
            <em>NOW</em>
          </div>

          <div className="floating-paid">
            <i aria-hidden="true">✓</i>
            <div>
              <small>DEPOSIT PAID</small>
              <b>$2,125 headed to your bank</b>
            </div>
          </div>

          <p className="example-mark">
            <b>Example</b> — an invented job, not a real customer.{' '}
            <Link href="/demo">See the live demo</Link>
          </p>
        </div>
      </section>

      <section className="flagship-index" id="flagship-index">
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> FIVE CONNECTED ADVANTAGES
          </p>
          <h2>
            Each feature is useful alone.
            <br />
            <em>Together, they change the business.</em>
          </h2>
        </div>
        <div className="feature-link-grid">
          {FLAGSHIPS.map(([number, title, body, href, kicker]) => (
            <Link href={href} key={title}>
              <span>{number}</span>
              <small>{kicker}</small>
              <h3>{title}</h3>
              <p>{body}</p>
              <b>
                Explore feature <span aria-hidden="true">→</span>
              </b>
            </Link>
          ))}
        </div>
      </section>

      {/* The light chapter. This is the break the page was missing: the same
          copy and the same grid read as a separate chapter on cream instead of
          as one more dark band. */}
      <section className="everything-index">
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> EVERYTHING BEHIND THE WEBSITE
          </p>
          <h2>The operational tools are already included.</h2>
          <p>
            No separate starter tier. No choosing which essential workflow you can afford this month.
          </p>
        </div>
        <div className="everything-grid">
          {INCLUDED.map(([title, body], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <PageCTA
        title="Start with the website. Grow into the whole system."
        body={`No subscription and no setup fee. The platform fee runs from ${HIGHEST_FEE} down to ${LOWEST_FEE} as your volume grows, and applies only when a homeowner pays you.`}
      />
      <SiteFooter />
    </main>
  );
}
