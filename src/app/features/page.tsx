import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SiteFooter from '@/components/site-footer';
import StickyCta from '@/components/sticky-cta';
import {
  APP_SIGNUP_URL,
  CtaLink,
  ExampleFrame,
  MARKETING_MAIN_ID,
  MARKETING_PAGE_CLASS,
  MarketingCta,
  MarketingHeader,
} from '@/components/marketing';
import { FEE_TIERS } from '@/lib/pricing';
import styles from './features.module.css';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Explore the complete no-subscription contractor suite — from website and AI intake to quoting, scheduling, crews and payments, all on one connected job record.',
  alternates: { canonical: 'https://letsgetquoted.com/features' },
};

// The published fee range, read from the one place it is defined rather than
// typed out here — /pricing and the calculator read the same array.
const LOWEST_FEE = FEE_TIERS[FEE_TIERS.length - 1].rate;
const HIGHEST_FEE = FEE_TIERS[0].rate;

/* --------------------------------------------------------------------------
   The hero demonstration.

   The outline asks for one job moving through five stages, the record they all
   share, and the notifications that arrive while it happens — and asks that it
   look like an application, not an infographic. HeroDashboard is this app's
   other hero panel, but it is a closed component: no children, and its markup
   is a five-view slideshow of unrelated tools rather than a pipeline. So this
   is its sibling. It borrows the same idea (window chrome, live pill, a grid
   canvas, a tilt) and none of its markup, which keeps the two from fighting
   over the global .fh-* classes.

   No client JavaScript: the tilt settles on hover and the halos pulse in CSS,
   so the page stays a server component and the panel renders identically with
   scripting off.
   -------------------------------------------------------------------------- */

type StageStatus = 'done' | 'current' | 'next';

type Stage = {
  num: string;
  /** The stage of the workflow — the five column headings. */
  label: string;
  /** Where this job actually stands at that stage. */
  value: string;
  /** The state chip. */
  state: string;
  status: StageStatus;
};

// Verbatim from the Codex draft's pipeline, which had these five stages as a
// flat strip: website → intake → quote → schedule → payment, three of them
// behind the job, one live, one still to come.
const STAGES: Stage[] = [
  { num: '01', label: 'Website', value: 'Request received', state: 'Captured', status: 'done' },
  { num: '02', label: 'Intake', value: 'High-value fit', state: 'Qualified', status: 'done' },
  { num: '03', label: 'Quote', value: '$4,250 approved', state: 'Won', status: 'done' },
  { num: '04', label: 'Schedule', value: 'Tuesday · 9–11', state: 'In progress', status: 'current' },
  { num: '05', label: 'Payment', value: 'Ready after work', state: 'Next', status: 'next' },
];

// Read out with each stage so the three states are not carried by colour alone.
const STATUS_READING: Record<StageStatus, string> = {
  done: 'Completed stage.',
  current: 'Current stage.',
  next: 'Upcoming stage.',
};

const STAGE_CLASS: Record<StageStatus, string> = {
  done: styles.stepDone,
  current: styles.stepCurrent,
  next: styles.stepNext,
};

type RailItem = { label: string; count?: string; active?: boolean; icon: ReactNode };

const RAIL: RailItem[] = [
  {
    label: 'Dashboard',
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    label: 'Leads',
    count: '3',
    icon: (
      <>
        <circle cx="12" cy="8" r="3.4" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </>
    ),
  },
  {
    label: 'Quotes',
    count: '2',
    icon: (
      <>
        <path d="M6 3h8l4 4v14H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h4" />
      </>
    ),
  },
  {
    label: 'Schedule',
    active: true,
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2.5" />
        <path d="M3 10h18M8 3v4M16 3v4" />
      </>
    ),
  },
  {
    label: 'Payments',
    icon: (
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
        <path d="M2.5 10h19M6 15h4" />
      </>
    ),
  },
];

function JobPipelineDashboard() {
  return (
    <div className={styles.stage}>
      <div className={styles.win}>
        <div className={styles.chrome}>
          <span className={styles.chromeDot} aria-hidden="true" />
          <span className={styles.chromeDot} aria-hidden="true" />
          <span className={styles.chromeDot} aria-hidden="true" />
          <span className={styles.chromeUrl}>app.letsgetquoted.com/jobs/1048</span>
          <span className={styles.chromeLive}>
            <span className={styles.pulse} aria-hidden="true" />
            Live
          </span>
        </div>

        <div className={styles.winBody}>
          {/* The app's own rail, in miniature. Decorative: the five words are
              nav labels for a screen the visitor is looking at, not links. */}
          <nav className={styles.rail} aria-hidden="true">
            {RAIL.map((item) => (
              <span
                key={item.label}
                className={`${styles.railItem} ${item.active ? styles.railItemActive : ''}`}
              >
                <svg className={styles.railIcon} viewBox="0 0 24 24">
                  {item.icon}
                </svg>
                <span className={styles.railLabel}>{item.label}</span>
                {item.count ? <span className={styles.railCount}>{item.count}</span> : null}
              </span>
            ))}
          </nav>

          <div className={styles.work}>
            <div className={styles.workHead}>
              <span className={styles.workHeadTitle}>
                <span className={styles.pulse} aria-hidden="true" />
                Live job workflow
              </span>
              <span className={styles.workHeadNote}>One customer record &middot; start to finish</span>
            </div>

            <ol className={styles.pipeline} aria-label="Job 1048, stage by stage">
              {STAGES.map((item) => (
                <li key={item.num} className={`${styles.step} ${STAGE_CLASS[item.status]}`}>
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.node} />
                  </span>
                  <div className={styles.stepCard}>
                    {/* globals' .sr-only — the three states are a colour and a
                        chip, and "In progress" alone does not say which of the
                        five this job is actually sitting on. */}
                    <span className="sr-only">{STATUS_READING[item.status]}</span>
                    <span className={styles.stepNum} aria-hidden="true">
                      {item.num}
                    </span>
                    <span className={styles.stepLabel}>{item.label}</span>
                    <b className={styles.stepValue}>{item.value}</b>
                    <span className={styles.stepState}>
                      {item.status === 'done' ? <span aria-hidden="true">&#10003; </span> : null}
                      {item.state}
                    </span>
                  </div>
                </li>
              ))}
            </ol>

            <div className={styles.record}>
              <div className={styles.recordField}>
                <span className={styles.recordLabel}>Job #1048</span>
                <span className={styles.recordValue}>Kitchen lighting upgrade</span>
                <span className={styles.recordSub}>Alex Morgan &middot; Royal Oak</span>
              </div>
              <div className={styles.recordField}>
                <span className={styles.recordLabel}>Approved quote</span>
                <span className={styles.recordValue}>$4,250</span>
                <span className={styles.recordSub}>Signed on a phone</span>
              </div>
              <div className={styles.recordField}>
                <span className={styles.recordLabel}>Deposit paid</span>
                <span className={styles.recordValue}>$2,125</span>
                <span className={styles.recordSub}>Cleared Friday</span>
              </div>
              <div className={styles.recordField}>
                <span className={styles.recordLabel}>Balance</span>
                <span className={styles.recordValue}>$2,125</span>
                <span className={styles.recordSub}>Due on completion</span>
              </div>
            </div>

            <p className={styles.recordNote}>
              Every stage above reads and writes this one record &mdash; the address, the price and
              the history are never re-typed on the way through.
            </p>
          </div>
        </div>
      </div>

      {/* The two things that interrupt a workday. They sit over the window on a
          desktop and rejoin the flow underneath it on a phone — see the 900px
          block in the stylesheet. */}
      {/* Plain divs, not <aside>: an aside is a complementary LANDMARK, and two
          of them inside the hero would put "Notification: new lead" in the
          landmark list of every screen reader on the page. The lead-in below
          carries the same information where it belongs — in the text. */}
      <div className={`${styles.float} ${styles.floatLead}`}>
        <span className={styles.floatIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M13 2 4 14h6l-1 8 9-12h-6z" />
          </svg>
        </span>
        <div className={styles.floatBody}>
          <span className={styles.floatTitle}>
            <span className={styles.pulse} aria-hidden="true" />
            <span className="sr-only">Notification: </span>
            New lead &mdash; scored high value
          </span>
          <p className={styles.floatText}>
            Panel upgrade, 200A service. In your service area, and the answers are already on the
            record.
          </p>
          <span className={styles.floatTime}>2 min ago</span>
        </div>
      </div>

      <div className={`${styles.float} ${styles.floatPay}`}>
        <span className={styles.floatIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 12.2l2.4 2.4 4.6-5" />
          </svg>
        </span>
        <div className={styles.floatBody}>
          <span className={styles.floatTitle}>
            <span className="sr-only">Notification: </span>
            Deposit paid &mdash; $2,125
          </span>
          <p className={styles.floatText}>Job #1048 &middot; on its way to your bank account.</p>
          <span className={styles.floatTime}>Just now</span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The page copy. Verbatim from the Codex draft — the five flagships with their
   kickers, and the eight tiles behind them.
   -------------------------------------------------------------------------- */

type Flagship = {
  num: string;
  title: string;
  body: string;
  href: string;
  kicker: string;
};

const FLAGSHIPS: Flagship[] = [
  {
    num: '01',
    title: 'One-click website',
    body: 'Launch a complete, editable contractor site with Smart Intake connected from day one.',
    href: '/features/website-builder',
    kicker: 'Build the front door',
  },
  {
    num: '02',
    title: 'AI Smart Intake',
    body: 'Ask better questions, build a useful project summary and surface the leads that deserve attention first.',
    href: '/features/ai-intake',
    kicker: 'Qualify the opportunity',
  },
  {
    num: '03',
    title: 'Quick Stops',
    body: 'Turn an opening in today’s route into an optional, prepaid nearby job at a price you choose.',
    href: '/features/quick-stops',
    kicker: 'Earn between jobs',
  },
  {
    num: '04',
    title: 'Texts + client portal',
    body: 'Keep every conversation, approval, update and payment connected to the right job.',
    href: '/features/client-portal',
    kicker: 'Keep customers informed',
  },
  {
    num: '05',
    title: 'Connected back office',
    body: 'Move from quote to schedule, crew, payment, review and recurring work without rebuilding the record.',
    href: '/features/back-office',
    kicker: 'Run the work',
  },
];

const INCLUDED: { title: string; body: string }[] = [
  { title: 'Quotes + e-sign', body: 'Itemized proposals, optional upgrades and clear approvals.' },
  { title: 'Scheduling', body: 'Arrival windows, capacity and the details needed to keep the promise.' },
  { title: 'Crew + labor', body: 'Assignments, time clock, hours and estimated pay.' },
  { title: 'Payments', body: 'Deposits, balances and payment plans through Stripe.' },
  { title: 'Recurring work', body: 'Automatic visits, saved cards and predictable revenue.' },
  { title: 'Cash flow', body: 'See customer money, payroll and bills before they move.' },
  { title: 'Customer communication', body: 'Two-way texts and a job-specific client portal.' },
  { title: 'Reviews + growth', body: 'Follow-ups, review requests and AI-assisted marketing.' },
];

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="eyebrow">
      <span className={styles.eyebrowMark} aria-hidden="true">
        &#10022;
      </span>
      {children}
    </p>
  );
}

export default function FeaturesPage() {
  return (
    <>
      {/* AppShell renders no chrome for this route (OWN_CHROME_MARKETING_ROUTES),
          so the page draws the shared marketing header itself. */}
      <MarketingHeader current="/features" />

      <main className={MARKETING_PAGE_CLASS} id={MARKETING_MAIN_ID}>
        <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
        <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

        <div className="marketing-shell">
          {/* The hero runs full width instead of using .hero-grid: the panel below
              is a five-column pipeline, and the grid's narrow right-hand cell is
              what turned it into a flat strip in the first place. */}
          <section className={`hero-copy ${styles.heroCopy}`} aria-labelledby="features-title">
            <Eyebrow>The full contractor suite</Eyebrow>
            <h1 id="features-title" className={styles.title}>
              One system for the first click, <em>the final payment and everything between.</em>
            </h1>
            <p className={styles.lede}>
              Your website, leads, quotes, schedule, crew, customer communication and money share one
              connected workflow&mdash;with no monthly subscription.
            </p>
            <div className="actions">
              <CtaLink spec={{ label: 'Build my free site' }} className="btn primary" arrow />
              <CtaLink
                spec={{ label: 'Explore the suite', href: '#flagship-index' }}
                className="btn secondary"
              />
            </div>
            {/* Deliberately NOT the fee. The lede already says "no monthly
                subscription" and the closing band states the rate in full — a
                third telling in between turns a features page into a pricing
                page. This line answers the other question a cold visitor has,
                which is whether the site they build is theirs. */}
            <p className={styles.heroNote}>
              Free to build, and no card required to start. You keep your own domain and your own
              customer list.
            </p>
          </section>

          <ExampleFrame
            variant="plain"
            label="One job moving through all five stages, with the record every stage shares underneath."
            note={
              <>
                Sample data &mdash; an invented job, not a real customer.{' '}
                <Link href="/demo">Click around the live demo</Link> to see the real screens.
              </>
            }
          >
            <JobPipelineDashboard />
          </ExampleFrame>

          <section className="section-block" id="flagship-index" aria-labelledby="advantages-title">
            <div className={styles.indexHead}>
              <Eyebrow>Five connected advantages</Eyebrow>
              <h2 id="advantages-title">
                Each feature is useful alone.
                <br />
                <em>Together, they change the business.</em>
              </h2>
            </div>
            <ul className={styles.linkGrid}>
              {FLAGSHIPS.map((item) => (
                <li key={item.title}>
                  <Link href={item.href} className={styles.linkCard}>
                    <span className={styles.cardNum} aria-hidden="true">
                      {item.num}
                    </span>
                    <span className={styles.cardKicker}>{item.kicker}</span>
                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <p className={styles.cardBody}>{item.body}</p>
                    <span className={styles.cardMore}>
                      Explore feature <span aria-hidden="true">&rarr;</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="section-block" aria-labelledby="included-title">
            <div className={styles.indexHead}>
              <Eyebrow>Everything behind the website</Eyebrow>
              <h2 id="included-title">The operational tools are already included.</h2>
              <p>
                No separate starter tier. No choosing which essential workflow you can afford this
                month.
              </p>
            </div>
            <ul className={styles.tileGrid}>
              {INCLUDED.map((item, index) => (
                <li key={item.title} className={styles.tile}>
                  <span className={styles.cardNum} aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.cardTitle}>{item.title}</h3>
                  <p className={styles.cardBody}>{item.body}</p>
                </li>
              ))}
            </ul>
          </section>

          <MarketingCta
            title="Start with the website. Grow into the whole system."
            note={`No subscription and no setup fee. A platform fee of ${LOWEST_FEE}–${HIGHEST_FEE} applies only when a homeowner pays you, and drops as you grow.`}
          />

          <SiteFooter />
        </div>

        <StickyCta href={APP_SIGNUP_URL} label="Build my free site" />
      </main>
    </>
  );
}
