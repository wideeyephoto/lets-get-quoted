'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import SiteFooter from '@/components/site-footer';
import HeroDashboard from '@/components/hero-dashboard';
import StickyCta from '@/components/sticky-cta';
import HomeFeeCalculator from '@/components/home-fee-calculator';
/* FROM THE FILES, NOT THE BARREL, because this page is a client component.
   components/marketing/index.ts also re-exports FeatureDetailLayout, which
   reads the request's CSP nonce and is therefore server-only — and a barrel
   pulls every one of its exports into the importer's module graph whether or
   not they are named here. So one client page importing four presentational
   pieces through the barrel was enough to fail the build with "you're
   importing a component that needs next/headers". Named imports do not
   tree-shake that away before the server/client boundary check runs. */
import { CtaLink, APP_SIGNUP_URL } from '@/components/marketing/links';
import ExampleFrame from '@/components/marketing/example-frame';
import MarketingCta from '@/components/marketing/marketing-cta';
import PriceZeroDial from '@/components/marketing/price-zero-dial';
import { TRADES } from '@/lib/trades';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import styles from './home-next.module.css';

/**
 * A candidate homepage, running beside the live one.
 *
 * WHERE THE WORDS CAME FROM. Every headline, kicker, bullet and footnote below
 * is the Codex homepage draft, carried across verbatim. That draft is the thing
 * being judged, and a rewrite dressed up as a port would make the judgement
 * meaningless — so the copy is not edited, reordered or "improved" here.
 *
 * WHERE THE LOOK CAME FROM. None of the Codex stylesheet came with it. Chrome,
 * color, type and spacing are this app's: `.marketing-shell`, `.hero-grid`,
 * `.section-block`, `.eyebrow`, `.btn`, `.compare-table`, `.pricing-tier`,
 * `.cta-band` and the rest are used from globals.css, read-only, and the module
 * beside this file defines only the pieces globals has no class for. The dark
 * Codex theme, its class names and its Tailwind-ish utility soup are all gone.
 *
 * THE FOUR EDITS TO THE COPY, and why each one was not optional:
 *
 *   1. "Built for 49 contractor trades" is now `{TRADES.length}`. The number is
 *      real and it moves; a literal in a marketing string goes stale silently.
 *
 *   2. The lead card's "DISTANCE · 3.2 miles" is gone. Nothing computes a
 *      per-lead mileage, so that figure was invented. It reads "In your service
 *      area" now, which is what the intake scorer actually knows.
 *
 *   3. The website preview's "4.9★ Local rating", "12 yrs Experience" and
 *      "LICENSED · INSURED · LOCAL" are gone. They are credentials about a
 *      business that does not exist, and a mock is not the place to invent a
 *      licence. The row now restates the three fields the builder was given.
 *
 *   4. The hero's dashboard mock greeted a real person by first name. The
 *      shared HeroDashboard stands in for the whole Codex `.dashboard-card`,
 *      so the greeting went with it.
 *
 * EVERY MOCK IS MARKED. Each product panel is wrapped in <ExampleFrame>, which
 * is a <figure> with a real <figcaption>: the "Example" badge and a plain-words
 * description are attached to the panel for a screen reader, not floating near
 * it. An unmarked screenshot-shaped panel reads as a real account, and a number
 * a visitor believes is real is a claim we never made.
 *
 * WHY THIS FILE IS A CLIENT COMPONENT. The flagship section is scroll-driven —
 * three steps observe the viewport and swap one sticky visual. That needs an
 * effect, and the section is not big enough to deserve its own module.
 *
 * NO STRUCTURED DATA. The live page emits Organization, SoftwareApplication and
 * FAQPage JSON-LD. A noindexed draft claiming to be the same organization is
 * not something to hand a crawler, so it is left out rather than copied.
 */

type Feature = {
  number: string;
  kicker: string;
  title: string;
  body: string;
  proof: string[];
  input: string;
  output: string;
  /** Plain-words caption for the mock, read out with the figure. */
  demoLabel: string;
};

const FEATURES: Feature[] = [
  {
    number: '01',
    kicker: 'ONE-CLICK AI WEBSITE',
    title: 'Go from no website to ready for business—in one click.',
    body: 'Start with a complete contractor site, then edit every word, service and service area before you publish.',
    // The trade count is interpolated, never typed: TRADES is the list the
    // /for pages are generated from, so the two can never disagree.
    proof: ['Your own domain', `Built for ${TRADES.length} contractor trades`, 'Edit everything before you publish'],
    input: 'Three business basics',
    output: 'A complete, editable site',
    demoLabel: 'The builder turning three business details into a full site, before anything is published.',
  },
  {
    number: '02',
    kicker: 'SMART INTAKE',
    title: 'Your website asks the questions a great estimator would.',
    body: 'Every inquiry becomes a clear project summary with fit, urgency, value and location already considered.',
    proof: ['Hot, warm and low lead scoring', 'Project-specific follow-ups', 'Instant high-value alerts'],
    input: 'One homeowner request',
    output: 'A prioritized lead with context',
    demoLabel: 'A homeowner answering intake questions on their phone, and the scored lead it becomes.',
  },
  {
    number: '03',
    kicker: 'QUICK STOPS',
    title: 'Get paid to fit nearby customers into today’s route.',
    body: 'Offer a nearby homeowner a same-day arrival window and price you choose. Nothing books until they pay.',
    proof: ['Route-aware matching', 'You control every offer', 'Always optional—never auto-booked'],
    input: 'A gap in today’s route',
    output: 'A paid priority visit you approved',
    demoLabel: 'A same-day request sitting near a route already planned, and the offer you would send.',
  },
];

const TRUST = [
  ['WEBSITE INCLUDED', 'One-click AI builder'],
  ['SMART INTAKE INCLUDED', 'Qualify every request'],
  ['BACK OFFICE INCLUDED', 'Quote, schedule and collect'],
  ['QUICK STOPS INCLUDED', 'Paid priority visits nearby'],
];

const PIPELINE = [
  ['01', 'Build the site'],
  ['02', 'Qualify the lead'],
  ['03', 'Win the job'],
  ['04', 'Run the work'],
  ['05', 'Get paid + grow'],
];

const AI_HANDOFFS = [
  {
    number: '01',
    stage: 'ATTRACT',
    title: 'Launches a job-ready website',
    body: 'Writes service pages, FAQs and local copy, then connects Smart Intake.',
  },
  {
    number: '02',
    stage: 'QUALIFY',
    title: 'Turns a request into a real scope',
    body: 'Asks trade-specific follow-ups and collects photos, timing, budget and contact details.',
  },
  {
    number: '03',
    stage: 'PRIORITIZE',
    title: 'Ranks what deserves attention',
    body: 'Scores fit, urgency, estimated value and distance—then sends instant high-value alerts.',
  },
  {
    number: '04',
    stage: 'FOLLOW THROUGH',
    title: 'Keeps the job record moving',
    body: 'Carries the same details into quote, schedule, texts, the client portal and payment—without retyping.',
  },
];

const CLIENT_BENEFITS = [
  ['Two-way texting', 'Replies stay connected to the right customer and job.'],
  ['One portal for every job', 'Quote, schedule, updates and payment share one customer view.'],
  ['A simpler customer experience', 'One direct link gives homeowners everything they need.'],
];

const SUITE = [
  ['Quotes + e-sign', 'Professional, itemized quotes with optional upgrades.'],
  ['Scheduling', 'Arrival windows, capacity and weather-aware planning.'],
  ['Crew + labor', 'Assignments, time clock, hours and estimated pay.'],
  ['Payments', 'Deposits, balances and payment plans through Stripe.'],
  ['Recurring work', 'Automatic visits, saved cards and predictable revenue.'],
  ['Cash flow', 'See payroll, bills and customer money before it moves.'],
  [
    'Texts + client portal',
    'Two-way messages, job updates, quotes, scheduling and payment in one customer view.',
  ],
  ['Reviews + growth', 'Follow-ups, review requests and AI-assisted marketing.'],
];

// The Codex comparison was two cards listing DIFFERENT items, so there is no
// shared row label to hang a normal comparison table on. Kept as two columns of
// four, each carrying its own wording untouched, in this app's .compare-table.
const STACK_COMPARE = [
  ['Website builder', 'Website + smart intake'],
  ['Lead form + inbox', 'Lead + quote'],
  ['CRM + scheduling', 'Schedule + crew'],
  ['Payments + reviews', 'Payment + growth'],
];

const DIFFERENCE_PROOF = [
  ['One customer record', 'From first question to final payment'],
  ['One place to work', 'For the owner, office and crew'],
  ['One aligned price', 'No monthly fee before you earn'],
];

/* -------------------------------------------------------------------------- */
/* The three flagship product mocks.                                           */
/*                                                                             */
/* Built from this app's tokens — no Codex CSS came across. Every interactive-  */
/* looking control is a <span>, not a <button>: these are pictures of the       */
/* product, and a real button here would put a keyboard trap in a figure that   */
/* does nothing when you press it.                                             */
/* -------------------------------------------------------------------------- */

function MockChrome({ title, pill, tone }: { title: string; pill: string; tone: 'live' | 'hot' | 'paid' }) {
  return (
    <div className={styles.mockTop}>
      <span className={styles.mockDots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className={styles.mockTitle}>{title}</span>
      <span className={styles.mockPill} data-tone={tone}>
        {pill}
      </span>
    </div>
  );
}

function SiteBuilderVisual() {
  return (
    <div className={styles.mock}>
      <MockChrome title="Website builder" pill="LIVE PREVIEW" tone="live" />
      <div className={styles.builderLayout}>
        <div className={styles.builderControls}>
          <p className={styles.miniLabel}>BUSINESS BASICS</p>
          <div className={styles.fakeField}>
            <small>Company</small>
            <strong>Brightline Electric</strong>
          </div>
          <div className={styles.fakeField}>
            <small>Trade</small>
            <strong>Electrician</strong>
          </div>
          <div className={styles.fakeField}>
            <small>Service area</small>
            <strong>Royal Oak, MI</strong>
          </div>
          <span className={styles.mockPrimary}>
            <b aria-hidden="true">✦</b> Generate full site with AI
          </span>
          <div className={styles.genStatus} aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className={styles.preview}>
          <div className={styles.previewNav}>
            <b>BRIGHTLINE</b>
            <span>Services &nbsp;Work &nbsp;Reviews</span>
            <em>Free estimate</em>
          </div>
          <div className={styles.previewHero}>
            <h4>
              Power your home.
              <br />
              Protect what matters.
            </h4>
            <span className={styles.mockPrimary}>Get an instant estimate →</span>
          </div>
          {/* The Codex preview claimed a 4.9-star rating and twelve years in
              business for an invented company. Those are credentials, not
              decoration, so the row restates the three fields the builder was
              actually handed instead. */}
          <div className={styles.previewStats}>
            <span>
              <b>24/7</b> AI estimate
            </span>
            <span>
              <b>Electrician</b> Trade
            </span>
            <span>
              <b>Royal Oak, MI</b> Service area
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function IntakeVisual() {
  return (
    <div className={styles.mock}>
      <MockChrome title="Smart intake" pill="HOT LEAD" tone="hot" />
      <div className={styles.intakeLayout}>
        <div className={styles.phone}>
          <span className={styles.phoneNotch} aria-hidden="true" />
          <p className={styles.miniLabel}>INSTANT ESTIMATE</p>
          <h4 className={styles.phoneQuestion}>What do you need done?</h4>
          <p className={styles.bubble}>My basement drain is backing up and water is spreading.</p>
          <p className={styles.aiQuestion}>
            <b aria-hidden="true">✦</b> Is wastewater actively entering the room?
          </p>
          <div className={styles.choiceRow}>
            <span>Yes</span>
            <span>No</span>
          </div>
          <div className={styles.meter} aria-hidden="true">
            <span />
          </div>
        </div>
        <div className={styles.leadCard}>
          <div className={styles.leadHead}>
            <span className={styles.avatar} aria-hidden="true">
              AM
            </span>
            <div>
              <small>NEW WEBSITE REQUEST</small>
              <strong>Emergency drain backup</strong>
            </div>
            <b className={styles.leadScore}>HOT</b>
          </div>
          <div className={styles.aiSummary}>
            <span>✦ AI SUMMARY</span>
            <p>Active indoor backup. In service area, wants help today, photos included.</p>
          </div>
          {/* "DISTANCE · 3.2 miles" was here. No per-lead mileage is computed
              anywhere in the product, so it was a number we made up. What the
              scorer genuinely knows is whether the job falls inside the service
              area — so that is what the card says. */}
          <div className={styles.leadGrid}>
            <span>
              <small>ESTIMATE</small>
              <b>$450–$780</b>
            </span>
            <span>
              <small>LOCATION</small>
              <b>In your service area</b>
            </span>
            <span>
              <small>URGENCY</small>
              <b>Today</b>
            </span>
            <span>
              <small>CONTACT</small>
              <b>Text first</b>
            </span>
          </div>
          <span className={styles.mockPrimary}>Call this lead first →</span>
        </div>
      </div>
    </div>
  );
}

function QuickStopVisual() {
  return (
    <div className={styles.mock}>
      <MockChrome title="Plan my day" pill="PAID TO CONFIRM" tone="paid" />
      <div className={styles.routeLayout}>
        <div className={styles.routeMap}>
          <svg viewBox="0 0 220 190" className={styles.routeSvg} role="img" aria-label="Two planned stops with a nearby request just off the route">
            <g className={styles.routeStreets} aria-hidden="true">
              <path d="M0 42H220M0 96H220M0 150H220M56 0V190M132 0V190" />
            </g>
            <path className={styles.routePath} d="M34 158 L84 118 L150 74" />
            <path className={styles.routeDetour} d="M84 118 L108 150" />
            <g className={styles.routeNodes}>
              <circle cx="34" cy="158" r="13" />
              <circle cx="150" cy="74" r="13" />
              <circle className={styles.routeQuick} cx="108" cy="150" r="13" />
            </g>
            <g className={styles.routeNums} aria-hidden="true">
              <text x="34" y="163">1</text>
              <text x="150" y="79">2</text>
              <text x="108" y="155">+</text>
            </g>
          </svg>
          <span className={styles.routeHome}>SHOP</span>
          <span className={styles.detourLabel}>0.7 mi off route</span>
        </div>
        <div className={styles.quickCard}>
          <p className={styles.miniLabel}>NEAR TODAY’S ROUTE</p>
          <div className={styles.quickTitle}>
            <span aria-hidden="true">QS</span>
            <div>
              <h4>Leaking shutoff valve</h4>
              <p>Royal Oak · same-day request</p>
            </div>
          </div>
          <div className={styles.quickMetrics}>
            <span>
              <small>ADDED DRIVE</small>
              <b>6 min</b>
            </span>
            <span>
              <small>OPEN WINDOW</small>
              <b>2:15–4:15</b>
            </span>
          </div>
          <div className={styles.offerRow}>
            <div>
              <small>YOUR QUICK STOP FEE</small>
              <strong>$149</strong>
            </div>
            <span className={styles.mockPrimary}>Send offer</span>
          </div>
          <p className={styles.paidNote}>
            <b aria-hidden="true">✓</b> Nothing books until the customer pays.
          </p>
        </div>
      </div>
    </div>
  );
}

const VISUALS = [SiteBuilderVisual, IntakeVisual, QuickStopVisual];

/**
 * The flagship section: three steps scroll past one visual that keeps up.
 *
 * Only the active mock is mounted. Cross-fading three stacked copies would put
 * two hidden product panels — dollar figures, customer names — in the accessible
 * tree at all times, and `visibility: hidden` on a transitioning layer is the
 * kind of thing that works until it doesn't. Re-keying on `active` costs a
 * remount of a few dozen static nodes and buys an honest DOM.
 */
function Flagships() {
  const [active, setActive] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    // A band across the middle of the viewport: whichever step is crossing it
    // owns the visual. Cheaper and steadier than measuring scroll offsets, and
    // it needs no rAF loop of its own.
    const observers = stepRefs.current.map((element, index) => {
      if (!element) return null;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActive(index);
        },
        { rootMargin: '-38% 0px -38% 0px', threshold: 0 },
      );
      observer.observe(element);
      return observer;
    });
    return () => observers.forEach((observer) => observer?.disconnect());
  }, []);

  const goToStep = (index: number) => {
    stepRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const Visual = VISUALS[active];
  const feature = FEATURES[active];

  return (
    <section className="section-block" aria-labelledby="flagships-title" id="flagships">
      <div className="section-heading">
        <p className="eyebrow">Three features you won’t find together anywhere else</p>
        <h2 id="flagships-title">
          Three advantages your ordinary <span className="gradient-text">website can’t give you.</span>
        </h2>
        <p>
          A better first impression, better-qualified leads and new revenue hiding inside the route you already
          drive.
        </p>
      </div>

      <div className={styles.scrolly}>
        <div className={styles.steps}>
          {FEATURES.map((item, index) => {
            const StepVisual = VISUALS[index];
            return (
              <article
                className={`${styles.step}${active === index ? ` ${styles.stepOn}` : ''}`}
                key={item.number}
                ref={(node) => {
                  stepRefs.current[index] = node;
                }}
              >
                <span className={styles.stepNumber}>{item.number} / 03</span>
                <p className={styles.stepKicker}>{item.kicker}</p>
                <h3 className={styles.stepTitle}>{item.title}</h3>
                <p className={styles.stepBody}>{item.body}</p>
                <div className={styles.handoff}>
                  <span>
                    <small>START WITH</small>
                    <b>{item.input}</b>
                  </span>
                  <i aria-hidden="true">→</i>
                  <span>
                    <small>GET</small>
                    <b>{item.output}</b>
                  </span>
                </div>
                <ul className={styles.proofList}>
                  {item.proof.map((proof) => (
                    <li key={proof}>
                      <span aria-hidden="true">✓</span>
                      {proof}
                    </li>
                  ))}
                </ul>

                {/* Phones only — see the note on `.stepDemo`. `display: none`
                    on the wider layout takes it out of the accessibility tree
                    too, so nothing is announced twice. */}
                <div className={styles.stepDemo}>
                  <ExampleFrame variant="plain" label={item.demoLabel}>
                    <StepVisual />
                  </ExampleFrame>
                </div>
              </article>
            );
          })}
        </div>

        <div className={styles.stage}>
          <div className={styles.stageInner}>
            <div className={styles.dial}>
              {FEATURES.map((item, index) => (
                <button
                  type="button"
                  key={item.number}
                  className={`${styles.dialNode}${active === index ? ` ${styles.dialNodeOn}` : ''}`}
                  onClick={() => goToStep(index)}
                  aria-label={`View ${item.kicker}`}
                  aria-current={active === index ? 'step' : undefined}
                >
                  {item.number}
                </button>
              ))}
              <span className={styles.dialCore}>
                <b>{feature.number}</b>
                <small>OF 03</small>
              </span>
            </div>

            <div className={styles.layer} key={active}>
              <ExampleFrame variant="plain" label={feature.demoLabel}>
                <Visual />
              </ExampleFrame>
            </div>

            <p className={styles.scrollPrompt}>
              <span>SCROLL TO EXPLORE</span>
              <i aria-hidden="true">↓</i>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomeNextPage({ searchParams }: { searchParams: { frame?: string } }) {
  // The compare view frames this page beside the live one, and a draft banner
  // inside the frame would make the two columns different heights for a reason
  // that has nothing to do with the design being judged.
  const framed = searchParams?.frame === '1';

  return (
    <main className="fx-page">
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      {framed ? null : (
        <div className={styles.draftBar}>
          <span className={styles.draftTag}>Draft</span>
          <span className={styles.draftWhat}>
            A candidate homepage — the live one is unchanged at <Link href="/">letsgetquoted.com</Link>.
          </span>
          <Link href="/home-compare" className={styles.draftLink}>
            Compare them side by side →
          </Link>
        </div>
      )}

      <div className="marketing-shell">
        {/* ---------------------------------------------------------------- */}
        {/* Hero                                                              */}
        {/* ---------------------------------------------------------------- */}
        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">One truck or ten crews. The full suite is yours.</p>

            <h1 className={styles.h1}>
              Build the website.
              <br />
              Win better jobs.
              <br />
              <span className="gradient-text">Run everything behind it.</span>
            </h1>

            <p className={styles.lede}>
              Launch a professional site in minutes. AI qualifies every request, alerts you to the best
              opportunities, and keeps each job moving from quote to payment.
            </p>

            <div className="actions">
              <CtaLink spec={{ label: 'Build my free site' }} className="btn primary" arrow />
              <a href="#included" className="btn secondary">
                Explore everything included
              </a>
            </div>

            <p className="hero-reassure hero-reassure-pill">
              Free to start · No credit card · <strong>Pay only when you get paid</strong>
            </p>

            <div className={styles.scalePair}>
              <span>
                <small>STARTING OUT?</small>
                <b>Look established on day one.</b>
              </span>
              <span>
                <small>ALREADY GROWING?</small>
                <b>Give every crew one system.</b>
              </span>
            </div>
          </div>

          <ExampleFrame
            variant="plain"
            className={styles.heroFigure}
            label="The dashboard on a normal morning — money in, jobs booked, leads waiting."
          >
            <HeroDashboard />
          </ExampleFrame>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Trust strip                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className={styles.trustStrip} aria-label="Product promises">
          <ul>
            {TRUST.map(([included, what]) => (
              <li key={included}>
                <b>{included}</b>
                <span>{what}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Flagship features (scroll-driven)                                 */}
        {/* ---------------------------------------------------------------- */}
        <Flagships />

        {/* ---------------------------------------------------------------- */}
        {/* The job pipeline                                                  */}
        {/* ---------------------------------------------------------------- */}
        <section className={`fastpath ${styles.pipeline}`} aria-labelledby="pipeline-title">
          <div className={styles.pipelineHead}>
            <p className="eyebrow" id="pipeline-title">
              The job pipeline
            </p>
            <span className={styles.pipelineNote}>
              <i aria-hidden="true" /> ONE CUSTOMER RECORD · START TO FINISH
            </span>
          </div>
          <ol className={`fastpath-row ${styles.pipelineRow}`}>
            {PIPELINE.map(([number, label]) => (
              <li className="fastpath-step" key={number}>
                <span className="fastpath-ic">{number}</span>
                <span className="fastpath-t">{label}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Where AI does the work                                            */}
        {/* ---------------------------------------------------------------- */}
        <section className="section-block" aria-labelledby="ai-title">
          <div className="section-heading">
            <p className="eyebrow">Four places AI saves you time</p>
            <h2 id="ai-title">
              It writes the site. Qualifies every lead.{' '}
              <span className="gradient-text">Tells you who to call first.</span>
            </h2>
            <p>
              Then it keeps those same details attached to the quote, schedule and follow-up—so nobody has to start
              over.
            </p>
          </div>

          <p className={styles.contextNote}>
            <span>REQUEST + PHOTOS</span>
            <i aria-hidden="true">→</i>
            <span>FIT + VALUE + DISTANCE</span>
            <i aria-hidden="true">→</i>
            <span>READY-TO-ACT LEAD</span>
          </p>

          <div className={styles.railHead}>
            <span>FOUR BUILT-IN HANDOFFS</span>
            <small>ONE CONNECTED WORKFLOW</small>
          </div>

          <ol className={styles.rail}>
            {AI_HANDOFFS.map((item, index) => (
              <li className={styles.railItem} key={item.number}>
                <article className={styles.railCard}>
                  <span className={styles.railNum} aria-hidden="true">
                    {item.number}
                  </span>
                  <div>
                    <small className={styles.railStage}>{item.stage}</small>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                </article>
                {index < AI_HANDOFFS.length - 1 ? (
                  <i className={styles.railArrow} aria-hidden="true">
                    →
                  </i>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Texting + the client portal                                       */}
        {/* ---------------------------------------------------------------- */}
        <section className="section-block" aria-labelledby="client-experience-title">
          <div className={styles.clientGrid}>
            <div className="section-heading">
              <p className="eyebrow">Text messaging + a client portal for every job</p>
              <h2 id="client-experience-title">
                Every job gets its own client portal.{' '}
                <span className="gradient-text">Every message stays attached.</span>
              </h2>
              <p>
                Give each homeowner one clear place to review the quote, see the schedule, follow updates and pay.
                Your team can text from the same job record, so the conversation and the work never drift apart.
              </p>
              <ul className={styles.clientBenefits}>
                {CLIENT_BENEFITS.map(([title, body]) => (
                  <li key={title}>
                    <span aria-hidden="true">✓</span>
                    <div>
                      <b>{title}</b>
                      <small>{body}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <ExampleFrame
              variant="plain"
              label="A job text conversation and the portal the same homeowner sees."
            >
              <div className={styles.clientProduct}>
                <div className={styles.console}>
                  <div className={styles.consoleTop}>
                    <span>Messages</span>
                    <small>JOB #1048 · KITCHEN REMODEL</small>
                  </div>
                  <div className={styles.contactRow}>
                    <span className={styles.avatar} aria-hidden="true">
                      AM
                    </span>
                    <div>
                      <b>Alex Morgan</b>
                      <small>Text conversation · synced to job</small>
                    </div>
                    <i>ACTIVE</i>
                  </div>
                  <div className={styles.stream}>
                    <div className={`${styles.msg} ${styles.msgOut}`}>
                      <small>BRIGHTLINE</small>
                      <p>Your estimate is ready. You can review and approve it here.</p>
                      {/* "Sent", not "Delivered": SmsStatus has no delivered
                          state and the Twilio status webhook discards the
                          carrier's delivered callback. */}
                      <span>10:14 AM · Sent</span>
                    </div>
                    <div className={`${styles.msg} ${styles.msgIn}`}>
                      <p>Approved—Tuesday morning works for us.</p>
                      <span>10:21 AM</span>
                    </div>
                    <div className={`${styles.msg} ${styles.msgOut}`}>
                      <small>BRIGHTLINE</small>
                      <p>You’re scheduled for Tuesday, 9–11 AM. We’ll text when the crew is on the way.</p>
                      <span>10:22 AM · Sent</span>
                    </div>
                  </div>
                  <div className={styles.messageFooter}>
                    <span>Reply by text…</span>
                    <span className={styles.mockPrimary}>Send</span>
                  </div>
                </div>

                <div className={styles.portal}>
                  <div className={styles.portalTop}>
                    <b>BRIGHTLINE ELECTRIC</b>
                    <small>YOUR JOB PORTAL</small>
                  </div>
                  <div className={styles.portalStatus}>
                    <span>
                      <small>JOB #1048</small>
                      <b>Kitchen lighting upgrade</b>
                    </span>
                    <em>SCHEDULED</em>
                  </div>
                  <ol className={styles.timeline}>
                    <li className={styles.tlDone}>
                      <i aria-hidden="true">✓</i>
                      <div>
                        <b>Quote approved</b>
                        <small>Today · 10:21 AM</small>
                      </div>
                    </li>
                    <li className={styles.tlNext}>
                      <i aria-hidden="true">2</i>
                      <div>
                        <b>Installation visit</b>
                        <small>Tuesday · 9–11 AM</small>
                      </div>
                    </li>
                    <li>
                      <i aria-hidden="true">3</i>
                      <div>
                        <b>Final payment</b>
                        <small>Due after work is complete</small>
                      </div>
                    </li>
                  </ol>
                  <div className={styles.portalActions}>
                    <span className={styles.mockPrimary}>View approved quote</span>
                    <span className={styles.mockSecondary}>Message contractor</span>
                  </div>
                  <p className={styles.paidNote}>
                    <b aria-hidden="true">✓</b> This portal is unique to this job.
                  </p>
                </div>
              </div>
            </ExampleFrame>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* The rest of the suite                                             */}
        {/* ---------------------------------------------------------------- */}
        <section className="section-block" id="included" aria-labelledby="included-title">
          <div className="section-heading">
            <p className="eyebrow">The rest of the job is included</p>
            <h2 id="included-title">One system from quote to review.</h2>
            <p>
              Your website is the front door. Quotes, scheduling, crews, payments and follow-up are already connected
              behind it.
            </p>
          </div>
          <ul className={styles.suiteGrid}>
            {SUITE.map(([title, body], index) => (
              <li className={styles.suiteCard} key={title}>
                <span className={styles.suiteNum} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Patchwork vs connected                                            */}
        {/* ---------------------------------------------------------------- */}
        <section className="section-block compare-band" id="difference" aria-labelledby="difference-title">
          <div className="section-heading">
            <p className="eyebrow">Built in. Not bolted on.</p>
            <h2 id="difference-title">Every handoff stays connected.</h2>
            <p>One login and one customer record—from the first website question through the final payment.</p>
          </div>

          <div className={styles.differenceProof}>
            {DIFFERENCE_PROOF.map(([title, body]) => (
              <span key={title}>
                <b>{title}</b>
                <small>{body}</small>
              </span>
            ))}
          </div>

          <div className="compare-scroll">
            <table className="compare-table">
              <caption className={styles.compareCaption}>
                The same four jobs, run as separate tools or as one connected suite.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="compare-col-head">
                    <strong>THE PATCHWORK</strong>
                    <span className="compare-head-tag">Separate tools</span>
                  </th>
                  <th scope="col" className="compare-col-head is-us">
                    <strong>LET’S GET QUOTED</strong>
                    <span className="compare-head-tag">One connected suite</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {STACK_COMPARE.map(([theirs, ours]) => (
                  <tr key={ours}>
                    <td className="compare-cell tone-bad">
                      <span className="compare-mark" aria-hidden="true">
                        ✕
                      </span>
                      <span className="compare-cell-text">{theirs}</span>
                      <span className={styles.compareStatus}>Separate</span>
                    </td>
                    <td className="compare-cell tone-good is-us">
                      <span className="compare-mark" aria-hidden="true">
                        ✓
                      </span>
                      <span className="compare-cell-text">{ours}</span>
                      <span className={styles.compareStatus}>Connected</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className={styles.compareFoot}>More logins. More copying. More places for a lead to stall.</td>
                  <td className={`${styles.compareFoot} is-us`}>
                    One job record moving forward from first click to paid.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Pricing                                                           */}
        {/* ---------------------------------------------------------------- */}
        <section className="section-block" id="pricing" aria-labelledby="pricing-title">
          <div className={styles.pricingGrid}>
            {/* The shared $0 dial replaces the flat $/0//MONTH mark that used to
                sit here. Same slot, same first column of .pricingGrid, same
                words — `/ MONTH` is Codex copy and stays verbatim; only the
                treatment changes. `inline` rather than `lead` because this
                section also carries the tier chart and the calculator, so the
                dial states the number without shouting over them. It is not an
                ExampleFrame on purpose: this is the real price, not a mock. */}
            <PriceZeroDial variant="inline" caption="/ MONTH" srLabel="$0 per month." />
            <div className="section-heading">
              <p className="eyebrow">Full suite. No monthly subscription.</p>
              <h2 id="pricing-title">
                When business is slow, <span className="gradient-text">your software bill is $0.</span>
              </h2>
              <p>
                Use the full suite without a monthly subscription. A small platform fee applies only when a homeowner
                pays you.
              </p>
              <ul className={styles.pricingPoints}>
                <li>No setup fee</li>
                <li>No contract</li>
                <li>No per-seat fee</li>
                <li>Rate drops as you grow</li>
              </ul>
            </div>
          </div>

          {/* Rates come from FEE_TIERS, the same constant the /pricing page and
              the calculator read, so a rate can never differ between pages. The
              bar height is derived from the rate rather than typed beside it —
              a chart that disagrees with its own label is worse than no chart. */}
          <div className="pricing-tiers">
            {FEE_TIERS.map((tier) => (
              <div
                className={`pricing-tier${tier.upTo === null ? ' pricing-tier-best' : ''}`}
                key={tier.tier}
              >
                <div className="pricing-tier-chart">
                  <span className="pricing-tier-rate">{tier.rate}</span>
                  <span className="pricing-tier-bar" style={{ height: `${Math.round(tier.ratePct * 144)}px` }} />
                </div>
                <span className="pricing-tier-label">Tier {tier.tier}</span>
                <span className="pricing-tier-range">{tier.rangeLabel}</span>
              </div>
            ))}
          </div>

          <HomeFeeCalculator />

          <p className={styles.fineprint}>
            Payment processing and platform fees apply to completed transactions. Stripe processing is separate and
            runs {STRIPE_PROCESSING_NOTE}.
          </p>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Close                                                             */}
        {/* ---------------------------------------------------------------- */}
        <MarketingCta
          id="final-cta"
          kicker="Built for the one-truck operator—and the crew doing $2M"
          title={
            <>
              One truck or ten crews. <span className="gradient-text">Your next stage starts here.</span>
            </>
          }
          body="Launch the site, connect the work and give your growing business one place to run."
          primary={{ label: 'Create my account', href: APP_SIGNUP_URL }}
          secondary={null}
          note="No card required · No monthly subscription · Cancel anytime"
        />

        <SiteFooter />
      </div>

      <StickyCta />
    </main>
  );
}
