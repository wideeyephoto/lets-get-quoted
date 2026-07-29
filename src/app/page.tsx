import Link from 'next/link';
import { TRADES } from '@/lib/trades';
import SiteFooter from '@/components/site-footer';
import HeroDashboard from '@/components/hero-dashboard';
import StickyCta from '@/components/sticky-cta';
import FeatureWheelStory from './features/FeatureWheelStory';

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

// The "quote to bank" flow, shown as its own homepage section. The dashed
// connector between the icons flows (see .flow-step-node::after /
// @keyframes flow-line-travel in globals.css).
const moneyFlow = [
  {
    title: 'Quote sent',
    body: 'A branded quote goes out from your new site in minutes — not a PDF stapled to an email.',
    icon: <QuoteIcon />,
  },
  {
    title: 'Signed off',
    body: 'Homeowner signs from their phone. Timestamped, no printer required.',
    icon: <SignatureIcon />,
  },
  {
    title: 'Payment collected',
    body: 'Card or bank payment, processed securely through Stripe.',
    icon: <CardIcon />,
  },
  {
    title: 'In your bank',
    body: 'Funds route straight to your account — no invoicing software, no chasing checks.',
    icon: <BankIcon />,
  },
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
      { tone: 'bad', text: 'Not offered' },
      { tone: 'mid', text: 'Add-ons, often disconnected' },
    ],
  },
  {
    label: '24/7 AI Estimator on your site',
    cells: [
      { tone: 'good', text: 'Yes — qualifies leads 24/7' },
      { tone: 'bad', text: 'Not offered' },
      { tone: 'bad', text: 'Not offered' },
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
      { tone: 'bad', text: 'Not offered' },
      { tone: 'good', text: 'Usually included' },
    ],
  },
  {
    label: 'Reviews: Google import + smart routing',
    cells: [
      { tone: 'good', text: 'Built in' },
      { tone: 'bad', text: 'Not offered' },
      { tone: 'mid', text: 'Sometimes' },
    ],
  },
  {
    label: 'Recurring visits & auto-billing',
    cells: [
      { tone: 'good', text: 'Built in' },
      { tone: 'bad', text: 'Not offered' },
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
      logo: 'https://letsgetquoted.com/SITE-LOGO-1.png',
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      <div className="marketing-shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <h1>Quote it. Sign it. Get paid. <span className="gradient-text">Straight to your bank.</span></h1>
          <p className="hero-text">
            The contractor website with a 24/7 AI Estimator that turns visitors into booked jobs &mdash; then quote,
            e-sign, and get paid in one flow, straight to your bank. No web guy, no paper contracts, no chasing checks.
          </p>
          <div className="actions">
            <Link href="/login?intent=signup" className="btn primary">
              Create Free Account
            </Link>
            <Link href="/demo" className="btn secondary">
              Explore the demo &mdash; no signup
            </Link>
          </div>
          <p className="hero-reassure hero-reassure-pill">Free to start &middot; No credit card &middot; <strong>you only pay when a homeowner pays you.</strong></p>
          <ul className="hero-trust-row">
            <li><MessageIcon /><span>24/7 AI Estimator prices &amp; books leads for you</span></li>
            <li><SignatureIcon /><span>Quote, e-sign &amp; get paid on Stripe</span></li>
            <li><TrendDownIcon /><span>No monthly bill &mdash; a small fee only when you get paid (1.25% &rarr; 0.65% as you grow)</span></li>
          </ul>
        </div>

        <HeroDashboard />
      </section>
      </div>

      {/* The lifecycle wheel + everyday command center — full content width */}
      <FeatureWheelStory />

      <div className="marketing-shell">

      {/* Peak-intent CTA right after the command center, so the desire built
          across the wheel has a button in reach before the comparison. */}
      <div className="mid-cta mid-cta-lead">
        <Link href="/login?intent=signup" className="btn primary">Create Free Account</Link>
        <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
      </div>

      <section className="section-block">
        <div className="flow-band-grid">
          <div className="section-heading">
            <p className="eyebrow">Quote to bank, automatically</p>
            <h2>From first quote to money in your bank &mdash; one unbroken flow.</h2>
            <p>
              The whole trip from quote to deposit happens in one place &mdash; no paperwork, no software to juggle, no
              waiting on the mail. Four steps turn a lead into a deposit.
            </p>
          </div>
          <aside className="hero-panel flow-panel">
            <div className="flow-pipeline">
              {moneyFlow.map((step, index) => {
                const isLast = index === moneyFlow.length - 1;
                return (
                  <div className={`flow-step${isLast ? ' flow-step-final' : ''}`} key={step.title}>
                    <span className="flow-step-node">
                      <span className="flow-step-icon">{step.icon}</span>
                    </span>
                    <span className="flow-step-copy">
                      <strong>{step.title}</strong>
                      <span>{step.body}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </section>

      <div className="mid-cta">
        <Link href="/login?intent=signup" className="btn primary">Create Free Account</Link>
        <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
      </div>

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
          <span><span className="compare-mark tone-bad" aria-hidden="true">✕</span> Not offered</span>
        </p>
        <p className="compare-source">
          Category comparison vs. typical published plans as of 2026 &mdash; field-service CRMs commonly run
          $50&ndash;$300+/mo per seat and website builders $16&ndash;$49/mo, billed whether or not you book work.
        </p>
        <div className="mid-cta">
          <Link href="/login?intent=signup" className="btn primary">Create Free Account</Link>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
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
            Take the deposit by bank/ACH and Stripe&rsquo;s cut nearly disappears. Slow month with no jobs?
            <strong> $0</strong> &mdash; while a monthly CRM still bills you $200+.
          </p>
        </div>
        <div className="mid-cta">
          <Link href="/login?intent=signup" className="btn primary">Create Free Account</Link>
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

      <section className="trade-links" aria-label="Built for your trade">
        <p className="trade-links-head">Built for your trade</p>
        <div className="trade-links-row">
          {TRADES.map((trade) => (
            <Link key={trade.slug} href={`/for/${trade.slug}`}>{trade.name}</Link>
          ))}
        </div>
      </section>

      <section className="section-block hfaq-band" aria-labelledby="hfaq-title">
        <div className="hfaq-grid">
          <div className="hfaq-intro">
            <p className="eyebrow">Straight answers</p>
            <h2 id="hfaq-title">The catch? <span className="gradient-text">There isn&rsquo;t one.</span></h2>
            <p>The honest answers to what every contractor asks before trusting a new tool with their name &mdash; and their money.</p>
            <p className="hfaq-ask">Still wondering something? <a href="mailto:hello@letsgetquoted.com">Email a real human &rarr;</a></p>
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
          <p>You&apos;ve read this far and we still haven&apos;t asked for a card &mdash; and we won&apos;t until a homeowner pays you. No subscription, no setup fee, no contract, cancel anytime, and your site and clients stay yours.</p>
          <div className="actions">
            <Link href="/login?intent=signup" className="btn primary">
              Create Free Account
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
