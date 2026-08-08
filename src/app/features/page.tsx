/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PageCTA,
  SiteFooter,
  SiteHeader,
  SIGNUP_LABEL,
  SIGNUP_URL,
} from '@/components/flagship/site-chrome';
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

/**
 * THE `id` IS PART OF THE CONTRACT, NOT DECORATION.
 *
 * The homepage's four-cell strip under the hero links straight at these cards
 * — /features#website-builder and so on — so a visitor who reads "Website
 * included · One-click AI builder" lands on the card that expands it, with the
 * other four in view. The ids match the deep-page slugs where there is one; the
 * two that differ (smart-intake, whose page is /features/ai-intake) do so
 * because the homepage names the feature "Smart Intake".
 *
 * Renaming an id here breaks a homepage link silently. There is a test that
 * asserts every homepage anchor resolves to an id on this page.
 */
type Flagship = {
  number: string;
  id: string;
  title: string;
  body: string;
  href: string;
  kicker: string;
  /**
   * WHAT THE FEATURE HANDS YOU, in the software's own nouns.
   *
   * Each card was a number, a label, a sentence and 65px of nothing — five
   * claims a visitor had to take on faith, on a page whose whole argument is
   * that the parts connect. These are not benefits restated; they are the
   * things that exist in the product once the feature runs, which is the
   * shortest honest way to show a feature on a page with no screenshots.
   */
  produces: [string, string, string];
};

const FLAGSHIPS: Flagship[] = [
  {
    number: '01',
    id: 'website-builder',
    title: 'One-click website',
    body: 'Launch a complete, editable contractor site with Smart Intake connected from day one.',
    href: '/features/website-builder',
    kicker: 'BUILD THE FRONT DOOR',
    produces: ['Trade-matched pages', 'Intake form wired in', 'Your own domain'],
  },
  {
    number: '02',
    id: 'smart-intake',
    title: 'AI Smart Intake',
    body: 'Ask better questions, build a useful project summary and surface the leads that deserve attention first.',
    href: '/features/ai-intake',
    kicker: 'QUALIFY THE OPPORTUNITY',
    produces: ['A written job summary', 'Budget and urgency read', 'Leads ranked by value'],
  },
  {
    number: '03',
    id: 'quick-stops',
    title: 'Quick Stops',
    body: 'Turn an opening in today’s route into an optional, prepaid nearby job at a price you choose.',
    href: '/features/quick-stops',
    kicker: 'EARN BETWEEN JOBS',
    produces: ['Openings in today’s route', 'Paid before you arrive', 'Your price, your radius'],
  },
  {
    number: '04',
    id: 'client-portal',
    title: 'Texts + client portal',
    body: 'Keep every conversation, approval, update and payment connected to the right job.',
    href: '/features/client-portal',
    kicker: 'KEEP CUSTOMERS INFORMED',
    produces: ['Two-way texting', 'Approvals and e-signature', 'Live job status'],
  },
  {
    number: '05',
    id: 'back-office',
    title: 'Connected back office',
    body: 'Move from quote to schedule, crew, payment, review and recurring work without rebuilding the record.',
    href: '/features/back-office',
    kicker: 'RUN THE WORK',
    produces: ['Quote → schedule → crew', 'Deposits and balances', 'Reviews and repeat visits'],
  },
];

/**
 * The operational tools, in four named groups.
 *
 * This was one flat grid of eight cards. The eight are unchanged in substance —
 * same tools, same descriptions — but a flat grid had no landing point inside
 * it, and the homepage hero's four badges (Plan & Schedule, Automate & Follow
 * Up, Get Paid Faster, Grow Your Business) needed somewhere to arrive that
 * answers the badge by name. Grouping is what those four badges already imply:
 * each one names a job the software does, and each job is two or three tools.
 *
 * As with FLAGSHIPS above, the ids are linked from the homepage and covered by
 * a test.
 */
type Capability = {
  id: string;
  number: string;
  title: string;
  lead: string;
  tools: [string, string][];
};

const CAPABILITIES: Capability[] = [
  {
    id: 'planning-and-scheduling',
    number: '01',
    title: 'Plan & Schedule',
    lead: 'Put the work on the calendar with everything the crew needs to arrive ready.',
    tools: [
      ['Scheduling', 'Arrival windows, capacity and the details needed to keep the promise.'],
      ['Crew + labor', 'Assignments, time clock, hours and estimated pay.'],
    ],
  },
  {
    id: 'automations',
    number: '02',
    title: 'Automate & Follow Up',
    lead: 'The messages, reminders and repeat visits that would otherwise depend on remembering.',
    tools: [
      ['Customer communication', 'Two-way texts and a job-specific client portal.'],
      ['Recurring work', 'Automatic visits, saved cards and predictable revenue.'],
    ],
  },
  {
    id: 'payments',
    number: '03',
    title: 'Get Paid Faster',
    lead: 'From the quote a customer approves to the money landing in your account.',
    tools: [
      ['Quotes + e-sign', 'Itemized proposals, optional upgrades and clear approvals.'],
      ['Payments', 'Deposits, balances and payment plans through Stripe.'],
      ['Cash flow', 'See customer money, payroll and bills before they move.'],
    ],
  },
  {
    id: 'website-and-growth',
    number: '04',
    title: 'Grow Your Business',
    lead: 'Turn finished work into reviews, repeat customers and the next job.',
    tools: [
      ['Reviews + growth', 'Follow-ups, review requests and AI-assisted marketing.'],
      ['Campaigns + blog', 'Email and text campaigns, a blog that publishes to your site, and what each one did.'],
    ],
  },
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
          {/* Was the app ROOT, which is the sign-in screen — the biggest button
              on the page promised a site and delivered a password field. */}
          <a className="button primary" href={SIGNUP_URL}>
            {SIGNUP_LABEL} <span aria-hidden="true">→</span>
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
              <b>Kitchen remodel · in your service area</b>
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
          {/* Was "Each feature is useful alone. Together, they change the
              business." — true, and about the software rather than about the
              reader. This says what the five features are FOR, in the order a
              job actually moves. */}
          <h2>
            Win better leads, quote faster,
            <br />
            <em>keep the crew moving, and get paid.</em>
          </h2>
        </div>
        <div className="feature-link-grid">
          {FLAGSHIPS.map(({ number, id, title, body, href, kicker, produces }) => (
            /* The id is on the link itself, so a visitor arriving from the
               homepage lands on the card rather than near it. scroll-margin-top
               keeps it clear of the sticky header — see §96. */
            <Link href={href} key={id} id={id}>
              <span>{number}</span>
              <small>{kicker}</small>
              <h3>{title}</h3>
              <p>{body}</p>
              {/* A list, not three styled spans: read aloud it is "three items,
                  a written job summary, …", which is the whole point of it. */}
              <ul className="feature-produces" aria-label={`What ${title} gives you`}>
                {produces.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
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
        {CAPABILITIES.map(({ id, number, title, lead, tools }) => (
          <section className="capability-band" id={id} key={id} aria-labelledby={`${id}-title`}>
            <div className="capability-head">
              <span>{number}</span>
              <h3 id={`${id}-title`}>{title}</h3>
              <p>{lead}</p>
            </div>
            <div className="everything-grid capability-tools">
              {tools.map(([name, body]) => (
                <article key={name}>
                  <h4>{name}</h4>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </section>

      <PageCTA
        title="Start with the website. Grow into the whole system."
        body={`No subscription and no setup fee. The platform fee runs from ${HIGHEST_FEE} down to ${LOWEST_FEE} as your volume grows, and applies only when a homeowner pays you.`}
      />
      <SiteFooter />
    </main>
  );
}
