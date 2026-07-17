import Link from 'next/link';
import { AVAILABLE_TEMPLATES } from '@/lib/templates/types';
import TemplateSlider from '@/components/template-slider';

export const dynamic = 'force-dynamic';

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

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M12 3v11.5M8 11l4 4 4-4" />
      <path d="M4.5 16v3a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3" />
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

const featureGrid = [
  {
    title: 'Premium websites, live in minutes',
    body: 'Three professionally designed templates. Add your photos and go — no page builder, no developer.',
    icon: <GlobeIcon />,
  },
  {
    title: 'Job costing that shows real margin',
    body: 'Track labor and materials against every job so profit is visible before the invoice goes out.',
    icon: <LayersIcon />,
  },
  {
    title: 'E-signatures, built in',
    body: 'Homeowners sign from their phone. Every signature is timestamped and locked to the record.',
    icon: <SignatureIcon />,
  },
  {
    title: 'Stripe Connect payments',
    body: 'Card and bank payments processed through Stripe, with your fee tier tracked automatically.',
    icon: <CardIcon />,
  },
  {
    title: 'Automatic SMS updates',
    body: 'You and your homeowner both get a text the moment a quote is signed or a payment lands.',
    icon: <MessageIcon />,
  },
  {
    title: 'Clean accounting export',
    body: 'Push a ready-to-import CSV to QuickBooks instead of rebuilding the same report every month.',
    icon: <ExportIcon />,
  },
];

const feeTiers = [
  { tier: 1, rate: '1.25%', range: '$0\u2013$100k', barHeight: 180 },
  { tier: 2, rate: '1.00%', range: '$100k\u2013$300k', barHeight: 144 },
  { tier: 3, rate: '0.80%', range: '$300k\u2013$750k', barHeight: 115 },
  { tier: 4, rate: '0.65%', range: '$750k+', barHeight: 94 },
];

const trustBadges = [
  { label: 'PCI-compliant payments via Stripe', icon: <ShieldIcon /> },
  { label: 'Direct-to-bank payouts via Stripe Connect', icon: <BankIcon /> },
  { label: 'Encrypted in transit, every request', icon: <LockIcon /> },
  { label: 'Row-level data isolation per account', icon: <LayersIcon /> },
];

export default function HomePage() {
  return (
    <main className="marketing-shell">
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
            Let&apos;s Get Quoted pairs a premium, professionally designed website with a payment engine built on
            Stripe Connect &mdash; so a signed quote turns into a bank deposit without you chasing a single check.
          </p>
          <div className="actions">
            <Link href="/login" className="btn primary">
              Create Free Account
            </Link>
            <Link href="/demo" className="btn secondary">
              See It in Action
            </Link>
          </div>
          <ul className="hero-trust-row">
            <li><ShieldIcon /><span>Bank-grade payouts via Stripe Connect</span></li>
            <li><SignatureIcon /><span>E-signatures built in</span></li>
            <li><TrendDownIcon /><span>Fees drop to 0.65% as you grow</span></li>
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
        </div>
        <div className="feature-grid">
          {featureGrid.map((item) => (
            <article key={item.title} className="feature-card">
              <span className="feature-card-icon">{item.icon}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block pricing-band">
        <div className="section-heading">
          <p className="eyebrow">Transparent pricing</p>
          <h2>The more you grow, the less you pay.</h2>
          <p>
            Our platform fee scales down automatically with your trailing 12-month payment volume &mdash; no calls
            to sales, no renegotiating.
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
        <p className="pricing-footnote">Platform fee only &mdash; standard Stripe card-processing fees apply separately.</p>
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
        <nav aria-label="Legal"><Link href="/privacy">Privacy Policy</Link><Link href="/sms-terms">SMS Terms</Link></nav>
      </footer>
    </main>
  );
}
