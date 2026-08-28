/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  PageCTA,
  SiteFooter,
  SiteHeader,
} from '@/components/flagship/site-chrome';
import {
  FLEX_PRICE,
  LOWEST_PLATFORM_FEE,
  PLAN_PRICE_OPTIONS,
  PLAN_FEE_RANGE_LABEL,
  PUBLIC_PRICING_SUMMARY,
  STRIPE_PROCESSING_NOTE,
} from '@/lib/pricing';
import { BRAND_POSITIONING } from '@/lib/brand-messaging';
import { buildSignupUrl } from '@/lib/signup-intent';
import { cspNonce } from '@/lib/csp-nonce';
import { FEATURE_COUNT } from '@/lib/features';
import { TRADES } from '@/lib/trades';
import CinematicMessageSimulation from './CinematicMessageSimulation';
import styles from '@/components/flagship/flagship.module.css';
import JobRecordStages from './job-record-stages';
import ProductTour from './ProductTour';
import WebsiteFeaturePreview from './WebsiteFeaturePreview';
import LaunchBanner from '@/components/marketing/launch-banner';
import ThemeFab from '@/components/theme-fab';
import AllFeaturesModal from '@/components/marketing/AllFeaturesModal';
import FeaturesToolSprawlCalculator from './FeaturesToolSprawlCalculator';
import FeaturesCatalogExplorer from './FeaturesCatalogExplorer';
import themeStyles from './features-theme.module.css';

const FEATURES_URL = 'https://letsgetquoted.com/features';
const FEATURES_DESCRIPTION =
  'One connected system for contractors: free website, AI intake, quotes, scheduling, crews, and Stripe payments. Plans start at $0/month.';
const FEATURE_SIGNUP_URL = buildSignupUrl({ source: 'feature_page' });
const LOWEST_FEE_PLAN = PLAN_PRICE_OPTIONS[PLAN_PRICE_OPTIONS.length - 1];
const AI_INTAKE_WORKFLOW = BRAND_POSITIONING.workflowSteps[1];

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
 * THE HERO IS NO LONGER THE SOURCE'S. It carried a five-card strip of stage
 * names under the copy, tilted, with two notification cards floating over it.
 * Measured at 1440 the alert covered stages 04 AND 05 — a five-step story
 * hiding the two steps it was building to — and the paid card covered the job
 * record, so "Kitchen lighting upgrade" rendered as "...ograde". Underneath
 * that, five equal boxes made five equal claims and none of them was large
 * enough to read as software.
 *
 * It is a thread beside the copy now: one job, running past the reader, with
 * the real outgoing texts in it. See hero-thread.ts for where the words come
 * from and §104 of the generator for the layout.
 */

export const metadata: Metadata = {
  title: 'Contractor Software & Features',
  description: FEATURES_DESCRIPTION,
  alternates: { canonical: FEATURES_URL },
  openGraph: {
    type: 'website',
    url: FEATURES_URL,
    siteName: "Let's Get Quoted",
    title: 'Contractor Software & Features · Let’s Get Quoted',
    description: FEATURES_DESCRIPTION,
    images: [{
      url: '/product/jobs.webp',
      width: 1600,
      height: 1000,
      alt: 'The Let’s Get Quoted contractor job workflow',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contractor Software & Features · Let’s Get Quoted',
    description: FEATURES_DESCRIPTION,
    images: ['/product/jobs.webp'],
  },
};

/**
 * THE PROOF STRIP, AND WHY IT IS FOUR FACTS RATHER THAN FOUR NUMBERS.
 *
 * A page that says "turn more leads into paid jobs" and then shows nothing but
 * more of its own claims is asking to be taken on faith. The obvious fix is a
 * strip of outcomes — leads won, revenue added, stars — and we do not have one
 * of those we could stand behind: no testimonial we have permission to quote,
 * no cohort, no measured conversion lift. An invented one is the fastest way to
 * lose everything else on the page.
 *
 * So every cell here is a fact about the product, with price claims projected
 * from the canonical billing catalog rather than copied into this page.
 */
const PROOF: { stat: string; label: string }[] = [
  { stat: `${TRADES.length} trades`, label: 'Pages, FAQs and intake questions written for yours' },
  { stat: FLEX_PRICE.monthlyPrice, label: 'Flex base price; its LGQ platform fee is 1.25%' },
  { stat: PLAN_FEE_RANGE_LABEL, label: 'LGQ platform fee, selected by plan rather than payment volume' },
  { stat: `${FEATURE_COUNT} features`, label: 'One connected product; included limits and seats vary by plan' },
];

/**
 * The objections, answered where they are raised.
 *
 * Every answer here is checkable against the product rather than the pitch.
 */
const FAQ: { q: string; a: string }[] = [
  {
    q: 'What exactly does the platform fee cost me?',
    a: `${PUBLIC_PRICING_SUMMARY} The LGQ fee applies to the discount-adjusted service subtotal collected through LGQ; tax, tips, refunds, credits, and Stripe costs are excluded. Stripe's ${STRIPE_PROCESSING_NOTE} are separate.`,
  },
  {
    q: 'Can I use the domain I already own?',
    a: 'Yes. You publish immediately on the included letsgetquoted.com subdomain, then point your own domain at the site with one CNAME whenever you are ready — publishing never waits on DNS. You buy and hold the registration yourself, in your own name; we never own the address your trucks and invoices carry.',
  },
  {
    q: 'How long does setup actually take?',
    a: 'Your business name, your trade and the towns you cover are enough to generate the whole site — pages, services, FAQs and the instant estimate — in one sitting. Everything it writes stays editable, before it goes live and afterwards.',
  },
  {
    q: 'Who owns my customers and my job history?',
    a: 'You do. There is no contract and no lock-in period, and a paid plan is cancelled from your own Settings page rather than by asking us. Your clients, quotes, jobs, messages and payment history are your records, your custom domain stays registered to you, and leaving does not cost you the address your customers already know.',
  },
  {
    q: 'How do payments work — do you hold my money?',
    a: 'No. Payments run on Stripe into your own connected account, so the money goes from the homeowner to you and settles on Stripe’s normal payout schedule. We never see card numbers and never hold your balance; the platform fee comes out of the payment as it clears.',
  },
  {
    q: 'Can I start with just the website and add the rest later?',
    a: 'Yes, and most people do. The site and the instant estimate are useful on their own from the first day. Quotes, scheduling, crew, texting and payments are already in the same account waiting — you turn to them when you need them, not when a plan says you have to.',
  },
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      name: "Let's Get Quoted",
      url: FEATURES_URL,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: FEATURES_DESCRIPTION,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description: PUBLIC_PRICING_SUMMARY,
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
  ],
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
type WebsiteCapability = {
  title: string;
  body: string;
};

type WebsiteFeature = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  capabilities: WebsiteCapability[];
  demoHref: string;
  deepHref: string;
};

const WEBSITE_FEATURE: WebsiteFeature = {
  id: 'website-builder',
  eyebrow: 'BUILD THE FRONT DOOR',
  title: 'A complete contractor website, generated in minutes.',
  description:
    'Tell us your business name, trade, and service area. LGQ generates your service pages, local pages, FAQs, trust content, and instant estimate—ready to edit and publish.',
  capabilities: [
    {
      title: 'Generated trade and local pages',
      body: 'Services, town pages, FAQs, and intake questions written for your trade.',
    },
    {
      title: 'Editable themes and layout sections',
      body: 'Brand colors, typography, project galleries, video, and flexible sections.',
    },
    {
      title: 'Automatic local SEO and structured data',
      body: 'LocalBusiness, review, and breadcrumb JSON-LD for Google search presence.',
    },
    {
      title: 'Instant estimate connected to the job',
      body: 'Requests arrive with scope, photos, budget, and urgency ready to quote.',
    },
  ],
  demoHref: '/demo/sites',
  deepHref: '/features/website-builder',
};

type WorkflowFeature = {
  number: string;
  id: string;
  title: string;
  body: string;
  href: string;
  kicker: string;
  produces: readonly [string, string, string];
  actionLabel: string;
};

/* THE WORKFLOW STAGES THAT RUN BEHIND THE FRONT DOOR */
const WORKFLOW_FEATURES: WorkflowFeature[] = [
  {
    number: '01',
    id: 'smart-intake',
    title: AI_INTAKE_WORKFLOW.title,
    body: AI_INTAKE_WORKFLOW.description,
    href: AI_INTAKE_WORKFLOW.href,
    kicker: AI_INTAKE_WORKFLOW.kicker,
    produces: AI_INTAKE_WORKFLOW.produces,
    actionLabel: 'Explore AI Intake',
  },
  {
    number: '02',
    id: 'quotes',
    title: 'Quotes and approvals',
    body: 'Send an itemized quote with optional add-ons, take the signature on a phone, and collect the deposit before the truck moves.',
    href: '/features/quotes',
    kicker: 'PRICE IT AND GET IT SIGNED',
    produces: ['Itemized quote with add-ons', 'E-signature on a phone', 'Deposit before scheduling'],
    actionLabel: 'Explore Quotes',
  },
  {
    number: '03',
    id: 'scheduling',
    title: 'Scheduling and crew',
    body: 'Turn an approved quote into a booked day, assign who is going, and plan the route without retyping the job.',
    href: '/features/scheduling',
    kicker: 'PUT IT ON THE CALENDAR',
    produces: ['Approved quote → booked day', 'Crew assigned and tracked', 'Today’s route, planned'],
    actionLabel: 'Explore Scheduling',
  },
  {
    number: '04',
    id: 'client-portal',
    title: 'Customer texts and payments',
    body: 'Two-way texting, on-my-way alerts, and one link where the homeowner approves, follows and pays.',
    href: '/features/client-portal',
    kicker: 'KEEP THEM INFORMED AND GET PAID',
    produces: ['Two-way texting', 'On-my-way alerts', 'Deposits, balances and plans'],
    actionLabel: 'Explore Customer Portal',
  },
];

/* THE OPERATIONAL TOOLS MOVED INTO A COMPONENT.
 *
 * They were four stacked bands here — number, heading, sentence, two or three
 * tool cards, four times. The copy is unchanged and so are the four ids the
 * homepage links to; what changed is that they are now four stages of one job
 * record rather than four sections about four subjects. The data lives beside
 * the component that draws it, in ./job-record-stages.
 */

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        nonce={cspNonce()}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className={themeStyles.featuresTheme}>
        <div className={themeStyles.siteShell}>
          <div className={`${themeStyles.ambient} ${themeStyles.ambientOne}`} />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientTwo}`} />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientThree}`} />
          <div className={`${themeStyles.ambient} ${themeStyles.ambientFour}`} />
          <main className={`${styles.root} inner-site feature-index-page`}>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <SiteHeader />
          <LaunchBanner offsetHeader />
          <ThemeFab />

          {/* Two columns, not one. The copy keeps the left and the thread takes the
              right; every child is placed explicitly in the grid rather than
              wrapped in a column div, because .index-hero > h1 and
              .index-hero > p:not(.eyebrow) are load-bearing selectors in the
              generated sheet and a wrapper would silently drop both. */}
          <section className="index-hero index-hero-beside" id="main-content">
            <p className="eyebrow">
              <span aria-hidden="true">✦</span> ONE JOB RECORD. EVERY STEP CONNECTED.
            </p>
            <h1>
              From website lead to paid job—<em>without stitching together six tools.</em>
            </h1>
            <p>
              Your website, AI intake, quotes, scheduling, crew, customer updates, and payments all work from the same job record.
            </p>
            <div className="hero-actions">
              <a className="button primary" href={FEATURE_SIGNUP_URL}>
                Build my free site <span aria-hidden="true">→</span>
              </a>
              <a className="button secondary" href="#tour">
                Watch one job move
              </a>
            </div>

        {/* The plan range stays beside the primary action and comes from the
            same canonical catalog as /pricing. */}
        <p className="index-hero-fee">
          Flex starts at {FLEX_PRICE.platformFee} platform fee (or as low as {LOWEST_PLATFORM_FEE} on {LOWEST_FEE_PLAN.name}) on collected payments. Free to build &amp; quote.{' '}
          <Link href="/pricing">Compare exact prices and limits</Link>
        </p>

        {/* One connected Job Record workflow simulation */}
        <CinematicMessageSimulation />
      </section>

      {/* Four facts about the product, immediately after the claims that need
          them. Not outcomes, not customers, not stars — see PROOF above for
          why, and for where each number is read from. */}
      <section className="index-proof" aria-label="What an account costs and covers">
        {PROOF.map((cell) => (
          <span key={cell.stat}>
            <b>{cell.stat}</b>
            <small>{cell.label}</small>
          </span>
        ))}
      </section>

      {/* THE PRODUCT, MOVING, BEFORE THE PAGE DESCRIBES IT FIVE MORE TIMES.
          Directly above "Five connected advantages", which is the last moment
          before the page turns into a list of claims. Nothing here autoplays
          for somebody who asked for less motion or less data, and the 2.4MB is
          not fetched at all until the section is within a screen. */}
      <ProductTour />

      <section className="flagship-index" id="flagship-index">
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> FROM FRONT DOOR TO FINAL PAYMENT
          </p>
          <h2>
            Start with the website.
            <br />
            <em>Run every job behind it.</em>
          </h2>
          <p className="index-subheading">
            Attract the homeowner, qualify the work, send the quote, schedule the crew, and collect payment without rebuilding the job.
          </p>
        </div>

        {/* FEATURED WEBSITE BLOCK */}
        <article
          className="website-featured"
          id={WEBSITE_FEATURE.id}
          aria-labelledby="website-featured-title"
        >
          <div className="website-featured-copy">
            <p className="eyebrow">{WEBSITE_FEATURE.eyebrow}</p>
            <h3 id="website-featured-title">{WEBSITE_FEATURE.title}</h3>
            <p>{WEBSITE_FEATURE.description}</p>

            <ul className="website-capabilities" aria-label="Website builder capabilities">
              {WEBSITE_FEATURE.capabilities.map((capability) => (
                <li key={capability.title}>
                  <strong>{capability.title}</strong>
                  <span>{capability.body}</span>
                </li>
              ))}
            </ul>

            <div className="website-featured-actions">
              <Link className="button primary" href={WEBSITE_FEATURE.demoHref}>
                Preview site templates <span aria-hidden="true">→</span>
              </Link>
              <Link className="button secondary" href={WEBSITE_FEATURE.deepHref}>
                Explore the website builder <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <WebsiteFeaturePreview />
        </article>

        {/* FOUR WORKFLOW STAGES */}
        <div className="feature-link-grid workflow-feature-grid">
          {WORKFLOW_FEATURES.map(({ number, id, title, body, href, kicker, produces, actionLabel }) => (
            <Link href={href} key={id} id={id}>
              <span>{number}</span>
              <small>{kicker}</small>
              <h3>{title}</h3>
              <p>{body}</p>
              <ul className="feature-produces" aria-label={`What ${title} gives you`}>
                {produces.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <b>
                {actionLabel} <span aria-hidden="true">→</span>
              </b>
            </Link>
          ))}
        </div>
      </section>

      {/* QUICK STOPS, ON ITS OWN, BECAUSE IT IS A DIFFERENT KIND OF THING.
          It used to be card 03 of five, between intake and the client portal —
          in the middle of a sequence describing one job moving from a click to
          a payment, on a page whose heading promises quoting. But a Quick Stop
          is not a stage of a job; it is a second, smaller job sold into the gap
          between two others. Below the sequence it reads as the extra it is,
          and the id stays so an old /features#quick-stops link still lands. */}
      <section className="route-band" id="quick-stops" aria-labelledby="route-title">
        <div className="route-copy">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> EARN MORE FROM EVERY ROUTE
          </p>
          <h2 id="route-title">
            Sell a priority visit to the customer you were <em>already driving past.</em>
          </h2>
          <p>
            A homeowner near today&rsquo;s route asks to be seen sooner. You approve the request,
            set the fee and the window, and they pay for the visit before you go. The work itself is
            quoted and invoiced exactly like any other job.
          </p>
          <Link className="route-link" href="/features/quick-stops">
            Explore Quick Stops <span aria-hidden="true">→</span>
          </Link>
        </div>
        <ul className="route-points">
          <li>
            <b>You approve every request</b>
            <small>Nothing lands on your calendar because somebody paid for it.</small>
          </li>
          <li>
            <b>You set the priority visit fee</b>
            <small>And the radius, the window and how many you will take.</small>
          </li>
          <li>
            <b>Paid before you arrive</b>
            <small>The window is confirmed when the visit fee clears, not before.</small>
          </li>
        </ul>
      </section>

      {/* 5-APP SOFTWARE SPRAWL & ROI SAVINGS CALCULATOR */}
      <FeaturesToolSprawlCalculator />

      {/* AI BREAKTHROUGHS & FIELD DISPATCH SUITE */}
      <section className="breakthroughs-band" id="breakthroughs" aria-labelledby="breakthroughs-title" style={{ padding: '4rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> NEW FIELD &amp; AI BREAKTHROUGHS
          </p>
          <h2 id="breakthroughs-title">
            Intelligent tools built for the truck, <em>not just the desk.</em>
          </h2>
          <p>
            24/7 call answering, photo-grounded estimating, and automated morning crew briefings.
          </p>
        </div>
        <div className="feature-link-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: '2rem' }}>
          <Link href="/features/ai-voice" id="ai-voice-spotlight">
            <span style={{ fontSize: '1.25rem', color: '#0284c7' }}>🎙️</span>
            <small>24/7 AI RECEPTIONIST &amp; HOTLINE</small>
            <h3>AI Voice Assistant</h3>
            <p>Answer every homeowner call in two rings, qualify scope details, transcribe audio, and dictate job notes hands-free.</p>
            <ul className="feature-produces" aria-label="What AI Voice gives you">
              <li>24/7 call qualification</li>
              <li>Audio transcripts &amp; summaries</li>
              <li>Hands-free field dictation</li>
            </ul>
            <b>Explore AI Voice <span aria-hidden="true">→</span></b>
          </Link>

          <Link href="/features/ai-vision" id="ai-vision-spotlight">
            <span style={{ fontSize: '1.25rem', color: '#8b5cf6' }}>📸</span>
            <small>MULTIMODAL PHOTO SCOPE</small>
            <h3>AI Vision Estimator</h3>
            <p>Read equipment rating plates, detect damage patterns, and draft material pick-lists directly from uploaded photos.</p>
            <ul className="feature-produces" aria-label="What AI Vision gives you">
              <li>Equipment model OCR</li>
              <li>Material pick-list generation</li>
              <li>Visual inspection PDF reports</li>
            </ul>
            <b>Explore AI Vision <span aria-hidden="true">→</span></b>
          </Link>

          <Link href="/features/dispatch" id="dispatch-spotlight">
            <span style={{ fontSize: '1.25rem', color: '#16a34a' }}>🚚</span>
            <small>MORNING CREW BRIEFINGS</small>
            <h3>Dispatch &amp; Loadout Suite</h3>
            <p>One-click morning dispatch with turn-by-turn route maps, tool loadout checklists, hazard warnings, and gate codes.</p>
            <ul className="feature-produces" aria-label="What Dispatch gives you">
              <li>One-click crew dispatch</li>
              <li>Truck equipment checklists</li>
              <li>Site hazard &amp; lockbox alerts</li>
            </ul>
            <b>Explore Dispatch <span aria-hidden="true">→</span></b>
          </Link>
        </div>
      </section>

      {/* 56-FEATURE COMPLETE CATALOG EXPLORER */}
      <FeaturesCatalogExplorer />

      {/* INTERACTIVE FREE CONTRACTOR TOOLS SHOWCASE */}
      <section className="tools-showcase-band" id="contractor-tools" aria-labelledby="tools-showcase-title" style={{ padding: '4rem 1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> FREE CONTRACTOR TOOLS &amp; CALCULATORS
          </p>
          <h2 id="tools-showcase-title">
            Try our instant estimating and <em>margin calculators live.</em>
          </h2>
          <p>
            Deterministic 1-page PDF exports, hourly rate modeling, and profit leak diagnostics — free to use right now.
          </p>
        </div>
        <div className="feature-link-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', marginTop: '2rem' }}>
          <Link href="/tools/estimate-generator">
            <span style={{ fontSize: '1.25rem', color: '#2563eb' }}>📄</span>
            <small>INSTANT ESTIMATE BUILDER</small>
            <h3>1-Page PDF Estimate Generator</h3>
            <p>Create trade-specific, itemized estimates with 1-click presets and export clean, printable 1-page PDFs.</p>
            <ul className="feature-produces" aria-label="What Estimate Generator provides">
              <li>Clean 1-page printable PDF</li>
              <li>Trade-specific line presets</li>
              <li>Instant customer pricing view</li>
            </ul>
            <b>Open Estimate Generator <span aria-hidden="true">→</span></b>
          </Link>

          <Link href="/tools/hourly-rate-calculator">
            <span style={{ fontSize: '1.25rem', color: '#059669' }}>🧮</span>
            <small>PROFITABILITY MODELING</small>
            <h3>Hourly Rate &amp; Margin Calculator</h3>
            <p>Calculate your true billable hourly rate based on overhead, labor burden, and target gross margin.</p>
            <ul className="feature-produces" aria-label="What Hourly Rate Calculator provides">
              <li>Overhead &amp; burden rollup</li>
              <li>Target gross margin slider</li>
              <li>Minimum billable rate benchmark</li>
            </ul>
            <b>Open Rate Calculator <span aria-hidden="true">→</span></b>
          </Link>

          <Link href="/tools/leakage-calculator">
            <span style={{ fontSize: '1.25rem', color: '#d97706' }}>🔍</span>
            <small>PROFIT DIAGNOSTIC</small>
            <h3>Profit Leakage Calculator</h3>
            <p>Diagnose where your contracting business loses margin between intake, uncollected change orders, and unpaid travel.</p>
            <ul className="feature-produces" aria-label="What Leakage Calculator provides">
              <li>Unbilled change order leaks</li>
              <li>Drive time margin recovery</li>
              <li>Estimated annual revenue lift</li>
            </ul>
            <b>Open Leakage Calculator <span aria-hidden="true">→</span></b>
          </Link>
        </div>
      </section>

      {/* The light chapter. This is the break the page was missing: it reads as
          a separate chapter on cream instead of as one more dark band.

          It used to be four stacked bands — number, heading, sentence, two or
          three tool cards, four times. Every band was true and none of them
          showed what the section is actually claiming, which is that these are
          not four products but four stages of ONE record. So the record stays
          on screen and the stages move it; see job-record-stages.tsx. */}
      <section className="everything-index" aria-labelledby="everything-title">
        <div className="index-heading">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> EVERYTHING BEHIND THE WEBSITE
          </p>
          <h2 id="everything-title">
            One job record.<br />Every operational tool included.
          </h2>
          <p>
            Approve the quote once. The schedule, crew, customer updates, payment and follow-up move
            with it.
          </p>
          {/* The claim the old lede made in two sentences, in the place a
              reader is most likely to be doing the sums. */}
          <p className="everything-note">
            <span aria-hidden="true">✓</span> Core workflow on every plan · Included capacity varies
          </p>
        </div>

        <JobRecordStages />

        <p className="everything-more" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <Link href="/features/back-office">
            See everything the back office runs <span aria-hidden="true">→</span>
          </Link>
          <span aria-hidden="true" style={{ opacity: 0.35 }}>·</span>
          <AllFeaturesModal triggerLabel="Browse the full feature catalog" triggerVariant="text" />
        </p>

      </section>

      {/* THE OBJECTIONS, ANSWERED WHERE THEY ARE RAISED.
          The page's own argument raises all six: "no monthly subscription"
          raises the fee, "your own domain" raises the one you already own,
          "in minutes" raises how long it really takes, and a system that holds
          your customers and takes your money raises who owns what. Reuses the
          homepage's <details> pattern, which works before hydration and is in
          the tab order for free. */}
      <section className="home-faq home-faq-dark" id="faq" aria-labelledby="features-faq-title">
        <div className="home-faq-head">
          <p className="eyebrow">
            <span aria-hidden="true">✦</span> BEFORE YOU START
          </p>
          <h2 id="features-faq-title">The questions worth asking first.</h2>
        </div>
        {/* No `name` on the details: an exclusive accordion closes the answer
            you were reading and hides every other one from find-in-page. */}
        <div className="home-faq-list">
          {FAQ.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <PageCTA
        title="Start with the website. Grow into the whole system."
        body={`${PUBLIC_PRICING_SUMMARY} See /pricing for included capacity, add-ons, and fee terms.`}
        href={FEATURE_SIGNUP_URL}
      />
      <SiteFooter />
      </main>
        </div>
      </div>
    </>
  );
}
