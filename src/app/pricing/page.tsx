import Link from 'next/link';
import type { Metadata } from 'next';
import { FEE_TIERS, STRIPE_PROCESSING_NOTE } from '@/lib/pricing';
import { FEATURE_COUNT } from '@/lib/features';
import PricingCalculator from './PricingCalculator';
import SiteFooter from '@/components/site-footer';
import { cspNonce } from '@/lib/csp-nonce';
import styles from './pricing.module.css';

export const metadata: Metadata = {
  title: 'Pricing',
  // Read from FEE_TIERS, not typed out: this description and the FAQ answer
  // below are the two places a stale rate would ship to search engines rather
  // than merely to the page.
  description: `No subscription and no setup fee. A platform fee of ${FEE_TIERS[FEE_TIERS.length - 1].rate}–${FEE_TIERS[0].rate} applies only when a homeowner pays you, and drops as you grow. Try the fee calculator.`,
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

// The pricing-model comparison. Deliberately a comparison of two BILLING
// MODELS, not of two products: no vendor is named, and no competitor's price is
// stated as fact — plans vary, they change, and quoting someone else's number
// on a page this page's job is to be trusted on would be the one claim here we
// couldn't stand behind. Every "them" cell is written about the conventional
// per-seat subscription model in general and hedged accordingly.
//
// The homepage table at src/app/page.tsx compares CAPABILITY across three
// product categories. This one compares only what you're billed and when, which
// is what someone who has just dragged the calculator above is actually asking.
const FIRST_TIER_RATE = FEE_TIERS[0].rate;
const LAST_TIER_RATE = FEE_TIERS[FEE_TIERS.length - 1].rate;

const modelColumns = [
  {
    key: 'lgq',
    label: 'Let’s Get Quoted',
    tag: 'One platform fee, only on money you collect',
    highlight: true,
  },
  {
    key: 'sub',
    label: 'Per-seat monthly software',
    tag: 'The conventional contractor suite',
    highlight: false,
  },
];

type ModelCell = { tone: 'good' | 'mid' | 'bad'; value?: string; text: string };
type ModelRow = { label: string; cells: [ModelCell, ModelCell] };

const MODEL_TONE_MARK: Record<ModelCell['tone'], string> = { good: '✓', mid: '~', bad: '✕' };

const modelRows: ModelRow[] = [
  {
    label: 'Monthly software subscription',
    cells: [
      { tone: 'good', value: '$0', text: 'No per-seat bill before the company earns.' },
      {
        tone: 'bad',
        text: 'A flat monthly bill, usually priced per seat, due on the same date whether or not the month brought work.',
      },
    ],
  },
  {
    label: 'When a homeowner pays you',
    cells: [
      { tone: 'good', value: 'Aligned', text: 'A platform fee applies to completed transactions.' },
      {
        tone: 'mid',
        text: 'Nothing extra at that moment — the subscription was already paid, collected or not.',
      },
    ],
  },
  {
    label: 'As the business grows',
    cells: [
      {
        tone: 'good',
        value: 'Lower rate',
        text: `The platform rate drops with growth — marginal rate falls from ${FIRST_TIER_RATE} to ${LAST_TIER_RATE} across your trailing 12-month volume, automatically.`,
      },
      {
        tone: 'bad',
        text: 'Growth typically means more seats and a higher plan tier, so the bill rises as the crew does.',
      },
    ],
  },
  {
    label: 'A slow month',
    cells: [
      {
        tone: 'good',
        value: '$0',
        text: 'If customers do not pay you through the platform, your monthly software bill is $0.',
      },
      { tone: 'bad', text: 'The subscription renews on schedule regardless.' },
    ],
  },
  {
    label: 'What you get on day one',
    cells: [
      {
        tone: 'good',
        value: 'Everything',
        text: `Full-featured from the beginning — all ${FEATURE_COUNT} features on every account.`,
      },
      {
        tone: 'mid',
        text: 'Feature tiers and paid add-ons are common, so the entry price is rarely the whole product.',
      },
    ],
  },
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
    a: `The platform fee is marginal across your trailing-12-month volume — as you collect more, each new bracket is charged at a lower rate, all the way down to ${LAST_TIER_RATE}. It happens automatically, with no call to sales.`,
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
          {/* The page's own title, so it's the h1. Pricing is a page people
              land on from search and navigate by heading; it started at h2,
              which left it with no name at all. See .section-heading h1. */}
          <h1>No subscription. You only pay when you get paid.</h1>
          {/* No "+" after a generated count. FEATURE_COUNT is ALL_FEATURES.length,
              so the number is exact — "74+" hedges a figure we know precisely and
              reads as marketing rounding. */}
          <p>
            All {FEATURE_COUNT} features are included from day one. There&apos;s no setup fee and no monthly
            subscription to cancel — just a small platform fee when a homeowner actually pays you, and it drops as you
            grow.
          </p>
        </div>
        <div className="actions">
          <Link href="/login" className="btn primary">Create free account</Link>
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
          <Link href="/#wheel" className="btn secondary">See all {FEATURE_COUNT} features &rarr;</Link>
        </div>
      </section>

      {/* Sits here, after "no per-seat pricing, no premium tier, no feature
          paywall" has been asserted above and before the FAQ, because that
          sentence is the setup and this table is the evidence for it. Putting
          it earlier would make that line an echo of a point already proved. */}
      <section className="section-block compare-band">
        <div className="section-heading">
          <p className="eyebrow">One model from one truck to ten crews</p>
          <h2>When business is slow, <span className="gradient-text">your software bill is $0.</span></h2>
          <p>
            The business just starting out gets the same operational foundation as the company doing $2 million a year.
            The conventional way to buy contractor software is a monthly subscription per seat, billed the same in a
            slow month as a busy one &mdash; here is that model next to this one.
          </p>
        </div>
        <div className="compare-scroll">
          <table className={`compare-table ${styles.modelTable}`}>
            <caption className="sr-only">
              How the no-subscription model compares with conventional per-seat monthly contractor software, by what
              you are billed and when.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="compare-corner"><span className="compare-corner-label">Two ways to pay</span></th>
                {modelColumns.map((col) => (
                  <th scope="col" key={col.key} className={col.highlight ? 'compare-col-head is-us' : 'compare-col-head'}>
                    {col.highlight ? <span className="compare-head-badge">No monthly fee</span> : null}
                    <strong>{col.label}</strong>
                    <span className="compare-head-tag">{col.tag}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modelRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="compare-row-label">{row.label}</th>
                  {row.cells.map((cell, index) => (
                    <td
                      key={modelColumns[index].key}
                      className={`compare-cell tone-${cell.tone}${modelColumns[index].highlight ? ' is-us' : ''}`}
                    >
                      <span className="compare-mark" aria-hidden="true">{MODEL_TONE_MARK[cell.tone]}</span>
                      <span className="compare-cell-text">
                        {cell.value ? (
                          <>
                            <b className={`${styles.value}${modelColumns[index].highlight ? ` ${styles.usValue}` : ''}`}>
                              {cell.value}
                            </b>{' '}
                          </>
                        ) : null}
                        {cell.text}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="compare-source">
          A comparison of pricing models, not of specific products &mdash; plans vary by vendor and change often, so we
          don&apos;t quote anyone else&apos;s price here. Platform fee only: standard Stripe processing (
          {STRIPE_PROCESSING_NOTE}) applies separately and goes to Stripe, not to us.
        </p>
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
            <Link href="/login" className="btn primary">Create free account</Link>
            <Link href="/faq" className="btn secondary">Read the FAQ</Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
