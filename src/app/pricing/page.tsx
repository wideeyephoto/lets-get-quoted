import Link from 'next/link';
import type { Metadata } from 'next';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import { FEATURE_COUNT } from '@/lib/features';
import PricingCalculator from './PricingCalculator';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';

export const metadata: Metadata = {
  title: 'Pricing — Let’s Get Quoted',
  description:
    'No subscription and no setup fee. A platform fee of 0.65%–1.25% applies only when a homeowner pays you, and drops as you grow. Try the fee calculator.',
  alternates: { canonical: 'https://letsgetquoted.com/pricing' },
};

// Presentation heights for the tier bars — tallest tier is the highest rate.
const BAR_HEIGHTS = [180, 144, 115, 94];

const included = [
  'Your contractor website + free subdomain',
  'AI instant estimate & lead intake',
  'Quotes, e-signatures & the client portal',
  'Scheduling, online booking & reminders',
  'Jobs, crew, hours & the field app',
  'Recurring plans & auto-billing',
  'Reviews, campaigns & rebook',
  'Insights, tax reports & QuickBooks export',
];

const pricingFaqs = [
  {
    q: 'What do I pay to start?',
    a: 'Nothing. There’s no subscription and no setup fee — you build your site, send quotes, and run jobs for free.',
  },
  {
    q: 'When am I charged?',
    a: 'Only when a homeowner actually pays you through the platform. The fee comes out of that payment automatically.',
  },
  {
    q: 'What about card processing?',
    a: `Standard Stripe processing (${STRIPE_PROCESSING_NOTE}) applies separately and goes to Stripe, not to us.`,
  },
  {
    q: 'How does the rate drop?',
    a: 'The platform fee is marginal across your trailing-12-month volume — as you collect more, each new bracket is charged at a lower rate, all the way down to 0.65%. It happens automatically, with no call to sales.',
  },
];

const pricingJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: pricingFaqs.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function PricingPage() {
  return (
    <main className="marketing-shell">
      <script type="application/ld+json" nonce={cspNonce()} dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd) }} />
      <div className="ambient-glow ambient-glow-a" aria-hidden="true" />

      <section className="section-block features-hero">
        <div className="section-heading">
          <p className="eyebrow">Pricing</p>
          <h2>No subscription. You only pay when you get paid.</h2>
          <p>
            Every one of the {FEATURE_COUNT}+ features is included from day one. There&apos;s no setup fee and nothing to
            cancel — just a small platform fee when a homeowner actually pays you, and it drops as you grow.
          </p>
        </div>
        <div className="actions">
          <Link href="/login" className="btn primary">Create Free Account</Link>
          <Link href="/demo" className="btn secondary">Explore the demo &mdash; no signup</Link>
        </div>
      </section>

      <section className="section-block pricing-band">
        <div className="section-heading">
          <p className="eyebrow">The more you grow, the less you pay</p>
          <h2>One simple fee, four tiers.</h2>
          <p>The platform fee is marginal across your trailing 12-month volume &mdash; each bracket bills at a lower rate.</p>
        </div>
        <div className="pricing-tiers">
          {FEE_TIERS.map((tier, index) => (
            <div className={`pricing-tier${tier.tier === 4 ? ' pricing-tier-best' : ''}`} key={tier.tier}>
              <div className="pricing-tier-chart">
                <span className="pricing-tier-rate">{tier.rate}</span>
                <span className="pricing-tier-bar" style={{ height: `${BAR_HEIGHTS[index]}px` }} />
              </div>
              <span className="pricing-tier-label">Tier {tier.tier}</span>
              <span className="pricing-tier-range">{tier.rangeLabel}</span>
            </div>
          ))}
        </div>
        <p className="pricing-footnote">Platform fee only. Standard Stripe processing ({STRIPE_PROCESSING_NOTE}) applies separately.</p>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Run the numbers</p>
          <h2>See exactly what you&apos;d pay.</h2>
          <p>Drag to your yearly volume &mdash; the fee is figured across brackets, the way you&apos;d actually be billed.</p>
        </div>
        <PricingCalculator />
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">All in, no add-ons</p>
          <h2>Everything&apos;s included in that one fee.</h2>
          <p>No per-seat pricing, no premium tier, no feature paywall &mdash; the whole toolkit ships to every account.</p>
        </div>
        <ul className="pricing-included">
          {included.map((item) => (
            <li key={item}><span className="feat-mark" aria-hidden="true">&#10003;</span><span>{item}</span></li>
          ))}
        </ul>
        <div className="mid-cta">
          <Link href="/#wheel" className="btn secondary">See all {FEATURE_COUNT}+ features &rarr;</Link>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <p className="eyebrow">Pricing questions</p>
        </div>
        <div className="faq-list">
          {pricingFaqs.map((item) => (
            <details className="faq-item" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-band-inner">
          <p className="eyebrow">Ready when you are</p>
          <h2>Start free &mdash; the first quote costs you nothing.</h2>
          <p>No subscription. No setup fee. You only pay our platform fee when a homeowner actually pays you.</p>
          <div className="actions">
            <Link href="/login" className="btn primary">Create Free Account</Link>
            <Link href="/faq" className="btn secondary">Read the FAQ</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
