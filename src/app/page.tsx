import Link from 'next/link';
import { TRADES, FEATURED_TRADES } from '@/lib/trades';
import SiteFooter from '@/components/site-footer';
import HeroDashboard from '@/components/hero-dashboard';
import StickyCta from '@/components/sticky-cta';
import HomeFeeCalculator from '@/components/home-fee-calculator';
import FeatureWheelStory from './features/FeatureWheelStory';
import { cspNonce } from '@/lib/csp-nonce';

function QuoteIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 5.5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" transform="translate(0.5 0)" />
      <path d="M6.5 9.5h11M6.5 13h6.5" />
    </svg>
  );
}

function SignatureIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M3 17c1.4-.9 2.3-2.6 3-4.4 1-2.6 1.6-5.6 2.9-5.6 1.1 0 1.1 2.3 2 4.6.7 1.8 1.7 2.5 2.6 1.5.9-1 1.5-3.2 2.5-3.2.8 0 1 1.3 2 1.3.9 0 1.7-.8 2.4-1.7" />
      <path d="M3 20h18" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2.2" />
      <path d="M2.5 9.5h19" />
      <path d="M6 14.5h4" />
    </svg>
  );
}

function BankIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 2.5 21.5 8H2.5L12 2.5z" />
      <path d="M4 8v10M9 8v10M15 8v10M20 8v10" />
      <path d="M2.5 21.5h19" />
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

function TrendDownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 7l6 6 4-4 7 8" />
      <path d="M21 10.5v6.5h-6.5" />
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

// The skimmer's fast path — the whole quote-to-bank story in four beats, shown
// as a compact strip right under the hero so the linear promise survives a fast
// scroll (the wheel + command center tell the long version below).
const fastPath = [
  { title: 'Quote sent', icon: <QuoteIcon /> },
  { title: 'Signed', icon: <SignatureIcon /> },
  { title: 'Paid', icon: <CardIcon /> },
  { title: 'In your bank', icon: <BankIcon /> },
];

// Category-based comparison (no named brands) so the claims stay defensible:
// the "usual" alternatives a contractor weighs us against.
const compareColumns = [
  { key: 'lgq', label: "Let’s Get Quoted", tag: 'One tool', highlight: true },
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
  { tier: 1, rate: '1.25%', range: '$0\u2013$100k', barHeight: 180 },
  { tier: 2, rate: '1.00%', range: '$100k\u2013$300k', barHeight: 144 },
  { tier: 3, rate: '0.80%', range: '$300k\u2013$750k', barHeight: 115 },
  { tier: 4, rate: '0.65%', range: '$750k+', barHeight: 94 },
];

const trustBadges = [
  { label: 'Card & bank payments run on Stripe — we never touch card numbers', icon: <ShieldIcon /> },
  { label: 'Money pays out straight to your own bank account', icon: <BankIcon /> },
  { label: 'Encrypted in transit, every request', icon: <LockIcon /> },
  { label: "Your data is walled off from every other contractor's", icon: <LayersIcon /> },
];

// On-page answers to the "what's the catch" objections — also emitted as
// FAQPage structured data below (only questions answered in visible text).
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

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: "Let's Get Quoted",
      url: 'https://letsgetquoted.com',
      // The current mark. SITE-LOGO-1.png is a previous brand and is what
      // search results were showing.
      logo: 'https://letsgetquoted.com/favicon.png',
    },
    {
      '@type': 'SoftwareApplication',
      name: "Let's Get Quoted",
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'An all-in-one platform for contractors: a marketing website with an AI lead estimator, quotes and e-signatures, scheduling, recurring billing, reviews, and Stripe payments that pay out to your bank. No subscription — you only pay when a homeowner pays you.',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
        description:
          'Free to start. No subscription or setup fee — a platform fee of 0.65%–1.25% applies only when a homeowner pays you.',
      },
    },
    {
      '@type': 'FAQPage',
      mainEntity: homeFaqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    },
  ],
};

export default function HomePage() {
  return (
    <main className="fx-page">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      <div className="marketing-shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <h1>Quote it. Sign it. Get paid. <span className="gradient-text">Straight to your bank.</span></h1>
          <p className="hero-text">
            Turn website visitors into qualified leads and booking requests, then send quotes, collect signatures,
            schedule work, and get paid in one connected workflow.
          </p>
          <div className="actions">
            <Link href="/login?intent=signup" className="btn primary">
              Create free account
            </Link>
            <Link href="/demo" className="btn secondary">
              Explore the demo &mdash; no signup
            </Link>
          </div>
          <p className="hero-reassure hero-reassure-pill">Free to start &middot; No credit card &middot; <strong>you only pay when a homeowner pays you.</strong></p>
          <ul className="hero-trust-row">
            <li><MessageIcon /><span>Collects job details, provides an estimated range, and accepts booking requests 24/7</span></li>
            <li><SignatureIcon /><span>Quote, e-sign &amp; get paid on Stripe</span></li>
            <li><TrendDownIcon /><span>No monthly subscription. Platform and Stripe processing fees apply when you collect payment (1.25% &rarr; 0.65% as you grow)</span></li>
          </ul>
        </div>

        <HeroDashboard />
      </section>

      {/* Skimmer's fast path — the linear quote→bank promise in one glance,
          before the long-form wheel below. */}
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
      </div>

      {/* The lifecycle wheel + everyday command center — full content width */}
      <FeatureWheelStory />

      <div className="marketing-shell">

      {/* The sign-up CTA used to appear five times on this page, each with the
          same no-card promise underneath. Past about three it stops reading as
          confidence and starts reading as anxiety — the page arguing with an
          objection nobody raised. Three remain: the hero, one after the pricing
          section where somebody has just worked out what it costs, and the
          closing band. This one, and the one after the comparison table, are
          gone; the demo link a few lines down still catches the same intent
          without asking for a signup. */}
      <section className="section-block compare-band">
        <div className="section-heading">
          <p className="eyebrow">Why contractors switch</p>
          <h2>One tool doing the work of five &mdash; and <span className="gradient-text">you only pay when you get paid.</span></h2>
          <p>
            A website builder gives you a page. Field-service software rents you a login by the month. Let&apos;s Get
            Quoted runs the whole job &mdash; your website, quotes, signatures, scheduling, and payments &mdash; with no
            monthly subscription standing between you and your next job.
          </p>
        </div>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col" className="compare-corner"><span className="compare-corner-label">How it stacks up</span></th>
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
                  <th scope="row" className="compare-row-label">{row.label}</th>
                  {row.cells.map((cell, index) => (
                    <td
                      key={compareColumns[index].key}
                      className={`compare-cell tone-${cell.tone}${compareColumns[index].highlight ? ' is-us' : ''}`}
                    >
                      <span className="compare-mark" aria-hidden="true">{TONE_MARK[cell.tone]}</span>
                      <span className="compare-cell-text">{cell.text}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="compare-legend">
          <span><span className="compare-mark tone-good" aria-hidden="true">✓</span> Built in</span>
          <span><span className="compare-mark tone-mid" aria-hidden="true">~</span> Partial or extra cost</span>
          <span><span className="compare-mark tone-bad" aria-hidden="true">✕</span> Not typically built in</span>
        </p>
        <p className="compare-source">
          Category comparison vs. typical published plans as of 2026 &mdash; field-service CRMs commonly run
          $50&ndash;$300+/mo per seat and website builders $16&ndash;$49/mo, billed whether or not you book work.
        </p>
        {/* Second of the two removed sign-up CTAs — see the note above the
            comparison band. The pricing section immediately below carries the
            one that matters here. */}
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
            <li><span>A $2,140 job, collected</span><span className="v">$2,140</span></li>
            <li><span>Platform fee (1.25%)</span><span className="v">&minus;$26.75</span></li>
            <li><span>Stripe processing (2.9% + 30&cent;)</span><span className="v">&minus;$62.36</span></li>
            <li className="keep"><span>You keep</span><span className="v">~$2,051</span></li>
          </ul>
          <p className="pricing-takehome-note">
            ACH processing is typically less expensive than card processing. Current Stripe fees apply. Slow month
            with no jobs? <strong>$0</strong> &mdash; while a monthly CRM still bills you $200+.
          </p>
        </div>
        <HomeFeeCalculator />
        <div className="mid-cta">
          <Link href="/login?intent=signup" className="btn primary">Create free account</Link>
          <Link href="/pricing" className="btn secondary">See full pricing &amp; fee calculator &rarr;</Link>
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
            <span className="reassure-ic"><ClockIcon /></span>
            <h3>Paid in 1&ndash;2 business days</h3>
            <p>Card and bank payments land in your <strong>own</strong> bank account through Stripe &mdash; typically within a couple of business days of a homeowner paying. We never hold your money.</p>
          </div>
          <div className="reassure-card">
            <span className="reassure-ic"><ExportIcon /></span>
            <h3>Never locked in</h3>
            <p>No contract, cancel anytime. Export your clients, jobs and invoices to a spreadsheet whenever you like &mdash; your data leaves with you, and any domain you connect stays yours.</p>
          </div>
          <div className="reassure-card">
            <span className="reassure-ic"><MessageIcon /></span>
            <h3>A real person, not a ticket bot</h3>
            <p>When money&rsquo;s on the line you reach an actual human on our team &mdash; no phone tree, no outsourced queue, no bouncing around a help desk.</p>
          </div>
        </div>
      </section>

      <section className="trade-links" aria-label="Built for your trade">
        <p className="trade-links-head">Built for your trade</p>
        <div className="trade-links-row">
          {FEATURED_TRADES.map((trade) => (
            <Link key={trade.slug} href={`/for/${trade.slug}`}>{trade.name}</Link>
          ))}
          <Link href="/for" className="trade-links-all">See all {TRADES.length} trades &rarr;</Link>
        </div>
      </section>

      <section className="section-block hfaq-band" aria-labelledby="hfaq-title">
        <div className="hfaq-grid">
          <div className="hfaq-intro">
            <p className="eyebrow">Straight answers</p>
            <h2 id="hfaq-title">The catch? <span className="gradient-text">There isn&rsquo;t one.</span></h2>
            <p>The honest answers to what every contractor asks before trusting a new tool with their name &mdash; and their money.</p>
            <p className="hfaq-ask">Still wondering something? <Link href="/demo">See it live in the demo &rarr;</Link></p>
          </div>
          <div className="hfaq-list">
            {homeFaqs.map((faq, index) => (
              <details className="hfaq-item" key={faq.q} open={index === 0}>
                <summary>
                  <span className="hfaq-q">{faq.q}</span>
                  <span className="hfaq-mark" aria-hidden="true" />
                </summary>
                <div className="hfaq-a"><p>{faq.a}</p></div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Your next quote could be the fastest payday you&apos;ve had yet.</h2>
          {/* The no-card promise is already made in the hero, in the pricing
              section and on the "Never locked in" card. Saying it a fourth time
              here, at length, was the page protesting. */}
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
            Free to start includes your website, the 24/7 AI Estimator, e-sign, scheduling, payments &amp; reviews &mdash; all of it.
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
