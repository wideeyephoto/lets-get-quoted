import Link from 'next/link';
import type { ReactNode } from 'react';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import { FAVORITE_FEATURES, FEATURE_COUNT } from '@/lib/features';
import { TRADES } from '@/lib/trades';
import TemplateSlider from '@/components/template-slider';

// Homepage showcases a curated set of 3 flagship templates in a slider —
// the full catalog (17 and growing) lives behind "See a live demo" / the
// in-app theme picker, not stacked on the landing page.
const FEATURED_TEMPLATE_IDS = ['carbon', 'modern', 'professional'];
const featuredTemplates = FEATURED_TEMPLATE_IDS.map((id) => AVAILABLE_TEMPLATES.find((template) => template.id === id)).filter((template): template is NonNullable<typeof template> => Boolean(template));

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

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 4 6 4 9s-1.5 6.4-4 9c-2.5-2.6-4-6-4-9s1.5-6.4 4-9z" />
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

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13h3M13.5 13h3M7.5 16.5h3" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17.9 6.75 20.6l1-5.85L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 9a6 6 0 0 1 6-6h5l-2.5-2.5M20 15a6 6 0 0 1-6 6H9l2.5 2.5" />
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

// The homepage headline grid is the "favorites" set from the shared feature
// catalog (src/lib/features.ts), so it can never drift from the /features page.
// Icons are mapped here by feature id — the copy itself lives in the catalog.
const FEATURE_ICONS: Record<string, ReactNode> = {
  'hosted-website': <GlobeIcon />,
  'ai-smart-intake': <MessageIcon />,
  'client-esignature': <SignatureIcon />,
  'stripe-payments': <CardIcon />,
  'payment-plans': <BankIcon />,
  'online-booking': <CalendarIcon />,
  'recurring-plans': <RepeatIcon />,
  'review-routing': <StarIcon />,
};

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
      { tone: 'bad', text: 'Rises with seats & tiers' },
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
    label: 'Instant AI estimate on your site',
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
  { label: 'Card payments run on Stripe — we never see card numbers', icon: <ShieldIcon /> },
  { label: 'Card & bank payments run on Stripe and pay out to your account', icon: <BankIcon /> },
  { label: 'Encrypted in transit, every request', icon: <LockIcon /> },
  { label: "Your data is walled off from every other contractor's", icon: <LayersIcon /> },
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
  ],
};

export default function HomePage() {
  return (
    <main className="marketing-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-b" aria-hidden="true" />

      <section className="hero-grid">
        <div className="hero-copy">
          <div className="hero-flow-strip" aria-hidden="true">
            <span>Quote</span>
            <span className="flow-strip-arrow">&rarr;</span>
            <span>Signed</span>
            <span className="flow-strip-arrow">&rarr;</span>
            <span>Paid</span>
            <span className="flow-strip-arrow">&rarr;</span>
            <span className="flow-strip-highlight">Banked</span>
          </div>
          <h1>Quote it. Sign it. Get paid. <span className="gradient-text">Straight to your bank.</span></h1>
          <p className="hero-text">
            One tool to win the lead, quote the job, and get paid &mdash; a contractor website with an AI estimator that
            qualifies homeowners 24/7, plus e-signatures, scheduling, and Stripe payments that land straight in your
            bank. No web guy, no paper contract, no chasing checks.
          </p>
          <div className="actions">
            <Link href="/login" className="btn primary">
              Create Free Account
            </Link>
            <Link href="/demo" className="btn secondary">
              Explore the demo &mdash; no signup
            </Link>
          </div>
          <p className="hero-reassure">Free to start &middot; No credit card &middot; You only pay when a homeowner pays you.</p>
          <ul className="hero-trust-row">
            <li><MessageIcon /><span>AI intake qualifies leads 24/7</span></li>
            <li><SignatureIcon /><span>Quote, e-sign &amp; get paid on Stripe</span></li>
            <li><TrendDownIcon /><span>No subscription &mdash; fees drop to 0.65%</span></li>
          </ul>
        </div>

        <aside className="hero-panel flow-panel">
          <p className="flow-panel-eyebrow">Quote to bank, automatically</p>
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
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Your storefront</p>
          <h2>Powerful website templates made for contractors.</h2>
          <p>
            Fully customizable and designed to convert, so every visitor sees a site that impresses clients
            from the first click. Pick a look, drop in your photos, and publish to your own domain.
          </p>
        </div>
        <TemplateSlider templates={featuredTemplates} />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Built for the whole handoff</p>
          <h2>Not just a website. Not just a payment link. The whole operating loop.</h2>
          <p>The features owners lean on every day &mdash; a slice of the {FEATURE_COUNT}+ that come standard.</p>
        </div>
        <div className="feature-grid">
          {FAVORITE_FEATURES.map((item) => (
            <article key={item.id} className="feature-card">
              <span className="feature-card-icon">{FEATURE_ICONS[item.id]}</span>
              <h3>{item.name}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </div>
        <div className="mid-cta">
          <Link href="/features" className="btn secondary">See all {FEATURE_COUNT}+ features &rarr;</Link>
        </div>
      </section>

      <section className="section-block compare-band">
        <div className="section-heading">
          <p className="eyebrow">Why contractors switch</p>
          <h2>One tool doing the work of five &mdash; and you only pay when you get paid.</h2>
          <p>
            A website builder gives you a page. Field-service software rents you a login by the month. Let&apos;s Get
            Quoted is the whole operating loop &mdash; site, quotes, e-signatures, scheduling, and payments &mdash; with
            no subscription standing between you and your next job.
          </p>
        </div>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col" className="compare-corner"><span className="compare-corner-label">How it stacks up</span></th>
                {compareColumns.map((col) => (
                  <th scope="col" key={col.key} className={col.highlight ? 'compare-col-head is-us' : 'compare-col-head'}>
                    {col.highlight ? <span className="compare-head-badge">Best value</span> : null}
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
        <div className="mid-cta">
          <Link href="/login" className="btn primary">Create Free Account</Link>
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
        <p className="pricing-footnote">Platform fee only. Standard Stripe processing (about 2.9% + 30&cent; per card charge) applies separately.</p>
        <div className="mid-cta">
          <Link href="/login" className="btn primary">Create Free Account</Link>
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

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Your next quote could be the fastest payday you&apos;ve had yet.</h2>
          <p>No subscription. No setup fee. You only pay our platform fee when a homeowner actually pays you.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">
              Create Free Account
            </Link>
          </div>
        </div>
      </section>

      <footer className="marketing-footer">
        <span>© 2026 Let&apos;s Get Quoted</span>
        <nav aria-label="Legal"><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/faq">FAQ</Link><Link href="/privacy">Privacy Policy</Link><Link href="/sms-terms">SMS Terms</Link></nav>
      </footer>
    </main>
  );
}
