import Link from 'next/link';
import { TRADES, FEATURED_TRADES } from '@/lib/trades';
import SiteFooter from '@/components/site-footer';
import HeroDashboard from '@/components/hero-dashboard';
import StickyCta from '@/components/sticky-cta';
import HomeFeeCalculator from '@/components/home-fee-calculator';
import FeatureWheelStory from '../features/FeatureWheelStory';
import styles from './home-next.module.css';

/**
 * A candidate homepage, running beside the live one.
 *
 * WHAT IT IS FOR. The brief was one line: a cold visitor cannot tell fast
 * enough what this is or who it is for. That is not a complaint about the
 * craft of the live page — the craft is the best thing about it — it is a
 * complaint about the first four seconds. So this keeps the brand, the palette,
 * the section rhythm and nearly all of the copy decisions, and rebuilds the
 * part of the page that has to answer "what is this, and is it for me".
 *
 * WHAT CHANGED, and why each one:
 *
 *   1. The headline names the category. "Quote it. Sign it. Get paid." is a
 *      sequence of verbs. It is a good line, and it tells you what the product
 *      DOES without ever telling you what it IS — software, an agency, a
 *      payment processor, a marketplace. You have to already know.
 *
 *   2. The audience is in the first line, not the third screen. The word
 *      "contractor" first appears on the live page in the eyebrow of the
 *      comparison band — about two and a half screens down.
 *
 *   3. It says what it is NOT. This is the big one. "Let's Get Quoted" reads,
 *      to somebody who has never heard of it, like a place a HOMEOWNER goes to
 *      get quotes. The name works against the product on first contact, and no
 *      amount of polish further down the page undoes a wrong first guess.
 *
 *   4. The trades moved up. They were the eighth section; they are the fastest
 *      "this is for me" signal on the page, and they cost one line.
 *
 *   5. The hero's three-item trust row became a four-card band with room to
 *      breathe. The middle item was fifteen words describing the AI estimator
 *      without naming it.
 *
 * WHAT DID NOT CHANGE. The comparison table, the fee tiers, the worked example,
 * the calculator, the trust badges, the reassurance cards and all seven FAQs
 * are carried across verbatim. They are the strongest material on the page and
 * none of them is what a cold visitor bounces off.
 *
 * DELIBERATE DUPLICATION. Every constant below is a copy of the one in
 * src/app/page.tsx rather than a shared import. Extracting them would mean
 * editing the live homepage to compare against the live homepage, and the whole
 * point of this route is that / cannot break while it is being judged. If this
 * page wins, it replaces page.tsx and the duplication goes with it.
 *
 * NO STRUCTURED DATA. The live page emits Organization, SoftwareApplication and
 * FAQPage JSON-LD. A noindexed draft claiming to be the same organisation is
 * not something to hand a crawler, so it is left out rather than copied.
 */

function QuoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 5.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" transform="translate(0.5 0)" />
      <path d="M6.5 9.5h11M6.5 13h6.5" />
    </svg>
  );
}

function SignatureIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 17c1.4-.9 2.3-2.6 3-4.4 1-2.6 1.6-5.6 2.9-5.6 1.1 0 1.1 2.3 2 4.6.7 1.8 1.7 2.5 2.6 1.5.9-1 1.5-3.2 2.5-3.2.8 0 1 1.3 2 1.3.9 0 1.7-.8 2.4-1.7" />
      <path d="M3 20h18" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 2.5 21.5 8H2.5L12 2.5z" />
      <path d="M4 8v10M9 8v10M15 8v10M20 8v10" />
      <path d="M2.5 21.5h19" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.6 3.6 5.6 3.6 9s-1.2 6.4-3.6 9c-2.4-2.6-3.6-5.6-3.6-9S9.6 5.6 12 3z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 2.75 19.5 5.5v5.75c0 5-3.2 8.5-7.5 10.25-4.3-1.75-7.5-5.25-7.5-10.25V5.5L12 2.75z" />
      <path d="M8.75 12.25l2.25 2.25 4.25-4.75" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 5.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" />
      <path d="M6.5 9.5h11M6.5 13h7" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3 21 8l-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="4" y="10.5" width="16" height="10" rx="2" />
      <path d="M7.5 10.5V7a4.5 4.5 0 0 1 9 0v3.5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" />
    </svg>
  );
}

/**
 * The new band, and the reason this draft exists.
 *
 * Four concrete nouns before any argument. The live page's hero asks you to
 * hold six verbs in your head — "capture, quote, sign, schedule, get paid, in
 * one connected workflow" — which only parses if you already know what kind of
 * thing is doing the capturing.
 */
const whatYouGet = [
  {
    icon: <GlobeIcon />,
    title: 'A website on your own domain',
    body: 'Pick a template built for contractors, drop in your photos, and you are live in minutes. No web guy, no hosting bill.',
  },
  {
    icon: <SparkIcon />,
    title: 'An AI estimator that works nights',
    body: 'It asks the questions you would ask, prices the job off your own numbers, and takes a booking request at 11pm on a Sunday.',
  },
  {
    icon: <SignatureIcon />,
    title: 'Quotes, e-signatures and the schedule',
    body: 'Send a quote from the truck, get it signed on a phone, put it on the calendar, and assign the crew — one thread, no re-typing.',
  },
  {
    icon: <BankIcon />,
    title: 'Money in your own bank account',
    body: 'Card, bank transfer, deposits and payment plans, running on Stripe and paying out to your account. We never hold it.',
  },
];

const fastPath = [
  { title: 'Quote sent', icon: <QuoteIcon /> },
  { title: 'Signed', icon: <SignatureIcon /> },
  { title: 'Paid', icon: <CardIcon /> },
  { title: 'In your bank', icon: <BankIcon /> },
];

// Category-based comparison (no named brands) so the claims stay defensible:
// the "usual" alternatives a contractor weighs us against. Carried across from
// the live page unchanged.
const compareColumns = [
  { key: 'lgq', label: 'Let’s Get Quoted', tag: 'One tool', highlight: true },
  { key: 'wb', label: 'Website builders', tag: 'Wix / Squarespace-type', highlight: false },
  { key: 'fs', label: 'Field-service software', tag: 'Monthly CRM suites', highlight: false },
];

type CompareCell = { tone: 'good' | 'mid' | 'bad'; text: string };
type CompareRow = { label: string; cells: [CompareCell, CompareCell, CompareCell] };

const compareRows: CompareRow[] = [
  {
    label: 'Monthly subscription',
    cells: [
      { tone: 'good', text: 'None — free to start' },
      { tone: 'bad', text: 'Flat monthly, even at $0 booked' },
      { tone: 'bad', text: 'Flat monthly, per seat' },
    ],
  },
  {
    label: 'When you actually pay',
    cells: [
      { tone: 'good', text: 'Only when a homeowner pays you' },
      { tone: 'mid', text: 'Every month, work or not' },
      { tone: 'mid', text: 'Every month, work or not' },
    ],
  },
  {
    label: 'Platform fee as you grow',
    cells: [
      { tone: 'good', text: 'Drops to 0.65% automatically' },
      { tone: 'bad', text: 'Flat — never rewards volume' },
      { tone: 'bad', text: 'Often rises with seats & tiers' },
    ],
  },
  {
    label: 'Contractor website on your domain',
    cells: [
      { tone: 'good', text: 'Premium templates, live in minutes' },
      { tone: 'good', text: 'Yes — you build & maintain it' },
      { tone: 'bad', text: 'Rare or costly bolt-on' },
    ],
  },
  {
    label: 'Quote → e-signature → payment, one flow',
    cells: [
      { tone: 'good', text: 'Built in, unbroken' },
      { tone: 'bad', text: 'Not typically built in' },
      { tone: 'mid', text: 'Add-ons, often disconnected' },
    ],
  },
  {
    label: '24/7 AI Estimator on your site',
    cells: [
      { tone: 'good', text: 'Yes — qualifies leads 24/7' },
      { tone: 'bad', text: 'Not typically built in' },
      { tone: 'bad', text: 'Not typically built in' },
    ],
  },
  {
    label: 'Deposits, payment plans & ACH',
    cells: [
      { tone: 'good', text: 'Built in on Stripe' },
      { tone: 'bad', text: 'Basic payment button at best' },
      { tone: 'mid', text: 'Some, with extra fees' },
    ],
  },
  {
    label: 'Online booking & client self-scheduling',
    cells: [
      { tone: 'good', text: 'Built in' },
      { tone: 'bad', text: 'Not typically built in' },
      { tone: 'good', text: 'Usually included' },
    ],
  },
  {
    label: 'Review requests and Google review links',
    cells: [
      { tone: 'good', text: 'Built in' },
      { tone: 'bad', text: 'Not typically built in' },
      { tone: 'mid', text: 'Sometimes' },
    ],
  },
  {
    label: 'Recurring visits & auto-billing',
    cells: [
      { tone: 'good', text: 'Built in' },
      { tone: 'bad', text: 'Not typically built in' },
      { tone: 'mid', text: 'Higher tiers only' },
    ],
  },
  {
    label: 'Move your clients & jobs over',
    cells: [
      { tone: 'good', text: 'Import clients, jobs & invoices in minutes' },
      { tone: 'bad', text: 'Not a CRM — nothing to import' },
      { tone: 'mid', text: 'Manual export or paid onboarding' },
    ],
  },
  {
    label: 'Time to get started',
    cells: [
      { tone: 'good', text: 'Minutes, no developer' },
      { tone: 'mid', text: 'Hours to days' },
      { tone: 'bad', text: 'Sales call & onboarding' },
    ],
  },
];

const TONE_MARK: Record<CompareCell['tone'], string> = { good: '✓', mid: '~', bad: '✕' };

const feeTiers = [
  { tier: 1, rate: '1.25%', range: '$0–$100k', barHeight: 180 },
  { tier: 2, rate: '1.00%', range: '$100k–$300k', barHeight: 144 },
  { tier: 3, rate: '0.80%', range: '$300k–$750k', barHeight: 115 },
  { tier: 4, rate: '0.65%', range: '$750k+', barHeight: 94 },
];

const trustBadges = [
  { label: 'Card & bank payments run on Stripe — we never touch card numbers', icon: <ShieldIcon /> },
  { label: 'Money pays out straight to your own bank account', icon: <BankIcon /> },
  { label: 'Encrypted in transit, every request', icon: <LockIcon /> },
  { label: "Your data is walled off from every other contractor's", icon: <LayersIcon /> },
];

const homeFaqs = [
  {
    q: 'So what’s the catch?',
    a: 'There isn’t one. No subscription, no setup fee, no contract. You build your site, send quotes, and run jobs for free — we only take a small platform fee (1.25%, dropping to 0.65% as you grow) when a homeowner actually pays you. In a month you book nothing, you pay nothing.',
  },
  {
    q: 'Do you hold my money?',
    a: 'Never. Payments run on Stripe and land straight in your own bank account — we never touch your card numbers or park your cash. Our fee comes out of the payment automatically, the moment it clears.',
  },
  {
    q: 'How fast do I actually get paid?',
    a: 'Card and bank payments settle to your account on Stripe’s standard payout schedule — typically a couple of business days after a homeowner pays. You watch every payment land in your dashboard in real time.',
  },
  {
    q: 'Am I locked in? Do I keep my clients and my domain?',
    a: 'You’re never locked in — there’s no contract and you can leave whenever you like. Your clients and job history stay yours, and any custom domain you connect is yours to keep.',
  },
  {
    q: 'Do I need my own website already?',
    a: 'No — building it is the first thing the platform does. Pick a template made for contractors, drop in your photos, and you’re live on your own domain in minutes. No web guy, no monthly hosting bill.',
  },
  {
    q: 'Will this get me more leads, or just organize the ones I have?',
    a: 'Both — and here’s the honest line between them. Your new site plus the 24/7 AI Estimator captures and qualifies every visitor who lands on it, day or night, so far more of the traffic you already earn turns into booked jobs and not one lead slips through the cracks. It isn’t a lead-gen ad service — it makes the leads you’re already getting actually convert.',
  },
  {
    q: 'Is the AI going to talk to my customers without me?',
    a: 'Only the way you tell it to. You set your prices and the rules; the AI answers and prices jobs around the clock and alerts you the moment a real lead comes in. You stay the face of your business — nothing reaches a homeowner without your say.',
  },
];

export default function HomeNextPage({ searchParams }: { searchParams: { frame?: string } }) {
  // The compare view frames this page beside the live one, and a draft banner
  // inside the frame would make the two columns different heights for a reason
  // that has nothing to do with the design being judged.
  const framed = searchParams.frame === '1';

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
        <section className="hero-grid">
          <div className="hero-copy">
            {/* Who it is for, before anything else. On the live page the word
                "contractor" does not appear until the comparison band. */}
            <p className={`eyebrow ${styles.audience}`}>Software for contractors &amp; home-service pros</p>

            <h1 className={styles.h1}>
              Run your whole business from one place.{' '}
              <span className="gradient-text">Pay nothing until a homeowner pays you.</span>
            </h1>

            <p className={styles.lede}>
              Let&rsquo;s Get Quoted is the system a contracting business runs on: your website, an AI that quotes
              leads around the clock, e-signed quotes, the schedule, your crew, and payments that land in your own
              bank account.
            </p>

            {/* The disambiguation. The name reads, to somebody who has never
                heard of it, like somewhere a HOMEOWNER goes to get quotes —
                and a wrong first guess is not recoverable further down a page. */}
            <p className={styles.notThis}>
              Not a lead marketplace &mdash; we don&rsquo;t sell you leads. Not a website builder you have to wire up
              yourself. It&rsquo;s the software your business runs on, from the first click on your site to the money
              in your account.
            </p>

            <div className="actions">
              <Link href="/login?intent=signup" className="btn primary">
                Create free account
              </Link>
              <Link href="/demo" className="btn secondary">
                Explore the demo &mdash; no signup
              </Link>
            </div>

            <p className="hero-reassure hero-reassure-pill">
              Free to start &middot; No credit card &middot; <strong>you only pay when a homeowner pays you.</strong>
            </p>
          </div>

          <HeroDashboard />
        </section>

        {/* Four nouns before any argument — what the thing actually is. */}
        <section className={styles.whatBand} aria-label="What you get">
          <ul className={styles.whatGrid}>
            {whatYouGet.map((item) => (
              <li className={styles.whatCard} key={item.title}>
                <span className={styles.whatIcon}>{item.icon}</span>
                <h2 className={styles.whatTitle}>{item.title}</h2>
                <p className={styles.whatBody}>{item.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="fastpath" aria-label="From quote to cash, in four steps">
          <ol className="fastpath-row">
            {fastPath.map((step) => (
              <li className="fastpath-step" key={step.title}>
                <span className="fastpath-ic">{step.icon}</span>
                <span className="fastpath-t">{step.title}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Moved up from eighth. The fastest "this is for me" signal on the
            page, and it costs one line. */}
        <section className="trade-links" aria-label="Built for your trade">
          <p className="trade-links-head">Built for your trade</p>
          <div className="trade-links-row">
            {FEATURED_TRADES.map((trade) => (
              <Link key={trade.slug} href={`/for/${trade.slug}`}>
                {trade.name}
              </Link>
            ))}
            <Link href="/for" className="trade-links-all">
              See all {TRADES.length} trades &rarr;
            </Link>
          </div>
        </section>
      </div>

      {/* The lifecycle wheel + everyday command center — full content width */}
      <FeatureWheelStory />

      <div className="marketing-shell">
        <section className="section-block compare-band">
          <div className="section-heading">
            <p className="eyebrow">Why contractors switch</p>
            <h2>
              One tool doing the work of five &mdash;{' '}
              <span className="gradient-text">and you only pay when you get paid.</span>
            </h2>
            <p>
              A website builder gives you a page. Field-service software rents you a login by the month. Let&apos;s Get
              Quoted runs the whole job &mdash; your website, quotes, signatures, scheduling, and payments &mdash; with
              no monthly subscription standing between you and your next job.
            </p>
          </div>
          <div className="compare-scroll">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col" className="compare-corner">
                    <span className="compare-corner-label">How it stacks up</span>
                  </th>
                  {compareColumns.map((col) => (
                    <th scope="col" key={col.key} className={col.highlight ? 'compare-col-head is-us' : 'compare-col-head'}>
                      {col.highlight ? <span className="compare-head-badge">No monthly fee</span> : null}
                      <strong>{col.label}</strong>
                      <span className="compare-head-tag">{col.tag}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compareRows.map((row) => (
                  <tr key={row.label}>
                    <th scope="row" className="compare-row-label">
                      {row.label}
                    </th>
                    {row.cells.map((cell, index) => (
                      <td
                        key={compareColumns[index].key}
                        className={`compare-cell tone-${cell.tone}${compareColumns[index].highlight ? ' is-us' : ''}`}
                      >
                        <span className="compare-mark" aria-hidden="true">
                          {TONE_MARK[cell.tone]}
                        </span>
                        <span className="compare-cell-text">{cell.text}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="compare-legend">
            <span>
              <span className="compare-mark tone-good" aria-hidden="true">
                ✓
              </span>{' '}
              Built in
            </span>
            <span>
              <span className="compare-mark tone-mid" aria-hidden="true">
                ~
              </span>{' '}
              Partial or extra cost
            </span>
            <span>
              <span className="compare-mark tone-bad" aria-hidden="true">
                ✕
              </span>{' '}
              Not typically built in
            </span>
          </p>
          <p className="compare-source">
            Category comparison vs. typical published plans as of 2026 &mdash; field-service CRMs commonly run
            $50&ndash;$300+/mo per seat and website builders $16&ndash;$49/mo, billed whether or not you book work.
          </p>
        </section>

        <section className="section-block pricing-band">
          <div className="section-heading">
            <p className="eyebrow">Transparent pricing</p>
            <h2>The more you grow, the less you pay.</h2>
            <p>
              You only pay when a homeowner actually pays you &mdash; no subscription, no setup fee. Our platform fee
              scales down automatically with your trailing 12-month volume, with no calls to sales.
            </p>
          </div>
          <div className="pricing-tiers">
            {feeTiers.map((t) => (
              <div className={`pricing-tier${t.tier === 4 ? ' pricing-tier-best' : ''}`} key={t.tier}>
                <div className="pricing-tier-chart">
                  <span className="pricing-tier-rate">{t.rate}</span>
                  <span className="pricing-tier-bar" style={{ height: `${t.barHeight}px` }} />
                </div>
                <span className="pricing-tier-label">Tier {t.tier}</span>
                <span className="pricing-tier-range">{t.range}</span>
              </div>
            ))}
          </div>
          <div className="pricing-takehome">
            <p className="pricing-takehome-h">What a real job actually costs you</p>
            <ul className="pricing-takehome-rows">
              <li>
                <span>A $2,140 job, collected</span>
                <span className="v">$2,140</span>
              </li>
              <li>
                <span>Platform fee (1.25%)</span>
                <span className="v">&minus;$26.75</span>
              </li>
              <li>
                <span>Stripe processing (2.9% + 30&cent;)</span>
                <span className="v">&minus;$62.36</span>
              </li>
              <li className="keep">
                <span>You keep</span>
                <span className="v">~$2,051</span>
              </li>
            </ul>
            <p className="pricing-takehome-note">
              ACH processing is typically less expensive than card processing. Current Stripe fees apply. Slow month
              with no jobs? <strong>$0</strong> &mdash; while a monthly CRM still bills you $200+.
            </p>
          </div>
          <HomeFeeCalculator />
          <div className="mid-cta">
            <Link href="/login?intent=signup" className="btn primary">
              Create free account
            </Link>
            <Link href="/pricing" className="btn secondary">
              See full pricing &amp; fee calculator &rarr;
            </Link>
          </div>
        </section>

        <section className="section-block proof-band">
          <div className="section-heading">
            <p className="eyebrow">Under the hood</p>
            <h2>Built on infrastructure contractors can trust with real money.</h2>
          </div>
          <div className="trust-badge-row">
            {trustBadges.map((badge) => (
              <div className="trust-badge" key={badge.label}>
                <span className="trust-badge-icon">{badge.icon}</span>
                <span>{badge.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section-block reassure-band">
          <div className="section-heading">
            <p className="eyebrow">No strings</p>
            <h2>The things you&rsquo;d ask before trusting us with your money.</h2>
          </div>
          <div className="reassure-row">
            <div className="reassure-card">
              <span className="reassure-ic">
                <ClockIcon />
              </span>
              <h3>Paid in 1&ndash;2 business days</h3>
              <p>
                Card and bank payments land in your <strong>own</strong> bank account through Stripe &mdash; typically
                within a couple of business days of a homeowner paying. We never hold your money.
              </p>
            </div>
            <div className="reassure-card">
              <span className="reassure-ic">
                <ExportIcon />
              </span>
              <h3>Never locked in</h3>
              <p>
                No contract, cancel anytime. Export your clients, jobs and invoices to a spreadsheet whenever you like
                &mdash; your data leaves with you, and any domain you connect stays yours.
              </p>
            </div>
            <div className="reassure-card">
              <span className="reassure-ic">
                <MessageIcon />
              </span>
              <h3>A real person, not a ticket bot</h3>
              <p>
                When money&rsquo;s on the line you reach an actual human on our team &mdash; no phone tree, no
                outsourced queue, no bouncing around a help desk.
              </p>
            </div>
          </div>
        </section>

        <section className="section-block hfaq-band" aria-labelledby="hfaq-title">
          <div className="hfaq-grid">
            <div className="hfaq-intro">
              <p className="eyebrow">Straight answers</p>
              <h2 id="hfaq-title">
                The catch? <span className="gradient-text">There isn&rsquo;t one.</span>
              </h2>
              <p>
                The honest answers to what every contractor asks before trusting a new tool with their name &mdash; and
                their money.
              </p>
              <p className="hfaq-ask">
                Still wondering something? <Link href="/demo">See it live in the demo &rarr;</Link>
              </p>
            </div>
            <div className="hfaq-list">
              {homeFaqs.map((faq, index) => (
                <details className="hfaq-item" key={faq.q} open={index === 0}>
                  <summary>
                    <span className="hfaq-q">{faq.q}</span>
                    <span className="hfaq-mark" aria-hidden="true" />
                  </summary>
                  <div className="hfaq-a">
                    <p>{faq.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="cta-band">
          <div className="cta-band-inner">
            <p className="eyebrow">Ready when you are</p>
            <h2>Your next quote could be the fastest payday you&apos;ve had yet.</h2>
            <p>No card required. Platform and Stripe processing fees apply only when you collect a payment.</p>
            <div className="actions">
              <Link href="/login?intent=signup" className="btn primary">
                Create free account
              </Link>
              <Link href="/demo" className="btn secondary">
                Explore the demo &mdash; no signup
              </Link>
            </div>
            <p className="cta-recap">
              Free to start includes your website, the 24/7 AI Estimator, e-sign, scheduling, payments &amp; reviews
              &mdash; all of it.
            </p>
            <p className="cta-nudge">Set it up tonight &mdash; your first quote can go out in the morning.</p>
          </div>
        </section>

        <SiteFooter />
      </div>

      <StickyCta />
    </main>
  );
}
